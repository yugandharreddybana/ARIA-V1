export interface PublicUser {
  id: string;
  name: string;
  email: string;
  workspaceId: string;
  createdAt: string;
}

export interface User extends PublicUser {
  passwordHash: string;
  isActive: boolean;
  updatedAt: string;
}
