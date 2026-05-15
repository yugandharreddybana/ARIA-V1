export type ProjectStatus = 'active' | 'archived' | 'paused';

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRepo {
  id: string;
  projectId: string;
  repoUrl: string;
  repoName: string;
  branch: string;
  createdAt: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  repoUrl?: string;
  branch?: string;
}
