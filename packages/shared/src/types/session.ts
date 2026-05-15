export type SessionState =
  | 'bootstrapping'
  | 'planning'
  | 'active'
  | 'paused'
  | 'review'
  | 'retro'
  | 'completed'
  | 'failed';

export interface Session {
  id: string;
  projectId: string;
  teamId: string;
  state: SessionState;
  startedAt: string;
  endedAt?: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StartSessionRequest {
  projectId: string;
  teamId: string;
}
