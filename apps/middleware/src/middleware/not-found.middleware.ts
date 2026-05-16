import { Request, Response } from 'express';

/**
 * Named `notFound` to match the import in app.ts:
 *   import { notFound } from './middleware/not-found.middleware';
 */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND',
  });
}
