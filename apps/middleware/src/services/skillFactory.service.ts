/**
 * skillFactory.service.ts
 * -----------------------
 * Takes a CodebaseProfile + company context and produces a ProposedSkill[]
 * array representing the full AI org chart.
 *
 * Hierarchy rules:
 *   Level 1 — CEO                          (always)
 *   Level 2 — CTO, CPO                     (always)
 *   Level 3 — Tech Lead                    (always, reports to CTO)
 *             Engineering Team Lead        (always, reports to Tech Lead)
 *             Security & Cloud Lead        (only if infra/cloud/cicd detected, reports to CTO)
 *             Product Manager              (always, reports to CPO)
 *   Level 4 — Scrum Master                 (always, reports to Tech Lead + PM)
 *   Level 5 — Frontend Dev                 (if hasFrontend)
 *             Backend Dev                  (if hasBackend)
 *             AI/ML Engineer               (if hasAiMl)
 *             Mobile Engineer              (if hasMobile)
 *             QA Engineer                  (always — every project needs QA)
 *             DevOps Engineer              (if hasInfra || hasCiCd)
 *             Cloud Engineer               (if hasCloud)
 *             Cybersecurity Analyst        (if hasCloud || hasInfra)
 *             Red Team / Pen Tester        (if hasCloud || hasInfra)
 *
 * The LLM (workspace LLM config) is called once per agent to produce
 * fully tailored instructions.  Each call is short (~300 token output)
 * so latency is acceptable for onboarding.
 */

import { randomUUID } from 'crypto';
import type { CodebaseProfile, ProposedSkill } from '../types/onboarding.types';
import { decryptApiKey } from './workspace.service';
import { db } from '@aria/db';
import { workspaces } from '@aria/db';
import { eq } from 'drizzle-orm';

// ── LLM call helper ───────────────────────────────────────────────────────────
async function callLlm(
  workspaceId: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new Error('Workspace not found');

  const provider  = ws.llmProvider ?? 'ollama';
  const model     = ws.llmModel    ?? 'qwen2.5-coder:7b';
  const rawKey    = ws.llmApiKeyEncrypted ? decryptApiKey(ws.llmApiKeyEncrypted) : '';

  let baseUrl: string;
  let headers: Record<string, string>;

  if (provider === 'ollama') {
    baseUrl = ws.llmBaseUrl ?? 'http://localhost:11434';
    headers = { 'Content-Type': 'application/json' };
  } else if (provider === 'anthropic') {
    baseUrl = 'https://api.anthropic.com';
    headers = {
      'Content-Type':    'application/json',
      'x-api-key':       rawKey,
      'anthropic-version': '2023-06-01',
    };
  } else if (provider === 'nvidia') {
    baseUrl = ws.llmBaseUrl ?? 'https://integrate.api.nvidia.com/v1';
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` };
  } else {
    // openai | custom
    baseUrl = ws.llmBaseUrl ?? 'https://api.openai.com/v1';
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` };
  }

  // Normalise to OpenAI-compatible chat completions (Ollama also supports this)
  const endpoint = provider === 'anthropic'
    ? `${baseUrl}/v1/messages`
    : `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  const body = provider === 'anthropic'
    ? JSON.stringify({
        model,
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })
    : JSON.stringify({
        model,
        max_tokens: 512,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
      });

  const res = await fetch(endpoint, {
    method:  'POST',
    headers,
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as {
    content?: { text: string }[];
    choices?: { message: { content: string } }[];
  };

  if (provider === 'anthropic') {
    return data.content?.[0]?.text?.trim() ?? '';
  }
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// ── Persona name pool ─────────────────────────────────────────────────────────
const PERSONA_NAMES = [
  'Alex Chen',    'Jordan Lee',   'Morgan Patel',  'Riley Kim',   'Casey Singh',
  'Taylor Nguyen','Sam Okafor',   'Drew Fernandez','Jamie Xu',    'Quinn Osei',
  'Blair Nkosi',  'Rowan Andrade','Avery Malik',   'Reese Okoro', 'Sage Kowalski',
  'Dana Torres',  'Finley Russo', 'Logan Balogun', 'Ellis Vance', 'Shea Matsuda',
];
let nameIdx = 0;
function nextName() { return PERSONA_NAMES[nameIdx++ % PERSONA_NAMES.length]; }

// ── Agent definition ──────────────────────────────────────────────────────────
interface AgentBlueprint {
  slug:               string;
  roleTitle:          string;
  department:         string;
  hierarchyLevel:     number;
  reportingManagerSlug: string | null;  // null = CEO (root)
  riskClass:          'A' | 'B' | 'C' | 'D';
  isAlwaysPresent:    boolean;
  ownedDomains:       string[];
  triggerKeywords:    string[];
  instructionFocus:   string;  // injected into LLM prompt
}

function buildBlueprints(profile: CodebaseProfile): AgentBlueprint[] {
  const blueprints: AgentBlueprint[] = [
    // ── Level 1 ────────────────────────────────────────────────────────────
    {
      slug: 'ceo', roleTitle: 'Chief Executive Officer', department: 'C-Suite',
      hierarchyLevel: 1, reportingManagerSlug: null, riskClass: 'A',
      isAlwaysPresent: true,
      ownedDomains:    ['strategy', 'vision', 'product-roadmap', 'company-direction'],
      triggerKeywords: ['vision', 'strategy', 'roadmap', 'company', 'direction', 'mission', 'goals', 'OKR'],
      instructionFocus: 'You own the product vision, company strategy, and roadmap for this specific codebase. You make final decisions on feature priorities, technical direction, and product goals. You review sprint outcomes, align the team on objectives, and ensure every engineering decision ties back to user value and business impact. You are NOT a generic CEO — you deeply understand this codebase and speak specifically about its architecture, user flows, and competitive positioning.',
    },
    // ── Level 2 ────────────────────────────────────────────────────────────
    {
      slug: 'cto', roleTitle: 'Chief Technology Officer', department: 'C-Suite',
      hierarchyLevel: 2, reportingManagerSlug: 'ceo', riskClass: 'A',
      isAlwaysPresent: true,
      ownedDomains:    ['architecture', 'tech-stack', 'engineering-standards', 'scalability'],
      triggerKeywords: ['architecture', 'tech-stack', 'infrastructure', 'engineering', 'scalability', 'performance', 'system design'],
      instructionFocus: 'You own technical architecture decisions, engineering standards, and the long-term scalability of the codebase. You review pull requests at a high level, approve major architectural changes, and ensure the engineering team follows best practices for this specific tech stack.',
    },
    {
      slug: 'cpo', roleTitle: 'Chief Product Officer', department: 'C-Suite',
      hierarchyLevel: 2, reportingManagerSlug: 'ceo', riskClass: 'A',
      isAlwaysPresent: true,
      ownedDomains:    ['product', 'user-experience', 'feature-definition', 'backlog'],
      triggerKeywords: ['product', 'feature', 'user story', 'backlog', 'UX', 'requirements', 'acceptance criteria'],
      instructionFocus: 'You own the product backlog, define features, write user stories, and ensure the product meets user needs. You work closely with the Scrum Master and Product Manager to prioritise work and define acceptance criteria for every ticket.',
    },
    // ── Level 3 ────────────────────────────────────────────────────────────
    {
      slug: 'tech-lead', roleTitle: 'Tech Lead', department: 'Engineering',
      hierarchyLevel: 3, reportingManagerSlug: 'cto', riskClass: 'B',
      isAlwaysPresent: true,
      ownedDomains:    ['code-review', 'technical-decisions', 'team-mentoring', 'sprint-planning'],
      triggerKeywords: ['code review', 'PR', 'merge', 'refactor', 'technical debt', 'design pattern', 'sprint'],
      instructionFocus: 'You lead the engineering team day-to-day. You review all code changes, unblock engineers, make tactical technical decisions, and ensure sprint goals are achievable. You are the bridge between the CTO\u2019s architectural vision and the engineers\u2019 daily work.',
    },
    {
      slug: 'product-manager', roleTitle: 'Product Manager', department: 'Product',
      hierarchyLevel: 3, reportingManagerSlug: 'cpo', riskClass: 'B',
      isAlwaysPresent: true,
      ownedDomains:    ['sprint-planning', 'ticket-creation', 'stakeholder-comms', 'roadmap-execution'],
      triggerKeywords: ['ticket', 'sprint', 'milestone', 'deadline', 'stakeholder', 'priority', 'estimate'],
      instructionFocus: 'You translate the product roadmap into executable sprint tickets. You write detailed acceptance criteria, coordinate between engineering and design, track progress, and communicate status to stakeholders.',
    },
  ];

  // Security & Cloud Lead — only if infra/cloud/cicd signals found
  if (profile.hasInfra || profile.hasCloud || profile.hasCiCd) {
    blueprints.push({
      slug: 'security-cloud-lead', roleTitle: 'Security & Cloud Lead', department: 'Security & Cloud',
      hierarchyLevel: 3, reportingManagerSlug: 'cto', riskClass: 'A',
      isAlwaysPresent: false,
      ownedDomains:    ['security', 'cloud-infrastructure', 'ci-cd', 'compliance'],
      triggerKeywords: ['security', 'cloud', 'infrastructure', 'CI/CD', 'pipeline', 'vulnerability', 'compliance', 'IAM'],
      instructionFocus: 'You own cloud infrastructure, CI/CD pipelines, and security posture. You review infrastructure-as-code changes, ensure secrets are managed correctly, and coordinate penetration testing and security audits.',
    });
  }

  // ── Level 4 ────────────────────────────────────────────────────────────
  blueprints.push({
    slug: 'scrum-master', roleTitle: 'Scrum Master', department: 'Engineering',
    hierarchyLevel: 4, reportingManagerSlug: 'tech-lead', riskClass: 'B',
    isAlwaysPresent: true,
    ownedDomains:    ['ceremonies', 'velocity', 'blockers', 'agile-process'],
    triggerKeywords: ['standup', 'retrospective', 'sprint review', 'velocity', 'blocker', 'ceremony', 'agile', 'scrum'],
    instructionFocus: 'You facilitate all agile ceremonies, track team velocity, surface blockers, and shield the engineering team from distractions. You report progress to the Product Manager and Tech Lead.',
  });

  // ── Level 5 — IC agents (conditionally generated) ─────────────────────
  if (profile.hasFrontend) {
    blueprints.push({
      slug: 'frontend-dev', roleTitle: 'Frontend Developer', department: 'Engineering',
      hierarchyLevel: 5, reportingManagerSlug: 'tech-lead', riskClass: 'C',
      isAlwaysPresent: false,
      ownedDomains:    ['ui', 'frontend', 'components', 'accessibility', 'performance'],
      triggerKeywords: ['UI', 'component', 'CSS', 'HTML', 'accessibility', 'responsive', 'React', 'Vue', 'frontend'],
      instructionFocus: `You write and review frontend code for this project. Frameworks detected: ${profile.allFrameworks.filter(f => ['React','Next.js','Vue','Svelte','Angular','Nuxt'].includes(f)).join(', ') || 'general frontend'}. You own component architecture, accessibility, performance optimisation, and visual correctness.`,
    });
  }

  if (profile.hasBackend) {
    blueprints.push({
      slug: 'backend-dev', roleTitle: 'Backend Developer', department: 'Engineering',
      hierarchyLevel: 5, reportingManagerSlug: 'tech-lead', riskClass: 'C',
      isAlwaysPresent: false,
      ownedDomains:    ['api', 'database', 'backend', 'business-logic', 'integrations'],
      triggerKeywords: ['API', 'endpoint', 'database', 'migration', 'service', 'REST', 'GraphQL', 'backend'],
      instructionFocus: `You implement and maintain backend services. Frameworks detected: ${profile.allFrameworks.filter(f => ['Express','Fastify','NestJS','Hono','Django','Flask'].includes(f)).join(', ') || 'general backend'}. You own API design, database schema changes, business logic, and third-party integrations.`,
    });
  }

  if (profile.hasAiMl) {
    blueprints.push({
      slug: 'ai-ml-engineer', roleTitle: 'AI/ML Engineer', department: 'Engineering',
      hierarchyLevel: 5, reportingManagerSlug: 'tech-lead', riskClass: 'B',
      isAlwaysPresent: false,
      ownedDomains:    ['ai', 'ml', 'llm', 'embeddings', 'model-integration', 'prompts'],
      triggerKeywords: ['model', 'LLM', 'embedding', 'prompt', 'fine-tune', 'inference', 'AI', 'ML', 'training'],
      instructionFocus: `You own AI/ML integration within the codebase. Detected AI frameworks: ${profile.allFrameworks.filter(f => ['LangChain','OpenAI SDK','Anthropic SDK','PyTorch','TensorFlow'].includes(f)).join(', ') || 'AI/ML libraries'}. You implement prompt engineering, model integrations, embedding pipelines, and ensure AI outputs are reliable and safe.`,
    });
  }

  if (profile.hasMobile) {
    blueprints.push({
      slug: 'mobile-engineer', roleTitle: 'Mobile Engineer', department: 'Engineering',
      hierarchyLevel: 5, reportingManagerSlug: 'tech-lead', riskClass: 'C',
      isAlwaysPresent: false,
      ownedDomains:    ['mobile', 'ios', 'android', 'react-native', 'flutter'],
      triggerKeywords: ['mobile', 'iOS', 'Android', 'React Native', 'Flutter', 'Expo', 'app store'],
      instructionFocus: `You develop and maintain the mobile application. Detected: ${profile.allFrameworks.filter(f => ['React Native','Expo','Flutter'].includes(f)).join(', ')}. You own native performance, app store submissions, and mobile-specific UX patterns.`,
    });
  }

  // QA — always present
  blueprints.push({
    slug: 'qa-engineer', roleTitle: 'QA Engineer', department: 'Engineering',
    hierarchyLevel: 5, reportingManagerSlug: 'tech-lead', riskClass: 'C',
    isAlwaysPresent: false,
    ownedDomains:    ['testing', 'qa', 'bugs', 'test-plans', 'e2e'],
    triggerKeywords: ['test', 'bug', 'QA', 'quality', 'e2e', 'unit test', 'integration test', 'regression'],
    instructionFocus: 'You write and maintain tests, identify bugs, define test plans, and gate releases on quality. You cover unit, integration, and end-to-end tests appropriate for this codebase.',
  });

  if (profile.hasInfra || profile.hasCiCd) {
    blueprints.push({
      slug: 'devops-engineer', roleTitle: 'DevOps Engineer', department: 'Security & Cloud',
      hierarchyLevel: 5, reportingManagerSlug: 'security-cloud-lead', riskClass: 'B',
      isAlwaysPresent: false,
      ownedDomains:    ['ci-cd', 'pipelines', 'containers', 'deployments', 'monitoring'],
      triggerKeywords: ['deploy', 'pipeline', 'CI/CD', 'Docker', 'container', 'Kubernetes', 'build', 'release'],
      instructionFocus: 'You own CI/CD pipelines, container builds, deployment automation, and monitoring. You ensure every merge to main is safely and automatically deployed.',
    });
  }

  if (profile.hasCloud) {
    blueprints.push({
      slug: 'cloud-engineer', roleTitle: 'Cloud Engineer', department: 'Security & Cloud',
      hierarchyLevel: 5, reportingManagerSlug: 'security-cloud-lead', riskClass: 'B',
      isAlwaysPresent: false,
      ownedDomains:    ['cloud', 'iac', 'aws', 'gcp', 'azure', 'cost-optimisation'],
      triggerKeywords: ['cloud', 'terraform', 'infrastructure', 'AWS', 'GCP', 'Azure', 'cost', 'IaC'],
      instructionFocus: 'You manage cloud infrastructure using IaC. You provision, cost-optimise, and maintain cloud resources, ensuring high availability and disaster recovery.',
    });
  }

  if (profile.hasCloud || profile.hasInfra) {
    blueprints.push(
      {
        slug: 'cybersecurity-analyst', roleTitle: 'Cybersecurity Analyst', department: 'Security & Cloud',
        hierarchyLevel: 5, reportingManagerSlug: 'security-cloud-lead', riskClass: 'A',
        isAlwaysPresent: false,
        ownedDomains:    ['security', 'vulnerability-management', 'siem', 'compliance', 'blue-team'],
        triggerKeywords: ['security', 'vulnerability', 'CVE', 'patch', 'compliance', 'audit', 'SIEM', 'blue team'],
        instructionFocus: 'You are the blue team. You monitor for threats, manage vulnerabilities, ensure compliance, and harden the infrastructure and application against attacks.',
      },
      {
        slug: 'red-team-engineer', roleTitle: 'Red Team / Pen Tester', department: 'Security & Cloud',
        hierarchyLevel: 5, reportingManagerSlug: 'security-cloud-lead', riskClass: 'A',
        isAlwaysPresent: false,
        ownedDomains:    ['penetration-testing', 'exploit-research', 'red-team', 'threat-modelling'],
        triggerKeywords: ['pen test', 'exploit', 'red team', 'attack surface', 'threat model', 'OWASP', 'CVE'],
        instructionFocus: 'You are the red team. You proactively attempt to find vulnerabilities in the application and infrastructure before attackers do. You produce detailed threat models and remediation reports.',
      },
    );
  }

  return blueprints;
}

// ── LLM instruction writer ────────────────────────────────────────────────────
async function generateInstructions(
  blueprint:   AgentBlueprint,
  profile:     CodebaseProfile,
  companyName: string,
  workspaceId: string,
): Promise<{ instructions: string; description: string }> {
  const system = `You are writing the system prompt ("instructions") for an AI agent that will work inside ${companyName}.
The agent's role is: ${blueprint.roleTitle}.
You have deep knowledge of the project's codebase:
${profile.projectSummary}
Frameworks in use: ${profile.allFrameworks.join(', ') || 'none detected'}.
Languages: ${profile.allLangs.join(', ')}.

Write a concise but complete system prompt for this agent. The prompt must:
1. Address the agent in second person ("You are the ${blueprint.roleTitle} for ${companyName}.").
2. Be specific to THIS codebase — name the actual frameworks, repo names, and tech stack.
3. Describe exactly what the agent owns, what decisions it makes, and who it reports to.
4. End with a one-sentence description (prefixed "DESCRIPTION:") summarising the role in plain English.

Output ONLY the system prompt followed by the DESCRIPTION line. No markdown, no headers.`;

  const user = `Focus area for this agent: ${blueprint.instructionFocus}`;

  try {
    const raw = await callLlm(workspaceId, system, user);
    const descMatch = raw.match(/DESCRIPTION:\s*(.+)$/m);
    const description  = descMatch?.[1]?.trim() ?? `${blueprint.roleTitle} for ${companyName}.`;
    const instructions = raw.replace(/DESCRIPTION:.+$/m, '').trim();
    return { instructions, description };
  } catch {
    // Fallback: use instructionFocus directly if LLM is unavailable
    return {
      instructions: `You are the ${blueprint.roleTitle} for ${companyName}. ${blueprint.instructionFocus}`,
      description:  `${blueprint.roleTitle} responsible for ${blueprint.ownedDomains.slice(0, 3).join(', ')}.`,
    };
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateTeamProposal(
  profile:     CodebaseProfile,
  companyName: string,
  workspaceId: string,
): Promise<ProposedSkill[]> {
  nameIdx = 0;  // reset persona name counter for each run
  const blueprints = buildBlueprints(profile);

  // Build tempId map keyed by slug so we can resolve reportingManagerTempId
  const tempIds = new Map<string, string>();
  for (const bp of blueprints) tempIds.set(bp.slug, randomUUID());

  // Generate instructions in parallel (capped at 5 concurrent to avoid rate limits)
  const CONCURRENCY = 5;
  const skills: ProposedSkill[] = [];

  for (let i = 0; i < blueprints.length; i += CONCURRENCY) {
    const batch = blueprints.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(bp => generateInstructions(bp, profile, companyName, workspaceId)),
    );
    for (let j = 0; j < batch.length; j++) {
      const bp     = batch[j];
      const { instructions, description } = results[j];
      const tempId = tempIds.get(bp.slug)!;
      const managerTempId = bp.reportingManagerSlug
        ? (tempIds.get(bp.reportingManagerSlug) ?? null)
        : null;

      skills.push({
        tempId,
        slug:                   bp.slug,
        realName:               nextName(),
        roleTitle:              bp.roleTitle,
        department:             bp.department,
        hierarchyLevel:         bp.hierarchyLevel,
        reportingManagerTempId: managerTempId,
        instructions,
        description,
        ownedDomains:           bp.ownedDomains,
        ownedRepoPaths:         [],
        triggerKeywords:        bp.triggerKeywords,
        riskClass:              bp.riskClass,
        isAlwaysPresent:        bp.isAlwaysPresent,
        isAiGenerated:          true,
      });
    }
  }

  return skills;
}
