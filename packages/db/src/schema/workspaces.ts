import { pgTable, uuid, varchar, text, timestamp, jsonb, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { providerCredentials } from './provider-credentials';

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),

  // ── Company identity (onboarding Step 1) ─────────────────────────────────
  name:                       varchar('name', { length: 255 }).notNull(),
  companyDescription:         text('company_description'),

  // ── Scout agent persona (onboarding Step 4) ──────────────────────────────
  scoutAgentName:             varchar('scout_agent_name', { length: 100 }).default('Aria Scout'),
  scoutAgentDescription:      text('scout_agent_description'),

  // ── Onboarding state ─────────────────────────────────────────────────────
  // null = onboarding not yet completed; set when user clicks "Create Company"
  onboardingCompletedAt:      timestamp('onboarding_completed_at', { withTimezone: true }),

  // ── GitHub integration ───────────────────────────────────────────────────
  githubInstallationId:       varchar('github_installation_id', { length: 255 }),
  githubAccessTokenEncrypted: text('github_access_token_encrypted'),

  // ── Jira integration ─────────────────────────────────────────────────────
  jiraBaseUrl:                varchar('jira_base_url', { length: 500 }),
  jiraApiTokenEncrypted:      text('jira_api_token_encrypted'),
  jiraUserEmail:              varchar('jira_user_email', { length: 255 }),

  // ── LLM / model configuration (onboarding Step 2) ────────────────────────
  // Legacy single-row fields stay for Hibernat/M1 compat; M3A prefers provider_credentials.
  llmProvider:                text('llm_provider').default('cursor'),
  llmBaseUrl:                 varchar('llm_base_url', { length: 500 }),
  llmApiKeyEncrypted:         text('llm_api_key_encrypted'),
  llmModel:                   varchar('llm_model', { length: 200 }),
  llmTierModels:              jsonb('llm_tier_models').notNull().default({}),
  llmModelCatalog:            jsonb('llm_model_catalog').notNull().default([]),
  llmCatalogRefreshedAt:      timestamp('llm_catalog_refreshed_at', { withTimezone: true }),
  githubPushTokenEncrypted:   text('github_push_token_encrypted'),
  activePlanningCredentialId: uuid('active_planning_credential_id').references((): AnyPgColumn => providerCredentials.id, { onDelete: 'set null' }),
  activeCodingCredentialId:   uuid('active_coding_credential_id').references((): AnyPgColumn => providerCredentials.id, { onDelete: 'set null' }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
