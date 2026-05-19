import { z } from 'zod';

export const lockAcquireSchema = z.object({
  path:       z.string().min(1).max(500),
  agentId:    z.string().min(1).max(200),
  ttlSeconds: z.number().int().min(5).max(600).optional(),
  sessionId:  z.string().uuid().optional(),
  reason:     z.string().max(200).optional(),
}).strict();

export const lockReleaseSchema = z.object({
  path:    z.string().min(1).max(500),
  agentId: z.string().min(1).max(200),
}).strict();

export const lockRefreshSchema = z.object({
  path:       z.string().min(1).max(500),
  agentId:    z.string().min(1).max(200),
  ttlSeconds: z.number().int().min(5).max(600),
}).strict();

export const hoverSchema = z.object({
  projectId:  z.string().uuid(),
  filePath:   z.string().min(1).max(500),
  symbol:     z.string().min(1).max(500),
  cursorLine: z.number().int().nonnegative().optional(),
}).strict();

export const diffDecisionSchema = z.object({
  agentId:     z.string().min(1).max(200),
  sessionId:   z.string().uuid().optional(),
  filePath:    z.string().min(1).max(500),
  diffHash:    z.string().regex(/^[0-9a-f]{64}$/),
  decision:    z.enum(['accepted','rejected','expired']),
  decidedBy:   z.string().min(1).max(200),
  diffExcerpt: z.string().max(20_000).optional(),
}).strict();

export const taskDispatchSchema = z.object({
  command: z.enum(['fix','test','explain','red-team','compliance','design-check']),
  agentId: z.string().min(1).max(200),
  projectId: z.string().uuid().optional(),
  filePath:  z.string().max(500).optional(),
  selection: z.string().max(50_000).optional(),
  cursorLine: z.number().int().nonnegative().optional(),
}).strict();
