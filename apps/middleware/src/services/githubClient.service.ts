import { eq } from 'drizzle-orm';
import { db, workspaces } from '@aria/db';
import { AppError } from '../middleware/error.middleware';
import { decryptSecret, encryptSecret } from './crypto.service';
import { fetchPriority, MOCK_REPO_FILES, MOCK_REPO_PATHS, type RepoFile } from './knowledgeMap';

export interface GithubRepoSummary {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
}

export interface RepoSnapshot {
  paths: string[];
  files: RepoFile[];
}

const MOCK_REPOS: GithubRepoSummary[] = [
  {
    fullName: 'acme/demo-app',
    private: false,
    defaultBranch: 'main',
    htmlUrl: 'https://github.com/acme/demo-app',
  },
];

function githubApiBase(): string {
  return (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/$/, '');
}

function isMockToken(_token: string): boolean {
  return process.env.ARIA_GITHUB_MODE === 'mock' && process.env.NODE_ENV !== 'production';
}

export async function saveGithubToken(workspaceId: string, token: string): Promise<void> {
  const encrypted = encryptSecret(token.trim(), { workspaceId, column: 'github_access_token_encrypted' });
  const updated = await db.update(workspaces)
    .set({ githubAccessTokenEncrypted: encrypted, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning({ id: workspaces.id });
  if (!updated.length) throw new AppError('Workspace not found', 404, 'NOT_FOUND');
}

export async function readGithubToken(workspaceId: string): Promise<string> {
  const row = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!row?.githubAccessTokenEncrypted) {
    throw new AppError('GitHub is not connected', 400, 'GITHUB_NOT_CONNECTED');
  }
  return decryptSecret(row.githubAccessTokenEncrypted, { workspaceId, column: 'github_access_token_encrypted' });
}

export async function listGithubRepos(workspaceId: string): Promise<GithubRepoSummary[]> {
  const token = await readGithubToken(workspaceId);
  if (isMockToken(token)) return MOCK_REPOS;
  const repos: GithubRepoSummary[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `${githubApiBase()}/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'aria-v1',
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.status === 401) throw new AppError('GitHub rejected the stored token', 400, 'GITHUB_UNAUTHORIZED');
    if (!res.ok) throw new AppError(`GitHub returned HTTP ${res.status}`, 502, 'GITHUB_ERROR');
    const batch = await res.json() as Array<{ full_name?: string; private?: boolean; default_branch?: string; html_url?: string }>;
    for (const repo of batch) {
      if (!repo.full_name) continue;
      repos.push({
        fullName: repo.full_name,
        private: Boolean(repo.private),
        defaultBranch: repo.default_branch || 'main',
        htmlUrl: repo.html_url || `https://github.com/${repo.full_name}`,
      });
    }
    if (batch.length < 100) break;
  }
  return repos;
}

const REPO_FULL_NAME = /^[\w.-]+\/[\w.-]+$/;

export function parseRepoFullName(input: string): { owner: string; repo: string } {
  let cleaned = input.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const githubUrl = cleaned.match(/^https:\/\/github\.com\/([^?#]+)$/i);
  if (githubUrl) cleaned = githubUrl[1];
  if (cleaned.includes('..') || !REPO_FULL_NAME.test(cleaned)) {
    throw new AppError('Repository must look like owner/name', 400, 'VALIDATION_ERROR');
  }
  const [owner, repo] = cleaned.split('/');
  return { owner, repo };
}

export async function readRepository(token: string, fullName: string, branch: string): Promise<RepoSnapshot> {
  if (isMockToken(token)) return { paths: MOCK_REPO_PATHS, files: MOCK_REPO_FILES };
  const { owner, repo } = parseRepoFullName(fullName);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'aria-v1',
  };
  const treeRes = await fetch(
    `${githubApiBase()}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers, signal: AbortSignal.timeout(20_000) },
  );
  if (treeRes.status === 404) {
    throw new AppError(`Branch ${branch} was not found on ${owner}/${repo}`, 404, 'GITHUB_BRANCH');
  }
  if (!treeRes.ok) throw new AppError(`GitHub tree returned HTTP ${treeRes.status}`, 502, 'GITHUB_ERROR');
  const tree = await treeRes.json() as { tree?: Array<{ path?: string; type?: string }> };
  const paths = (tree.tree ?? [])
    .filter((entry) => entry.type === 'blob' && entry.path)
    .map((entry) => entry.path as string)
    .slice(0, 2000);
  const interesting = paths
    .map((path) => ({ path, rank: fetchPriority(path) }))
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.path.length - b.path.length)
    .slice(0, 25)
    .map((entry) => entry.path);
  const files: RepoFile[] = [];
  for (const path of interesting) {
    const res = await fetch(
      `${githubApiBase()}/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) continue;
    const body = await res.json() as { content?: string; encoding?: string };
    if (body.encoding !== 'base64' || !body.content) continue;
    const text = Buffer.from(body.content, 'base64').toString('utf8').slice(0, 20_000);
    files.push({ path, text });
  }
  return { paths, files };
}
