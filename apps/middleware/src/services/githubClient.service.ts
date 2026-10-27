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

/** Setup stores the repo label as the last URL segment. GitHub calls need owner/name. */
export function githubFullName(repoName: string, repoUrl?: string | null): string {
  for (const candidate of [repoName, repoUrl ?? '']) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    try {
      const parsed = parseRepoFullName(trimmed);
      return `${parsed.owner}/${parsed.repo}`;
    } catch {
      continue;
    }
  }
  return repoName.trim().split('/').pop()?.replace(/\.git$/, '') || repoName.trim();
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

export class MergeForbiddenError extends AppError {
  constructor() {
    super('Agents cannot merge or update git refs', 403, 'MERGE_FORBIDDEN');
  }
}

const FORBIDDEN_PATH = /\/pulls\/\d+\/merge(?:$|[/?])|\/merges(?:$|[/?])|\/git\/refs\//;

async function githubFetch(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  if (FORBIDDEN_PATH.test(path)) throw new MergeForbiddenError();
  return fetch(`${githubApiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'aria-v1',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
}

export async function githubRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; json: unknown; etag: string | null }> {
  if (FORBIDDEN_PATH.test(path)) throw new MergeForbiddenError();
  if (isMockToken(token) && method === 'GET' && path.includes('/branches/')) {
    return { status: 200, json: { name: 'main', protected: true }, etag: null };
  }
  const res = await githubFetch(token, method, path, body, extraHeaders);
  if (res.status === 304) return { status: 304, json: null, etag: res.headers.get('etag') };
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, json, etag: res.headers.get('etag') };
}

export async function getBranch(token: string, fullName: string): Promise<{ name: string; protected: boolean }> {
  const { owner, repo } = parseRepoFullName(fullName);
  if (isMockToken(token)) return { name: 'main', protected: true };
  const repoRes = await githubRequest(token, 'GET', `/repos/${owner}/${repo}`);
  const meta = repoRes.json as { default_branch?: string } | null;
  if (!meta?.default_branch) throw new AppError('Repository has no default branch', 502, 'GITHUB_ERROR');
  const name = meta.default_branch;
  const branch = await githubRequest(token, 'GET', `/repos/${owner}/${repo}/branches/${encodeURIComponent(name)}`);
  const body = branch.json as { protected?: boolean } | null;
  return { name, protected: Boolean(body?.protected) };
}

export async function getPull(token: string, fullName: string, number: number, etag?: string | null): Promise<{ status: number; etag: string | null; pull: { merged_at: string | null; state: string; headSha: string | null } | null }> {
  const { owner, repo } = parseRepoFullName(fullName);
  const res = await githubRequest(token, 'GET', `/repos/${owner}/${repo}/pulls/${number}`, undefined, etag ? { 'If-None-Match': etag } : undefined);
  if (res.status === 304) return { status: 304, etag: res.etag, pull: null };
  const body = res.json as { merged_at?: string | null; state?: string; head?: { sha?: string } } | null;
  return {
    status: res.status,
    etag: res.etag,
    pull: body ? { merged_at: body.merged_at ?? null, state: body.state ?? 'open', headSha: body.head?.sha ?? null } : null,
  };
}

export async function createPull(token: string, fullName: string, input: { title: string; head: string; base: string; body: string }): Promise<{ number: number; url: string }> {
  const { owner, repo } = parseRepoFullName(fullName);
  if (isMockToken(token)) return { number: 1, url: `https://github.com/${owner}/${repo}/pull/1` };
  const res = await githubRequest(token, 'POST', `/repos/${owner}/${repo}/pulls`, input);
  const body = res.json as { number?: number; html_url?: string } | null;
  if (!res.status || res.status >= 300 || !body?.number) {
    throw new AppError(`GitHub did not open a pull request (HTTP ${res.status})`, 502, 'GITHUB_ERROR');
  }
  return { number: body.number, url: body.html_url || `https://github.com/${owner}/${repo}/pull/${body.number}` };
}

export async function createReview(
  token: string,
  fullName: string,
  number: number,
  review: { event: 'COMMENT'; body: string; comments?: Array<{ path: string; line?: number; body: string }> },
): Promise<void> {
  const { owner, repo } = parseRepoFullName(fullName);
  if (isMockToken(token)) return;
  await githubRequest(token, 'POST', `/repos/${owner}/${repo}/pulls/${number}/reviews`, review);
}

export async function getPullFiles(token: string, fullName: string, number: number): Promise<string[]> {
  const { owner, repo } = parseRepoFullName(fullName);
  if (isMockToken(token)) return ['apps/middleware/src/services/tickets/ticketPipeline.ts'];
  const names: string[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const res = await githubRequest(token, 'GET', `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`);
    const body = res.json as Array<{ filename?: string }> | null;
    const batch = Array.isArray(body) ? body.map((file) => file.filename || '').filter(Boolean) : [];
    names.push(...batch);
    if (batch.length < 100) break;
  }
  return names;
}

export async function getPullDiff(token: string, fullName: string, number: number): Promise<string> {
  const { owner, repo } = parseRepoFullName(fullName);
  if (isMockToken(token)) return 'diff --git a/apps/middleware/src/services/tickets/ticketPipeline.ts b/apps/middleware/src/services/tickets/ticketPipeline.ts\n@@ -1 +1 @@\n-old\n+new\n';
  const res = await githubFetch(token, 'GET', `/repos/${owner}/${repo}/pulls/${number}`, undefined, {
    Accept: 'application/vnd.github.diff',
  });
  if (!res.ok) throw new AppError(`GitHub diff failed (HTTP ${res.status})`, 502, 'GITHUB_ERROR');
  return (await res.text()).slice(0, 200_000);
}

export async function getFileAtRef(token: string, fullName: string, filePath: string, ref: string): Promise<string | null> {
  const { owner, repo } = parseRepoFullName(fullName);
  if (isMockToken(token)) return null;
  const encoded = filePath.split('/').map(encodeURIComponent).join('/');
  const res = await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encoded}?ref=${encodeURIComponent(ref)}`);
  if (res.status === 404) return null;
  const body = res.json as { content?: string; encoding?: string } | null;
  if (!body?.content || body.encoding !== 'base64') return null;
  return Buffer.from(body.content, 'base64').toString('utf8');
}

export async function createIssueComment(token: string, fullName: string, number: number, body: string): Promise<void> {
  const { owner, repo } = parseRepoFullName(fullName);
  if (isMockToken(token)) return;
  await githubRequest(token, 'POST', `/repos/${owner}/${repo}/issues/${number}/comments`, { body });
}

export async function listCheckRuns(token: string, fullName: string, sha: string): Promise<Array<{ name: string; status: string; conclusion: string | null }>> {
  const { owner, repo } = parseRepoFullName(fullName);
  if (isMockToken(token)) return [];
  const res = await githubRequest(token, 'GET', `/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}/check-runs`);
  const body = res.json as { check_runs?: Array<{ name?: string; status?: string; conclusion?: string | null }> } | null;
  return (body?.check_runs ?? []).map((run) => ({
    name: run.name || 'check',
    status: run.status || 'completed',
    conclusion: run.conclusion ?? null,
  }));
}
