/**
 * skillFactory.service.ts
 * -----------------------
 * Takes a CodebaseProfile and builds the complete AI agent team as a
 * ProposedSkill[] array.
 *
 * Two phases:
 *   1. STRUCTURE  — decide which roles exist and their hierarchy
 *                   (pure logic, no LLM call needed)
 *   2. INSTRUCTIONS — call the workspace LLM once per agent to write
 *                   fully custom instructions tailored to this project
 *
 * The result is saved into onboarding_proposals.proposed_skills as JSON
 * and displayed in the Step 5 interactive org tree.
 */

import { randomUUID } from 'crypto';
import { db } from '@aria/db';
import { workspaces } from '@aria/db';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { CodebaseProfile, ProposedSkill } from '../types/onboarding.types';

// ── Persona name pool (used to give agents human-sounding names) ──────────────

const PERSONA_NAMES = [
  'Alex Chen', 'Jordan Lee', 'Morgan Kim', 'Riley Park', 'Casey Liu',
  'Taylor Wang', 'Sam Patel', 'Quinn Zhang', 'Drew Nguyen', 'Blake Sharma',
  'Avery Russo', 'Kai Tanaka', 'Reese Okafor', 'Jamie Costa', 'Skyler Mehta',
  'Dana Kovacs', 'Sage Andersen', 'Rowan Diaz', 'Finley Gupta', 'Eden Brooks',
];

let nameIndex = 0;
function nextName(): string {
  return PERSONA_NAMES[nameIndex++ % PERSONA_NAMES.length];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ── Phase 1: Build structure ───────────────────────────────────────────────────────────

function buildStructure(profile: CodebaseProfile, companyName: string): ProposedSkill[] {
  nameIndex = 0; // reset for deterministic naming
  const skills: ProposedSkill[] = [];

  function add(role: Omit<ProposedSkill, 'tempId' | 'realName' | 'instructions' | 'description' | 'isAiGenerated'>): ProposedSkill {
    const skill: ProposedSkill = {
      tempId:       `tmp_${slug(role.slug)}`,
      realName:     nextName(),
      instructions: '', // filled in Phase 2
      description:  '', // filled in Phase 2
      isAiGenerated: true,
      ...role,
    };
    skills.push(skill);
    return skill;
  }

  // ────────────────────────────────────────────────────────────────────
  // LEVEL 1 — CEO (always present)
  // ────────────────────────────────────────────────────────────────────
  add({
    slug: 'ceo', roleTitle: 'Chief Executive Officer',
    department: 'C-Suite', hierarchyLevel: 1,
    reportingManagerTempId: null, isAlwaysPresent: true,
    ownedDomains: ['strategy', 'vision', 'company', 'product-direction', 'roadmap', 'design'],
    ownedRepoPaths: [],
    triggerKeywords: ['strategy', 'vision', 'roadmap', 'company direction', 'product goal', 'priority', 'okr'],
    riskClass: 'A',
  });

  // ────────────────────────────────────────────────────────────────────
  // LEVEL 2 — C-Suite (always present)
  // ────────────────────────────────────────────────────────────────────
  add({
    slug: 'cto', roleTitle: 'Chief Technology Officer',
    department: 'C-Suite', hierarchyLevel: 2,
    reportingManagerTempId: 'tmp_ceo', isAlwaysPresent: true,
    ownedDomains: ['architecture', 'technology', 'engineering', 'infrastructure', 'security'],
    ownedRepoPaths: [],
    triggerKeywords: ['architecture', 'tech stack', 'engineering decision', 'infrastructure', 'security policy'],
    riskClass: 'A',
  });

  add({
    slug: 'cpo', roleTitle: 'Chief Product Officer',
    department: 'C-Suite', hierarchyLevel: 2,
    reportingManagerTempId: 'tmp_ceo', isAlwaysPresent: true,
    ownedDomains: ['product', 'design', 'ux', 'user-research', 'feature-planning'],
    ownedRepoPaths: [],
    triggerKeywords: ['product', 'feature', 'ux', 'user story', 'design', 'prototype', 'wireframe'],
    riskClass: 'A',
  });

  // ────────────────────────────────────────────────────────────────────
  // LEVEL 3 — Directors / Leads (always present)
  // ────────────────────────────────────────────────────────────────────
  add({
    slug: 'tech-lead', roleTitle: 'Engineering Team Lead',
    department: 'Engineering', hierarchyLevel: 3,
    reportingManagerTempId: 'tmp_cto', isAlwaysPresent: true,
    ownedDomains: ['code-review', 'engineering', 'sprint-planning', 'technical-design'],
    ownedRepoPaths: [],
    triggerKeywords: ['code review', 'pull request', 'sprint', 'technical design', 'engineering'],
    riskClass: 'B',
  });

  add({
    slug: 'product-manager', roleTitle: 'Product Manager',
    department: 'Product', hierarchyLevel: 3,
    reportingManagerTempId: 'tmp_cpo', isAlwaysPresent: true,
    ownedDomains: ['backlog', 'requirements', 'acceptance-criteria', 'stakeholders'],
    ownedRepoPaths: [],
    triggerKeywords: ['backlog', 'requirement', 'acceptance criteria', 'user story', 'stakeholder'],
    riskClass: 'B',
  });

  // Security & Cloud Lead — only if infra/cicd/cloud signals present
  if (profile.hasInfra || profile.hasCiCd || profile.hasCloud) {
    add({
      slug: 'security-cloud-lead', roleTitle: 'Security & Cloud Lead',
      department: 'Security & Cloud', hierarchyLevel: 3,
      reportingManagerTempId: 'tmp_cto', isAlwaysPresent: false,
      ownedDomains: ['security', 'cloud', 'devops', 'compliance', 'infrastructure'],
      ownedRepoPaths: [],
      triggerKeywords: ['security', 'cloud', 'devops', 'vulnerability', 'compliance', 'infrastructure'],
      riskClass: 'A',
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // LEVEL 4 — Scrum Master (always present)
  // ────────────────────────────────────────────────────────────────────
  add({
    slug: 'scrum-master', roleTitle: 'Scrum Master',
    department: 'Engineering', hierarchyLevel: 4,
    reportingManagerTempId: 'tmp_tech-lead', isAlwaysPresent: true,
    ownedDomains: ['ceremonies', 'sprint', 'retrospective', 'standup', 'velocity'],
    ownedRepoPaths: [],
    triggerKeywords: ['standup', 'retrospective', 'sprint planning', 'velocity', 'impediment', 'scrum'],
    riskClass: 'B',
  });

  // ────────────────────────────────────────────────────────────────────
  // LEVEL 5 — Engineering ICs (conditional on codebase signals)
  // ────────────────────────────────────────────────────────────────────
  const fePath = profile.repos.flatMap(r => r.frameworks).filter(f =>
    ['React','Next.js','Vue','Svelte','Angular'].includes(f));

  if (profile.hasFrontend) {
    const fwLabel = fePath.length > 0 ? fePath[0] : 'Frontend';
    add({
      slug: 'frontend-dev', roleTitle: `${fwLabel} Developer`,
      department: 'Engineering', hierarchyLevel: 5,
      reportingManagerTempId: 'tmp_tech-lead', isAlwaysPresent: false,
      ownedDomains: ['frontend', 'ui', 'ux-implementation', 'components', 'styling'],
      ownedRepoPaths: profile.repos.filter(r => r.hasFrontend).map(r => r.repoName),
      triggerKeywords: ['component', 'ui', 'frontend', 'css', 'styling', 'page', 'layout'],
      riskClass: 'C',
    });
  }

  if (profile.hasBackend) {
    const bwLabel = profile.allFrameworks.find(f => ['Express','Fastify','NestJS','Hono','Django','Rails'].includes(f)) ?? 'Backend';
    add({
      slug: 'backend-dev', roleTitle: `${bwLabel} Engineer`,
      department: 'Engineering', hierarchyLevel: 5,
      reportingManagerTempId: 'tmp_tech-lead', isAlwaysPresent: false,
      ownedDomains: ['api', 'backend', 'database', 'services', 'auth'],
      ownedRepoPaths: profile.repos.filter(r => r.hasBackend).map(r => r.repoName),
      triggerKeywords: ['api', 'endpoint', 'database', 'query', 'service', 'backend', 'auth'],
      riskClass: 'B',
    });
  }

  if (profile.hasAiMl) {
    add({
      slug: 'ai-engineer', roleTitle: 'AI / ML Engineer',
      department: 'Engineering', hierarchyLevel: 5,
      reportingManagerTempId: 'tmp_tech-lead', isAlwaysPresent: false,
      ownedDomains: ['ai', 'ml', 'models', 'embeddings', 'prompts', 'rag'],
      ownedRepoPaths: profile.repos.filter(r => r.hasAiMl).map(r => r.repoName),
      triggerKeywords: ['model', 'embedding', 'prompt', 'llm', 'fine-tune', 'rag', 'inference'],
      riskClass: 'B',
    });
  }

  if (profile.hasMobile) {
    add({
      slug: 'mobile-dev', roleTitle: 'Mobile Engineer',
      department: 'Engineering', hierarchyLevel: 5,
      reportingManagerTempId: 'tmp_tech-lead', isAlwaysPresent: false,
      ownedDomains: ['mobile', 'ios', 'android', 'native', 'app-store'],
      ownedRepoPaths: profile.repos.filter(r => r.hasMobile).map(r => r.repoName),
      triggerKeywords: ['mobile', 'ios', 'android', 'app store', 'push notification'],
      riskClass: 'C',
    });
  }

  // QA always present when there is any backend or frontend
  if (profile.hasBackend || profile.hasFrontend) {
    add({
      slug: 'qa-engineer', roleTitle: 'QA Engineer',
      department: 'Engineering', hierarchyLevel: 5,
      reportingManagerTempId: 'tmp_tech-lead', isAlwaysPresent: false,
      ownedDomains: ['testing', 'qa', 'bugs', 'regression', 'e2e'],
      ownedRepoPaths: [],
      triggerKeywords: ['test', 'bug', 'regression', 'qa', 'e2e', 'flaky', 'coverage'],
      riskClass: 'B',
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // LEVEL 5 — Security & Cloud ICs (conditional)
  // ────────────────────────────────────────────────────────────────────
  const secLead = 'tmp_security-cloud-lead';

  if (profile.hasCiCd || profile.hasInfra) {
    add({
      slug: 'devops-engineer', roleTitle: 'DevOps Engineer',
      department: 'Security & Cloud', hierarchyLevel: 5,
      reportingManagerTempId: secLead, isAlwaysPresent: false,
      ownedDomains: ['ci-cd', 'pipelines', 'deployments', 'docker', 'containers'],
      ownedRepoPaths: [],
      triggerKeywords: ['ci', 'cd', 'pipeline', 'deploy', 'dockerfile', 'container', 'build'],
      riskClass: 'B',
    });
  }

  if (profile.hasCloud) {
    add({
      slug: 'cloud-engineer', roleTitle: 'Cloud Engineer',
      department: 'Security & Cloud', hierarchyLevel: 5,
      reportingManagerTempId: secLead, isAlwaysPresent: false,
      ownedDomains: ['cloud', 'aws', 'gcp', 'azure', 'terraform', 'iam'],
      ownedRepoPaths: [],
      triggerKeywords: ['cloud', 'terraform', 'aws', 'gcp', 'azure', 'iam', 'vpc', 's3'],
      riskClass: 'A',
    });
  }

  if (profile.hasInfra || profile.hasCloud) {
    add({
      slug: 'cybersecurity-engineer', roleTitle: 'Cybersecurity Engineer (Blue Team)',
      department: 'Security & Cloud', hierarchyLevel: 5,
      reportingManagerTempId: secLead, isAlwaysPresent: false,
      ownedDomains: ['security', 'monitoring', 'siem', 'incident-response', 'hardening'],
      ownedRepoPaths: [],
      triggerKeywords: ['vulnerability', 'cve', 'incident', 'monitoring', 'soc', 'siem', 'hardening'],
      riskClass: 'A',
    });

    add({
      slug: 'red-team-engineer', roleTitle: 'Red Team / Penetration Tester',
      department: 'Security & Cloud', hierarchyLevel: 5,
      reportingManagerTempId: secLead, isAlwaysPresent: false,
      ownedDomains: ['penetration-testing', 'red-team', 'exploit', 'attack-surface'],
      ownedRepoPaths: [],
      triggerKeywords: ['pentest', 'red team', 'exploit', 'attack surface', 'owasp', 'injection'],
      riskClass: 'A',
    });
  }

  return skills;
}

// ── Phase 2: LLM instruction generation ─────────────────────────────────────────────

const LLM_TIMEOUT_MS = 60_000;

async function callLlm(workspaceId: string, prompt: string): Promise<string> {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new AppError('Workspace not found', 404);

  const provider  = ws.llmProvider ?? 'ollama';
  const model     = ws.llmModel    ?? 'llama3';
  const baseUrl   = ws.llmBaseUrl  ?? 'http://localhost:11434';

  let endpoint: string;
  let body: Record<string, unknown>;
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (provider === 'ollama') {
    endpoint = `${baseUrl}/api/generate`;
    body     = { model, prompt, stream: false };
  } else if (provider === 'anthropic') {
    endpoint = 'https://api.anthropic.com/v1/messages';
    headers  = { ...headers, 'x-api-key': ws.llmApiKeyEncrypted ?? '', 'anthropic-version': '2023-06-01' };
    body     = { model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] };
  } else {
    // openai-compatible (openai / nvidia / custom)
    endpoint = provider === 'openai'
      ? 'https://api.openai.com/v1/chat/completions'
      : `${baseUrl}/v1/chat/completions`;
    headers  = { ...headers, Authorization: `Bearer ${ws.llmApiKeyEncrypted ?? ''}` };
    body     = { model, messages: [{ role: 'user', content: prompt }] };
  }

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new AppError(`LLM call failed (${res.status}): ${err}`, 502);
    }
    const data = await res.json() as Record<string, unknown>;

    // Extract text from different provider response shapes
    if (provider === 'ollama')     return (data.response as string) ?? '';
    if (provider === 'anthropic')  return ((data.content as Array<{ text: string }>)[0]?.text) ?? '';
    return ((data.choices as Array<{ message: { content: string } }>)[0]?.message?.content) ?? '';
  } finally {
    clearTimeout(timer);
  }
}

function buildInstructionPrompt(
  skill: ProposedSkill,
  profile: CodebaseProfile,
  companyName: string,
  managerTitle: string | null,
): string {
  return `You are writing the system instructions for an AI agent named "${skill.realName}" who works as the ${skill.roleTitle} at ${companyName}.

Project context:
${profile.projectSummary}

Tech stack: ${profile.allFrameworks.join(', ') || 'not specified'}.
Languages: ${profile.allLangs.join(', ') || 'not specified'}.

This agent's department: ${skill.department}.
Hierarchy level: ${skill.hierarchyLevel} (1=CEO, 5=IC).
${managerTitle ? `This agent reports to: ${managerTitle}.` : 'This agent is the top-level executive (no manager).'}

Your task: Write a detailed, specific system-prompt instruction for this agent. The instructions must:
1. Open with who the agent is and their role at ${companyName} (use the actual company name).
2. Describe their specific responsibilities in the context of THIS project's codebase and tech stack.
3. Define what they own, what decisions they make, and what they escalate.
4. Specify their communication style and how they interact with their team.
5. Include 3-5 concrete examples of tasks or questions this agent should handle.
6. Be written in second person ("You are...").

Write ONLY the system instructions. No meta-commentary. No markdown headers. Plain paragraphs. 200-400 words.`;
}

// ── Public API ───────────────────────────────────────────────────────────────────

/**
 * generateTeamProposal
 * --------------------
 * Builds a complete ProposedSkill[] for the given codebase profile.
 * Calls the workspace LLM once per agent to write custom instructions.
 */
export async function generateTeamProposal(
  workspaceId: string,
  profile: CodebaseProfile,
  companyName: string,
): Promise<ProposedSkill[]> {
  const structure = buildStructure(profile, companyName);

  // Build a tempId → roleTitle map for manager lookup in prompts
  const titleMap = new Map(structure.map(s => [s.tempId, s.roleTitle]));

  // Generate instructions for all agents in parallel (max 5 concurrent)
  const CONCURRENCY = 5;
  const result: ProposedSkill[] = [...structure];

  for (let i = 0; i < result.length; i += CONCURRENCY) {
    const batch = result.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (skill, batchIdx) => {
        const managerTitle = skill.reportingManagerTempId
          ? (titleMap.get(skill.reportingManagerTempId) ?? null)
          : null;
        const prompt = buildInstructionPrompt(skill, profile, companyName, managerTitle);
        try {
          const instructions = await callLlm(workspaceId, prompt);
          const descPrompt   = `In one sentence (max 20 words), describe the role of the ${skill.roleTitle} at ${companyName} in the context of: ${profile.projectSummary}`;
          const description  = await callLlm(workspaceId, descPrompt);
          result[i + batchIdx] = { ...skill, instructions: instructions.trim(), description: description.trim() };
        } catch {
          // If LLM fails for one agent, use a meaningful fallback
          result[i + batchIdx] = {
            ...skill,
            instructions: `You are ${skill.realName}, the ${skill.roleTitle} at ${companyName}. ${profile.projectSummary} Your role is to own the ${skill.ownedDomains.join(', ')} domains and make decisions within your area of expertise.`,
            description:  `Owns ${skill.ownedDomains.slice(0, 3).join(', ')} for ${companyName}.`,
          };
        }
      }),
    );
  }

  return result;
}
