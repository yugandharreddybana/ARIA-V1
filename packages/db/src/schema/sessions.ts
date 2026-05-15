import { pgTable, uuid, varchar, boolean, timestamp, pgEnum, jsonb, integer, text, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { workspaces } from './workspaces';

export const sessionStateEnum = pgEnum('session_state', ['new','bootstrapping','scrumming','working','paused','completed','failed']);
export const sessionModeEnum = pgEnum('session_mode', ['precision','throughput','planning','shadow']);
export const environmentEnum = pgEnum('environment', ['dev','staging','prod_readonly','production']);
export const missionTypeEnum = pgEnum('mission_type', ['stability','feature','tech_debt','security','planning']);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  state: sessionStateEnum('state').notNull().default('new'),
  mode: sessionModeEnum('mode').notNull().default('precision'),
  environment: environmentEnum('environment').notNull().default('dev'),
  missionType: missionTypeEnum('mission_type').notNull().default('feature'),
  missionRiskAppetite: varchar('mission_risk_appetite', { length: 20 }).notNull().default('moderate'),
  missionScope: jsonb('mission_scope').notNull().default([]),
  tokenBudget: integer('token_budget'),
  timeBudgetMinutes: integer('time_budget_minutes'),
  isFirstStart: boolean('is_first_start').notNull().default(false),
  briefSummary: text('brief_summary'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({ projectIdx: index('sessions_project_idx').on(t.projectId) }));
