import { db } from '@aria/db';
import { projects, projectRepos } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { AppError } from '../middleware/error.middleware';

export async function listProjects(workspaceId: string) {
  return db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
    with: { repos: true },
  });
}

export async function getProject(id: string, workspaceId: string) {
  const p = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)),
    with: { repos: true },
  });
  if (!p) throw new AppError('Project not found', 404);
  return p;
}

export async function createProject(workspaceId: string, name: string, description?: string) {
  const [p] = await db.insert(projects).values({ id: randomUUID(), workspaceId, name: name.trim(), description: description?.trim(), status: 'active' }).returning();
  return p;
}

export async function archiveProject(id: string, workspaceId: string) {
  await getProject(id, workspaceId);
  await db.update(projects).set({ status: 'archived' }).where(eq(projects.id, id));
}

export async function connectRepo(projectId: string, workspaceId: string, repoUrl: string, branch = 'main') {
  await getProject(projectId, workspaceId);
  const repoName = repoUrl.split('/').pop()?.replace(/\.git$/, '') ?? repoUrl;
  const [repo] = await db.insert(projectRepos).values({ id: randomUUID(), projectId, repoUrl: repoUrl.trim(), repoName, branch }).returning();
  return repo;
}
