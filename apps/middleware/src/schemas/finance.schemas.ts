import { z } from 'zod';

export const estimateSchema = z.object({
  sessionId:      z.string().uuid(),
  tokens:         z.number().int().nonnegative(),
  computeMinutes: z.number().int().nonnegative(),
  storageGbDays:  z.number().nonnegative(),
  thirdPartyUsd:  z.number().nonnegative().optional(),
  remoteBackend:  z.boolean(),
}).strict();

export const allocateSchema = z.object({
  scope:    z.enum(['session','project','workspace','global']),
  scopeRef: z.string().uuid(),
  tokens:   z.number().int().positive(),
}).strict();

export const procurementSchema = z.object({
  proposedBy: z.string().min(1).max(200),
  problem:    z.string().min(1).max(8000),
  category:   z.string().min(1).max(100),
  requirements: z.array(z.string()).max(100).optional(),
  candidates: z.array(z.object({
    vendorId:        z.string().uuid(),
    name:            z.string().min(1).max(200),
    monthlyCostUsd:  z.number().nonnegative(),
    featureCoverage: z.number().min(0).max(1),
    slaUptime:       z.number().min(0).max(1),
    trustScore:      z.number().min(0).max(1),
  })).max(50).optional(),
}).strict();

export const issueCardSchema = z.object({
  vendorId:      z.string().uuid().optional(),
  spendLimitUsd: z.number().positive(),
}).strict();

export const freezeCardSchema = z.object({
  stripeCardId: z.string().min(1).max(200),
  reason:       z.string().min(1).max(500),
}).strict();

export const arbitrageSchema = z.object({
  service:           z.string().min(1).max(100),
  currentProvider:   z.string().min(1).max(100),
  candidateProvider: z.string().min(1).max(100),
  monthlySavingsUsd: z.number().nonnegative(),
  rationaleMd:       z.string().min(1).max(20_000),
}).strict();

export const diplomatSchema = z.object({
  vendor:      z.string().min(1).max(200),
  targetUsd:   z.number().positive(),
  competitors: z.array(z.string().min(1).max(200)).max(10).optional(),
}).strict();
