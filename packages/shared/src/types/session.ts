export type SessionState = 'new' | 'bootstrapping' | 'scrumming' | 'working' | 'paused' | 'completed' | 'failed';
export type SessionMode = 'precision' | 'throughput' | 'planning' | 'shadow';
export type SessionEnvironment = 'dev' | 'staging' | 'prod_readonly' | 'production';
export type MissionType = 'stability' | 'feature' | 'tech_debt' | 'security' | 'planning';

export interface Session {
  id: string;
  projectId: string;
  workspaceId: string;
  state: SessionState;
  mode: SessionMode;
  environment: SessionEnvironment;
  missionType: MissionType;
  missionRiskAppetite: string;
  missionScope: string[];
  tokenBudget?: number | null;
  timeBudgetMinutes?: number | null;
  isFirstStart: boolean;
  briefSummary?: string | null;
  startedAt: string;
  endedAt?: string | null;
  createdAt: string;
}

export interface CreateSessionRequest {
  projectId: string;
  mode?: SessionMode;
  environment?: SessionEnvironment;
  missionType?: MissionType;
  missionRiskAppetite?: string;
  missionScope?: string[];
  tokenBudget?: number;
  timeBudgetMinutes?: number;
}
