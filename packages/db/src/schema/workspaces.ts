import { pgTable, uuid, varchar, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const llmProviderEnum = pgEnum('llm_provider', ['ollama', 'anthropic', 'openai', 'nvidia', 'custom']);

export const workspaces = pgTable('workspaces', {
  id:                         uuid('id').primaryKey().defaultRandom(),

  // ── Company identity (onboarding Step 1) ─────────────────────────────────
  name:                       varchar('name', { length: 255 }).notNull(),
  companyDescription:         text('company_description'),

  // ── Scout agent persona (onboarding Step 4) ───────────────────────────────
  scoutAgentName:             varchar('scout_agent_name', { length: 100 }).default('Aria Scout'),
  scoutAgentDescription:      text('scout_agent_description'),

  // ── Onboarding state ──────────────────────────────────────────────────────
  onboardingCompletedAt:      timestamp('onboarding_completed_at', { withTimezone: true }),

  // ── GitHub integration ────────────────────────────────────────────────────
  githubInstallationId:       varchar('github_installation_id', { length: 255 }),
  githubAccessTokenEncrypted: text('github_access_token_encrypted'),

  // ── Jira integration ──────────────────────────────────────────────────────
  jiraBaseUrl:                varchar('jira_base_url', { length: 500 }),
  jiraApiTokenEncrypted:      text('jira_api_token_encrypted'),
  jiraUserEmail:              varchar('jira_user_email', { length: 255 }),

  // ── LLM / model configuration (onboarding Step 2) ─────────────────────────
  llmProvider:                llmProviderEnum('llm_provider').default('ollama'),
  llmBaseUrl:                 varchar('llm_base_url', { length: 500 }),
  llmApiKeyEncrypted:         text('llm_api_key_encrypted'),
  llmModel:                   varchar('llm_model', { length: 200 }),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
