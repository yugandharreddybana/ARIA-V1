import { pgTable, uuid, varchar, text, timestamp, pgEnum, jsonb, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { projectRepos } from './projects';

export const memoryLayerEnum = pgEnum('memory_layer', ['repo','project','workspace']);

export const memoryEntries = pgTable('memory_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  layer: memoryLayerEnum('layer').notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => projectRepos.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id'),
  category: varchar('category', { length: 100 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content').notNull(),
  tags: jsonb('tags').notNull().default([]),
  sourceTicketId: uuid('source_ticket_id'),
  sourceSessionId: uuid('source_session_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({ layerIdx: index('memory_layer_idx').on(t.layer), projectIdx: index('memory_project_idx').on(t.projectId) }));
