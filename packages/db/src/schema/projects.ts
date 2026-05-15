import { pgTable, uuid, varchar, text, boolean, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';

export const analysisStatusEnum = pgEnum('analysis_status', ['pending','running','completed','failed']);

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  analysisStatus: analysisStatusEnum('analysis_status').notNull().default('pending'),
  firstStartCompleted: boolean('first_start_completed').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({ workspaceIdx: index('projects_workspace_idx').on(t.workspaceId) }));

export const projectRepos = pgTable('project_repos', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  githubRepoId: varchar('github_repo_id', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 500 }).notNull(),
  cloneUrl: varchar('clone_url', { length: 500 }).notNull(),
  branch: varchar('branch', { length: 255 }).notNull().default('main'),
  isActive: boolean('is_active').notNull().default(true),
  lastAnalyzedAt: timestamp('last_analyzed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({ projectIdx: index('project_repos_project_idx').on(t.projectId) }));
