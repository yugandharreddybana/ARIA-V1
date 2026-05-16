import { Router, Request, Response } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'aria-middleware',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

export default healthRouter;
