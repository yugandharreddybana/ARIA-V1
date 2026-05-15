import { db } from '@aria/db';
import { projects, projectRepos } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';

export interface CreateProjectDto {
  name: string;
  description?: string;
}

export interface ConnectRepoDto {
  repoUrl: string;
  repoName: string;
  branch?: string;
}

export async function listProjects(workspaceId: string) {
  return db.select().from(projects).where(eq(projects.workspaceId, workspaceId));
}

export async function createProject(workspaceId: string, dto: CreateProjectDto) {
  const [project] = await db.insert(projects).values({
    workspaceId,
    name: dto.name.trim(),
    description: dto.description?.trim(),
  }).returning();
  return project;
}

export async function getProject(workspaceId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  if (!project) throw new AppError('Project not found', 404);
  return project;
}

export async function deleteProject(workspaceId: string, projectId: string) {
  const project = await getProject(workspaceId, projectId);
  await db.update(projects)
    .set({ status: 'archived' })
    .where(eq(projects.id, project.id));
}

export async function connectRepo(workspaceId: string, projectId: string, dto: ConnectRepoDto) {
  await getProject(workspaceId, projectId);
  const [repo] = await db.insert(projectRepos).values({
    projectId,
    repoUrl: dto.repoUrl.trim(),
    repoName: dto.repoName.trim(),
    branch: dto.branch?.trim() ?? 'main',
  }).returning();
  return repo;
}

export async function listRepos(workspaceId: string, projectId: string) {
  await getProject(workspaceId, projectId);
  return db.select().from(projectRepos).where(eq(projectRepos.projectId, projectId));
}
