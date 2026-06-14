/**
 * repoAnalysis.service.ts
 * -----------------------
 * The "Scout" agent.  Given a list of SelectedRepo objects and a GitHub
 * access token, this service:
 *
 *  1. Fetches the file tree (recursive) for each repo via GitHub REST API.
 *  2. Reads README.md + package.json / requirements.txt / go.mod / Cargo.toml
 *     / pubspec.yaml from the root to understand the tech stack.
 *  3. Detects signals (hasFrontend, hasBackend, hasAiMl …) from file names
 *     and dependency lists.
 *  4. Returns a CodebaseProfile that skillFactory.service uses to decide
 *     which agents to create and to write their system prompts.
 */

import type { SelectedRepo, RepoSignals, CodebaseProfile } from '../types/onboarding.types';

// ── GitHub REST helpers ──────────────────────────────────────────────────
async function ghFetch(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return res.json();
}

async function getFileContent(fullName: string, path: string, branch: string, token: string): Promise<string | null> {
  const data = await ghFetch(
    `https://api.github.com/repos/${fullName}/contents/${path}?ref=${branch}`,
    token,
  ) as { content?: string; encoding?: string } | null;
  if (!data?.content) return null;
  return Buffer.from(data.content, data.encoding === 'base64' ? 'base64' : 'utf-8').toString('utf-8');
}

async function getFileTree(fullName: string, branch: string, token: string): Promise<string[]> {
  const data = await ghFetch(
    `https://api.github.com/repos/${fullName}/git/trees/${branch}?recursive=1`,
    token,
  ) as { tree?: { path: string; type: string }[] } | null;
  return (data?.tree ?? []).map(f => f.path);
}

// ── Detection helpers ──────────────────────────────────────────────────────
const FRONTEND_DEPS  = ['react', 'vue', 'next', '@angular/core', 'svelte', 'nuxt', 'vite', 'gatsby', 'remix'];
const BACKEND_DEPS   = ['express', 'fastify', '@nestjs/core', 'hono', 'koa', 'django', 'flask', 'rails', 'gin', 'echo', 'actix-web', 'axum'];
const AIML_DEPS      = ['torch', 'tensorflow', 'transformers', 'langchain', 'openai', 'anthropic', '@langchain', 'llama-index', 'haystack', 'scikit-learn', 'numpy', 'pandas'];
const INFRA_FILES    = ['dockerfile', 'docker-compose.yml', 'docker-compose.yaml'];
const CICD_FILES     = ['.github/workflows', '.gitlab-ci.yml', 'jenkinsfile', '.circleci/config.yml', '.travis.yml'];
const CLOUD_FILES    = ['terraform', 'pulumi', 'serverless.yml', 'cdk.json', 'app.yaml', 'cloudbuild.yaml', 'azure-pipelines.yml'];
const MOBILE_DEPS    = ['react-native', 'expo', 'flutter'];

function detectFromDeps(deps: string[], patterns: string[]): boolean {
  const lower = deps.map(d => d.toLowerCase());
  return patterns.some(p => lower.some(d => d.includes(p)));
}

function detectFromPaths(paths: string[], patterns: string[]): boolean {
  const lower = paths.map(p => p.toLowerCase());
  return patterns.some(p => lower.some(f => f.includes(p)));
}

function extractDeps(pkgJson: string | null, requirementsTxt: string | null, goMod: string | null): string[] {
  const deps: string[] = [];
  if (pkgJson) {
    try {
      const pkg = JSON.parse(pkgJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      deps.push(...Object.keys(pkg.dependencies ?? {}));
      deps.push(...Object.keys(pkg.devDependencies ?? {}));
    } catch { /* ignore malformed package.json */ }
  }
  if (requirementsTxt) {
    requirementsTxt.split('\n').forEach(line => {
      const name = line.split(/[>=<!]/)[0].trim();
      if (name) deps.push(name);
    });
  }
  if (goMod) {
    goMod.split('\n').forEach(line => {
      const m = line.trim().match(/^require\s+(\S+)/);
      if (m) deps.push(m[1]);
    });
  }
  return deps;
}

function detectPrimaryLang(paths: string[], deps: string[]): string {
  const ext = (e: string) => paths.filter(p => p.endsWith(e)).length;
  const counts: [string, number][] = [
    ['TypeScript', ext('.ts') + ext('.tsx')],
    ['JavaScript', ext('.js') + ext('.jsx')],
    ['Python',     ext('.py')],
    ['Go',         ext('.go')],
    ['Rust',       ext('.rs')],
    ['Java',       ext('.java')],
    ['Ruby',       ext('.rb')],
    ['Dart',       ext('.dart')],
  ];
  return counts.sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown';
}

function detectFrameworks(deps: string[]): string[] {
  const found: string[] = [];
  const map: [string, string][] = [
    ['next',            'Next.js'],
    ['react',           'React'],
    ['vue',             'Vue'],
    ['svelte',          'Svelte'],
    ['@angular/core',   'Angular'],
    ['nuxt',            'Nuxt'],
    ['express',         'Express'],
    ['fastify',         'Fastify'],
    ['@nestjs/core',    'NestJS'],
    ['hono',            'Hono'],
    ['django',          'Django'],
    ['flask',           'Flask'],
    ['langchain',       'LangChain'],
    ['@langchain',      'LangChain'],
    ['openai',          'OpenAI SDK'],
    ['anthropic',       'Anthropic SDK'],
    ['torch',           'PyTorch'],
    ['tensorflow',      'TensorFlow'],
    ['drizzle-orm',     'Drizzle ORM'],
    ['prisma',          'Prisma'],
    ['react-native',    'React Native'],
    ['expo',            'Expo'],
  ];
  const lower = deps.map(d => d.toLowerCase());
  for (const [dep, label] of map) {
    if (lower.some(d => d.includes(dep.toLowerCase()))) found.push(label);
  }
  return [...new Set(found)];
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function analyseRepos(
  repos: SelectedRepo[],
  githubToken: string,
): Promise<CodebaseProfile> {
  const repoSignals: RepoSignals[] = [];

  for (const repo of repos) {
    // Parallel fetch of file tree + key files
    const [tree, readme, pkgJson, requirements, goMod] = await Promise.all([
      getFileTree(repo.fullName, repo.branch, githubToken),
      getFileContent(repo.fullName, 'README.md', repo.branch, githubToken)
        .catch(() => null),
      getFileContent(repo.fullName, 'package.json', repo.branch, githubToken)
        .catch(() => null),
      getFileContent(repo.fullName, 'requirements.txt', repo.branch, githubToken)
        .catch(() => null),
      getFileContent(repo.fullName, 'go.mod', repo.branch, githubToken)
        .catch(() => null),
    ]);

    const deps       = extractDeps(pkgJson, requirements, goMod);
    const frameworks = detectFrameworks(deps);
    const primaryLang = detectPrimaryLang(tree, deps);

    const signals: RepoSignals = {
      repoName:    repo.repoName,
      hasFrontend: detectFromDeps(deps, FRONTEND_DEPS),
      hasBackend:  detectFromDeps(deps, BACKEND_DEPS),
      hasAiMl:     detectFromDeps(deps, AIML_DEPS),
      hasInfra:    detectFromPaths(tree, INFRA_FILES),
      hasCiCd:     detectFromPaths(tree, CICD_FILES),
      hasCloud:    detectFromPaths(tree, CLOUD_FILES),
      hasMobile:   detectFromDeps(deps, MOBILE_DEPS),
      primaryLang,
      frameworks,
      description: (readme ?? '').slice(0, 600).replace(/\n+/g, ' ').trim(),
    };

    repoSignals.push(signals);
  }

  // Aggregate across all repos
  const agg = {
    hasFrontend:   repoSignals.some(r => r.hasFrontend),
    hasBackend:    repoSignals.some(r => r.hasBackend),
    hasAiMl:       repoSignals.some(r => r.hasAiMl),
    hasInfra:      repoSignals.some(r => r.hasInfra),
    hasCiCd:       repoSignals.some(r => r.hasCiCd),
    hasCloud:      repoSignals.some(r => r.hasCloud),
    hasMobile:     repoSignals.some(r => r.hasMobile),
    allFrameworks: [...new Set(repoSignals.flatMap(r => r.frameworks))],
    allLangs:      [...new Set(repoSignals.map(r => r.primaryLang).filter(Boolean))],
  };

  const repoNames   = repoSignals.map(r => r.repoName).join(', ');
  const techList    = agg.allFrameworks.length ? agg.allFrameworks.join(', ') : agg.allLangs.join(', ');
  const layers      = [
    agg.hasFrontend ? 'a frontend' : '',
    agg.hasBackend  ? 'a backend'  : '',
    agg.hasAiMl     ? 'AI/ML components' : '',
    agg.hasInfra    ? 'containerised infrastructure' : '',
    agg.hasCloud    ? 'cloud/IaC configuration' : '',
  ].filter(Boolean).join(', ');

  const projectSummary =
    `The project comprises ${repos.length} repo(s): ${repoNames}. ` +
    `Primary tech stack: ${techList || 'unknown'}. ` +
    `It includes ${layers || 'general software components'}.`;

  return {
    repos: repoSignals,
    ...agg,
    projectSummary,
  };
}
