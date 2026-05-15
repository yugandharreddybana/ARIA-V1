import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  githubInstallationId: varchar('github_installation_id', { length: 255 }),
  githubAccessTokenEncrypted: text('github_access_token_encrypted'),
  jiraBaseUrl: varchar('jira_base_url', { length: 500 }),
  jiraApiTokenEncrypted: text('jira_api_token_encrypted'),
  jiraUserEmail: varchar('jira_user_email', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
