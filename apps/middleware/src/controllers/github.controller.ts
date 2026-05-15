import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { GITHUB_AUTHORIZE_URL, getGithubOAuthConfig } from '../config/github';
import { handleGithubCallback } from '../services/github-oauth.service';
import { validateEnv } from '../config/env';

const stateStore = new Map<string, number>();
const STATE_TTL = 10 * 60 * 1000;

function purge() {
  const now = Date.now();
  for (const [k, ts] of stateStore) if (now - ts > STATE_TTL) stateStore.delete(k);
}

export async function githubStart(req: Request, res: Response) {
  purge();
  const state = randomBytes(16).toString('hex');
  stateStore.set(state, Date.now());
  const { clientId, callbackUrl, scope } = getGithubOAuthConfig();
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', callbackUrl);
  url.searchParams.set('scope', scope);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
}

export async function githubCallback(req: Request, res: Response) {
  const { code, state, error } = req.query as Record<string, string>;
  const env = validateEnv();
  const webBase = env.CORS_ORIGINS.split(',')[0].trim();

  if (error) return res.redirect(`${webBase}/login?error=github_denied`);

  const ts = stateStore.get(state);
  if (!ts || Date.now() - ts > STATE_TTL) return res.redirect(`${webBase}/login?error=invalid_state`);
  stateStore.delete(state);

  try {
    const { accessToken, refreshToken } = await handleGithubCallback(code);
    const isProduction = env.NODE_ENV === 'production';
    res.cookie('aria_refresh', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.redirect(`${webBase}/auth/callback?token=${encodeURIComponent(accessToken)}`);
  } catch {
    return res.redirect(`${webBase}/login?error=github_failed`);
  }
}
