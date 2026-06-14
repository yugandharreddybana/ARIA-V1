/**
 * skillFactory.service.ts
 * -----------------------
 * Takes a CodebaseProfile (from repoAnalysis.service) and the workspace
 * LLM configuration, then:
 *
 * 1. Determines which roles to create based on detected codebase layers.
 * 2. Calls the workspace LLM to write full, project-specific instructions
 *    for each role (system prompt tailored to THIS codebase).
 * 3. Returns a ProposedSkill[] with complete hierarchy and reporting links.
 *
 * Always-present roles (regardless of codebase):
 *   CEO (L1) → CTO, CPO (L2) → Tech Lead, Security & Cloud Lead (L3)
 *   → Product Manager (L3) → Scrum Master (L4)
 *
 * Conditional roles (generated only when detected):
 *   Frontend Dev     — hasFrontend
 *   Backend Dev      — hasBackend
 *   AI/ML Engineer   — hasAiMl
 *   QA Engineer      — hasBackend || hasFrontend
 *   DevOps Engineer  — hasInfra || hasCiCd
 *   Cloud Engineer   — hasCloud
 *   Cybersecurity    — hasInfra || hasCloud
 *   Red Team         — hasInfra || hasCloud
 *   Mobile Dev       — hasMobile
 */

import { randomUUID } from 'crypto';
import type { CodebaseProfile, ProposedSkill } from '../types/onboarding.types';
import { db } from '@aria/db';
import { workspaces } from '@aria/db';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import { decrypt } from '../utils/crypto.utils';

// ---- LLM call helper -------------------------------------------------------

async function callLlm(workspaceId: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new AppError('Workspace not found', 404);

  const provider = ws.llmProvider ?? 'ollama';
  const model    = ws.llmModel ?? 'llama3';
  const baseUrl  = ws.llmBaseUrl ?? 'http://localhost:11434';
  const apiKey   = ws.llmApiKeyEncrypted ? decrypt(ws.llmApiKeyEncrypted) : '';

  // Build a provider-agnostic OpenAI-compatible request
  // (Anthropic, OpenAI, NVIDIA NIM, Ollama all support this format)
  const endpoint = provider === 'ollama'
    ? `${baseUrl}/v1/chat/completions`
    : provider === 'anthropic'
    ? 'https://api.anthropic.com/v1/messages'
    : provider === 'nvidia'
    ? 'https://integrate.api.nvidia.com/v1/chat/completions'
    : `${baseUrl}/v1/chat/completions`; // openai / custom

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (provider === 'anthropic') {
    headers['x-api-key']         = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body = provider === 'anthropic'
    ? JSON.stringify({ model, max_tokens: 2048, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] })
    : JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] });

  const res = await fetch(endpoint, { method: 'POST', headers, body });
  if (!res.ok) {
    const err = await res.text();
    throw new AppError(`LLM call failed (${res.status}): ${err.slice(0, 200)}`, 502);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    content?: Array<{ text?: string }>; // Anthropic shape
  };

  return (
    data.choices?.[0]?.message?.content ??
    data.content?.[0]?.text ??
    ''
  ).trim();
}

// ---- Skill instruction builder ---------------------------------------------

async function buildInstructions(
  workspaceId: string,
  roleTitle:   string,
  department:  string,
  profile:     CodebaseProfile,
  companyName: string,
  reportsTo:   string,
): Promise<{ instructions: string; description: string }> {
  const system = [
    `You are an AI assistant that writes precise, detailed system-prompt instructions for AI agents.`,
    `The instructions must be tailored to a specific software project — not generic.`,
    `Write in second person ("You are...").`,
    `Return ONLY a JSON object with two keys: "instructions" (full system prompt, 300-600 words) and "description" (1-2 sentences, used as a tooltip in the org chart).`,
    `Do not include markdown code fences. Return raw JSON only.`,
  ].join(' ');

  const user = [
    `Company: ${companyName}`,
    `Role: ${roleTitle} (${department} department)`,
    `Reports to: ${reportsTo}`,
    ``,
    `Project summary:`,
    profile.projectSummary,
    ``,
    `Tech stack: ${profile.allFrameworks.join(', ') || 'unknown'}`,
    `Languages: ${profile.allLangs.join(', ')}`,
    `Layers detected: frontend=${profile.hasFrontend} backend=${profile.hasBackend} ai=${profile.hasAiMl} infra=${profile.hasInfra} cloud=${profile.hasCloud} mobile=${profile.hasMobile}`,
    ``,
    `Write the "instructions" and "description" for this agent now.`,
  ].join('\n');

  let raw = '';
  try {
    raw = await callLlm(workspaceId, system, user);
    const parsed = JSON.parse(raw) as { instructions?: string; description?: string };
    return {
      instructions: parsed.instructions ?? '',
      description:  parsed.description  ?? '',
    };
  } catch {
    // Graceful fallback: generate a sensible default without the LLM
    return {
      instructions: `You are the ${roleTitle} at ${companyName}. ${profile.projectSummary} You work within the ${department} department and report to ${reportsTo}. Your goal is to ensure your owned domains are well-designed, well-tested, and delivered on time.`,
      description:  `${roleTitle} — ${department} department, reports to ${reportsTo}.`,
    };
  }
}

// ---- Persona name pool (deterministic) -------------------------------------

const PERSONA_NAMES: Record<string, string> = {
  'ceo':                    'Jordan Blake',
  'cto':                    'Morgan Chen',
  'cpo':                    'Riley Patel',
  'tech-lead':              'Alex Rivera',
  'security-cloud-lead':    'Sam Torres',
  'product-manager':        'Casey Kim',
  'scrum-master':           'Drew Nguyen',
  'frontend-dev':           'Quinn Okafor',
  'backend-dev':            'Avery Singh',
  'ai-ml-engineer':         'Reese Yamamoto',
  'qa-engineer':            'Parker Liu',
  'mobile-dev':             'Skylar Adeola',
  'devops-engineer':        'Taylor Hassan',
  'cloud-engineer':         'Logan Petrov',
  'cybersecurity-engineer': 'Hunter Vasquez',
  'red-team-engineer':      'Blake Nkosi',
};

// ---- Main export -----------------------------------------------------------

export async function generateTeamProposal(
  workspaceId: string,
  companyName: string,
  profile: CodebaseProfile,
): Promise<ProposedSkill[]> {
  // We build the list top-down so reportingManagerTempId can reference
  // already-created tempIds.
  const skills: ProposedSkill[] = [];

  const id = () => randomUUID();

  // Helper: generate a skill and push to list
  async function make(
    slug:           string,
    roleTitle:      string,
    department:     string,
    hierarchyLevel: number,
    reportsToTempId: string | null,
    reportsToTitle:  string,
    ownedDomains:    string[],
    repoPaths:       string[],
    keywords:        string[],
    riskClass:       'A' | 'B' | 'C' | 'D',
    alwaysPresent:   boolean,
  ): Promise<ProposedSkill> {
    const tempId = id();
    const { instructions, description } = await buildInstructions(
      workspaceId, roleTitle, department, profile, companyName, reportsToTitle,
    );
    const skill: ProposedSkill = {
      tempId,
      slug,
      realName:               PERSONA_NAMES[slug] ?? roleTitle,
      roleTitle,
      department,
      hierarchyLevel,
      reportingManagerTempId: reportsToTempId,
      instructions,
      description,
      ownedDomains,
      ownedRepoPaths: repoPaths,
      triggerKeywords: keywords,
      riskClass,
      isAlwaysPresent: alwaysPresent,
      isAiGenerated:   true,
    };
    skills.push(skill);
    return skill;
  }

  // ── Level 1: CEO ─────────────────────────────────────────────────────────────
  const ceo = await make(
    'ceo', 'Chief Executive Officer', 'C-Suite', 1, null, 'no one — you lead the company',
    ['product-vision', 'company-strategy', 'roadmap', 'design', 'okrs'],
    [], ['vision', 'strategy', 'roadmap', 'design', 'product', 'business', 'okr'],
    'A', true,
  );

  // ── Level 2: CTO, CPO ────────────────────────────────────────────────────────
  const cto = await make(
    'cto', 'Chief Technology Officer', 'C-Suite', 2, ceo.tempId, 'CEO',
    ['architecture', 'technology-decisions', 'engineering-standards', 'security'],
    [], ['architecture', 'tech-stack', 'engineering', 'CTO', 'scalability', 'security'],
    'A', true,
  );
  const cpo = await make(
    'cpo', 'Chief Product Officer', 'C-Suite', 2, ceo.tempId, 'CEO',
    ['product-strategy', 'user-experience', 'feature-prioritisation', 'stakeholder-management'],
    [], ['product', 'UX', 'features', 'backlog', 'CPO', 'prioritisation'],
    'A', true,
  );

  // ── Level 3: Leads & PM ───────────────────────────────────────────────────────
  const techLead = await make(
    'tech-lead', 'Engineering Team Lead', 'Engineering', 3, cto.tempId, 'CTO',
    ['code-review', 'engineering-velocity', 'technical-planning', 'mentoring'],
    [], ['tech-lead', 'code review', 'PR', 'engineering lead', 'sprint planning'],
    'B', true,
  );
  const secLead = await make(
    'security-cloud-lead', 'Security & Cloud Team Lead', 'Security & Cloud', 3, cto.tempId, 'CTO',
    ['security-posture', 'cloud-infrastructure', 'incident-response', 'compliance'],
    [], ['security', 'cloud', 'infra', 'incident', 'vulnerability', 'compliance'],
    'A', true,
  );
  const pm = await make(
    'product-manager', 'Product Manager', 'Product', 3, cpo.tempId, 'CPO',
    ['sprint-goals', 'user-stories', 'acceptance-criteria', 'stakeholder-sync'],
    [], ['PM', 'product manager', 'user story', 'acceptance criteria', 'sprint goal'],
    'B', true,
  );

  // ── Level 4: Scrum Master ─────────────────────────────────────────────────────
  const sm = await make(
    'scrum-master', 'Scrum Master', 'Engineering', 4, techLead.tempId, 'Engineering Team Lead',
    ['sprint-ceremonies', 'impediment-removal', 'team-velocity', 'retrospectives'],
    [], ['scrum', 'sprint', 'retro', 'standup', 'impediment', 'velocity'],
    'B', true,
  );

  // ── Level 5: Conditional IC roles ──────────────────────────────────────────────
  if (profile.hasFrontend) {
    await make(
      'frontend-dev', 'Frontend Developer', 'Engineering', 5, sm.tempId, 'Scrum Master',
      ['ui-components', 'client-routing', 'state-management', 'accessibility'],
      profile.repos.filter(r => r.hasFrontend).map(r => r.repoName),
      ['frontend', 'UI', 'React', 'Next.js', 'component', 'CSS', 'rendering'],
      'C', false,
    );
  }

  if (profile.hasBackend) {
    await make(
      'backend-dev', 'Backend Developer', 'Engineering', 5, sm.tempId, 'Scrum Master',
      ['api-design', 'database-schema', 'server-logic', 'performance'],
      profile.repos.filter(r => r.hasBackend).map(r => r.repoName),
      ['backend', 'API', 'database', 'server', 'endpoint', 'SQL', 'REST'],
      'C', false,
    );
  }

  if (profile.hasAiMl) {
    await make(
      'ai-ml-engineer', 'AI/ML Engineer', 'Engineering', 5, sm.tempId, 'Scrum Master',
      ['model-integration', 'prompt-engineering', 'ai-pipelines', 'evaluation'],
      profile.repos.filter(r => r.hasAiMl).map(r => r.repoName),
      ['AI', 'ML', 'model', 'prompt', 'LLM', 'embedding', 'inference', 'training'],
      'B', false,
    );
  }

  if (profile.hasMobile) {
    await make(
      'mobile-dev', 'Mobile Developer', 'Engineering', 5, sm.tempId, 'Scrum Master',
      ['mobile-ui', 'native-apis', 'app-store', 'offline-sync'],
      profile.repos.filter(r => r.hasMobile).map(r => r.repoName),
      ['mobile', 'iOS', 'Android', 'React Native', 'Expo', 'Flutter'],
      'C', false,
    );
  }

  if (profile.hasFrontend || profile.hasBackend) {
    await make(
      'qa-engineer', 'QA Engineer', 'Engineering', 5, sm.tempId, 'Scrum Master',
      ['test-coverage', 'regression-testing', 'bug-triage', 'test-automation'],
      [],
      ['QA', 'test', 'bug', 'regression', 'automation', 'playwright', 'jest'],
      'C', false,
    );
  }

  if (profile.hasInfra || profile.hasCiCd) {
    await make(
      'devops-engineer', 'DevOps Engineer', 'Security & Cloud', 5, secLead.tempId, 'Security & Cloud Team Lead',
      ['ci-cd-pipelines', 'container-orchestration', 'deployment-automation', 'monitoring'],
      [],
      ['DevOps', 'CI', 'CD', 'pipeline', 'Docker', 'Kubernetes', 'deployment'],
      'B', false,
    );
  }

  if (profile.hasCloud) {
    await make(
      'cloud-engineer', 'Cloud Engineer', 'Security & Cloud', 5, secLead.tempId, 'Security & Cloud Team Lead',
      ['cloud-provisioning', 'iac', 'cost-optimisation', 'scaling'],
      [],
      ['cloud', 'AWS', 'GCP', 'Azure', 'Terraform', 'Pulumi', 'IaC', 'CDK'],
      'B', false,
    );
  }

  if (profile.hasInfra || profile.hasCloud) {
    await make(
      'cybersecurity-engineer', 'Cybersecurity Engineer', 'Security & Cloud', 5, secLead.tempId, 'Security & Cloud Team Lead',
      ['vulnerability-scanning', 'security-hardening', 'secrets-management', 'compliance'],
      [],
      ['security', 'CVE', 'vulnerability', 'OWASP', 'hardening', 'secrets', 'compliance'],
      'A', false,
    );
    await make(
      'red-team-engineer', 'Red Team Engineer', 'Security & Cloud', 5, secLead.tempId, 'Security & Cloud Team Lead',
      ['penetration-testing', 'attack-simulation', 'threat-modelling', 'reporting'],
      [],
      ['red team', 'pentest', 'exploit', 'attack', 'threat model', 'CVE'],
      'A', false,
    );
  }

  return skills;
}
