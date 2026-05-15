import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { AuthTokenPayload } from '@aria/shared';
import { validateEnv } from './env';

function getPrivateKey(): string {
  const env = validateEnv();
  return Buffer.from(env.JWT_PRIVATE_KEY, 'base64').toString('utf-8');
}

function getPublicKey(): string {
  const env = validateEnv();
  return Buffer.from(env.JWT_PUBLIC_KEY, 'base64').toString('utf-8');
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  jti: string;
}

export function signAccessToken(payload: Omit<AuthTokenPayload, 'iat' | 'exp' | 'jti'>): string {
  const env = validateEnv();
  const jti = uuidv4();
  return jwt.sign(
    { ...payload, jti },
    getPrivateKey(),
    {
      algorithm: 'RS256',
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    }
  );
}

export function signRefreshToken(userId: string): { token: string; jti: string } {
  const env = validateEnv();
  const jti = uuidv4();
  const token = jwt.sign(
    { sub: userId, jti, type: 'refresh' },
    getPrivateKey(),
    {
      algorithm: 'RS256',
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    }
  );
  return { token, jti };
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] }) as AuthTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string; jti: string } {
  return jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] }) as { sub: string; jti: string };
}

export function decodeToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.decode(token) as AuthTokenPayload;
  } catch {
    return null;
  }
}
