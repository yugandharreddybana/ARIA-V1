import { pgTable, text, uuid, doublePrecision, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workspaces } from './workspaces';
import { projects } from './projects';

const tstz = (name: string) => timestamp(name, { withTimezone: true });

// ── concept_nodes ───────────────────────────────────────────────────
export const conceptNodes = pgTable('concept_nodes', {
  id:          text('id').primaryKey(),
  projectId:   uuid('project_id').notNull().references(() => projects.id,   { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  nodeType:    text('node_type').notNull(),
  name:        text('name').notNull(),
  filePath:    text('file_path'),
  summary:     text('summary'),
  metadata:    text('metadata'),
  createdAt:   tstz('created_at').notNull().defaultNow(),
  updatedAt:   tstz('updated_at').notNull().defaultNow(),
});

// ── concept_edges ───────────────────────────────────────────────────
export const conceptEdges = pgTable('concept_edges', {
  id:           text('id').primaryKey(),
  projectId:    uuid('project_id').notNull().references(() => projects.id,     { onDelete: 'cascade' }),
  workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  sourceNodeId: text('source_node_id').notNull().references(() => conceptNodes.id, { onDelete: 'cascade' }),
  targetNodeId: text('target_node_id').notNull().references(() => conceptNodes.id, { onDelete: 'cascade' }),
  edgeType:     text('edge_type').notNull(),
  label:        text('label'),
  confidence:   doublePrecision('confidence'),
  createdAt:    tstz('created_at').notNull().defaultNow(),
});

// ── Relations ─────────────────────────────────────────────────────────
export const conceptNodesRelations = relations(conceptNodes, ({ one, many }) => ({
  project:      one(projects,   { fields: [conceptNodes.projectId],   references: [projects.id]   }),
  workspace:    one(workspaces, { fields: [conceptNodes.workspaceId], references: [workspaces.id] }),
  outEdges:     many(conceptEdges, { relationName: 'sourceNode' }),
  inEdges:      many(conceptEdges, { relationName: 'targetNode' }),
}));

export const conceptEdgesRelations = relations(conceptEdges, ({ one }) => ({
  project:    one(projects,     { fields: [conceptEdges.projectId],    references: [projects.id]     }),
  workspace:  one(workspaces,   { fields: [conceptEdges.workspaceId],  references: [workspaces.id]   }),
  sourceNode: one(conceptNodes, { fields: [conceptEdges.sourceNodeId], references: [conceptNodes.id], relationName: 'sourceNode' }),
  targetNode: one(conceptNodes, { fields: [conceptEdges.targetNodeId], references: [conceptNodes.id], relationName: 'targetNode' }),
}));
