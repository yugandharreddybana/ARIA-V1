import type { Response, NextFunction } from 'express';
import { fleetProxy } from '../services/fleet.proxy';
import { registerAgentSchema, publishEventSchema, heartbeatSchema, shadowBranchSchema } from '../schemas/fleet.schemas';
import type { AriaRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';

function bearer(req: AriaRequest): string {
  const auth = req.headers.authorization;
  const t = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
  if (!t) throw new AppError('Missing bearer token', 401);
  return t;
}

export async function registerAgent(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = registerAgentSchema.parse(req.body);
    res.status(201).json({ success: true, data: await fleetProxy.register(parsed.agentId, parsed.agentFamily, bearer(req)) });
  } catch (err) { next(err); }
}

export async function publishEvent(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = publishEventSchema.parse(req.body);
    res.status(201).json({ success: true, data: await fleetProxy.publish(parsed, bearer(req)) });
  } catch (err) { next(err); }
}

export async function listEvents(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const epicId = typeof req.query.epicId === 'string' ? req.query.epicId : undefined;
    res.json({ success: true, data: await fleetProxy.recent(bearer(req), epicId) });
  } catch (err) { next(err); }
}

export async function heartbeat(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = heartbeatSchema.parse(req.body);
    res.status(201).json({ success: true, data: await fleetProxy.heartbeat(parsed, bearer(req)) });
  } catch (err) { next(err); }
}

export async function healScan(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await fleetProxy.healScan(bearer(req)) }); }
  catch (err) { next(err); }
}

export async function deadlockSweep(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await fleetProxy.deadlockSweep(bearer(req)) }); }
  catch (err) { next(err); }
}

export async function openShadow(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = shadowBranchSchema.parse(req.body);
    res.status(201).json({ success: true, data: await fleetProxy.openShadow(parsed.ticketRef, parsed.speculativeDiff ?? '', bearer(req)) });
  } catch (err) { next(err); }
}

export async function listDebts(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await fleetProxy.openDebts(bearer(req)) }); }
  catch (err) { next(err); }
}

export async function listBreakers(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await fleetProxy.openBreakers(bearer(req)) }); }
  catch (err) { next(err); }
}
