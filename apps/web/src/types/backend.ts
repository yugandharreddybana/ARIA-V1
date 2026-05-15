export interface AnalysisJobResponse {
  jobId: string;
  projectId: string;
  repoId: string;
  repoUrl: string;
  branch: string;
  workspaceId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  createdAt: string;
  updatedAt: string;
}
