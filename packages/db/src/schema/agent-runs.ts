import { customType, pgTable, uuid, text, integer, bigint, boolean, timestamp, jsonb, index, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({
  dataType() { return 'bytea'; },
});
import { projects, projectRepos } from './projects';
import { runtimeKinds } from './provider-credentials';
import { skills } from './skills';
import { tickets } from './tickets';
import { workspaces } from './workspaces';

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => skills.id, { onDelete: 'set null' }),
  ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
  parentRunId: uuid('parent_run_id').references((): AnyPgColumn => agentRuns.id, { onDelete: 'set null' }),
  activity: text('activity').notNull(),
  taskType: text('task_type').notNull(),
  runtime: text('runtime').notNull().references(() => runtimeKinds.id),
  status: text('status').notNull().default('queued'),
  blockedReason: text('blocked_reason'),
  priority: integer('priority').notNull().default(0),
  idempotencyKey: text('idempotency_key').notNull(),
  attempt: integer('attempt').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  notBefore: tstz('not_before').notNull().defaultNow(),
  leaseOwner: text('lease_owner'),
  leaseExpiresAt: tstz('lease_expires_at'),
  heartbeatAt: tstz('heartbeat_at'),
  modelId: text('model_id'),
  modelParams: jsonb('model_params').notNull().default([]),
  externalAgentId: text('external_agent_id'),
  externalRunId: text('external_run_id'),
  externalUrl: text('external_url'),
  streamCursor: text('stream_cursor'),
  repoId: uuid('repo_id').references(() => projectRepos.id, { onDelete: 'set null' }),
  baseRef: text('base_ref'),
  headSha: text('head_sha'),
  branch: text('branch'),
  prUrl: text('pr_url'),
  prNumber: integer('pr_number'),
  input: jsonb('input').notNull().default({}),
  promptText: text('prompt_text'),
  resultText: text('result_text'),
  resultJson: jsonb('result_json'),
  outputSource: text('output_source'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  tokensReserved: bigint('tokens_reserved', { mode: 'number' }).notNull().default(0),
  budgetProjectScoped: boolean('budget_project_scoped'),
  tokensInput: bigint('tokens_input', { mode: 'number' }),
  tokensOutput: bigint('tokens_output', { mode: 'number' }),
  tokensCacheRead: bigint('tokens_cache_read', { mode: 'number' }),
  tokensCacheWrite: bigint('tokens_cache_write', { mode: 'number' }),
  tokensTotal: bigint('tokens_total', { mode: 'number' }),
  createdAt: tstz('created_at').notNull().defaultNow(),
  startedAt: tstz('started_at'),
  finishedAt: tstz('finished_at'),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
}, (t) => ({
  idempotency: uniqueIndex('agent_runs_idempotency_key_uidx').on(t.idempotencyKey),
  projectIdx: index('idx_agent_runs_project').on(t.projectId),
}));

export const agentRunLogs = pgTable('agent_run_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  kind: text('kind').notNull(),
  message: text('message').notNull(),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

export const ticketEvents = pgTable('ticket_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  eventType: text('event_type').notNull(),
  actorKind: text('actor_kind').notNull(),
  agentId: uuid('agent_id'),
  runId: uuid('run_id'),
  summary: text('summary').notNull(),
  detail: jsonb('detail').notNull().default({}),
  detailCanonical: text('detail_canonical').notNull().default('{}'),
  modelId: text('model_id'),
  tokensTotal: bigint('tokens_total', { mode: 'number' }),
  prUrl: text('pr_url'),
  commitSha: text('commit_sha'),
  prevHash: text('prev_hash'),
  hash: text('hash').notNull(),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

export const ticketReports = pgTable('ticket_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  ticketKey: text('ticket_key').notNull(),
  markdown: text('markdown').notNull(),
  contentHash: text('content_hash').notNull(),
  pdfSha256: text('pdf_sha256').notNull(),
  pdfBytes: bytea('pdf_bytes').notNull(),
  valid: boolean('valid').notNull(),
  errors: jsonb('errors').notNull().default([]),
  runId: uuid('run_id'),
  commitSha: text('commit_sha'),
  createdAt: tstz('created_at').notNull().defaultNow(),
});
