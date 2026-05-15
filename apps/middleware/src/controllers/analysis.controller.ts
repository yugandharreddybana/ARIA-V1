import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import { triggerAnalysis } from '../services/analysis.service';

export async function triggerAnalysisJob(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    const result = await triggerAnalysis(req.params.id, req.params.repoId, req.user!.workspaceId);
    res.status(202).json(result);
  } catch (e) { next(e); }
}
