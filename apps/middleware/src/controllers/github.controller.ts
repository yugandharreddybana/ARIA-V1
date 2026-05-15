import type { Request, Response, NextFunction } from 'express';
import { generateOAuthState, validateOAuthState, buildGitHubAuthorizeUrl, handleGitHubCallback } from '../services/github-oauth.service';
import { jwtService } from '../config/jwt';
import { AppError } from '../middleware/error.middleware';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

export async function githubStart(_req: Request, res: Response): Promise<void> {
  const state = generateOAuthState();
  res.cookie('gh_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  res.redirect(buildGitHubAuthorizeUrl(state));
}

export async function githubCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    const cookieState = (req.cookies as Record<string, string>)['gh_oauth_state'];
    res.clearCookie('gh_oauth_state');

    if (!code || !state || state !== cookieState || !validateOAuthState(state)) {
      throw new AppError('Invalid OAuth state', 400);
    }

    const { accessToken, isNew } = await handleGitHubCallback(code, jwtService);
    const redirectUrl = new URL(isNew ? '/dashboard?welcome=1' : '/dashboard', WEB_URL);
    redirectUrl.searchParams.set('token', accessToken);
    res.redirect(redirectUrl.toString());
  } catch (err) {
    next(err);
  }
}
