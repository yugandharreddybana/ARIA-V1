import { z } from 'zod';

const priorityEnum = z.enum(['p0_critical', 'high', 'normal', 'low', 'speculative']);

export const llmInvokeSchema = z.object({
  sessionId: z.string().uuid(),
  agentId: z.string().min(1),
  skillSlug: z.string().optional(),
  targetBackend: z.string().min(1).default('auto'),
  priority: priorityEnum.default('normal'),
  promptTokensEstimated: z.number().int().nonnegative().default(0),
  contextWindowTokens: z.number().int().nonnegative().optional(),
  systemMessage: z.string().optional(),
  injectedContextRefs: z.record(z.unknown()).optional(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).min(1),
  modelParameters: z.record(z.unknown()).optional(),
});

export type LlmInvokeInput = z.infer<typeof llmInvokeSchema>;
