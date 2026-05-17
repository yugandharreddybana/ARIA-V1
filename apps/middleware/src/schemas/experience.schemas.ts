import { z } from 'zod';

const veracityEnum = z.enum(['human-authored', 'human-approved', 'ai-only']);

export const appendEntrySchema = z.object({
  skill:    z.string().min(1).max(100),
  kind:     z.enum(['best_practice', 'anti_pattern']),
  text:     z.string().min(1).max(2000),
  veracity: veracityEnum.default('ai-only'),
  notes:    z.string().max(2000).optional(),
}).strict();

export const appendFailureStorySchema = z.object({
  skill:       z.string().min(1).max(100),
  id:          z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  root_cause:  z.string().min(1).max(4000),
  resolution:  z.string().min(1).max(4000),
  veracity:    veracityEnum.default('ai-only'),
}).strict();

export type AppendEntryInput = z.infer<typeof appendEntrySchema>;
export type AppendFailureStoryInput = z.infer<typeof appendFailureStorySchema>;
