import crypto from 'crypto';
import { db } from '@aria/db';
import { users, workspaces } from '@aria/db';
import { eq } from 'drizzle-orm';
import { githubOAuthConfig as cfg } from '../config/github';
import { JwtService } from '../config/jwt';

const stateStore = new Map<string, number>();

export function generateOAuthState(): string {
  const state = crypto.randomBytes(24).toString('hex');
  stateStore.set(state, Date.now() + 10 * 60 * 1000);
  return state;
}

export function validateOAuthState(state: string): boolean {
  const exp = stateStore.get(state);
  stateStore.delete(state);
  return !!exp && Date.now() < exp;
}

export function buildGitHubAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.callbackUrl,
    scope: cfg.scope,
    state,
  });
  return `${cfg.authUrl}?${params.toString()}`;
}

async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code }),
  });
  const data = await res.json() as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(data.error ?? 'GitHub token exchange failed');
  return data.access_token;
}

async function getGitHubUser(token: string): Promise<{ id: number; login: string; name: string | null; email: string | null }> {
  const [userRes, emailsRes] = await Promise.all([
    fetch(cfg.userUrl, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }),
    fetch(cfg.emailsUrl, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }),
  ]);
  const user = await userRes.json() as { id: number; login: string; name: string | null; email: string | null };
  if (!user.email) {
    const emails = await emailsRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
    const primary = emails.find(e => e.primary && e.verified);
    user.email = primary?.email ?? null;
  }
  return user;
}

export async function handleGitHubCallback(
  code: string,
  jwtService: JwtService,
): Promise<{ accessToken: string; isNew: boolean }> {
  const ghToken = await exchangeCodeForToken(code);
  const ghUser = await getGitHubUser(ghToken);
  if (!ghUser.email) throw new Error('GitHub account has no verified email');

  let user = (await db.select().from(users).where(eq(users.email, ghUser.email)).limit(1))[0];
  let isNew = false;

  if (!user) {
    const [ws] = await db.insert(workspaces).values({ name: `${ghUser.login}'s workspace` }).returning();
    [user] = await db.insert(users).values({
      workspaceId: ws.id,
      name: ghUser.name ?? ghUser.login,
      email: ghUser.email,
      passwordHash: crypto.randomBytes(32).toString('hex'),
    }).returning();
    isNew = true;
  }

  const accessToken = await jwtService.signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    workspaceId: user.workspaceId,
  });

  return { accessToken, isNew };
}
