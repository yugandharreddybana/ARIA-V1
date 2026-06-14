import { z } from 'zod';

const TICKET_TYPES = ['bug', 'feature', 'tech_debt', 'incident', 'process'] as const;
const TICKET_STATUSES = [
  'backlog', 'ready_for_dev', 'in_progress', 'ready_for_qa',
  'in_qa', 'ready_for_review', 'done', 'rejected',
] as const;

export const createTicketSchema = z.object({
  projectId:       z.string().uuid({ message: 'projectId must be a valid UUID' }),
  title:           z.string().min(1, 'title is required').max(500),
  description:     z.string().min(1, 'description is required').max(5000),
  type:            z.enum(TICKET_TYPES, { errorMap: () => ({ message: 'type must be one of: bug, feature, tech_debt, incident, process' }) }),
  riskClass:       z.enum(['A', 'B', 'C']).optional(),
  affectedDomains: z.array(z.string()).optional(),
});

export const updateTicketSchema = z.object({
  status:          z.enum(TICKET_STATUSES).optional(),
  assignedSkillId: z.string().uuid().nullable().optional(),
  humanApproved:   z.boolean().optional(),
  title:           z.string().min(1).max(500).optional(),
  description:     z.string().min(1).max(5000).optional(),
}).refine(
  data => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' },
);

export const agentCreateTicketSchema = z.object({
  sessionId:       z.string().uuid({ message: 'sessionId must be a valid UUID' }),
  skillId:         z.string().uuid({ message: 'skillId must be a valid UUID' }),
  projectId:       z.string().uuid({ message: 'projectId must be a valid UUID' }),
  title:           z.string().min(1, 'title is required').max(500),
  description:     z.string().min(1, 'description is required').max(5000),
  type:            z.enum(TICKET_TYPES, { errorMap: () => ({ message: 'type must be one of: bug, feature, tech_debt, incident, process' }) }),
  riskClass:       z.enum(['A', 'B', 'C']).optional(),
  affectedDomains: z.array(z.string()).optional(),
  promptBlock:     z.unknown().optional(),
});

export const agentUpdateStatusSchema = z.object({
  status:    z.enum(TICKET_STATUSES, { errorMap: () => ({ message: 'status must be a valid ticket status' }) }),
  skillId:   z.string().uuid({ message: 'skillId must be a valid UUID' }),
  sessionId: z.string().uuid().optional(),
});
