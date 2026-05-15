import { TicketType, TicketStatus, RiskClass, EvidenceType } from '../constants/enums';

export interface Ticket {
  id: string;
  projectId: string;
  sessionId: string | null;
  type: TicketType;
  status: TicketStatus;
  title: string;
  description: string;
  promptBlock: PromptBlock | null;     // Scrum Master Prompt Master output
  riskClass: RiskClass;
  affectedDomains: string[];
  assignedSkillId: string | null;
  assignedHumanId: string | null;
  jiraIssueKey: string | null;         // optional Jira mirror
  createdBySkillId: string | null;
  humanApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptBlock {
  objective: string;
  context: string[];          // file paths / domain names
  constraints: string[];
  doNotDos: string[];
  acceptanceCriteria: string[];
}

export interface TicketEvidence {
  id: string;
  ticketId: string;
  evidenceType: EvidenceType;
  screenshots: string[];      // file paths or URLs
  videoPath: string | null;
  logs: string;
  reproSteps: string[];
  environment: EvidenceEnvironment;
  codeDiff: string | null;    // for fix evidence
  testOutput: string | null;  // for fix evidence
  commitHash: string | null;
  createdBySkillId: string | null;
  createdAt: Date;
}

export interface EvidenceEnvironment {
  browser: string | null;
  device: string | null;
  url: string | null;
  appVersion: string | null;
  branch: string | null;
  environment: string;
}
