import { Router, type Request, type Response } from 'express';
import { getTelemetry } from '../services/telemetry.service';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.type('text/plain; version=0.0.4; charset=utf-8').send(getTelemetry().render());
});

export default router;
