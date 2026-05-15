export type AnalysisJobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface AnalysisJob {
  jobId: string;
  projectId: string;
  repoId: string;
  repoUrl: string;
  branch: string;
  workspaceId: string;
  status: AnalysisJobStatus;
  createdAt: string;
  updatedAt: string;
}
