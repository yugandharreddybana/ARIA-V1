import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@aria/db';
import { users, workspaces, refreshTokens } from '@aria/db';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../config/jwt';
import { AppError } from '../middleware/error.middleware';
import { validateEnv } from '../config/env';
import type { SignupRequest, LoginRequest, AuthResponse, PublicUser } from '@aria/shared';

const BCRYPT_ROUNDS = 12;

export class AuthService {

  async signup(data: SignupRequest): Promise<{ response: AuthResponse; refreshToken: string; refreshJti: string; expiresAt: Date }> {
    // Check email not already taken
    const existing = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email.toLowerCase().trim()))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError('An account with this email already exists', 409, 'EMAIL_TAKEN');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    // Create workspace + user in a transaction
    const result = await db.transaction(async (tx) => {
      const [workspace] = await tx.insert(workspaces)
        .values({ name: `${data.name}'s Workspace` })
        .returning();

      const [user] = await tx.insert(users)
        .values({
          name: data.name.trim(),
          email: data.email.toLowerCase().trim(),
          passwordHash,
          workspaceId: workspace.id,
        })
        .returning();

      return { workspace, user };
    });

    return this._issueTokens(result.user);
  }

  async login(data: LoginRequest): Promise<{ response: AuthResponse; refreshToken: string; refreshJti: string; expiresAt: Date }> {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.email, data.email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      // Timing-safe: still hash even if user not found
      await bcrypt.hash(data.password, BCRYPT_ROUNDS);
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.isActive) {
      throw new AppError('Account is deactivated', 403, 'ACCOUNT_INACTIVE');
    }

    const passwordValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!passwordValid) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    return this._issueTokens(user);
  }

  async refresh(refreshToken: string, ipAddress?: string, userAgent?: string): Promise<{ accessToken: string }> {
    let payload: { sub: string; jti: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError('Invalid or expired refresh token', 401, 'REFRESH_TOKEN_INVALID');
    }

    // Hash the incoming token to compare with stored hash
    const tokenHash = this._hashToken(refreshToken);

    const [stored] = await db.select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.jti, payload.jti),
          eq(refreshTokens.isRevoked, false)
        )
      )
      .limit(1);

    if (!stored || stored.tokenHash !== tokenHash) {
      throw new AppError('Refresh token not found or already used', 401, 'REFRESH_TOKEN_INVALID');
    }

    if (new Date() > stored.expiresAt) {
      throw new AppError('Refresh token expired', 401, 'REFRESH_TOKEN_EXPIRED');
    }

    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, stored.userId))
      .limit(1);

    if (!user || !user.isActive) {
      throw new AppError('User not found or inactive', 401, 'USER_INACTIVE');
    }

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      workspaceId: user.workspaceId!,
    });

    return { accessToken };
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await db.update(refreshTokens)
        .set({ isRevoked: true })
        .where(eq(refreshTokens.jti, payload.jti));
    } catch {
      // Silently ignore invalid tokens on logout
    }
  }

  async getMe(userId: string): Promise<PublicUser> {
    const [user] = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      workspaceId: users.workspaceId,
      createdAt: users.createdAt,
    })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      workspaceId: user.workspaceId!,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private async _issueTokens(user: typeof users.$inferSelect) {
    const env = validateEnv();
    const { token: refreshToken, jti } = signRefreshToken(user.id);
    const tokenHash = this._hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash,
      jti,
      expiresAt,
    });

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      workspaceId: user.workspaceId!,
    });

    const publicUser: PublicUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      workspaceId: user.workspaceId!,
      createdAt: user.createdAt.toISOString(),
    };

    return {
      response: { user: publicUser, accessToken },
      refreshToken,
      refreshJti: jti,
      expiresAt,
    };
  }

  private _hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

export const authService = new AuthService();
