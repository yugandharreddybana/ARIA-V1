/**
 * repoAnalysis.service.ts
 * -----------------------
 * Uses the workspace's stored GitHub OAuth token to read each connected repo:
 *   - file tree (top 2 levels)
 *   - README.md content (first 800 chars)
 *   - package.json / requirements.txt / go.mod / Cargo.toml (root only)
 *   - CI/CD config files (.github/workflows, .gitlab-ci.yml, Jenkinsfile)
 *   - Infrastructure files (Dockerfile, docker-compose.yml, terraform/, serverless.yml)
 *
 * Produces a CodebaseProfile that skillFactory uses to decide which agents
 * to create and to write custom per-agent instructions.
 */

import { db } from '@aria/db';
import { workspaces, projectRepos } from '@aria/db';
import { eq } from 'drizzle-orm';
import { decryptApiKey } from './workspace.service';
import type { RepoSignals, CodebaseProfile } from '../types/onboarding.types';

// ---- GitHub REST helpers --------------------------------------------------

interface GhTreeItem { path: string; type: 'blob' | 'tree'; }
interface GhTree     { tree: GhTreeItem[]; }
interface GhContent  { content?: string; encoding?: string; }

async function ghFetch<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

function decodeBase64(encoded: string): string {
  return Buffer.from(encoded.replace(/\n/g, ''), 'base64').toString('utf-8');
}

async function fetchFileContent(
  fullName: string,
  filePath: string,
  branch: string,
  token: string,
): Promise<string | null> {
  try {
    const data = await ghFetch<GhContent>(
      `https://api.github.com/repos/${fullName}/contents/${filePath}?ref=${branch}`,
      token,
    );
    if (data.content && data.encoding === 'base64') {
      return decodeBase64(data.content).slice(0, 2000);
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchTree(
  fullName: string,
  branch: string,
  token: string,
): Promise<string[]> {
  try {
    const data = await ghFetch<GhTree>(
      `https://api.github.com/repos/${fullName}/git/trees/${branch}?recursive=0`,
      token,
    );
    return data.tree.map(i => i.path);
  } catch {
    return [];
  }
}

// ---- Detection logic -------------------------------------------------------

function detectFromTree(paths: string[], fileContents: Record<string, string>): Omit<RepoSignals, 'repoName' | 'description'> {
  const p = paths.map(x => x.toLowerCase());
  const allContent = Object.values(fileContents).join('\n').toLowerCase();

  // Frontend detection
  const hasFrontend =
    p.some(x => x.match(/\/(components|pages|views|app)\//)) ||
    allContent.includes('"react"') ||
    allContent.includes('"next"') ||
    allContent.includes('"vue"') ||
    allContent.includes('"@angular/core"') ||
    allContent.includes('"svelte"') ||
    allContent.includes('"solid-js"');

  // Backend detection
  const hasBackend =
    allContent.includes('"express"') ||
    allContent.includes('"fastify"') ||
    allContent.includes('"@nestjs/core"') ||
    allContent.includes('"hono"') ||
    allContent.includes('"koa"') ||
    allContent.includes('flask') ||
    allContent.includes('fastapi') ||
    allContent.includes('django') ||
    allContent.includes('rails') ||
    allContent.includes('gin-gonic') ||
    p.some(x => x.includes('server.') || x.includes('main.go') || x.includes('main.py'));

  // AI/ML detection
  const hasAiMl =
    allContent.includes('torch') ||
    allContent.includes('tensorflow') ||
    allContent.includes('transformers') ||
    allContent.includes('langchain') ||
    allContent.includes('openai') ||
    allContent.includes('anthropic') ||
    allContent.includes('llama') ||
    allContent.includes('huggingface') ||
    allContent.includes('sklearn') ||
    allContent.includes('scikit');

  // Infra detection
  const hasInfra =
    p.some(x => x.includes('dockerfile') || x.includes('docker-compose'));

  // CI/CD detection
  const hasCiCd =
    p.some(x =>
      x.includes('.github/workflows') ||
      x.includes('.gitlab-ci') ||
      x.includes('jenkinsfile') ||
      x.includes('.circleci') ||
      x.includes('bitbucket-pipelines'),
    );

  // Cloud / IaC detection
  const hasCloud =
    p.some(x =>
      x.includes('terraform') ||
      x.includes('pulumi') ||
      x.includes('serverless.yml') ||
      x.includes('cdk.json') ||
      x.includes('.aws') ||
      x.includes('gcp') ||
      x.includes('azure'),
    ) ||
    allContent.includes('aws-cdk') ||
    allContent.includes('@pulumi');

  // Mobile detection
  const hasMobile =
    allContent.includes('react-native') ||
    allContent.includes('expo') ||
    allContent.includes('flutter') ||
    p.some(x => x.includes('android/') || x.includes('ios/'));

  // Primary language
  const langCounts: Record<string, number> = {};
  for (const path of paths) {
    const ext = path.split('.').pop() ?? '';
    const lang = EXT_TO_LANG[ext];
    if (lang) langCounts[lang] = (langCounts[lang] ?? 0) + 1;
  }
  const primaryLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown';

  // Frameworks
  const frameworks: string[] = [];
  const fc = allContent;
  if (fc.includes('"next"') || fc.includes('"next.js"'))           frameworks.push('Next.js');
  if (fc.includes('"react"') && !frameworks.includes('Next.js'))    frameworks.push('React');
  if (fc.includes('"vue"'))                                          frameworks.push('Vue');
  if (fc.includes('"@angular/core"'))                               frameworks.push('Angular');
  if (fc.includes('"svelte"'))                                       frameworks.push('Svelte');
  if (fc.includes('"express"'))                                      frameworks.push('Express');
  if (fc.includes('"fastify"'))                                      frameworks.push('Fastify');
  if (fc.includes('"@nestjs/core"'))                                frameworks.push('NestJS');
  if (fc.includes('"hono"'))                                         frameworks.push('Hono');
  if (fc.includes('drizzle-orm'))                                    frameworks.push('Drizzle ORM');
  if (fc.includes('prisma'))                                         frameworks.push('Prisma');
  if (fc.includes('tailwindcss') || fc.includes('tailwind'))         frameworks.push('Tailwind CSS');
  if (fc.includes('flask'))                                          frameworks.push('Flask');
  if (fc.includes('fastapi'))                                        frameworks.push('FastAPI');
  if (fc.includes('django'))                                         frameworks.push('Django');
  if (fc.includes('langchain'))                                      frameworks.push('LangChain');
  if (fc.includes('"@trpc/server"') || fc.includes('trpc'))         frameworks.push('tRPC');

  return { hasFrontend, hasBackend, hasAiMl, hasInfra, hasCiCd, hasCloud, hasMobile, primaryLang, frameworks };
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin',
  rb: 'Ruby', php: 'PHP', cs: 'C#', cpp: 'C++', c: 'C', swift: 'Swift',
  dart: 'Dart',
};

// ---- Public API ------------------------------------------------------------

/**
 * Analyses a single GitHub repo and returns its RepoSignals.
 */
export async function analyseRepo(
  fullName: string,
  branch: string,
  token: string,
): Promise<RepoSignals> {
  const [paths, readmeRaw, packageJson, requirements, goMod] = await Promise.all([
    fetchTree(fullName, branch, token),
    fetchFileContent(fullName, 'README.md', branch, token),
    fetchFileContent(fullName, 'package.json', branch, token),
    fetchFileContent(fullName, 'requirements.txt', branch, token),
    fetchFileContent(fullName, 'go.mod', branch, token),
  ]);

  const fileContents: Record<string, string> = {};
  if (packageJson)  fileContents['package.json']  = packageJson;
  if (requirements) fileContents['requirements.txt'] = requirements;
  if (goMod)        fileContents['go.mod']         = goMod;

  const signals = detectFromTree(paths, fileContents);
  const repoName = fullName.split('/').pop() ?? fullName;
  const description = (readmeRaw ?? '').slice(0, 500);

  return { repoName, description, ...signals };
}

/**
 * Builds a full CodebaseProfile from all repos connected to a project.
 * Reads GitHub token from the workspace record.
 */
export async function buildCodebaseProfile(
  workspaceId: string,
  projectId: string,
): Promise<CodebaseProfile> {
  // Get GitHub token
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new Error('Workspace not found');
  if (!ws.githubAccessTokenEncrypted) throw new Error('GitHub token not found — complete GitHub OAuth first');
  const token = decryptApiKey(ws.githubAccessTokenEncrypted);

  // Get all repos for this project
  const repos = await db.query.projectRepos.findMany({ where: eq(projectRepos.projectId, projectId) });
  if (!repos.length) throw new Error('No repos connected to this project');

  // Analyse each repo concurrently (rate-limit to 3 parallel)
  const repoSignals: RepoSignals[] = [];
  for (let i = 0; i < repos.length; i += 3) {
    const batch = repos.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(r => analyseRepo(r.repoName, r.branch, token)),
    );
    repoSignals.push(...results);
  }

  // Aggregate signals
  const hasFrontend   = repoSignals.some(r => r.hasFrontend);
  const hasBackend    = repoSignals.some(r => r.hasBackend);
  const hasAiMl       = repoSignals.some(r => r.hasAiMl);
  const hasInfra      = repoSignals.some(r => r.hasInfra);
  const hasCiCd       = repoSignals.some(r => r.hasCiCd);
  const hasCloud      = repoSignals.some(r => r.hasCloud);
  const hasMobile     = repoSignals.some(r => r.hasMobile);
  const allFrameworks = [...new Set(repoSignals.flatMap(r => r.frameworks))];
  const allLangs      = [...new Set(repoSignals.map(r => r.primaryLang).filter(l => l !== 'Unknown'))];

  const stackDesc = [
    allLangs.length     ? `Primary languages: ${allLangs.join(', ')}.`         : '',
    allFrameworks.length? `Frameworks: ${allFrameworks.join(', ')}.`             : '',
    hasFrontend         ? 'Has a frontend application.'                          : '',
    hasBackend          ? 'Has a backend/API layer.'                             : '',
    hasAiMl             ? 'Contains AI/ML components.'                          : '',
    hasInfra            ? 'Uses containerisation (Docker).'                     : '',
    hasCiCd             ? 'Has CI/CD pipelines.'                                : '',
    hasCloud            ? 'Uses cloud infrastructure (IaC).'                    : '',
    hasMobile           ? 'Contains a mobile application.'                      : '',
  ].filter(Boolean).join(' ');

  const projectSummary = [
    `This project consists of ${repos.length} repo(s): ${repoSignals.map(r => r.repoName).join(', ')}.`,
    stackDesc,
    repoSignals[0]?.description ? `Context: ${repoSignals[0].description.slice(0, 200)}` : '',
  ].filter(Boolean).join(' ');

  return {
    repos: repoSignals,
    hasFrontend, hasBackend, hasAiMl, hasInfra, hasCiCd, hasCloud, hasMobile,
    allFrameworks, allLangs, projectSummary,
  };
}
