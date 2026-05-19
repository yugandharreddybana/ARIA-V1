import type { Response, NextFunction } from 'express';
import { UiDiscoveryService } from '../services/uiDiscovery.service';
import { uiDiscoverySchema } from '../schemas/uiDiscovery.schemas';
import { getPgPool } from '../services/db.client';
import type { AriaRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { resolve } from 'node:path';

let singleton: UiDiscoveryService | null = null;
function service(): UiDiscoveryService {
  if (singleton) return singleton;
  // repoRoot is two levels up from apps/middleware/src/controllers when running via tsx,
  // and from dist/controllers when running compiled. Use process.cwd() — the dev/up script
  // and Dockerfile both invoke from the repo root.
  singleton = new UiDiscoveryService(getPgPool(), resolve(process.cwd(), '..', '..'));
  return singleton;
}

export async function upsert(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = uiDiscoverySchema.parse(req.body);
    const rec = await service().upsert(parsed, req.user?.userId ?? null);
    res.status(200).json({ success: true, data: rec });
  } catch (err) {
    next(err);
  }
}

export async function get(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const ticketId = req.params.ticketId;
    if (!ticketId) throw new AppError('ticketId required', 400);
    const rec = await service().get(ticketId);
    if (!rec) { res.status(404).json({ success: false, error: 'Not found', code: 'NOT_FOUND' }); return; }
    res.status(200).json({ success: true, data: rec });
  } catch (err) {
    next(err);
  }
}
