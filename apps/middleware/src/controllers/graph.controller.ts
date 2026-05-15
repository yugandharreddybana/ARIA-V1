import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import { getConceptGraph, clearConceptGraph } from '../services/backend.service';

export async function fetchConceptGraph(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    const graph = await getConceptGraph(req.params.projectId);
    res.json(graph);
  } catch (e) { next(e); }
}

export async function deleteConceptGraph(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    await clearConceptGraph(req.params.projectId);
    res.status(204).send();
  } catch (e) { next(e); }
}
