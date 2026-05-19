import type { Response, NextFunction } from 'express';
import { ExperienceService } from '../services/experience.service';
import { ModelTransferService } from '../services/modelTransfer.service';
import { auditSkill } from '../services/veracity.service';
import { appendEntrySchema, appendFailureStorySchema } from '../schemas/experience.schemas';
import type { AriaRequest } from '../middleware/auth.middleware';
import { resolve } from 'node:path';

function root(): string { return resolve(process.cwd(), '..', '..'); }
let svcSingleton: ExperienceService | null = null;
function svc(): ExperienceService { return (svcSingleton ??= new ExperienceService(root())); }

export function list(_req: AriaRequest, res: Response): void {
  res.json({ success: true, data: svc().listSkills() });
}

export function read(req: AriaRequest, res: Response): void {
  res.json({ success: true, data: svc().read(req.params.slug) });
}

export function audit(req: AriaRequest, res: Response): void {
  const slug = req.params.slug;
  res.json({ success: true, data: auditSkill(svc().read(slug)) });
}

export function append(req: AriaRequest, res: Response, next: NextFunction): void {
  try {
    const parsed = appendEntrySchema.parse(req.body);
    const after = parsed.kind === 'best_practice'
      ? svc().appendBestPractice(parsed.skill, parsed.text, parsed.veracity, parsed.notes)
      : svc().appendAntiPattern (parsed.skill, parsed.text, parsed.veracity, parsed.notes);
    res.status(201).json({ success: true, data: after });
  } catch (err) { next(err); }
}

export function appendStory(req: AriaRequest, res: Response, next: NextFunction): void {
  try {
    const parsed = appendFailureStorySchema.parse(req.body);
    const after = svc().appendFailureStory(parsed.skill, {
      id: parsed.id,
      description: parsed.description,
      root_cause: parsed.root_cause,
      resolution: parsed.resolution,
      veracity: parsed.veracity,
    });
    res.status(201).json({ success: true, data: after });
  } catch (err) { next(err); }
}

export function modelTransfer(req: AriaRequest, res: Response, next: NextFunction): void {
  try {
    const ws = typeof req.body?.workspace === 'string' ? req.body.workspace : 'default';
    const result = new ModelTransferService(root()).run(ws);
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}
