import { z } from 'zod';
import { acceptanceCriteriaZ, acceptanceCriterionZ } from '@aria/shared';

const TICKET_TYPES = ['bug', 'feature', 'tech_debt', 'incident', 'process'] as const;
const ISSUE_TYPES = ['epic', 'story', 'sub_task'] as const;
const TICKET_STATUSES = [
  'backlog', 'ready_for_dev', 'in_progress', 'ready_for_qa',
  'in_qa', 'ready_for_review', 'awaiting_merge', 'blocked', 'done', 'rejected',
] as const;
const STORY_POINTS = [1, 2, 3, 5, 8, 13] as const;
const LAYERS = ['frontend', 'backend', 'fullstack'] as const;
const UI_MOCK = [
  'not_required', 'pending_designer', 'pending_po_sm', 'pending_owner',
  'changes_requested', 'approved',
] as const;
const READINESS = ['not_ready', 'ready', 'blocked'] as const;

const fibPoints = z.number().int().refine(
  (value) => (STORY_POINTS as readonly number[]).includes(value),
  'storyPoints must be Fibonacci',
);

export const createTicketSchema = z.object({
  projectId: z.string().uuid({ message: 'projectId must be a valid UUID' }),
  title: z.string().min(1, 'title is required').max(500),
  description: z.string().min(1, 'description is required').max(5000),
  type: z.enum(TICKET_TYPES, { errorMap: () => ({ message: 'type must be one of: bug, feature, tech_debt, incident, process' }) }),
  riskClass: z.enum(['A', 'B', 'C']).optional(),
  affectedDomains: z.array(z.string()).optional(),
  storyPoints: fibPoints.optional(),
  estimatedDays: z.number().positive().max(13).optional(),
  flowId: z.string().uuid().nullable().optional(),
  layer: z.enum(LAYERS).nullable().optional(),
  issueType: z.enum(ISSUE_TYPES).optional(),
  parentId: z.string().uuid().nullable().optional(),
  epicId: z.string().uuid().nullable().optional(),
  acceptanceCriteria: z.array(acceptanceCriterionZ).optional(),
  behaviourNotes: z.string().max(10000).nullable().optional(),
  uiAffected: z.boolean().optional(),
  sprintId: z.string().uuid().nullable().optional(),
  assigneeAgentId: z.string().uuid().nullable().optional(),
  predictedPaths: z.array(z.string().min(1).max(500)).max(100).optional(),
  ideaCardId: z.string().uuid().nullable().optional(),
});

export const updateTicketSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  assignedSkillId: z.string().uuid().nullable().optional(),
  humanApproved: z.boolean().optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).max(5000).optional(),
  storyPoints: fibPoints.optional(),
  estimatedDays: z.number().positive().max(13).optional(),
  flowId: z.string().uuid().nullable().optional(),
  layer: z.enum(LAYERS).nullable().optional(),
  action: z.enum(['approve', 'unblock', 'reject']).optional(),
  issueType: z.enum(ISSUE_TYPES).optional(),
  parentId: z.string().uuid().nullable().optional(),
  epicId: z.string().uuid().nullable().optional(),
  acceptanceCriteria: z.array(acceptanceCriterionZ).optional(),
  behaviourNotes: z.string().max(10000).nullable().optional(),
  uiAffected: z.boolean().optional(),
  uiMockStatus: z.enum(UI_MOCK).optional(),
  readinessStatus: z.enum(READINESS).optional(),
  sprintId: z.string().uuid().nullable().optional(),
  assigneeAgentId: z.string().uuid().nullable().optional(),
  predictedPaths: z.array(z.string().min(1).max(500)).max(100).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' },
);

export const agentCreateTicketSchema = z.object({
  sessionId: z.string().uuid({ message: 'sessionId must be a valid UUID' }),
  skillId: z.string().uuid({ message: 'skillId must be a valid UUID' }),
  projectId: z.string().uuid({ message: 'projectId must be a valid UUID' }),
  title: z.string().min(1, 'title is required').max(500),
  description: z.string().min(1, 'description is required').max(5000),
  type: z.enum(TICKET_TYPES, { errorMap: () => ({ message: 'type must be one of: bug, feature, tech_debt, incident, process' }) }),
  riskClass: z.enum(['A', 'B', 'C']).optional(),
  affectedDomains: z.array(z.string()).optional(),
  promptBlock: z.unknown().optional(),
  issueType: z.enum(ISSUE_TYPES).optional(),
  parentId: z.string().uuid().nullable().optional(),
  epicId: z.string().uuid().nullable().optional(),
  acceptanceCriteria: acceptanceCriteriaZ.optional(),
  predictedPaths: z.array(z.string().min(1).max(500)).max(100).optional(),
  storyPoints: fibPoints.optional(),
  estimatedDays: z.number().positive().max(13).optional(),
});

export const agentUpdateStatusSchema = z.object({
  status: z.enum(TICKET_STATUSES, { errorMap: () => ({ message: 'status must be a valid ticket status' }) }),
  skillId: z.string().uuid({ message: 'skillId must be a valid UUID' }),
  sessionId: z.string().uuid().optional(),
});

export const createSprintSchema = z.object({
  name: z.string().min(1).max(200),
  goal: z.string().max(2000).nullable().optional(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['planned', 'active', 'closed']).optional(),
});

export const updateSprintSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  goal: z.string().max(2000).nullable().optional(),
  status: z.enum(['planned', 'active', 'closed']).optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'At least one field required' });

export const reassignPathOwnerSchema = z.object({
  pathOwnerId: z.string().uuid(),
  toAgentId: z.string().uuid(),
  ticketId: z.string().uuid().nullable().optional(),
  handoverMd: z.string().min(1).max(20000).optional(),
});
