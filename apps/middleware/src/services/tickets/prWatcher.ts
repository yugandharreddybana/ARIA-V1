import { readGithubToken, getPull, githubFullName } from '../githubClient.service';
import { getPgPool } from '../db.client';
import { applyTransition } from './ticketActions';

const etags = new Map<string, string>();

interface OpenPull {
  id: string;
  project_id: string;
  workspace_id: string;
  pr_number: number;
  pr_url: string | null;
  repo_name: string | null;
  repo_url: string | null;
}

export async function watchPullRequests(): Promise<void> {
  const rows = await getPgPool().query<OpenPull>(
    `SELECT t.id, t.project_id, p.workspace_id, r.pr_number, r.pr_url, repo.repo_name, repo.repo_url
       FROM tickets t
       JOIN projects p ON p.id = t.project_id
       JOIN LATERAL (
         SELECT pr_number, pr_url FROM agent_runs
          WHERE ticket_id = t.id AND pr_number IS NOT NULL
          ORDER BY created_at DESC LIMIT 1
       ) r ON true
       LEFT JOIN LATERAL (
         SELECT repo_name, repo_url FROM project_repos WHERE project_id = t.project_id ORDER BY created_at LIMIT 1
       ) repo ON true
      WHERE t.status NOT IN ('done', 'rejected')`,
  );
  for (const ticket of rows.rows) {
    try {
      const token = await readGithubToken(ticket.workspace_id);
      const fromUrl = ticket.pr_url?.match(/github\.com\/([^/]+\/[^/]+)\/pull\//);
      const named = ticket.repo_name ? githubFullName(ticket.repo_name, ticket.repo_url) : '';
      const fullName = named.includes('/') ? named : fromUrl?.[1];
      if (!fullName) continue;
      const pulled = await getPull(token, fullName, ticket.pr_number, etags.get(ticket.id));
      if (pulled.etag) etags.set(ticket.id, pulled.etag);
      if (pulled.status === 304 || !pulled.pull) continue;
      if (pulled.pull.merged_at) {
        await applyTransition(ticket.id, 'pr_merged', { actorKind: 'owner', prUrl: ticket.pr_url, reason: 'Owner merged the pull request' });
        continue;
      }
      if (pulled.pull.state === 'closed') {
        await applyTransition(ticket.id, 'pr_closed', { actorKind: 'owner', prUrl: ticket.pr_url, reason: 'Pull request was closed without merge' });
      }
    } catch {
      // One ticket's GitHub error does not stop the sweep.
    }
  }
}

let lastWatch = 0;

export async function maybeWatchPulls(now = Date.now()): Promise<void> {
  if (now - lastWatch < 60_000) return;
  lastWatch = now;
  await watchPullRequests();
}
