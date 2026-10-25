import { pgTable, uuid, text, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { businessFlows } from './knowledge';
import { skills } from './skills';

export const flowOwners = pgTable('flow_owners', {
  flowId: uuid('flow_id').notNull().references(() => businessFlows.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  layer: text('layer').notNull(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.flowId, t.layer, t.role] }),
  agentIdx: index('idx_flow_owners_agent').on(t.agentId),
}));
