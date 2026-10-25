import { eq } from 'drizzle-orm';
import { db, workspaces } from '@aria/db';
import { AppError } from '../middleware/error.middleware';
import { decryptSecret, encryptSecret } from './crypto.service';
import { MOCK_REPO_FILES, MOCK_REPO_PATHS, type RepoFile } from './knowledgeMap';

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

function isMockToken(token: string): boolean {
  return process.env.ARIA_GITHUB_MODE === 'mock' || token === 'aria-mock-github';
}

export async function saveGithubToken(workspaceId: string, token: string): Promise<void> {
  const encrypted = encryptSecret(token.trim());
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
  return decryptSecret(row.githubAccessTokenEncrypted);
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

export function parseRepoFullName(input: string): { owner: string; repo: string } {
  const cleaned = input.replace(/\.git$/, '').replace(/\/$/, '');
  const match = cleaned.match(/github\.com[:/]([^/]+)\/([^/]+)$/i) ?? cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) throw new AppError('Repository must look like owner/name', 400, 'VALIDATION_ERROR');
  return { owner: match[1], repo: match[2] };
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
  const interesting = paths.filter((path) => isInteresting(path)).slice(0, 25);
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

function isInteresting(path: string): boolean {
  const base = path.split('/').pop() ?? path;
  if (/^(package\.json|README\.md|go\.mod|pom\.xml|requirements\.txt|schema\.prisma|Cargo\.toml)$/i.test(base)) return true;
  if (/\.(sql)$/i.test(base)) return true;
  if (/route\.(ts|js|tsx)$/.test(base)) return true;
  if (/(login|signup|sign-in|sign-up|page)\.(tsx|jsx|vue)$/i.test(base)) return true;
  return false;
}
