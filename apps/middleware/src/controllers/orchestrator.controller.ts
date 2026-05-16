import type { Response, NextFunction } from 'express';
import { orchestratorProxy } from '../services/orchestrator.proxy';
import type { AriaRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';

function getToken(req: AriaRequest): string {
  const auth = req.headers.authorization;
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
  const cookie = (req as unknown as { cookies?: Record<string, string> }).cookies?.aria_access_token;
  const token = bearer ?? cookie;
  if (!token) throw new AppError('Missing token to proxy to backend', 401);
  return token;
}

export async function start(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await orchestratorProxy.start(req.params.id, getToken(req)) }); }
  catch (err) { next(err); }
}
export async function pause(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await orchestratorProxy.pause(req.params.id, getToken(req)) }); }
  catch (err) { next(err); }
}
export async function stop(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await orchestratorProxy.stop(req.params.id, getToken(req)) }); }
  catch (err) { next(err); }
}
export async function status(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await orchestratorProxy.status(req.params.id, getToken(req)) }); }
  catch (err) { next(err); }
}
