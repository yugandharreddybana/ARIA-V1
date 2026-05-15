export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  githubInstallationId: string | null;
  githubAccessToken: string | null;  // encrypted at rest
  jiraBaseUrl: string | null;
  jiraApiToken: string | null;       // encrypted at rest
  jiraUserEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}
