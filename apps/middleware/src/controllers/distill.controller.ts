import type { Response, NextFunction } from 'express';
import { distill, preFlight } from '../services/distill.service';
import { distillSchema, preflightSchema } from '../schemas/distill.schemas';
import type { AriaRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';

function bearer(req: AriaRequest): string {
  const auth = req.headers.authorization;
  const t = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
  if (!t) throw new AppError('Missing bearer token for backend proxy', 401);
  return t;
}

export async function distillHandler(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = distillSchema.parse(req.body);
    const payload = await distill(parsed, bearer(req));
    res.status(200).json({ success: true, data: payload });
  } catch (err) { next(err); }
}

export async function preflightHandler(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = preflightSchema.parse(req.body);
    const estimate = await preFlight(parsed);
    res.status(200).json({ success: true, data: estimate });
  } catch (err) { next(err); }
}
