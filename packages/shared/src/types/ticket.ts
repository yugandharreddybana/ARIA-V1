import type { RiskClass } from '../constants/enums';

export type TicketType = 'bug' | 'feature' | 'tech_debt' | 'incident' | 'process';
export type TicketStatus =
  | 'backlog'
  | 'ready_for_dev'
  | 'in_progress'
  | 'ready_for_qa'
  | 'in_qa'
  | 'ready_for_review'
  | 'awaiting_merge'
  | 'blocked'
  | 'done'
  | 'rejected';
export type EvidenceType = 'bug_report' | 'fix' | 'feature_design' | 'qa_verification';

export interface Ticket {
  id: string;
  projectId: string;
  sessionId?: string | null;
  type: TicketType;
  status: TicketStatus;
  title: string;
  description: string;
  promptBlock?: unknown | null;
  riskClass: string;
  affectedDomains: string[];
  assignedSkillId?: string | null;
  jiraIssueKey?: string | null;
  createdBySkillId?: string | null;
  humanApproved: boolean;
  statusReason?: string | null;
  flowId?: string | null;
  layer?: 'frontend' | 'backend' | 'fullstack' | null;
  storyPoints?: number;
  dueAt?: string | null;
  workStartedAt?: string | null;
  scheduleState?: 'not_started' | 'on_track' | 'at_risk' | 'overdue' | 'done';
  ticketKey?: string;
  splitSuggested?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketEvidence {
  id: string;
  ticketId: string;
  evidenceType: EvidenceType;
  screenshots: string[];
  videoPath?: string | null;
  logs: string;
  reproSteps: string[];
  environment: Record<string, unknown>;
  codeDiff?: string | null;
  testOutput?: string | null;
  commitHash?: string | null;
  createdBySkillId?: string | null;
  createdAt: string;
}

export interface CreateTicketRequest {
  projectId: string;
  title: string;
  description: string;
  type: TicketType;
  riskClass?: string;
  affectedDomains?: string[];
  storyPoints?: number;
  flowId?: string | null;
  layer?: 'frontend' | 'backend' | 'fullstack' | null;
}

export interface UpdateTicketRequest {
  status?: TicketStatus;
  assignedSkillId?: string | null;
  humanApproved?: boolean;
  title?: string;
  description?: string;
  storyPoints?: number;
  flowId?: string | null;
  layer?: 'frontend' | 'backend' | 'fullstack' | null;
  action?: 'approve' | 'unblock' | 'reject';
}
