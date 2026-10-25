import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workspaces } from './workspaces';

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  companySize: integer('company_size'),
  companyMix: jsonb('company_mix'),
  modelTaskTiers: jsonb('model_task_tiers').$type<{ planning?: 'top' | 'auto'; development?: 'top' | 'auto' }>().notNull().default({ planning: 'top', development: 'auto' }),
  modelTierModels: jsonb('model_tier_models').$type<{ top?: string; auto?: string }>().notNull().default({}),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

export const projectRepos = pgTable('project_repos', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  repoUrl: text('repo_url').notNull(),
  repoName: text('repo_name').notNull(),
  branch: text('branch').notNull().default('main'),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [projects.workspaceId], references: [workspaces.id] }),
  repos: many(projectRepos),
}));

export const projectReposRelations = relations(projectRepos, ({ one }) => ({
  project: one(projects, { fields: [projectRepos.projectId], references: [projects.id] }),
}));
