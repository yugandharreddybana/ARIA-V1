import type { AcceptanceCriterion } from '../schemas/acceptance';

export type TicketType = 'bug' | 'feature' | 'tech_debt' | 'incident' | 'process';
export type IssueType = 'epic' | 'story' | 'sub_task';
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
export type UiMockStatus =
  | 'not_required'
  | 'pending_designer'
  | 'pending_po_sm'
  | 'pending_owner'
  | 'changes_requested'
  | 'approved';
export type ReadinessStatus = 'not_ready' | 'ready' | 'blocked';

export interface TicketOwnerView {
  ownerAgentId: string | null;
  ownerName: string | null;
  backupAgentId: string | null;
  backupName: string | null;
  ownershipSource: 'assignee' | 'path' | 'flow' | 'none';
}

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
  issueType?: IssueType;
  parentId?: string | null;
  epicId?: string | null;
  acceptanceCriteria?: AcceptanceCriterion[];
  behaviourNotes?: string | null;
  uiAffected?: boolean;
  uiMockStatus?: UiMockStatus;
  apiContract?: unknown | null;
  dorChecklist?: unknown[];
  dodChecklist?: unknown[];
  readinessStatus?: ReadinessStatus;
  rollbackPlan?: string | null;
  sprintId?: string | null;
  assigneeAgentId?: string | null;
  predictedPaths?: string[];
  ideaCardId?: string | null;
  ownerAgentId?: string | null;
  ownerName?: string | null;
  backupAgentId?: string | null;
  backupName?: string | null;
  ownershipSource?: TicketOwnerView['ownershipSource'];
  subTasks?: Ticket[];
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
  issueType?: IssueType;
  parentId?: string | null;
  epicId?: string | null;
  acceptanceCriteria?: AcceptanceCriterion[];
  behaviourNotes?: string | null;
  uiAffected?: boolean;
  sprintId?: string | null;
  assigneeAgentId?: string | null;
  predictedPaths?: string[];
  ideaCardId?: string | null;
  estimatedDays?: number;
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
  issueType?: IssueType;
  parentId?: string | null;
  epicId?: string | null;
  acceptanceCriteria?: AcceptanceCriterion[];
  behaviourNotes?: string | null;
  uiAffected?: boolean;
  uiMockStatus?: UiMockStatus;
  readinessStatus?: ReadinessStatus;
  sprintId?: string | null;
  assigneeAgentId?: string | null;
  predictedPaths?: string[];
  estimatedDays?: number;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal?: string | null;
  startsOn: string;
  endsOn: string;
  status: 'planned' | 'active' | 'closed';
  createdAt: string;
}

export interface PathOwner {
  id: string;
  projectId: string;
  pathGlob: string;
  layer: 'frontend' | 'backend' | 'fullstack' | 'docs' | 'other';
  ownerAgentId: string;
  backupAgentId?: string | null;
  source: 'merged_pr' | 'manual' | 'flow_seed';
  lastTicketId?: string | null;
  lastPrNumber?: number | null;
  ownerName?: string | null;
  backupName?: string | null;
}
