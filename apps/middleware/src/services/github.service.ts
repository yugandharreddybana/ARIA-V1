/**
 * github.service.ts
 * -----------------
 * Lists the authenticated user’s GitHub repositories.
 * Used in onboarding Step 3 to populate the multi-select repo picker.
 */

import { db, workspaces } from '@aria/db';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import { decryptApiKey } from './workspace.service';
import type { GitHubRepoListItem } from '../types/onboarding.types';

const GH_API = 'https://api.github.com';

interface RawGitHubRepo {
  id: number; full_name: string; name: string; description: string | null;
  private: boolean; default_branch: string; language: string | null; updated_at: string;
}

export async function listUserRepos(workspaceId: string): Promise<GitHubRepoListItem[]> {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new AppError('Workspace not found', 404, 'NOT_FOUND');
  if (!ws.githubAccessTokenEncrypted) {
    throw new AppError('GitHub not connected. Please complete GitHub OAuth first.', 400, 'GITHUB_NOT_CONNECTED');
  }

  const token = decryptApiKey(ws.githubAccessTokenEncrypted);

  // ponytail: paginate up to 3×100 repos — enough for onboarding.
  // Upgrade path: follow the Link header if a user ever has >300 repos.
  const raw: RawGitHubRepo[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `${GH_API}/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      if (page === 1) throw new AppError(`GitHub API error: ${res.status} ${res.statusText}`, 502, 'GITHUB_ERROR');
      break;
    }
    const batch = await res.json() as RawGitHubRepo[];
    raw.push(...batch);
    if (batch.length < 100) break;
  }

  return raw.map(r => ({
    id:            r.id,
    fullName:      r.full_name,
    name:          r.name,
    description:   r.description,
    private:       r.private,
    defaultBranch: r.default_branch,
    language:      r.language,
    updatedAt:     r.updated_at,
  }));
}
