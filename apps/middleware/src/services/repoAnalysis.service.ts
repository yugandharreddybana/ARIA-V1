/**
 * repoAnalysis.service.ts
 * -----------------------
 * Fetches each connected GitHub repo's file tree, README, package.json,
 * and key config files via the GitHub REST API, then synthesises a
 * CodebaseProfile that the skillFactory uses to decide which agents to
 * generate and what instructions to write for them.
 *
 * Uses the workspace's decrypted GitHub access token (set during Step 3
 * OAuth). Falls back gracefully when files are missing.
 */

import { db } from '@aria/db';
import { workspaces, projectRepos } from '@aria/db';
import { eq } from 'drizzle-orm';
import type { CodebaseProfile, RepoSignals } from '../types/onboarding.types';
import { AppError } from '../middleware/error.middleware';
import { decrypt } from '../utils/crypto.utils';

// ---- GitHub REST helpers --------------------------------------------------

interface GHTreeItem { path: string; type: string; }
interface GHTree    { tree: GHTreeItem[]; }

async function ghFetch<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept:        'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function getFileContent(fullName: string, path: string, token: string): Promise<string | null> {
  const data = await ghFetch<{ content?: string; encoding?: string }>(
    `https://api.github.com/repos/${fullName}/contents/${path}`,
    token,
  );
  if (!data?.content || data.encoding !== 'base64') return null;
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
}

async function getRepoTree(fullName: string, branch: string, token: string): Promise<string[]> {
  const tree = await ghFetch<GHTree>(
    `https://api.github.com/repos/${fullName}/git/trees/${branch}?recursive=1`,
    token,
  );
  return tree?.tree.map(i => i.path) ?? [];
}

// ---- Detection logic -------------------------------------------------------

const FRONTEND_MARKERS = [
  'react', 'next', 'vue', 'nuxt', 'angular', 'svelte', 'vite',
  '@remix-run', 'gatsby', 'astro',
];
const BACKEND_MARKERS = [
  'express', 'fastify', 'nestjs', '@nestjs', 'koa', 'hapi',
  'django', 'flask', 'fastapi', 'rails', 'spring',
  'drizzle-orm', 'prisma', 'sequelize', 'typeorm',
];
const AIML_MARKERS = [
  'torch', 'tensorflow', 'transformers', 'langchain',
  'openai', 'anthropic', '@anthropic-ai', 'huggingface',
  'sentence-transformers', 'llama', 'ollama',
];
const INFRA_FILE_PATTERNS = [
  'Dockerfile', 'docker-compose', 'docker-compose.yml', 'docker-compose.yaml',
];
const CICD_PATH_PATTERNS = [
  '.github/workflows', '.gitlab-ci', 'Jenkinsfile', 'circle.yml',
  '.circleci', 'azure-pipelines',
];
const CLOUD_MARKERS = [
  'aws-cdk', '@aws-cdk', 'serverless', '@pulumi', 'terraform',
  'gcp', '@google-cloud', 'azure',
];
const MOBILE_MARKERS = [
  'react-native', 'expo', 'flutter', '@capacitor', 'ionic',
];

function detectFromPackageJson(raw: string): {
  hasFrontend: boolean; hasBackend: boolean; hasAiMl: boolean;
  hasCloud: boolean; hasMobile: boolean; frameworks: string[];
} {
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; name?: string } = {};
  try { pkg = JSON.parse(raw); } catch { /* ignore malformed */ }
  const allDeps = [
    ...Object.keys(pkg.dependencies  ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ].map(d => d.toLowerCase());

  const hit = (markers: string[]) => markers.some(m => allDeps.some(d => d.includes(m)));

  const frameworks: string[] = [];
  if (allDeps.some(d => d.includes('next')))        frameworks.push('Next.js');
  if (allDeps.some(d => d.includes('react')))       frameworks.push('React');
  if (allDeps.some(d => d.includes('vue')))         frameworks.push('Vue.js');
  if (allDeps.some(d => d.includes('svelte')))      frameworks.push('Svelte');
  if (allDeps.some(d => d.includes('angular')))     frameworks.push('Angular');
  if (allDeps.some(d => d.includes('express')))     frameworks.push('Express');
  if (allDeps.some(d => d.includes('fastify')))     frameworks.push('Fastify');
  if (allDeps.some(d => d.includes('nestjs') || d.includes('@nestjs'))) frameworks.push('NestJS');
  if (allDeps.some(d => d.includes('drizzle')))     frameworks.push('Drizzle ORM');
  if (allDeps.some(d => d.includes('prisma')))      frameworks.push('Prisma');
  if (allDeps.some(d => d.includes('langchain')))   frameworks.push('LangChain');
  if (allDeps.some(d => d.includes('openai')))      frameworks.push('OpenAI SDK');
  if (allDeps.some(d => d.includes('react-native'))) frameworks.push('React Native');
  if (allDeps.some(d => d.includes('expo')))        frameworks.push('Expo');
  if (allDeps.some(d => d.includes('terraform')))   frameworks.push('Terraform');
  if (allDeps.some(d => d.includes('aws-cdk') || d.includes('@aws-cdk'))) frameworks.push('AWS CDK');

  return {
    hasFrontend: hit(FRONTEND_MARKERS),
    hasBackend:  hit(BACKEND_MARKERS),
    hasAiMl:     hit(AIML_MARKERS),
    hasCloud:    hit(CLOUD_MARKERS),
    hasMobile:   hit(MOBILE_MARKERS),
    frameworks,
  };
}

function detectFromRequirementsTxt(raw: string): { hasAiMl: boolean; hasBackend: boolean; frameworks: string[] } {
  const lines = raw.toLowerCase().split('\n');
  const frameworks: string[] = [];
  const hasAiMl = AIML_MARKERS.some(m => lines.some(l => l.includes(m)));
  const hasBackend = ['django', 'flask', 'fastapi'].some(m => {
    const hit = lines.some(l => l.includes(m));
    if (hit) frameworks.push(m.charAt(0).toUpperCase() + m.slice(1));
    return hit;
  });
  return { hasAiMl, hasBackend, frameworks };
}

function detectLang(paths: string[]): string {
  const counts: Record<string, number> = {};
  for (const p of paths) {
    const ext = p.split('.').pop()?.toLowerCase() ?? '';
    if (['ts', 'tsx'].includes(ext))  counts['TypeScript'] = (counts['TypeScript'] ?? 0) + 1;
    else if (['js', 'jsx'].includes(ext)) counts['JavaScript'] = (counts['JavaScript'] ?? 0) + 1;
    else if (ext === 'py')            counts['Python']     = (counts['Python']     ?? 0) + 1;
    else if (ext === 'go')            counts['Go']         = (counts['Go']         ?? 0) + 1;
    else if (ext === 'rs')            counts['Rust']       = (counts['Rust']       ?? 0) + 1;
    else if (ext === 'java')          counts['Java']       = (counts['Java']       ?? 0) + 1;
    else if (ext === 'rb')            counts['Ruby']       = (counts['Ruby']       ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? 'Unknown';
}

// ---- Main export -----------------------------------------------------------

export async function analyseRepos(workspaceId: string, projectId: string): Promise<CodebaseProfile> {
  // 1. Load workspace to get GitHub token
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new AppError('Workspace not found', 404);
  if (!ws.githubAccessTokenEncrypted) throw new AppError('GitHub not connected — complete Step 3 first', 400);

  const ghToken = decrypt(ws.githubAccessTokenEncrypted);

  // 2. Load all repos for this project
  const repos = await db.query.projectRepos.findMany({ where: eq(projectRepos.projectId, projectId) });
  if (!repos.length) throw new AppError('No repos connected — complete Step 3 first', 400);

  // 3. Analyse each repo
  const repoSignals: RepoSignals[] = await Promise.all(
    repos.map(async (repo) => {
      // Derive fullName from repoUrl: https://github.com/owner/name -> owner/name
      const fullName = repo.repoUrl
        .replace('https://github.com/', '')
        .replace(/\.git$/, '');

      const [paths, readmeRaw, pkgRaw, reqsRaw] = await Promise.all([
        getRepoTree(fullName, repo.branch, ghToken),
        getFileContent(fullName, 'README.md', ghToken)
          .then(r => r ?? getFileContent(fullName, 'readme.md', ghToken)),
        getFileContent(fullName, 'package.json', ghToken),
        getFileContent(fullName, 'requirements.txt', ghToken),
      ]);

      // File-tree based detection
      const hasInfra = INFRA_FILE_PATTERNS.some(p => paths.some(f => f.toLowerCase().includes(p.toLowerCase())));
      const hasCiCd  = CICD_PATH_PATTERNS.some(p  => paths.some(f => f.startsWith(p)));

      let hasFrontend = false, hasBackend = false, hasAiMl = false;
      let hasCloud = false, hasMobile = false;
      const frameworks: string[] = [];

      if (pkgRaw) {
        const r = detectFromPackageJson(pkgRaw);
        hasFrontend = hasFrontend || r.hasFrontend;
        hasBackend  = hasBackend  || r.hasBackend;
        hasAiMl     = hasAiMl    || r.hasAiMl;
        hasCloud    = hasCloud    || r.hasCloud;
        hasMobile   = hasMobile   || r.hasMobile;
        frameworks.push(...r.frameworks);
      }

      if (reqsRaw) {
        const r = detectFromRequirementsTxt(reqsRaw);
        hasAiMl    = hasAiMl    || r.hasAiMl;
        hasBackend  = hasBackend  || r.hasBackend;
        frameworks.push(...r.frameworks);
      }

      const primaryLang = detectLang(paths);
      const description = (readmeRaw ?? '').slice(0, 500);

      return {
        repoName: repo.repoName,
        hasFrontend, hasBackend, hasAiMl,
        hasInfra, hasCiCd, hasCloud, hasMobile,
        primaryLang,
        frameworks: [...new Set(frameworks)],
        description,
      } satisfies RepoSignals;
    }),
  );

  // 4. Aggregate
  const profile: CodebaseProfile = {
    repos:         repoSignals,
    hasFrontend:   repoSignals.some(r => r.hasFrontend),
    hasBackend:    repoSignals.some(r => r.hasBackend),
    hasAiMl:       repoSignals.some(r => r.hasAiMl),
    hasInfra:      repoSignals.some(r => r.hasInfra),
    hasCiCd:       repoSignals.some(r => r.hasCiCd),
    hasCloud:      repoSignals.some(r => r.hasCloud),
    hasMobile:     repoSignals.some(r => r.hasMobile),
    allFrameworks: [...new Set(repoSignals.flatMap(r => r.frameworks))],
    allLangs:      [...new Set(repoSignals.map(r => r.primaryLang))],
    projectSummary: buildSummary(repoSignals),
  };

  return profile;
}

function buildSummary(signals: RepoSignals[]): string {
  const repoNames = signals.map(r => r.repoName).join(', ');
  const langs     = [...new Set(signals.map(r => r.primaryLang))].join(', ');
  const fws       = [...new Set(signals.flatMap(r => r.frameworks))].slice(0, 5).join(', ');
  const layers: string[] = [];
  if (signals.some(r => r.hasFrontend)) layers.push('frontend');
  if (signals.some(r => r.hasBackend))  layers.push('backend');
  if (signals.some(r => r.hasAiMl))    layers.push('AI/ML');
  if (signals.some(r => r.hasInfra))   layers.push('containerised infrastructure');
  if (signals.some(r => r.hasCloud))   layers.push('cloud/IaC');
  const desc = signals[0]?.description ? ` ${signals[0].description.slice(0, 200).trim()}.` : '';
  return (
    `The project consists of ${signals.length} repo(s): ${repoNames}. ` +
    `Primary language(s): ${langs}. ` +
    `Key frameworks: ${fws || 'none detected'}. ` +
    `Detected layers: ${layers.join(', ') || 'general purpose'}.` +
    desc
  );
}
