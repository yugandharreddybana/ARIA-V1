// Auth-related shared types

export interface AuthTokenPayload {
  sub: string;        // user id
  email: string;
  name: string;
  workspaceId: string;
  iat: number;
  exp: number;
  jti: string;        // JWT ID for revocation
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  workspaceId: string;
  createdAt: string;
}

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
