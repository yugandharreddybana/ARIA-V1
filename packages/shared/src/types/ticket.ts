export type RiskClass = 'A' | 'B' | 'C' | 'D';
export type TicketStatus = 'open' | 'in_progress' | 'review' | 'done' | 'blocked' | 'cancelled';
export type TicketType = 'feature' | 'bug' | 'tech_debt' | 'security' | 'devops';
export type EvidenceType = 'screenshot' | 'log' | 'repro_steps' | 'test_output' | 'note';

export interface Ticket {
  id: string;
  projectId: string;
  sessionId?: string;
  title: string;
  description?: string;
  status: TicketStatus;
  riskClass: RiskClass;
  ticketType: TicketType;
  assignedTo?: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketEvidence {
  id: string;
  ticketId: string;
  type: EvidenceType;
  content: string;
  createdAt: string;
}

export interface CreateTicketRequest {
  projectId: string;
  title: string;
  description?: string;
  riskClass?: RiskClass;
  ticketType?: TicketType;
  priority?: number;
}
