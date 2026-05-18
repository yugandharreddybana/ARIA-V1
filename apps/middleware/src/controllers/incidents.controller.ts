import type { Response, NextFunction } from 'express';
import { z } from 'zod';
import { incidentProxy, type IncidentRow } from '../services/incident.proxy';
import type { AriaRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';

const declareSchema = z.object({
  source:           z.string().min(1).max(200),
  severity:         z.enum(['P0','P1','P2','P3']),
  title:            z.string().min(1).max(500),
  description:      z.string().min(1).max(8000),
  relatedSessionId: z.string().uuid().optional(),
  relatedCommits:   z.array(z.string()).max(50).optional(),
}).strict();

const transitionSchema = z.object({
  to: z.enum(['open','investigating','mitigated','resolved','postmortem']),
}).strict();

function bearer(req: AriaRequest): string {
  const auth = req.headers.authorization;
  const t = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
  if (!t) throw new AppError('Missing bearer token', 401);
  return t;
}

export async function declare(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = declareSchema.parse(req.body);
    const out = await incidentProxy.declare(parsed, bearer(req));
    res.status(201).json({ success: true, data: out });
  } catch (err) { next(err); }
}

export async function list(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await incidentProxy.list(bearer(req)) }); }
  catch (err) { next(err); }
}

export async function get(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await incidentProxy.get(req.params.id, bearer(req)) }); }
  catch (err) { next(err); }
}

export async function transition(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = transitionSchema.parse(req.body);
    const to: IncidentRow['status'] = parsed.to;
    const out = await incidentProxy.transition(req.params.id, to, bearer(req));
    res.json({ success: true, data: out });
  } catch (err) { next(err); }
}
