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

export interface ConceptNodeDto {
  id: string;
  projectId: string;
  nodeType: string;
  name: string;
  filePath?: string;
  summary?: string;
  metadata?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConceptEdgeDto {
  id: string;
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: string;
  label?: string;
  confidence?: number;
  createdAt: string;
}

export interface ConceptGraphMeta {
  nodeCount: number;
  edgeCount: number;
  status: 'empty' | 'partial' | 'complete';
}

export interface ConceptGraphResponse {
  projectId: string;
  nodes: ConceptNodeDto[];
  edges: ConceptEdgeDto[];
  meta: ConceptGraphMeta;
}
