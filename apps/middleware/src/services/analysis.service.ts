import { validateEnv } from '../config/env';
import { AppError } from '../middleware/error.middleware';
import { db } from '@aria/db';
import { projectRepos } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { projects } from '@aria/db';

export async function triggerAnalysis(projectId: string, repoId: string, workspaceId: string) {
  // Ownership check
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project || project.workspaceId !== workspaceId) throw new AppError('Project not found', 404);

  const repo = await db.query.projectRepos.findFirst({
    where: and(eq(projectRepos.id, repoId), eq(projectRepos.projectId, projectId)),
  });
  if (!repo) throw new AppError('Repo not found', 404);

  const env = validateEnv();

  // Forward to Spring Boot backend
  const res = await fetch(`${env.BACKEND_URL}/api/analysis/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      repoId: repo.id,
      repoUrl: repo.repoUrl,
      branch: repo.branch,
      workspaceId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AppError(`Backend rejected analysis job: ${text}`, 502);
  }

  const data = await res.json() as { jobId: string; status: string };
  return data;
}
