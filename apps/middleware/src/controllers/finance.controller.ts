import type { Response, NextFunction } from 'express';
import { financeProxy } from '../services/finance.proxy';
import {
  estimateSchema, allocateSchema, procurementSchema, issueCardSchema, freezeCardSchema,
  arbitrageSchema, diplomatSchema,
} from '../schemas/finance.schemas';
import type { AriaRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';

function bearer(req: AriaRequest): string {
  const auth = req.headers.authorization;
  const t = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
  if (!t) throw new AppError('Missing bearer token', 401);
  return t;
}

export async function estimate(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = estimateSchema.parse(req.body);
    res.json({ success: true, data: await financeProxy.estimate(parsed, bearer(req)) });
  } catch (err) { next(err); }
}
export async function allocate(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = allocateSchema.parse(req.body);
    res.json({ success: true, data: await financeProxy.allocate(parsed, bearer(req)) });
  } catch (err) { next(err); }
}
export async function proposeProcurement(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = procurementSchema.parse(req.body);
    res.status(201).json({ success: true, data: await financeProxy.proposeProcurement(parsed, bearer(req)) });
  } catch (err) { next(err); }
}
export async function issueCard(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = issueCardSchema.parse(req.body);
    res.status(201).json({ success: true, data: await financeProxy.issueCard(parsed, bearer(req)) });
  } catch (err) { next(err); }
}
export async function freezeCard(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = freezeCardSchema.parse(req.body);
    res.json({ success: true, data: await financeProxy.freezeCard(parsed, bearer(req)) });
  } catch (err) { next(err); }
}
export async function proposeArbitrage(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = arbitrageSchema.parse(req.body);
    res.status(201).json({ success: true, data: await financeProxy.proposeArbitrage(parsed, bearer(req)) });
  } catch (err) { next(err); }
}
export async function diplomatPlaybook(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = diplomatSchema.parse(req.body);
    res.json({ success: true, data: await financeProxy.diplomatPlaybook(parsed, bearer(req)) });
  } catch (err) { next(err); }
}
