import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { validateEnv } from '../config/env';

export interface AriaRequest extends Request {
  user?: {
    userId: string;
    workspaceId: string;
    email: string;
  };
}

interface JwtPayload {
  sub: string;
  workspaceId: string;
  email: string;
  type: 'access';
}

export function requireAuth(req: AriaRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Also check httpOnly cookie as fallback (defence-in-depth)
  const cookieToken = (req as Request & { cookies: Record<string, string> }).cookies?.aria_access_token;
  const finalToken = token ?? cookieToken ?? null;

  if (!finalToken) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
    return;
  }

  try {
    const env = validateEnv();
    const payload = jwt.verify(finalToken, env.JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    }) as JwtPayload;

    if (payload.type !== 'access') {
      res.status(401).json({ success: false, error: 'Invalid token type', code: 'UNAUTHORIZED' });
      return;
    }

    req.user = {
      userId: payload.sub,
      workspaceId: payload.workspaceId,
      email: payload.email,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ success: false, error: 'Invalid token', code: 'UNAUTHORIZED' });
  }
}
