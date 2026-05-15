import { SessionState, SessionMode, MissionType, Environment } from '../constants/enums';

export interface Session {
  id: string;
  projectId: string;
  workspaceId: string;
  state: SessionState;
  mode: SessionMode;
  environment: Environment;
  missionType: MissionType;
  missionRiskAppetite: 'conservative' | 'moderate' | 'aggressive';
  missionScope: string[];  // repo ids or domain names
  tokenBudget: number | null;
  timeBudgetMinutes: number | null;
  isFirstStart: boolean;
  briefSummary: string | null;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
}
