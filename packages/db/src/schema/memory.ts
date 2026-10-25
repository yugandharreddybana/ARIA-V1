import { integer, pgTable, uuid, varchar, text, timestamp, pgEnum, jsonb, index } from 'drizzle-orm/pg-core';
import { projects, projectRepos } from './projects';
import { sessions } from './sessions';
import { skills } from './skills';

export const memoryLayerEnum = pgEnum('memory_layer', ['repo','project','workspace']);

export const memoryEntries = pgTable('memory_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  layer: memoryLayerEnum('layer').notNull(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  memoryType: text('memory_type').notNull().default('episodic'),
  importance: integer('importance').notNull().default(1),
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
