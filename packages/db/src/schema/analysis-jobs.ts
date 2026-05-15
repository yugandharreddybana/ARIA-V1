import { pgTable, text, uuid, timestamptz } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workspaces } from './workspaces';
import { projects, projectRepos } from './projects';

export const analysisJobs = pgTable('analysis_jobs', {
  id:           text('id').primaryKey(),                // Spring-generated string ID
  projectId:    uuid('project_id').notNull().references(() => projects.id,     { onDelete: 'cascade' }),
  repoId:       uuid('repo_id').notNull().references(() => projectRepos.id,    { onDelete: 'cascade' }),
  repoUrl:      text('repo_url').notNull(),
  branch:       text('branch').notNull().default('main'),
  workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  status:       text('status').notNull().default('queued'),
  errorMessage: text('error_message'),
  createdAt:    timestamptz('created_at').notNull().defaultNow(),
  updatedAt:    timestamptz('updated_at').notNull().defaultNow(),
});

export const analysisJobsRelations = relations(analysisJobs, ({ one }) => ({
  project:   one(projects,     { fields: [analysisJobs.projectId],   references: [projects.id]     }),
  repo:      one(projectRepos, { fields: [analysisJobs.repoId],      references: [projectRepos.id] }),
  workspace: one(workspaces,   { fields: [analysisJobs.workspaceId], references: [workspaces.id]  }),
}));
