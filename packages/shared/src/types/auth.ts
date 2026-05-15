import type { PublicUser } from './user';

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokenPayload {
  sub: string;         // userId
  email: string;
  name: string;
  workspaceId: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}
