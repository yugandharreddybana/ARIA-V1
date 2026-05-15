import crypto from 'crypto';
import { db } from '@aria/db';
import { users, workspaces, refreshTokens } from '@aria/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { GITHUB_TOKEN_URL, GITHUB_USER_URL, GITHUB_EMAILS_URL, getGithubOAuthConfig } from '../config/github';
import { signAccessToken, signRefreshToken } from '../config/jwt';
import { AppError } from '../middleware/error.middleware';

interface GithubUser { id: number; login: string; name: string | null; email: string | null; avatarUrl?: string | null; }
interface GithubEmail { email: string; primary: boolean; verified: boolean; }

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function exchangeCode(code: string): Promise<string> {
  const { clientId, clientSecret, callbackUrl } = getGithubOAuthConfig();
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: callbackUrl }),
  });
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new AppError('GitHub token exchange failed', 502);
  return data.access_token;
}

async function getGithubIdentity(token: string): Promise<{ ghUser: GithubUser; email: string }> {
  const [uRes, eRes] = await Promise.all([
    fetch(GITHUB_USER_URL, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }),
    fetch(GITHUB_EMAILS_URL, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }),
  ]);
  const ghUser = await uRes.json() as GithubUser;
  const emails = await eRes.json() as GithubEmail[];
  const primary = emails.find(e => e.primary && e.verified);
  const email = primary?.email ?? ghUser.email ?? '';
  if (!email) throw new AppError('No verified email on GitHub account', 400);
  return { ghUser, email };
}

export async function handleGithubCallback(code: string) {
  const ghToken = await exchangeCode(code);
  const { ghUser, email } = await getGithubIdentity(ghToken);

  let existing = await db.query.users.findFirst({ where: eq(users.email, email) });

  if (!existing) {
    const [ws] = await db.insert(workspaces).values({
      id: randomUUID(),
      name: `${ghUser.name ?? ghUser.login}'s Workspace`,
    }).returning();
    const [u] = await db.insert(users).values({
      id: randomUUID(),
      workspaceId: ws.id,
      name: ghUser.name ?? ghUser.login,
      email,
      passwordHash: '',
      isActive: true,
      githubId: String(ghUser.id),
      githubLogin: ghUser.login,
    }).returning();
    existing = u;
  } else if (!existing.githubId) {
    // Link GitHub to existing email account
    const [updated] = await db.update(users)
      .set({ githubId: String(ghUser.id), githubLogin: ghUser.login })
      .where(eq(users.id, existing.id))
      .returning();
    existing = updated;
  }

  // Issue access token
  const accessToken = signAccessToken({
    sub: existing.id,
    email: existing.email,
    name: existing.name,
    workspaceId: existing.workspaceId,
  });

  // Issue refresh token AND persist to DB — without this, silent refresh fails for OAuth users
  const { token: refreshToken, jti } = signRefreshToken(existing.id);
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(refreshTokens).values({
    userId: existing.id,
    tokenHash,
    jti,
    expiresAt,
  });

  return { user: existing, accessToken, refreshToken };
}
