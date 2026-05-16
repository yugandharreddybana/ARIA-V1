import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Never leak stack traces in production
  const isProd = process.env.NODE_ENV === 'production';

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      ...(isProd ? {} : { stack: err.stack }),
    });
    return;
  }

  // Unexpected errors — log and return generic response
  console.error('[ARIA] Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
    ...(isProd ? {} : { detail: String(err) }),
  });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ success: false, error: 'Route not found', code: 'NOT_FOUND' });
}
