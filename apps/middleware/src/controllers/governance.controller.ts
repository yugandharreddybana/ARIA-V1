import type { Response, NextFunction } from 'express';
import { governanceProxy } from '../services/governance.proxy';
import {
  complianceScanSchema, complianceDecideSchema, gdprRedactSchema, auditExportSchema,
} from '../schemas/governance.schemas';
import type { AriaRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';

function bearer(req: AriaRequest): string {
  const auth = req.headers.authorization;
  const t = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
  if (!t) throw new AppError('Missing bearer token', 401);
  return t;
}

export async function scan(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = complianceScanSchema.parse(req.body);
    res.json({ success: true, data: await governanceProxy.scan(parsed, bearer(req)) });
  } catch (err) { next(err); }
}
export async function list(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await governanceProxy.list(bearer(req)) }); }
  catch (err) { next(err); }
}
export async function decide(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = complianceDecideSchema.parse(req.body);
    res.json({ success: true, data: await governanceProxy.decide(req.params.id, parsed, bearer(req)) });
  } catch (err) { next(err); }
}
export async function redact(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = gdprRedactSchema.parse(req.body);
    res.status(201).json({ success: true, data: await governanceProxy.redact(parsed, bearer(req)) });
  } catch (err) { next(err); }
}
export async function exportAudit(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = auditExportSchema.parse(req.body);
    res.status(201).json({ success: true, data: await governanceProxy.exportAudit(parsed, bearer(req)) });
  } catch (err) { next(err); }
}
export async function explain(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await governanceProxy.explain(req.params.sessionId, bearer(req)) }); }
  catch (err) { next(err); }
}
