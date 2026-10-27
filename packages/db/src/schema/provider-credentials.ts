import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workspaces } from './workspaces';

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const providerCredentials = pgTable('provider_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  label: text('label').notNull().default('default'),
  apiKeyEncrypted: text('api_key_encrypted'),
  baseUrl: text('base_url'),
  extraEncrypted: text('extra_encrypted'),
  connectionStatus: text('connection_status').notNull().default('untested'),
  lastTestedAt: tstz('last_tested_at'),
  lastError: text('last_error'),
  binaryStatus: text('binary_status').notNull().default('not_required'),
  retiredAt: tstz('retired_at'),
  catalogJson: jsonb('catalog_json').notNull().default([]),
  catalogRefreshedAt: tstz('catalog_refreshed_at'),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
}, (t) => ({
  workspaceProviderLabel: uniqueIndex('provider_credentials_workspace_provider_label_uidx').on(t.workspaceId, t.provider, t.label),
}));

export const runtimeKinds = pgTable('runtime_kinds', {
  id: text('id').primaryKey(),
  description: text('description').notNull().default(''),
  introducedIn: text('introduced_in').notNull().default('m3'),
});

export const providerCredentialsRelations = relations(providerCredentials, ({ one }) => ({
  workspace: one(workspaces, { fields: [providerCredentials.workspaceId], references: [workspaces.id] }),
}));
