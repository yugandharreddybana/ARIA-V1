import { z } from 'zod';

export const complianceScanSchema = z.object({
  triggeredBy: z.string().min(1).max(200),
  triggerRef:  z.string().max(500).optional(),
  diffPath:    z.string().max(500).optional(),
  diff:        z.string().min(1).max(500_000),
}).strict();

export const complianceDecideSchema = z.object({
  decidedBy: z.string().min(1).max(200),
  to:        z.enum(['accepted','rejected','mitigated']),
}).strict();

export const gdprRedactSchema = z.object({
  table:         z.string().min(1).max(100),
  sourceId:      z.string().min(1).max(200),
  column:        z.string().min(1).max(100),
  originalValue: z.string().max(10_000).optional(),
  reason:        z.enum(['gdpr-erasure','ccpa-erasure','data-minimisation']),
  requestedBy:   z.string().min(1).max(200),
}).strict();

export const auditExportSchema = z.object({
  requestedBy: z.string().min(1).max(200),
  scope:       z.enum(['soc2','iso','gdpr','all']),
}).strict();
