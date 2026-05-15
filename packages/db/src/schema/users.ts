import { pgTable, uuid, text, boolean, timestamptz } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workspaces } from './workspaces';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  githubId: text('github_id').unique(),
  githubLogin: text('github_login'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ one }) => ({
  workspace: one(workspaces, { fields: [users.workspaceId], references: [workspaces.id] }),
}));
