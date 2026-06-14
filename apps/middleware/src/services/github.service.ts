/**
 * github.service.ts
 * -----------------
 * Lists the authenticated user’s GitHub repositories.
 * Used in onboarding Step 3 to populate the multi-select repo picker.
 */

import { db } from '@aria/db';
import { workspaces } from '@aria/db';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import { decryptGithubToken } from './repoAnalysis.service';
import type { GitHubRepoListItem } from '../types/onboarding.types';

const GH_API = 'https://api.github.com';

export async function listUserRepos(workspaceId: string): Promise<GitHubRepoListItem[]> {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new AppError('Workspace not found', 404);

  const token = decryptGithubToken(ws.githubAccessTokenEncrypted);

  // Fetch up to 100 repos (sorted by most recently updated)
  const res = await fetch(
    `${GH_API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!res.ok) {
    throw new AppError(`GitHub API error: ${res.status} ${res.statusText}`, 502);
  }

  const raw = await res.json() as Array<{
    id: number; full_name: string; name: string; description: string | null;
    private: boolean; default_branch: string; language: string | null; updated_at: string;
  }>;

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
