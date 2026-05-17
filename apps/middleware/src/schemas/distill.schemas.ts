import { z } from 'zod';

export const distillSchema = z.object({
  projectId:       z.string().uuid(),
  sessionId:       z.string().uuid().optional(),
  agentId:         z.string().min(1).max(200),
  taskDescription: z.string().min(1).max(8000),
  affectedSkill:   z.string().min(1).max(100).optional(),
  maxAffectedSymbols: z.number().int().min(1).max(50).optional(),
  maxModuleContext:   z.number().int().min(1).max(20).optional(),
  maxDomainConcepts:  z.number().int().min(1).max(20).optional(),
  maxDecisions:       z.number().int().min(1).max(20).optional(),
}).strict();

export type DistillInputZ = z.infer<typeof distillSchema>;

export const preflightSchema = z.object({
  projectId:       z.string().uuid(),
  agentId:         z.string().min(1).max(200),
  rawPromptTokens: z.number().int().min(0),
}).strict();

export type PreflightInputZ = z.infer<typeof preflightSchema>;
