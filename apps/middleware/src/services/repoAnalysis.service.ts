/**
 * repoAnalysis.service.ts
 * -----------------------
 * The "Scout" agent that analyses connected GitHub repos and produces a
 * CodebaseProfile used by skillFactory to generate the AI team.
 *
 * What it reads per repo (in order of priority):
 *   1. Repository metadata (language, description)
 *   2. Root file tree (one level deep)
 *   3. package.json / requirements.txt / pyproject.toml / go.mod
 *   4. README.md (first 1000 chars)
 *   5. .github/workflows file list (presence check only)
 *   6. Docker / IaC files presence check
 */

import type { CodebaseProfile, RepoSignals, SelectedRepo } from '../types/onboarding.types';

const GH_API = 'https://api.github.com';

// ── Helpers ───────────────────────────────────────────────────────────────────
function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function ghGet<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: ghHeaders(token) });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ── Detector helpers ───────────────────────────────────────────────────────────
const FRONTEND_PKGS  = ['react', 'vue', 'next', 'nuxt', '@angular/core', 'svelte', 'solid-js', 'astro'];
const BACKEND_PKGS   = ['express', 'fastify', 'koa', 'nestjs', 'hapi', 'flask', 'django', 'rails', 'gin', 'fiber', 'axum', 'actix'];
const AI_ML_PKGS     = ['torch', 'tensorflow', 'transformers', 'langchain', 'openai', 'anthropic', 'llama-index', 'haystack', 'scikit-learn', 'keras'];
const INFRA_FILES    = ['dockerfile', 'docker-compose.yml', 'docker-compose.yaml'];
const CLOUD_FILES    = ['serverless.yml', 'serverless.yaml', 'cdk.json', 'pulumi.yaml', 'terraform.tf', 'main.tf'];
const CI_DIRS        = ['.github/workflows', '.gitlab-ci.yml', 'jenkinsfile', '.circleci'];
const MOBILE_PKGS    = ['react-native', 'expo', '@capacitor/core', 'flutter'];

function detectFromPackageJson(content: string) {
  const lower = content.toLowerCase();
  return {
    hasFrontend: FRONTEND_PKGS.some(p => lower.includes(`"${p}"`)),
    hasBackend:  BACKEND_PKGS.some(p  => lower.includes(`"${p}"`)),
    hasAiMl:     AI_ML_PKGS.some(p    => lower.includes(`"${p}"`)),
    hasMobile:   MOBILE_PKGS.some(p   => lower.includes(`"${p}"`)),
    frameworks:  [
      ...FRONTEND_PKGS.filter(p => lower.includes(`"${p}"`)),
      ...BACKEND_PKGS.filter(p  => lower.includes(`"${p}"`)),
    ],
  };
}

function detectFromPythonDeps(content: string) {
  const lower = content.toLowerCase();
  return {
    hasBackend: BACKEND_PKGS.some(p => lower.includes(p)),
    hasAiMl:   AI_ML_PKGS.some(p   => lower.includes(p)),
    frameworks: AI_ML_PKGS.filter(p => lower.includes(p)),
  };
}

function detectFromFileTree(names: string[]) {
  const lower = names.map(n => n.toLowerCase());
  return {
    hasInfra: INFRA_FILES.some(f => lower.includes(f)),
    hasCloud: CLOUD_FILES.some(f => lower.some(n => n.includes(f))),
    hasCiCd:  CI_DIRS.some(d    => lower.some(n => n.includes(d.split('/')[0]))),
  };
}

// ── Per-repo analysis ───────────────────────────────────────────────────────────
async function analyseRepo(repo: SelectedRepo, token: string): Promise<RepoSignals> {
  const [owner, repoName] = repo.fullName.split('/');
  const base = `${GH_API}/repos/${owner}/${repoName}`;

  // 1. Repo metadata
  const meta = await ghGet<{ language: string | null; description: string | null }>(
    base, token,
  );

  // 2. Root file tree
  const tree = await ghGet<{ tree: Array<{ path: string; type: string }> }>(
    `${base}/git/trees/${repo.branch}?recursive=0`, token,
  );
  const rootNames = (tree?.tree ?? []).map(n => n.path.toLowerCase());

  // 3. Dependencies
  let depSignals = { hasFrontend: false, hasBackend: false, hasAiMl: false, hasMobile: false, frameworks: [] as string[] };
  const pkgJson = await ghGet<object>(`${GH_API}/repos/${owner}/${repoName}/contents/package.json`, token) as { content?: string } | null;
  if (pkgJson?.content) {
    const decoded = Buffer.from(pkgJson.content, 'base64').toString('utf8');
    depSignals = { ...depSignals, ...detectFromPackageJson(decoded) };
  }

  // Python deps (requirements.txt or pyproject.toml)
  const pyReqs = await ghGet<{ content?: string }>(`${GH_API}/repos/${owner}/${repoName}/contents/requirements.txt`, token);
  if (pyReqs?.content) {
    const decoded = Buffer.from(pyReqs.content, 'base64').toString('utf8');
    const py = detectFromPythonDeps(decoded);
    depSignals.hasBackend = depSignals.hasBackend || py.hasBackend;
    depSignals.hasAiMl   = depSignals.hasAiMl   || py.hasAiMl;
    depSignals.frameworks = [...depSignals.frameworks, ...py.frameworks];
  }

  // 4. README
  const readme = await ghGet<{ content?: string }>(`${GH_API}/repos/${owner}/${repoName}/contents/README.md`, token);
  const readmeText = readme?.content
    ? Buffer.from(readme.content, 'base64').toString('utf8').slice(0, 1000)
    : (meta?.description ?? '');

  // 5. File-tree presence checks
  const treeSignals = detectFromFileTree(rootNames);

  // Go.mod detection (Go backend)
  if (rootNames.includes('go.mod')) {
    depSignals.hasBackend = true;
    depSignals.frameworks.push('Go');
  }

  // Infer language
  const primaryLang = meta?.language ?? (depSignals.hasFrontend ? 'TypeScript' : depSignals.hasAiMl ? 'Python' : 'Unknown');

  return {
    repoName:    repo.repoName,
    hasFrontend: depSignals.hasFrontend,
    hasBackend:  depSignals.hasBackend,
    hasAiMl:     depSignals.hasAiMl,
    hasMobile:   depSignals.hasMobile,
    hasInfra:    treeSignals.hasInfra,
    hasCiCd:     treeSignals.hasCiCd,
    hasCloud:    treeSignals.hasCloud,
    primaryLang,
    frameworks:  [...new Set(depSignals.frameworks)],
    description: readmeText.slice(0, 500),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────────
export async function buildCodebaseProfile(
  repos: SelectedRepo[],
  githubToken: string,
): Promise<CodebaseProfile> {
  const signals = await Promise.all(repos.map(r => analyseRepo(r, githubToken)));

  const agg = {
    hasFrontend: signals.some(s => s.hasFrontend),
    hasBackend:  signals.some(s => s.hasBackend),
    hasAiMl:     signals.some(s => s.hasAiMl),
    hasInfra:    signals.some(s => s.hasInfra),
    hasCiCd:     signals.some(s => s.hasCiCd),
    hasCloud:    signals.some(s => s.hasCloud),
    hasMobile:   signals.some(s => s.hasMobile),
    allFrameworks: [...new Set(signals.flatMap(s => s.frameworks))],
    allLangs:      [...new Set(signals.map(s => s.primaryLang).filter(Boolean))],
  };

  const repoNames  = signals.map(s => s.repoName).join(', ');
  const fwSummary  = agg.allFrameworks.length ? ` using ${agg.allFrameworks.slice(0, 5).join(', ')}` : '';
  const layers     = [
    agg.hasFrontend ? 'a frontend' : null,
    agg.hasBackend  ? 'a backend API' : null,
    agg.hasAiMl     ? 'AI/ML components' : null,
    agg.hasInfra    ? 'containerised infrastructure' : null,
  ].filter(Boolean).join(', ');

  const projectSummary =
    `This project consists of ${signals.length} repo(s): ${repoNames}${fwSummary}. ` +
    (layers ? `It includes ${layers}. ` : '') +
    `Primary language(s): ${agg.allLangs.join(', ') || 'unknown'}.`;

  return { repos: signals, ...agg, projectSummary };
}

/** Decrypt and return the workspace GitHub token for API calls. */
export function decryptGithubToken(encrypted: string | null): string {
  if (!encrypted) throw new Error('No GitHub token available for this workspace');
  // Token is stored as-is for now (encryption layer plugged in via auth.service).
  // If encryption is enabled, replace this with the workspace crypto helper.
  return encrypted;
}
