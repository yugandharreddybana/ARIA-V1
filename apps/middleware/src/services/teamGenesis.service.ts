/**
 * teamGenesis.service.ts
 *
 * The "Team Genesis" pipeline — triggered automatically after a user connects
 * GitHub repos to a project. It:
 *
 *   1. Reads each selected repo via the GitHub REST API (file tree, README,
 *      package.json / pyproject.toml / Cargo.toml / go.mod, key source dirs).
 *   2. Builds a CodebaseProfile per repo (tech stack, layers, purpose).
 *   3. Merges all profiles into a ProjectProfile.
 *   4. Runs a SkillFactory that:
 *      a. Always produces the fixed C-suite / leadership layer (CEO, CTO, CPO,
 *         Scrum Master, Tech Lead).
 *      b. Dynamically adds engineering, QA, security, cloud, DevOps agents only
 *         when the detected stack actually needs them.
 *      c. Writes fully-framed, project-specific skill instructions into each
 *         agent's `description` and `skillMdPath` fields.
 *   5. Returns a SkillProposal[] — NOT yet saved. The frontend shows this for
 *      user review/edit, then calls commitTeamGenesis() to persist.
 */

import { db } from '@aria/db';
import { projects, projectRepos, skills, teams, teamMembers } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import { getLlmConfig, decryptApiKey } from './workspace.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RepoProfile {
  repoName: string;
  repoUrl: string;
  branch: string;
  purpose: string;           // e.g. "Next.js 14 web frontend with Tailwind + shadcn/ui"
  techStack: string[];       // e.g. ["TypeScript","Next.js","Tailwind","Drizzle"]
  layers: RepoLayer[];       // detected architectural layers
  keyDirs: string[];         // top-level dirs that matter (src, app, packages, etc.)
  readme: string;            // first 3000 chars of README
  rawNotes: string;          // LLM-generated analyst notes
}

export type RepoLayer =
  | 'frontend'
  | 'backend'
  | 'database'
  | 'infrastructure'
  | 'ml'
  | 'mobile'
  | 'cli'
  | 'library'
  | 'monorepo';

export interface ProjectProfile {
  projectId: string;
  projectName: string;
  repos: RepoProfile[];
  allLayers: Set<RepoLayer>;
  allTechStack: string[];
  summary: string;           // LLM-generated cross-repo summary
}

export interface SkillProposal {
  slug: string;
  realName: string;
  roleTitle: string;
  description: string;       // full framed system-prompt instructions
  riskClass: 'A' | 'B' | 'C' | 'D';
  ownedDomains: string[];
  ownedRepoPaths: string[];
  triggerKeywords: string[];
  teamName: string;          // which team this agent belongs to
  teamRole: 'lead' | 'member' | 'scrum_master' | 'observer';
  layer: string;             // 'leadership' | 'engineering' | 'security' | etc.
}

export interface GenesisProgress {
  type: 'reading_repo' | 'repo_done' | 'creating_agents' | 'agent_created' | 'done' | 'error';
  repoName?: string;
  repoIndex?: number;
  totalRepos?: number;
  agentName?: string;
  totalAgents?: number;
  agentIndex?: number;
  message: string;
  proposal?: SkillProposal[];  // only on 'done'
}

// ─── GitHub content helpers ───────────────────────────────────────────────────

async function ghGet<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch { return null; }
}

async function getFileContent(owner: string, repo: string, path: string, branch: string, token: string): Promise<string> {
  const data = await ghGet<{ content?: string; encoding?: string }>(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, token,
  );
  if (!data?.content) return '';
  try { return Buffer.from(data.content, 'base64').toString('utf-8').slice(0, 8000); }
  catch { return ''; }
}

async function getTree(owner: string, repo: string, branch: string, token: string): Promise<string[]> {
  const data = await ghGet<{ tree?: { path: string; type: string }[] }>(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, token,
  );
  return (data?.tree ?? []).filter(n => n.type === 'blob').map(n => n.path).slice(0, 500);
}

function extractOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
  const m = repoUrl.match(/github\.com[/:]([^/]+)\/([^/\.]+)(\.git)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

// ─── Stack detector ───────────────────────────────────────────────────────────

function detectStackFromFiles(allPaths: string[], packageJson: string, extraManifests: Record<string, string>): { tech: string[]; layers: RepoLayer[] } {
  const tech = new Set<string>();
  const layers = new Set<RepoLayer>();
  const p = allPaths.join('\n').toLowerCase();

  // Language signals
  if (p.includes('.ts') || p.includes('.tsx'))    tech.add('TypeScript');
  if (p.includes('.js') || p.includes('.jsx'))    tech.add('JavaScript');
  if (p.includes('.py'))                           { tech.add('Python'); }
  if (p.includes('.go'))                           { tech.add('Go'); }
  if (p.includes('.rs'))                           { tech.add('Rust'); }
  if (p.includes('.java'))                         { tech.add('Java'); }
  if (p.includes('.cs'))                           tech.add('C#');
  if (p.includes('.rb'))                           tech.add('Ruby');

  // Framework signals from package.json
  const pkg = packageJson.toLowerCase();
  if (pkg.includes('"next"') || pkg.includes('next/'))      { tech.add('Next.js'); layers.add('frontend'); }
  if (pkg.includes('"react"'))                               { tech.add('React'); layers.add('frontend'); }
  if (pkg.includes('"vue"'))                                 { tech.add('Vue.js'); layers.add('frontend'); }
  if (pkg.includes('"svelte"'))                              { tech.add('Svelte'); layers.add('frontend'); }
  if (pkg.includes('"express"') || pkg.includes('"fastify"') || pkg.includes('"hono"')) { tech.add('Node.js API'); layers.add('backend'); }
  if (pkg.includes('"drizzle-orm"'))                         { tech.add('Drizzle ORM'); layers.add('database'); }
  if (pkg.includes('"prisma"'))                              { tech.add('Prisma'); layers.add('database'); }
  if (pkg.includes('"tailwindcss"'))                         tech.add('Tailwind CSS');
  if (pkg.includes('"@anthropic"') || pkg.includes('openai') || pkg.includes('nvidia')) tech.add('LLM Integration');
  if (pkg.includes('"react-native"') || pkg.includes('expo')) { tech.add('React Native'); layers.add('mobile'); }

  // Python specifics
  const pyproject = (extraManifests['pyproject.toml'] ?? '').toLowerCase();
  const requirements = (extraManifests['requirements.txt'] ?? '').toLowerCase();
  const combined = pyproject + requirements;
  if (combined.includes('fastapi') || combined.includes('flask') || combined.includes('django')) { tech.add('Python API'); layers.add('backend'); }
  if (combined.includes('torch') || combined.includes('tensorflow') || combined.includes('transformers')) { tech.add('ML/AI'); layers.add('ml'); }
  if (combined.includes('pandas') || combined.includes('numpy') || combined.includes('scikit')) { tech.add('Data Science'); layers.add('ml'); }

  // Infrastructure signals
  if (p.includes('dockerfile') || p.includes('.dockerignore')) { tech.add('Docker'); layers.add('infrastructure'); }
  if (p.includes('terraform') || p.includes('.tf'))            { tech.add('Terraform'); layers.add('infrastructure'); }
  if (p.includes('kubernetes') || p.includes('k8s') || p.includes('.yaml') && p.includes('kind: deployment')) { tech.add('Kubernetes'); layers.add('infrastructure'); }
  if (p.includes('.github/workflows'))                          { tech.add('GitHub Actions'); layers.add('infrastructure'); }
  if (p.includes('helm'))                                       { tech.add('Helm'); layers.add('infrastructure'); }

  // Monorepo signals
  if (p.includes('packages/') && (p.includes('apps/') || p.includes('libs/'))) layers.add('monorepo');
  if (p.includes('turbo.json') || p.includes('nx.json') || p.includes('pnpm-workspace')) { tech.add('Monorepo Tooling'); layers.add('monorepo'); }

  // CLI signals
  if (pkg.includes('"bin"') || p.includes('cmd/') || p.includes('cli/')) layers.add('cli');

  // If nothing detected
  if (layers.size === 0) layers.add('library');

  return { tech: Array.from(tech), layers: Array.from(layers) };
}

// ─── LLM call helper (uses workspace config) ──────────────────────────────────

async function callLlm(workspaceId: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const config = await getLlmConfig(workspaceId);
  // Build the appropriate client based on provider
  const provider = config.provider ?? 'ollama';

  let baseUrl: string;
  let headers: Record<string, string>;

  if (provider === 'ollama') {
    baseUrl = (config.baseUrl ?? 'http://localhost:11434') + '/api/chat';
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model ?? 'qwen2.5-coder:7b', stream: false, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}`);
    const d = await res.json() as { message?: { content: string } };
    return d.message?.content ?? '';
  }

  // OpenAI-compatible (anthropic uses its own format — handled separately)
  if (provider === 'anthropic') {
    const raw = config.hasApiKey ? '' : '';
    const apiKeyRow = await db.query.workspaces?.findFirst ? null : null;
    // We need the raw key — fetch it from workspace
    const ws = await db.query.workspaces.findFirst({ where: (w: { id: { equals: (v: string) => unknown } }) => w.id.equals(workspaceId) } as never);
    const key = (ws as { llmApiKeyEncrypted?: string })?.llmApiKeyEncrypted ? decryptApiKey((ws as { llmApiKeyEncrypted: string }).llmApiKeyEncrypted) : '';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.model ?? 'claude-sonnet-4-5', max_tokens: 2048, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
    const d = await res.json() as { content?: { text: string }[] };
    return d.content?.[0]?.text ?? '';
  }

  // OpenAI / NVIDIA NIM / Custom — all OpenAI-compatible
  const endpointMap: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    nvidia: 'https://integrate.api.nvidia.com/v1',
  };
  baseUrl = (config.baseUrl ?? endpointMap[provider] ?? 'http://localhost:8000/v1') + '/chat/completions';
  headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${await getRawApiKey(workspaceId)}` };
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: config.model, stream: false, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`LLM error ${res.status}`);
  const d = await res.json() as { choices?: { message: { content: string } }[] };
  return d.choices?.[0]?.message?.content ?? '';
}

async function getRawApiKey(workspaceId: string): Promise<string> {
  // We import drizzle eq at top — re-use it
  const { eq: eqFn } = await import('drizzle-orm');
  const { workspaces } = await import('@aria/db');
  const ws = await db.query.workspaces.findFirst({ where: eqFn(workspaces.id, workspaceId) });
  if (!(ws as { llmApiKeyEncrypted?: string })?.llmApiKeyEncrypted) return '';
  return decryptApiKey((ws as { llmApiKeyEncrypted: string }).llmApiKeyEncrypted);
}

// ─── Repo Analyser Agent ──────────────────────────────────────────────────────

export async function analyseRepo(
  repoProfile: Pick<RepoProfile, 'repoName' | 'repoUrl' | 'branch'>,
  githubToken: string,
  workspaceId: string,
  analysisAgentDescription: string,
): Promise<RepoProfile> {
  const or = extractOwnerRepo(repoProfile.repoUrl);
  if (!or) throw new AppError(`Cannot parse repo URL: ${repoProfile.repoUrl}`, 400);

  const [allPaths, readmeRaw, packageJsonRaw, pyprojectRaw, requirementsRaw, goModRaw] = await Promise.all([
    getTree(or.owner, or.repo, repoProfile.branch, githubToken),
    getFileContent(or.owner, or.repo, 'README.md', repoProfile.branch, githubToken)
      .catch(() => getFileContent(or.owner, or.repo, 'readme.md', repoProfile.branch, githubToken)),
    getFileContent(or.owner, or.repo, 'package.json', repoProfile.branch, githubToken),
    getFileContent(or.owner, or.repo, 'pyproject.toml', repoProfile.branch, githubToken),
    getFileContent(or.owner, or.repo, 'requirements.txt', repoProfile.branch, githubToken),
    getFileContent(or.owner, or.repo, 'go.mod', repoProfile.branch, githubToken),
  ]);

  const { tech, layers } = detectStackFromFiles(allPaths, packageJsonRaw, {
    'pyproject.toml': pyprojectRaw,
    'requirements.txt': requirementsRaw,
    'go.mod': goModRaw,
  });

  const topDirs = [...new Set(allPaths.map(p => p.split('/')[0]))].filter(Boolean).slice(0, 20);
  const keySourceDirs = topDirs.filter(d => ['src','app','apps','packages','lib','libs','api','core','cmd','server','client','web','mobile'].includes(d));

  const systemPrompt = `You are a senior software architect acting as the ARIA Analysis Agent.
${analysisAgentDescription}

Your job: read the information about a repository and produce a concise but thorough analyst report.
Output ONLY valid JSON matching this schema (no markdown fences, no extra text):
{
  "purpose": "<one sentence — what this repo does>",
  "rawNotes": "<3-5 sentences — tech stack, architecture, key patterns, what kinds of engineers would work on it>"
}`;

  const userPrompt = `Repository: ${repoProfile.repoName} (${repoProfile.repoUrl})
Branch: ${repoProfile.branch}

Detected tech stack: ${tech.join(', ') || 'unknown'}
Detected architectural layers: ${layers.join(', ') || 'unknown'}
Top-level directories: ${topDirs.join(', ')}
Key source dirs: ${keySourceDirs.join(', ')}

README (first 3000 chars):
${readmeRaw.slice(0, 3000) || '(no README found)'}

package.json:
${packageJsonRaw.slice(0, 2000) || '(not found)'}

All file paths (first 500):
${allPaths.slice(0, 500).join('\n')}`;

  let purpose = `${repoProfile.repoName} — ${layers.join(', ')} project`;
  let rawNotes = `Tech stack: ${tech.join(', ')}. Layers: ${layers.join(', ')}. Top dirs: ${topDirs.join(', ')}.`;

  try {
    const llmOut = await callLlm(workspaceId, systemPrompt, userPrompt);
    const parsed = JSON.parse(llmOut.trim()) as { purpose?: string; rawNotes?: string };
    purpose = parsed.purpose ?? purpose;
    rawNotes = parsed.rawNotes ?? rawNotes;
  } catch { /* fallback to static values above */ }

  return {
    repoName: repoProfile.repoName,
    repoUrl: repoProfile.repoUrl,
    branch: repoProfile.branch,
    purpose,
    techStack: tech,
    layers,
    keyDirs: keySourceDirs,
    readme: readmeRaw.slice(0, 3000),
    rawNotes,
  };
}

// ─── Skill Factory ────────────────────────────────────────────────────────────

// Fixed leadership layer — always created regardless of project type
const LEADERSHIP_LAYER: Array<Omit<SkillProposal, 'description' | 'ownedRepoPaths'>> = [
  {
    slug: 'ceo',
    realName: 'Aria CEO',
    roleTitle: 'Chief Executive Officer',
    riskClass: 'A',
    ownedDomains: ['product-vision', 'roadmap', 'strategic-decisions', 'team-direction', 'design-approval', 'release-approval'],
    triggerKeywords: ['vision', 'roadmap', 'strategy', 'priority', 'direction', 'approve', 'release', 'design', 'product decision', 'launch'],
    teamName: 'Leadership',
    teamRole: 'lead',
    layer: 'leadership',
  },
  {
    slug: 'cto',
    realName: 'Aria CTO',
    roleTitle: 'Chief Technology Officer',
    riskClass: 'A',
    ownedDomains: ['architecture', 'tech-debt', 'engineering-standards', 'infrastructure-decisions', 'security-policy'],
    triggerKeywords: ['architecture', 'tech stack', 'infrastructure', 'scalability', 'engineering decision', 'tech debt', 'platform'],
    teamName: 'Leadership',
    teamRole: 'member',
    layer: 'leadership',
  },
  {
    slug: 'cpo',
    realName: 'Aria CPO',
    roleTitle: 'Chief Product Officer',
    riskClass: 'A',
    ownedDomains: ['product-requirements', 'user-experience', 'feature-prioritisation', 'acceptance-criteria'],
    triggerKeywords: ['feature', 'user story', 'acceptance criteria', 'product requirement', 'ux', 'user experience', 'priority'],
    teamName: 'Leadership',
    teamRole: 'member',
    layer: 'leadership',
  },
  {
    slug: 'scrum-master',
    realName: 'Aria Scrum Master',
    roleTitle: 'Scrum Master',
    riskClass: 'B',
    ownedDomains: ['sprint-planning', 'standup', 'retrospectives', 'blockers', 'velocity'],
    triggerKeywords: ['sprint', 'standup', 'blocker', 'retrospective', 'velocity', 'planning', 'ticket assignment', 'scrum'],
    teamName: 'Leadership',
    teamRole: 'scrum_master',
    layer: 'leadership',
  },
  {
    slug: 'tech-lead',
    realName: 'Aria Tech Lead',
    roleTitle: 'Technical Lead',
    riskClass: 'B',
    ownedDomains: ['code-review', 'technical-mentorship', 'pull-request-approval', 'cross-team-coordination'],
    triggerKeywords: ['code review', 'pr review', 'technical guidance', 'mentorship', 'best practices', 'tech lead'],
    teamName: 'Engineering',
    teamRole: 'lead',
    layer: 'leadership',
  },
];

function buildCeoInstructions(profile: ProjectProfile): string {
  const repoList = profile.repos.map(r => `  - ${r.repoName}: ${r.purpose}`).join('\n');
  const tech = [...new Set(profile.allTechStack)].join(', ');
  const layers = [...profile.allLayers].join(', ');
  return `You are the Chief Executive Officer of the AI engineering company built on top of the "${profile.projectName}" project.

Project Overview:
${profile.summary}

Repositories under your oversight:
${repoList}

Technology landscape: ${tech}
Architectural layers: ${layers}

Your role and responsibilities:
- Own the product vision, design direction, and long-term roadmap for ${profile.projectName}. Every feature, every sprint goal, every release must align with the vision you define.
- Review and approve all major product decisions. No feature ships without your explicit sign-off on whether it serves the product strategy.
- Maintain a clear prioritisation of what matters most right now for ${profile.projectName}. When agents disagree on priority, you have the final word.
- Champion user experience and product quality. You read every UI/UX propo