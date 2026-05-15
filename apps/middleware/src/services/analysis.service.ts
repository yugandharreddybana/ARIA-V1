import { db } from '@aria/db';
import { projectRepos, projects } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import * as BackendService from './backend.service';

export async function triggerAnalysis(projectId: string, repoId: string, workspaceId: string) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project || project.workspaceId !== workspaceId) throw new AppError('Project not found', 404);

  const repo = await db.query.projectRepos.findFirst({
    where: and(eq(projectRepos.id, repoId), eq(projectRepos.projectId, projectId)),
  });
  if (!repo) throw new AppError('Repo not found', 404);

  return BackendService.createAnalysisJob({
    projectId,
    repoId: repo.id,
    repoUrl: repo.repoUrl,
    branch: repo.branch,
    workspaceId,
  });
}

export async function getJobStatus(jobId: string) {
  return BackendService.getAnalysisJob(jobId);
}

export async function listProjectJobs(workspaceId: string) {
  return BackendService.listAnalysisJobs(workspaceId);
}
