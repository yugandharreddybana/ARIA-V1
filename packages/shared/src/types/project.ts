import { AnalysisStatus } from '../constants/enums';

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  analysisStatus: AnalysisStatus;
  firstStartCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectRepo {
  id: string;
  projectId: string;
  githubRepoId: string;
  fullName: string;    // e.g. "owner/repo-name"
  cloneUrl: string;
  branch: string;      // default branch
  isActive: boolean;
  lastAnalyzedAt: Date | null;
  createdAt: Date;
}
