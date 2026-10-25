import { z } from 'zod';

const model = z.string().trim().min(1).max(200);
const key = z.string().trim().min(8).max(500);

export const llmConfigSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('cursor'),
    baseUrl: z.string().url().optional(),
    model: model.default('cursor-agent'),
    apiKey: key,
  }),
  z.object({
    provider: z.literal('gemini'),
    baseUrl: z.string().url().optional(),
    model: model.default('gemini-2.0-flash'),
    apiKey: key,
  }),
  z.object({
    provider: z.literal('groq'),
    baseUrl: z.string().url().optional(),
    model: model.default('llama-3.3-70b-versatile'),
    apiKey: key,
  }),
  z.object({
    provider: z.literal('ollama'),
    baseUrl: z.string().url(),
    model,
    apiKey: z.string().trim().min(8).max(500).optional(),
  }),
  z.object({
    provider: z.literal('openai'),
    baseUrl: z.string().url().optional(),
    model,
    apiKey: key,
  }),
  z.object({
    provider: z.literal('anthropic'),
    baseUrl: z.string().url().optional(),
    model,
    apiKey: key,
  }),
  z.object({
    provider: z.literal('nvidia'),
    baseUrl: z.string().url().optional(),
    model,
    apiKey: z.string().trim().min(10).refine((value) => value.startsWith('nvapi-'), 'NVIDIA API keys start with nvapi-'),
  }),
  z.object({
    provider: z.literal('custom'),
    baseUrl: z.string().url(),
    model,
    apiKey: z.string().trim().min(8).max(500).optional(),
  }),
  z.object({
    provider: z.literal('openai_compatible'),
    baseUrl: z.string().url(),
    model,
    apiKey: key,
  }),
]);

export type LlmConfigInput = z.infer<typeof llmConfigSchema>;
