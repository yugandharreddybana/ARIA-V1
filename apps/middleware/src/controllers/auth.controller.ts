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
      // Flat shape matching AuthResponse: { user, accessToken }
      res.status(201).json({ user: response.user, accessToken: response.accessToken });
    } catch (err) { next(err); }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { response, refreshToken, expiresAt } = await authService.login(req.body);
      res.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...COOKIE_OPTIONS, expires: expiresAt });
      // Flat shape matching AuthResponse: { user, accessToken }
      res.status(200).json({ user: response.user, accessToken: response.accessToken });
    } catch (err) { next(err); }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies?.[REFRESH_COOKIE_NAME];
      if (!token) {
        res.status(401).json({ message: 'No refresh token', code: 'REFRESH_TOKEN_MISSING' });
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
      res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) { next(err); }
  }

  async me(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getMe(req.user!.sub);
      // Flat shape: { user } — matches what web auth.context expects
      res.status(200).json({ user });
    } catch (err) { next(err); }
  }
}

export const authController = new AuthController();
