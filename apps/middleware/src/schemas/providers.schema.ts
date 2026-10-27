import { z } from 'zod';
import { LLM_PROVIDERS } from '../services/llmProvider.service';

const providerEnum = z.enum(LLM_PROVIDERS);
const label = z.string().trim().min(1).max(80).default('default');
const key = z.string().trim().min(8).max(500);
const model = z.string().trim().min(1).max(200).optional();

export const createCredentialSchema = z.object({
  provider: providerEnum,
  label: label.optional(),
  apiKey: key.optional(),
  baseUrl: z.string().url().optional(),
  model,
});

export const testCredentialSchema = z.object({
  apiKey: key.optional(),
  model,
});

export const activateCredentialSchema = z.object({
  tier: z.enum(['planning', 'coding']),
  projectId: z.string().uuid().optional(),
});

export const projectCredentialSchema = z.object({
  planningCredentialId: z.string().uuid().nullable().optional(),
  codingCredentialId: z.string().uuid().nullable().optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  standupTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  sprintWorkdays: z.number().int().min(1).max(30).optional(),
  modelTaskTiers: z.object({
    planning: z.enum(['top', 'auto']).optional(),
    development: z.enum(['top', 'auto']).optional(),
  }).optional(),
});

export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;
export type ActivateCredentialInput = z.infer<typeof activateCredentialSchema>;
