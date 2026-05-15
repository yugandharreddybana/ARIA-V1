import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../config/jwt';
import { AppError } from './error.middleware';
import type { AuthTokenPayload } from '@aria/shared';

export interface AriaRequest extends Request {
  user?: AuthTokenPayload;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function requireAuth(req: AriaRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Invalid or expired token', 401, 'TOKEN_INVALID'));
    }
  }
}
