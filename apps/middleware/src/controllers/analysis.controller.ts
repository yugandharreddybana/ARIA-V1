import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import { triggerAnalysis, getJobStatus, listProjectJobs } from '../services/analysis.service';

export async function triggerAnalysisJob(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    const result = await triggerAnalysis(req.params.id, req.params.repoId, req.user!.workspaceId);
    res.status(202).json(result);
  } catch (e) { next(e); }
}

export async function getAnalysisJob(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    res.json(await getJobStatus(req.params.jobId));
  } catch (e) { next(e); }
}

export async function listAnalysisJobs(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    res.json({ jobs: await listProjectJobs(req.user!.workspaceId) });
  } catch (e) { next(e); }
}
