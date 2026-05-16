import type { Request, Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import { authService } from '../services/auth.service';

const REFRESH_COOKIE_NAME = 'aria_refresh';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export class AuthController {

  async signup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { response, refreshToken, expiresAt } = await authService.signup(req.body);
      res.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...COOKIE_OPTIONS, expires: expiresAt });
      res.status(201).json({ user: response.user, accessToken: response.accessToken });
    } catch (err) { next(err); }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { response, refreshToken, expiresAt } = await authService.login(req.body);
      res.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...COOKIE_OPTIONS, expires: expiresAt });
      res.status(200).json({ user: response.user, accessToken: response.accessToken });
    } catch (err) { next(err); }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies?.[REFRESH_COOKIE_NAME];
      if (!token) {
        // Consistent error shape: { success, error, code } — matches all other API errors
        res.status(401).json({
          success: false,
          error: 'No refresh token provided',
          code: 'REFRESH_TOKEN_MISSING',
        });
        return;
      }
      const { accessToken } = await authService.refresh(token, req.ip, req.headers['user-agent']);
      res.status(200).json({ accessToken });
    } catch (err) { next(err); }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies?.[REFRESH_COOKIE_NAME];
      if (token) await authService.logout(token);
      res.clearCookie(REFRESH_COOKIE_NAME, COOKIE_OPTIONS);
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (err) { next(err); }
  }

  async me(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // req.user is set by requireAuth middleware with field `userId` — NOT `.sub`
      const user = await authService.getMe(req.user!.userId);
      res.status(200).json({ user });
    } catch (err) { next(err); }
  }
}

export const authController = new AuthController();
