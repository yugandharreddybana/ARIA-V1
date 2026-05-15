export type NodeType = 'file' | 'module' | 'service' | 'endpoint' | 'db_table' | 'function' | 'class' | 'interface';
export type EdgeType = 'calls' | 'queries' | 'owns' | 'depends_on' | 'imports' | 'extends' | 'implements' | 'triggers';
export type GraphStatus = 'empty' | 'partial' | 'complete';

export interface ConceptNode {
  id: string;
  projectId: string;
  nodeType: NodeType;
  name: string;
  filePath?: string;
  summary?: string;
  metadata?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConceptEdge {
  id: string;
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: EdgeType;
  label?: string;
  confidence?: number;
  createdAt: string;
}

export interface GraphMeta {
  nodeCount: number;
  edgeCount: number;
  status: GraphStatus;
}

export interface ConceptGraph {
  projectId: string;
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  meta: GraphMeta;
}
