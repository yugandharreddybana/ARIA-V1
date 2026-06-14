/**
 * skillFactory.service.ts
 * -----------------------
 * Takes a CodebaseProfile + workspace context and:
 *   1. Decides which roles to create based on detection signals.
 *   2. Calls the workspace LLM to generate custom per-agent instructions.
 *   3. Returns a fully resolved ProposedSkill[] with the complete hierarchy.
 *
 * Hierarchy levels:
 *   1 = CEO
 *   2 = C-suite (CTO, CPO)
 *   3 = Directors / Leads (Tech Lead, Security & Cloud Lead, Product Manager)
 *   4 = Scrum Master
 *   5 = Individual Contributors (engineers, QA, security analysts, etc.)
 */

import { randomUUID } from 'crypto';
import { db } from '@aria/db';
import { workspaces } from '@aria/db';
import { eq } from 'drizzle-orm';
import { decryptApiKey } from './workspace.service';
import type { CodebaseProfile, ProposedSkill } from '../types/onboarding.types';

// ---- LLM caller (OpenAI-compatible) ----------------------------------------

async function callLlm(
  workspaceId: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new Error('Workspace not found');

  const provider  = ws.llmProvider  ?? 'ollama';
  const model     = ws.llmModel     ?? 'qwen2.5-coder:7b';
  const apiKey    = ws.llmApiKeyEncrypted ? decryptApiKey(ws.llmApiKeyEncrypted) : undefined;

  let baseUrl: string;
  switch (provider) {
    case 'anthropic': baseUrl = 'https://api.anthropic.com/v1'; break;
    case 'openai':    baseUrl = 'https://api.openai.com/v1';    break;
    case 'nvidia':    baseUrl = ws.llmBaseUrl ?? 'https://integrate.api.nvidia.com/v1'; break;
    case 'ollama':    baseUrl = (ws.llmBaseUrl ?? 'http://localhost:11434') + '/v1'; break;
    default:          baseUrl = ws.llmBaseUrl ?? 'http://localhost:8000/v1';
  }

  // Anthropic uses a different API format
  if (provider === 'anthropic') {
    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey ?? '',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json() as { content: { text: string }[] };
    return data.content[0]?.text ?? '';
  }

  // OpenAI-compatible (OpenAI / NVIDIA NIM / Ollama / custom)
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey ?? 'ollama'}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? '';
}

// ---- Persona name bank ------------------------------------------------------

const PERSONA_NAMES: Record<string, string> = {
  'ceo':                    'Alexandra Rhodes',
  'cto':                    'Marcus Chen',
  'cpo':                    'Priya Nair',
  'tech-lead':              'Jordan Blake',
  'security-cloud-lead':    'Zara Kim',
  'product-manager':        'Daniel Park',
  'scrum-master':           'Sofia Reyes',
  'frontend-developer':     'Ethan Walsh',
  'backend-developer':      'Layla Hassan',
  'ai-ml-engineer':         'Ravi Sharma',
  'fullstack-developer':    'Casey Morgan',
  'mobile-developer':       'Mei Lin',
  'devops-engineer':        'Owen Torres',
  'cloud-engineer':         'Aisha Patel',
  'cybersecurity-analyst':  'Viktor Novak',
  'red-team-engineer':      'Nadia Volkov',
  'qa-engineer':            'Sam Rivera',
};

// ---- Instruction generator --------------------------------------------------

async function generateInstructions(
  workspaceId: string,
  companyName: string,
  companyDescription: string,
  profile: CodebaseProfile,
  roleTitle: string,
  department: string,
  reportingTo: string | null,
  ownedDomains: string[],
): Promise<{ instructions: string; description: string }> {
  const systemPrompt = `You are an expert AI agent configuration specialist.
Your task is to write precise, actionable system instructions for an AI agent role in a software company.
The instructions must be:
- Specific to the actual tech stack and codebase described
- Written in second person ("You are...")
- Covering: identity, responsibilities, decision-making authority, collaboration rules, tools/repos owned, escalation paths
- 300-500 words
- Followed by a 1-2 sentence description for display in the org chart`;

  const userPrompt = `Company: ${companyName}
Company description: ${companyDescription}

Codebase profile:
${profile.projectSummary}
Frameworks: ${profile.allFrameworks.join(', ') || 'None detected'}
Languages: ${profile.allLangs.join(', ') || 'Unknown'}
Has frontend: ${profile.hasFrontend}
Has backend: ${profile.hasBackend}
Has AI/ML: ${profile.hasAiMl}
Has infrastructure: ${profile.hasInfra}
Has CI/CD: ${profile.hasCiCd}
Has cloud IaC: ${profile.hasCloud}

Role to configure:
- Title: ${roleTitle}
- Department: ${department}
- Reports to: ${reportingTo ?? 'No one (top of hierarchy)'}
- Owned domains: ${ownedDomains.join(', ')}

Write the full system instructions, then on a new line write "DESCRIPTION:" followed by a 1-2 sentence description.
Return ONLY the instructions and description — no preamble or commentary.`;

  const raw = await callLlm(workspaceId, systemPrompt, userPrompt);

  const descMatch = raw.match(/DESCRIPTION:\s*(.+)/s);
  const description  = descMatch ? descMatch[1].trim().split('\n')[0].trim() : `${roleTitle} agent for ${companyName}.`;
  const instructions = raw.replace(/DESCRIPTION:.*/s, '').trim();

  return { instructions, description };
}

// ---- Role definition --------------------------------------------------------

interface RoleDef {
  slug:                string;
  roleTitle:           string;
  department:          string;
  hierarchyLevel:      number;
  reportingManagerSlug: string | null;
  ownedDomains:        string[];
  triggerKeywords:     string[];
  riskClass:           'A' | 'B' | 'C' | 'D';
  isAlwaysPresent:     boolean;
  condition:           (p: CodebaseProfile) => boolean;
}

const ROLE_DEFINITIONS: RoleDef[] = [
  // ---- Level 1: CEO ----
  {
    slug: 'ceo', roleTitle: 'Chief Executive Officer', department: 'C-Suite',
    hierarchyLevel: 1, reportingManagerSlug: null,
    ownedDomains: ['strategy', 'vision', 'product-direction', 'team-culture'],
    triggerKeywords: ['vision', 'strategy', 'roadmap', 'company', 'mission', 'okr', 'milestone'],
    riskClass: 'A', isAlwaysPresent: true, condition: () => true,
  },
  // ---- Level 2: C-Suite ----
  {
    slug: 'cto', roleTitle: 'Chief Technology Officer', department: 'C-Suite',
    hierarchyLevel: 2, reportingManagerSlug: 'ceo',
    ownedDomains: ['architecture', 'tech-strategy', 'engineering-standards'],
    triggerKeywords: ['architecture', 'tech debt', 'engineering', 'infrastructure', 'scale', 'security'],
    riskClass: 'A', isAlwaysPresent: true, condition: () => true,
  },
  {
    slug: 'cpo', roleTitle: 'Chief Product Officer', department: 'C-Suite',
    hierarchyLevel: 2, reportingManagerSlug: 'ceo',
    ownedDomains: ['product-strategy', 'user-experience', 'feature-prioritisation', 'design'],
    triggerKeywords: ['product', 'feature', 'user', 'ux', 'design', 'prioritise', 'backlog'],
    riskClass: 'A', isAlwaysPresent: true, condition: () => true,
  },
  // ---- Level 3: Leads ----
  {
    slug: 'product-manager', roleTitle: 'Product Manager', department: 'Product',
    hierarchyLevel: 3, reportingManagerSlug: 'cpo',
    ownedDomains: ['sprint-planning', 'requirements', 'acceptance-criteria', 'stakeholder-comms'],
    triggerKeywords: ['sprint', 'story', 'epic', 'requirement', 'acceptance', 'stakeholder', 'release'],
    riskClass: 'B', isAlwaysPresent: true, condition: () => true,
  },
  {
    slug: 'tech-lead', roleTitle: 'Engineering Team Lead', department: 'Engineering',
    hierarchyLevel: 3, reportingManagerSlug: 'cto',
    ownedDomains: ['code-review', 'engineering-decisions', 'tech-standards', 'developer-unblocking'],
    triggerKeywords: ['code review', 'pr', 'pull request', 'tech decision', 'architecture', 'merge', 'linting'],
    riskClass: 'B', isAlwaysPresent: true, condition: () => true,
  },
  {
    slug: 'security-cloud-lead', roleTitle: 'Security & Cloud Lead', department: 'Security & Cloud',
    hierarchyLevel: 3, reportingManagerSlug: 'cto',
    ownedDomains: ['security-posture', 'cloud-architecture', 'compliance', 'incident-response'],
    triggerKeywords: ['security', 'cloud', 'compliance', 'vulnerability', 'incident', 'infra', 'devops'],
    riskClass: 'A', isAlwaysPresent: true, condition: () => true,
  },
  // ---- Level 4: Scrum Master ----
  {
    slug: 'scrum-master', roleTitle: 'Scrum Master', department: 'Engineering',
    hierarchyLevel: 4, reportingManagerSlug: 'tech-lead',
    ownedDomains: ['ceremony-facilitation', 'impediment-removal', 'sprint-health', 'team-velocity'],
    triggerKeywords: ['standup', 'retrospective', 'sprint', 'ceremony', 'velocity', 'blocker', 'burndown'],
    riskClass: 'B', isAlwaysPresent: true, condition: () => true,
  },
  // ---- Level 5: Individual Contributors ----
  {
    slug: 'frontend-developer', roleTitle: 'Frontend Developer', department: 'Engineering',
    hierarchyLevel: 5, reportingManagerSlug: 'tech-lead',
    ownedDomains: ['ui-components', 'client-side-logic', 'css', 'browser-performance'],
    triggerKeywords: ['component', 'ui', 'css', 'html', 'browser', 'frontend', 'jsx', 'tsx', 'styling'],
    riskClass: 'B', isAlwaysPresent: false, condition: p => p.hasFrontend,
  },
  {
    slug: 'backend-developer', roleTitle: 'Backend Developer', department: 'Engineering',
    hierarchyLevel: 5, reportingManagerSlug: 'tech-lead',
    ownedDomains: ['api', 'database', 'server-logic', 'integrations'],
    triggerKeywords: ['api', 'endpoint', 'database', 'query', 'migration', 'server', 'rest', 'graphql'],
    riskClass: 'B', isAlwaysPresent: false, condition: p => p.hasBackend,
  },
  {
    slug: 'fullstack-developer', roleTitle: 'Fullstack Developer', department: 'Engineering',
    hierarchyLevel: 5, reportingManagerSlug: 'tech-lead',
    ownedDomains: ['full-stack', 'api', 'ui', 'database'],
    triggerKeywords: ['fullstack', 'full stack', 'api', 'component', 'database'],
    riskClass: 'B', isAlwaysPresent: false,
    // Only add fullstack if BOTH frontend and backend exist (replaces neither)
    condition: p => p.hasFrontend && p.hasBackend,
  },
  {
    slug: 'ai-ml-engineer', roleTitle: 'AI/ML Engineer', department: 'Engineering',
    hierarchyLevel: 5, reportingManagerSlug: 'tech-lead',
    ownedDomains: ['ml-models', 'ai-pipelines', 'data-processing', 'model-evaluation'],
    triggerKeywords: ['model', 'training', 'inference', 'embedding', 'llm', 'ai', 'ml', 'dataset'],
    riskClass: 'B', isAlwaysPresent: false, condition: p => p.hasAiMl,
  },
  {
    slug: 'mobile-developer', roleTitle: 'Mobile Developer', department: 'Engineering',
    hierarchyLevel: 5, reportingManagerSlug: 'tech-lead',
    ownedDomains: ['mobile-app', 'app-store', 'native-apis', 'mobile-performance'],
    triggerKeywords: ['mobile', 'ios', 'android', 'react native', 'flutter', 'expo'],
    riskClass: 'B', isAlwaysPresent: false, condition: p => p.hasMobile,
  },
  {
    slug: 'qa-engineer', roleTitle: 'QA Engineer', department: 'Engineering',
    hierarchyLevel: 5, reportingManagerSlug: 'tech-lead',
    ownedDomains: ['test-coverage', 'regression-testing', 'qa-automation', 'bug-triage'],
    triggerKeywords: ['test', 'bug', 'qa', 'regression', 'e2e', 'unit test', 'coverage', 'jest', 'playwright'],
    riskClass: 'B', isAlwaysPresent: false, condition: p => p.hasBackend || p.hasFrontend,
  },
  {
    slug: 'devops-engineer', roleTitle: 'DevOps Engineer', department: 'Security & Cloud',
    hierarchyLevel: 5, reportingManagerSlug: 'security-cloud-lead',
    ownedDomains: ['ci-cd', 'deployment', 'docker', 'pipelines', 'release-management'],
    triggerKeywords: ['deploy', 'pipeline', 'ci', 'cd', 'docker', 'container', 'release', 'build'],
    riskClass: 'C', isAlwaysPresent: false, condition: p => p.hasInfra || p.hasCiCd,
  },
  {
    slug: 'cloud-engineer', roleTitle: 'Cloud Engineer', department: 'Security & Cloud',
    hierarchyLevel: 5, reportingManagerSlug: 'security-cloud-lead',
    ownedDomains: ['cloud-infra', 'iac', 'cost-optimisation', 'cloud-security'],
    triggerKeywords: ['aws', 'gcp', 'azure', 'terraform', 'pulumi', 'cloud', 'serverless', 'iac'],
    riskClass: 'C', isAlwaysPresent: false, condition: p => p.hasCloud,
  },
  {
    slug: 'cybersecurity-analyst', roleTitle: 'Cybersecurity Analyst (Blue Team)', department: 'Security & Cloud',
    hierarchyLevel: 5, reportingManagerSlug: 'security-cloud-lead',
    ownedDomains: ['threat-monitoring', 'vulnerability-management', 'siem', 'compliance'],
    triggerKeywords: ['security', 'vulnerability', 'cve', 'siem', 'compliance', 'audit', 'threat'],
    riskClass: 'A', isAlwaysPresent: false, condition: p => p.hasInfra || p.hasCloud || p.hasCiCd,
  },
  {
    slug: 'red-team-engineer', roleTitle: 'Red Team Engineer (Pen Tester)', department: 'Security & Cloud',
    hierarchyLevel: 5, reportingManagerSlug: 'security-cloud-lead',
    ownedDomains: ['penetration-testing', 'exploit-research', 'attack-simulation', 'security-gaps'],
    triggerKeywords: ['pen test', 'exploit', 'attack', 'red team', 'owasp', 'injection', 'xss', 'csrf'],
    riskClass: 'A', isAlwaysPresent: false, condition: p => p.hasInfra || p.hasCloud || p.hasBackend,
  },
];

// ---- Main export ------------------------------------------------------------

/**
 * Generates the full ProposedSkill[] for a workspace based on its codebase.
 * Calls the LLM once per agent to generate custom instructions.
 */
export async function generateProposedSkills(
  workspaceId: string,
  profile: CodebaseProfile,
): Promise<ProposedSkill[]> {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new Error('Workspace not found');

  const companyName        = ws.name;
  const companyDescription = ws.companyDescription ?? 'A software company';

  // 1. Filter roles based on codebase signals
  const activeRoles = ROLE_DEFINITIONS.filter(r => r.condition(profile));

  // 2. Build tempId map: slug -> tempId (needed for reportingManagerTempId)
  const slugToTempId: Record<string, string> = {};
  for (const role of activeRoles) {
    slugToTempId[role.slug] = randomUUID();
  }

  // 3. Generate instructions for each role (batch 4 at a time to not overload the LLM)
  const proposedSkills: ProposedSkill[] = [];

  for (let i = 0; i < activeRoles.length; i += 4) {
    const batch = activeRoles.slice(i, i + 4);
    const results = await Promise.all(
      batch.map(async (role) => {
        const reportingManagerSlug = role.reportingManagerSlug;
        const reportingTo = reportingManagerSlug
          ? activeRoles.find(r => r.slug === reportingManagerSlug)?.roleTitle ?? null
          : null;

        const { instructions, description } = await generateInstructions(
          workspaceId,
          companyName,
          companyDescription,
          profile,
          role.roleTitle,
          role.department,
          reportingTo,
          role.ownedDomains,
        );

        const reportingManagerTempId = reportingManagerSlug
          ? slugToTempId[reportingManagerSlug] ?? null
          : null;

        const skill: ProposedSkill = {
          tempId:                 slugToTempId[role.slug],
          slug:                   role.slug,
          realName:               PERSONA_NAMES[role.slug] ?? `Agent ${role.roleTitle}`,
          roleTitle:              role.roleTitle,
          department:             role.department,
          hierarchyLevel:         role.hierarchyLevel,
          reportingManagerTempId,
          instructions,
          description,
          ownedDomains:           role.ownedDomains,
          ownedRepoPaths:         [],
          triggerKeywords:        role.triggerKeywords,
          riskClass:              role.riskClass,
          isAlwaysPresent:        role.isAlwaysPresent,
          isAiGenerated:          true,
        };

        return skill;
      }),
    );
    proposedSkills.push(...results);
  }

  // Sort by hierarchy level so the tree renders top-down
  proposedSkills.sort((a, b) => a.hierarchyLevel - b.hierarchyLevel || a.slug.localeCompare(b.slug));

  return proposedSkills;
}
