import { z } from 'zod';

export const llmConfigSchema = z.discriminatedUnion('provider', [
  // Ollama — local, no API key required
  z.object({
    provider: z.literal('ollama'),
    baseUrl:  z.string().url({ message: 'baseUrl must be a valid URL (e.g. http://localhost:11434)' }),
    model:    z.string().min(1, 'model name is required').max(200),
    apiKey:   z.undefined().optional(),
  }),
  // Anthropic — API key required, baseUrl optional (defaults to anthropic api)
  z.object({
    provider: z.literal('anthropic'),
    baseUrl:  z.string().url().optional(),
    model:    z.string().min(1, 'model name is required').max(200),
    apiKey:   z.string().min(20, 'Anthropic API key is required and must be at least 20 characters'),
  }),
  // OpenAI-compatible — API key required, baseUrl required
  z.object({
    provider: z.literal('openai'),
    baseUrl:  z.string().url({ message: 'baseUrl must be a valid URL (e.g. https://api.openai.com/v1)' }).optional(),
    model:    z.string().min(1, 'model name is required').max(200),
    apiKey:   z.string().min(10, 'OpenAI API key is required'),
  }),
  // Custom OpenAI-compatible endpoint
  z.object({
    provider: z.literal('custom'),
    baseUrl:  z.string().url({ message: 'A valid base URL is required for custom providers' }),
    model:    z.string().min(1, 'model name is required').max(200),
    apiKey:   z.string().optional(),
  }),
]);

export type LlmConfigInput = z.infer<typeof llmConfigSchema>;
