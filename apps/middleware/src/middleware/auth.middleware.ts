import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { validateEnv } from '../config/env';

/**
 * AriaRequest — extends Express Request with the authenticated user payload.
 *
 * IMPORTANT: the JWT payload uses `sub` for the userId (standard JWT claim),
 * but we map it to `userId` here so every controller uses the explicit field
 * name and TypeScript enforces it at compile time. Never read `req.user.sub`
 * in a controller — it will be undefined at runtime.
 */
export interface AriaRequest extends Request {
  user?: {
    /** Authenticated user's database UUID — mapped from JWT `sub` claim. */
    userId: string;
    workspaceId: string;
    email: string;
    name: string;
  };
}

interface JwtPayload {
  sub: string;
  workspaceId: string;
  email: string;
  name: string;
  type: 'access';
}

/**
 * Verify Bearer JWT (RS256).
 * Falls back to httpOnly cookie `aria_access_token` as defence-in-depth.
 * Handles PEM keys stored in env with escaped \\n sequences.
 */
export function requireAuth(
  req: AriaRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const cookieToken =
    (req as Request & { cookies: Record<string, string> }).cookies
      ?.aria_access_token ?? null;
  const token = bearerToken ?? cookieToken;

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  try {
    const env = validateEnv();
    // PEM keys stored in .env files often have literal \n instead of real newlines
    const publicKey = env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');

    const payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
    }) as JwtPayload;

    if (payload.type !== 'access') {
      res.status(401).json({
        success: false,
        error: 'Invalid token type',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    // Map JWT `sub` → `userId` so all controllers use the explicit field name.
    // TypeScript will catch any attempt to use req.user.sub at compile time.
    req.user = {
      userId: payload.sub,
      workspaceId: payload.workspaceId,
      email: payload.email,
      name: payload.name,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }
    res.status(401).json({
      success: false,
      error: 'Invalid token',
      code: 'UNAUTHORIZED',
    });
  }
}
