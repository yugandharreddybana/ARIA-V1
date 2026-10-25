import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { projects } from './projects';
import { workspaces } from './workspaces';

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const knowledgeMaps = pgTable('knowledge_maps', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  techStack: jsonb('tech_stack').notNull().default([]),
  modules: jsonb('modules').notNull().default([]),
  dataModel: jsonb('data_model').notNull().default([]),
  apis: jsonb('apis').notNull().default([]),
  summary: text('summary').notNull().default(''),
  source: text('source').notNull().default('template'),
  agentRunId: uuid('agent_run_id'),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
}, (t) => ({ projectIdx: uniqueIndex('knowledge_maps_project_uidx').on(t.projectId) }));

export const businessFlows = pgTable('business_flows', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  knowledgeMapId: uuid('knowledge_map_id').notNull().references(() => knowledgeMaps.id, { onDelete: 'cascade' }),
  flowKey: text('flow_key').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('other'),
  description: text('description').notNull().default(''),
  entryPoints: jsonb('entry_points').notNull().default([]),
  layer: text('layer').notNull().default('fullstack'),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
}, (t) => ({
  projectIdx: index('business_flows_project_idx').on(t.projectId),
  flowKeyIdx: uniqueIndex('business_flows_project_flow_key').on(t.projectId, t.flowKey),
}));

export const knowledgeMapsRelations = relations(knowledgeMaps, ({ one, many }) => ({
  project: one(projects, { fields: [knowledgeMaps.projectId], references: [projects.id] }),
  workspace: one(workspaces, { fields: [knowledgeMaps.workspaceId], references: [workspaces.id] }),
  flows: many(businessFlows),
}));

export const businessFlowsRelations = relations(businessFlows, ({ one }) => ({
  map: one(knowledgeMaps, { fields: [businessFlows.knowledgeMapId], references: [knowledgeMaps.id] }),
  project: one(projects, { fields: [businessFlows.projectId], references: [projects.id] }),
}));
