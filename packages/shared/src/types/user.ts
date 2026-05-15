export interface PublicUser {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  githubLogin?: string | null;
  isActive: boolean;
  createdAt: string;
}
