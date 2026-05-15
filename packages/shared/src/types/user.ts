export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  workspaceId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
