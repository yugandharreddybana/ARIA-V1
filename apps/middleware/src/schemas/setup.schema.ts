import { z } from 'zod';
import { LLM_PROVIDERS } from '../services/llmProvider.service';
import { ROLE_KEYS } from '../services/companyGenerator';

const modelTier = z.enum(['top', 'auto']);
const modelId = z.string().trim().min(1).max(200);

export const modelTierPatchSchema = z.object({
  planning: modelTier,
  development: modelTier,
  topModel: modelId.nullable().optional(),
  autoModel: modelId.nullable().optional(),
}).strict();

export const setupProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
}).strict();

export const githubTokenSchema = z.object({
  token: z.string().trim().min(8).max(500),
}).strict();

export const connectReposSchema = z.object({
  projectId: z.string().uuid(),
  repos: z.array(z.object({
    fullName: z.string().trim().min(3).max(200),
    branch: z.string().trim().min(1).max(200).default('main'),
  }).strict()).min(1).max(20),
}).strict();

export const analyzeSchema = z.object({
  projectId: z.string().uuid(),
}).strict();

const mixField = z.number().int().min(0).max(40);

export const companyGenerateSchema = z.object({
  size: z.number().int().min(3).max(40),
  mix: z.object({
    business: mixField,
    qa: mixField,
    frontend: mixField,
    backend: mixField,
    fullstack: mixField,
    junior: mixField,
    aiml: mixField,
    devops: mixField,
    security: mixField,
  }).strict(),
  modelTiers: z.object({
    planning: modelTier,
    development: modelTier,
    topModel: modelId.optional(),
    autoModel: modelId.optional(),
  }).strict().optional(),
}).strict();

export const agentPatchSchema = z.object({
  roleTitle: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  instructions: z.string().trim().min(1).max(8000).optional(),
  department: z.string().trim().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  realName: z.string().trim().min(2).max(120).optional(),
  planningTier: modelTier.nullable().optional(),
  developmentTier: modelTier.nullable().optional(),
  modelOverride: modelId.nullable().optional(),
}).strict();

export const agentCreateSchema = z.object({
  realName: z.string().trim().min(2).max(120),
  roleTitle: z.string().trim().min(2).max(200),
  roleKey: z.enum(ROLE_KEYS),
  instructions: z.string().trim().min(1).max(8000),
  description: z.string().trim().max(2000).optional(),
  managerId: z.string().uuid().nullable().optional(),
}).strict();

export const providerEnum = z.enum(LLM_PROVIDERS);
