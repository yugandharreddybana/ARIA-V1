/**
 * repoAnalysis.service.ts
 * -----------------------
 * Step 4 of onboarding: the "Aria Scout" agent.
 *
 * Reads each connected GitHub repo (file tree + README + package.json +
 * key config files) using the user's stored GitHub OAuth token, then
 * builds a CodebaseProfile that the skillFactory uses to decide which
 * agents to create and what instructions to write for each.
 */

import { db } from '@aria/db';
import { workspaces, projectRepos } from '@aria/db';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { RepoSignals, CodebaseProfile, SelectedRepo } from '../types/onboarding.types';

// ── GitHub API helpers ──────────────────────────────────────────────────────

const GH = 'https://api.github.com';

type GhHeaders = { Authorization: string; Accept: string };

function ghHeaders(token: string): GhHeaders {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };
}

async function fetchText(url: string, headers: GhHeaders): Promise<string> {
  const res = await fetch(url, { headers });
  if (!res.ok) return '';
  return res.text();
}

async function fetchJson<T>(url: string, headers: GhHeaders): Promise<T | null> {
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

// ── File-tree entry returned by GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1 ─

interface GhTreeEntry { path: string; type: 'blob' | 'tree'; }
interface GhTree      { tree: GhTreeEntry[]; }
interface GhRepo      { description: string | null; default_branch: string; language: string | null; }
interface GhContent   { content?: string; encoding?: string; }

// ── Signal detection ──────────────────────────────────────────────────────────────

const FRONTEND_DEPS  = ['react', 'vue', 'next', '@angular', 'svelte', 'nuxt', 'remix', 'gatsby', 'vite'];
const BACKEND_DEPS   = ['express', 'fastify', 'nestjs', '@nestjs', 'hono', 'koa', 'django', 'flask', 'rails', 'spring'];
const AIML_DEPS      = ['torch', 'tensorflow', 'transformers', 'langchain', 'openai', 'anthropic', '@anthropic', 'huggingface', 'diffusers', 'sentence-transformers'];
const CLOUD_FILES    = ['serverless.yml', 'serverless.yaml', 'samconfig.toml', 'cdk.json', 'pulumi.yaml', 'azure-pipelines.yml'];
const CLOUD_DIRS     = ['terraform', 'infra', 'infrastructure', 'cdk', 'pulumi', '.aws'];
const MOBILE_DEPS    = ['react-native', 'expo', 'flutter', 'capacitor', 'ionic'];

function detectFromPaths(paths: string[]): {
  hasInfra: boolean;
  hasCiCd:  boolean;
  hasCloud: boolean;
  hasMobile: boolean;
} {
  const pathSet = new Set(paths.map(p => p.toLowerCase()));
  const hasDockerfile  = pathSet.has('dockerfile') || pathSet.has('docker-compose.yml') || pathSet.has('docker-compose.yaml');
  const hasCiCd        = paths.some(p => p.startsWith('.github/workflows') || p.includes('gitlab-ci') || p === 'Jenkinsfile' || p.includes('circleci'));
  const hasCloud       = paths.some(p => CLOUD_FILES.includes(p) || CLOUD_DIRS.some(d => p.startsWith(d + '/')));
  const hasMobile      = paths.some(p => p.includes('android') || p.includes('ios') || p === 'pubspec.yaml');

  return { hasInfra: hasDockerfile, hasCiCd, hasCloud, hasMobile };
}

function detectFromDeps(deps: Record<string, string>): {
  hasFrontend: boolean;
  hasBackend:  boolean;
  hasAiMl:     boolean;
  hasMobile:   boolean;
  frameworks:  string[];
} {
  const keys = Object.keys(deps).map(k => k.toLowerCase());
  const hasFrontend = FRONTEND_DEPS.some(d => keys.some(k => k.includes(d)));
  const hasBackend  = BACKEND_DEPS.some(d => keys.some(k => k.includes(d)));
  const hasAiMl     = AIML_DEPS.some(d => keys.some(k => k.includes(d)));
  const hasMobile   = MOBILE_DEPS.some(d => keys.some(k => k.includes(d)));

  // Build a human-readable frameworks list for the LLM prompt
  const frameworks: string[] = [];
  if (keys.some(k => k.includes('next')))       frameworks.push('Next.js');
  else if (keys.some(k => k.includes('react'))) frameworks.push('React');
  if (keys.some(k => k.includes('vue')))        frameworks.push('Vue');
  if (keys.some(k => k.includes('svelte')))     frameworks.push('Svelte');
  if (keys.some(k => k.includes('express')))    frameworks.push('Express');
  if (keys.some(k => k.includes('fastify')))    frameworks.push('Fastify');
  if (keys.some(k => k.includes('nestjs') || k.includes('@nestjs'))) frameworks.push('NestJS');
  if (keys.some(k => k.includes('hono')))       frameworks.push('Hono');
  if (keys.some(k => k.includes('drizzle')))    frameworks.push('Drizzle ORM');
  if (keys.some(k => k.includes('prisma')))     frameworks.push('Prisma');
  if (keys.some(k => k.includes('langchain')))  frameworks.push('LangChain');
  if (keys.some(k => k.includes('openai')))     frameworks.push('OpenAI SDK');
  if (keys.some(k => k.includes('anthropic')))  frameworks.push('Anthropic SDK');
  if (keys.some(k => k.includes('torch')))      frameworks.push('PyTorch');
  if (keys.some(k => k.includes('expo')))       frameworks.push('Expo');
  if (keys.some(k => k.includes('react-native'))) frameworks.push('React Native');

  return { hasFrontend, hasBackend, hasAiMl, hasMobile, frameworks };
}

// ── Analyse a single repo ─────────────────────────────────────────────────────────────

async function analyseRepo(fullName: string, branch: string, ghToken: string): Promise<RepoSignals> {
  const headers = ghHeaders(ghToken);
  const [owner, repo] = fullName.split('/');

  // 1. Repo metadata (description + default language)
  const ghRepo = await fetchJson<GhRepo>(`${GH}/repos/${fullName}`, headers);
  const primaryLang = ghRepo?.language ?? 'Unknown';
  const repoDesc    = ghRepo?.description ?? '';

  // 2. File tree (recursive, flat list of all paths)
  const treeData = await fetchJson<GhTree>(
    `${GH}/repos/${fullName}/git/trees/${branch}?recursive=1`,
    headers,
  );
  const paths = (treeData?.tree ?? []).filter(e => e.type === 'blob').map(e => e.path);

  // 3. README (first 600 chars)
  let readmeText = '';
  const readmePath = paths.find(p => /^readme\.(md|txt|rst)$/i.test(p));
  if (readmePath) {
    const raw = await fetchText(
      `https://raw.githubusercontent.com/${fullName}/${branch}/${readmePath}`,
      headers,
    );
    readmeText = raw.slice(0, 600);
  }

  // 4. package.json (root level only)
  let allDeps: Record<string, string> = {};
  if (paths.includes('package.json')) {
    const content = await fetchJson<GhContent>(
      `${GH}/repos/${fullName}/contents/package.json?ref=${branch}`,
      headers,
    );
    if (content?.content && content.encoding === 'base64') {
      try {
        const parsed = JSON.parse(Buffer.from(content.content, 'base64').toString('utf-8'));
        allDeps = { ...parsed.dependencies, ...parsed.devDependencies };
      } catch {
        // malformed package.json — ignore
      }
    }
  }

  // 5. requirements.txt (Python)
  let requirementsTxt = '';
  if (paths.includes('requirements.txt')) {
    requirementsTxt = await fetchText(
      `https://raw.githubusercontent.com/${fullName}/${branch}/requirements.txt`,
      headers,
    );
  }
  // Treat Python requirement names as pseudo-deps
  const pythonDeps = requirementsTxt
    .split('\n')
    .map(l => l.split('==')[0].split('>=')[0].trim().toLowerCase())
    .filter(Boolean);
  for (const dep of pythonDeps) allDeps[dep] = '*';

  // 6. Run detection
  const pathSignals = detectFromPaths(paths);
  const depSignals  = detectFromDeps(allDeps);

  const description = (readmeText || repoDesc).trim();

  return {
    repoName:    repo,
    fullName,
    hasFrontend: depSignals.hasFrontend,
    hasBackend:  depSignals.hasBackend,
    hasAiMl:     depSignals.hasAiMl,
    hasInfra:    pathSignals.hasInfra,
    hasCiCd:     pathSignals.hasCiCd,
    hasCloud:    pathSignals.hasCloud,
    hasMobile:   depSignals.hasMobile || pathSignals.hasMobile,
    primaryLang,
    frameworks:  depSignals.frameworks,
    description,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────────

/**
 * buildCodebaseProfile
 * --------------------
 * Analyses all repos connected to a workspace and returns a
 * CodebaseProfile that the skillFactory uses to build the agent team.
 *
 * @param workspaceId - the workspace whose repos we read
 * @param projectId   - the project whose projectRepos rows we read
 * @param ghToken     - decrypted GitHub OAuth access token
 */
export async function buildCodebaseProfile(
  repos: SelectedRepo[],
  ghToken: string,
): Promise<CodebaseProfile> {
  if (repos.length === 0) throw new AppError('No repos provided for analysis', 400);

  // Analyse all repos in parallel
  const repoSignals = await Promise.all(
    repos.map(r => analyseRepo(r.fullName, r.branch || 'main', ghToken)),
  );

  // Aggregate boolean flags
  const agg = repoSignals.reduce(
    (acc, r) => ({
      hasFrontend: acc.hasFrontend || r.hasFrontend,
      hasBackend:  acc.hasBackend  || r.hasBackend,
      hasAiMl:     acc.hasAiMl    || r.hasAiMl,
      hasInfra:    acc.hasInfra   || r.hasInfra,
      hasCiCd:     acc.hasCiCd    || r.hasCiCd,
      hasCloud:    acc.hasCloud    || r.hasCloud,
      hasMobile:   acc.hasMobile   || r.hasMobile,
    }),
    { hasFrontend: false, hasBackend: false, hasAiMl: false, hasInfra: false, hasCiCd: false, hasCloud: false, hasMobile: false },
  );

  const allFrameworks = [...new Set(repoSignals.flatMap(r => r.frameworks))];
  const allLangs      = [...new Set(repoSignals.map(r => r.primaryLang).filter(Boolean))];

  // Build a 3-5 sentence project summary for the LLM prompt
  const repoDescs = repoSignals.map(r => `${r.repoName}: ${r.description}`).filter(d => d.length > 10).join(' | ');
  const stackLine  = allFrameworks.length > 0 ? `The tech stack includes ${allFrameworks.join(', ')}.` : '';
  const layerLine  = [
    agg.hasFrontend ? 'frontend UI' : '',
    agg.hasBackend  ? 'backend API' : '',
    agg.hasAiMl     ? 'AI/ML components' : '',
    agg.hasMobile   ? 'mobile app' : '',
    agg.hasInfra || agg.hasCiCd || agg.hasCloud ? 'infrastructure/DevOps' : '',
  ].filter(Boolean).join(', ');

  const projectSummary = [
    repoDescs ? `Project overview: ${repoDescs}.` : '',
    stackLine,
    layerLine ? `The project has ${layerLine} layers.` : '',
    `Primary language(s): ${allLangs.join(', ') || 'unknown'}.`,
  ].filter(Boolean).join(' ');

  return { repos: repoSignals, ...agg, allFrameworks, allLangs, projectSummary };
}
