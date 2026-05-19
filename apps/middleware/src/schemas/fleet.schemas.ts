import { z } from 'zod';

export const registerAgentSchema = z.object({
  agentId:     z.string().min(1).max(200),
  agentFamily: z.string().min(1).max(100),
}).strict();

export const publishEventSchema = z.object({
  epicId:    z.string().min(1).max(200),
  topic:     z.string().min(1).max(100),
  payload:   z.string().min(1).max(64_000),
  agentId:   z.string().min(1).max(200),
  signature: z.string().min(1).max(8_000),
}).strict();

export const heartbeatSchema = z.object({
  agentId:             z.string().min(1).max(200),
  sessionId:           z.string().uuid().optional(),
  skillSlug:           z.string().max(100).optional(),
  state:               z.enum(['active','waiting','blocked','complete','error']),
  waitingOn:           z.string().max(200).optional(),
  waitingSince:        z.string().datetime().optional(),
  lastOutputAt:        z.string().datetime().optional(),
  tokensConsumedIdle:  z.number().int().nonnegative().optional(),
}).strict();

export const shadowBranchSchema = z.object({
  ticketRef:        z.string().min(1).max(200),
  speculativeDiff:  z.string().max(200_000).optional(),
}).strict();
