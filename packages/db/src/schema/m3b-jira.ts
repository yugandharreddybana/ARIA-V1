import { customType, pgTable, uuid, text, integer, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { skills } from './skills';
import { tickets } from './tickets';
import { workspaces } from './workspaces';
import { businessFlows } from './knowledge';

const tstz = (name: string) => timestamp(name, { withTimezone: true });
const bytea = customType<{ data: Buffer }>({
  dataType() { return 'bytea'; },
});

// Tables with uniqueIndex must appear before tables without one in this file:
// check-schema-drift.cjs matches pgTable…uniqueIndex non-greedily across neighbors.

export const ticketLinks = pgTable('ticket_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  fromTicketId: uuid('from_ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  toTicketId: uuid('to_ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  linkType: text('link_type').notNull(),
  contractJson: jsonb('contract_json'),
  verifiedAt: tstz('verified_at'),
  verifiedByAgentId: uuid('verified_by_agent_id').references(() => skills.id, { onDelete: 'set null' }),
  createdAt: tstz('created_at').notNull().defaultNow(),
}, (t) => ({
  toIdx: index('ticket_links_to_idx').on(t.toTicketId),
  linkUidx: uniqueIndex('ticket_links_from_to_type_uidx').on(t.fromTicketId, t.toTicketId, t.linkType),
}));

export const pathOwners = pgTable('path_owners', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  pathGlob: text('path_glob').notNull(),
  layer: text('layer').notNull(),
  ownerAgentId: uuid('owner_agent_id').notNull().references(() => skills.id, { onDelete: 'restrict' }),
  backupAgentId: uuid('backup_agent_id').references(() => skills.id, { onDelete: 'set null' }),
  source: text('source').notNull().default('merged_pr'),
  lastTicketId: uuid('last_ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
  lastPrNumber: integer('last_pr_number'),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
}, (t) => ({
  ownerIdx: index('path_owners_owner_idx').on(t.ownerAgentId),
  projectIdx: index('path_owners_project_idx').on(t.projectId),
  pathLayerUidx: uniqueIndex('path_owners_project_glob_layer_uidx').on(t.projectId, t.pathGlob, t.layer),
}));

export const ticketComments = pgTable('ticket_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  authorType: text('author_type').notNull(),
  authorAgentId: uuid('author_agent_id').references(() => skills.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  createdAt: tstz('created_at').notNull().defaultNow(),
}, (t) => ({
  ticketIdx: index('ticket_comments_ticket_idx').on(t.ticketId),
}));

export const ticketAttachments = pgTable('ticket_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  stateKey: text('state_key'),
  pathInRepo: text('path_in_repo'),
  contentType: text('content_type'),
  bytes: bytea('bytes'),
  sha256: text('sha256').notNull(),
  createdByAgentId: uuid('created_by_agent_id').references(() => skills.id, { onDelete: 'set null' }),
  createdAt: tstz('created_at').notNull().defaultNow(),
}, (t) => ({
  ticketIdx: index('ticket_attachments_ticket_idx').on(t.ticketId),
}));

export const ownershipHandoffs = pgTable('ownership_handoffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  pathOwnerId: uuid('path_owner_id').references(() => pathOwners.id, { onDelete: 'set null' }),
  flowId: uuid('flow_id').references(() => businessFlows.id, { onDelete: 'set null' }),
  fromAgentId: uuid('from_agent_id').references(() => skills.id, { onDelete: 'set null' }),
  toAgentId: uuid('to_agent_id').notNull().references(() => skills.id, { onDelete: 'restrict' }),
  reason: text('reason').notNull(),
  handoverMd: text('handover_md').notNull(),
  ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
  createdAt: tstz('created_at').notNull().defaultNow(),
}, (t) => ({
  projectIdx: index('ownership_handoffs_project_idx').on(t.projectId),
}));
