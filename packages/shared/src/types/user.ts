export interface PublicUser {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  githubLogin?: string;
  isActive: boolean;
  createdAt: string;
}
