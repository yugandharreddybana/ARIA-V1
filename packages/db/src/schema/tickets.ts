import { pgTable, uuid, varchar, text, boolean, integer, timestamp, pgEnum, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { sessions } from './sessions';
import { skills } from './skills';
import { businessFlows } from './knowledge';

export const ticketTypeEnum = pgEnum('ticket_type', ['bug','feature','tech_debt','incident','process']);
export const ticketStatusEnum = pgEnum('ticket_status', ['backlog','ready_for_dev','in_progress','ready_for_qa','in_qa','ready_for_review','awaiting_merge','blocked','done','rejected']);
export const evidenceTypeEnum = pgEnum('evidence_type', ['bug_report','fix','feature_design','qa_verification']);

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => sessions.id),
  type: ticketTypeEnum('ticket_type').notNull(),
  status: ticketStatusEnum('status').notNull().default('backlog'),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  assignedTo: uuid('assigned_to').references(() => skills.id, { onDelete: 'set null' }),
  priority: integer('priority').notNull().default(2),
  promptBlock: jsonb('prompt_block'),
  riskClass: varchar('risk_class', { length: 1 }).notNull().default('B'),
  affectedDomains: jsonb('affected_domains').notNull().default([]),
  assignedSkillId: uuid('assigned_skill_id').references(() => skills.id),
  jiraIssueKey: varchar('jira_issue_key', { length: 100 }),
  createdBySkillId: uuid('created_by_skill_id').references(() => skills.id),
  humanApproved: boolean('human_approved').notNull().default(false),
  statusReason: text('status_reason'),
  flowId: uuid('flow_id').references(() => businessFlows.id, { onDelete: 'set null' }),
  layer: text('layer'),
  storyPoints: integer('story_points').notNull().default(1),
  dueAt: timestamp('due_at', { withTimezone: true }),
  workStartedAt: timestamp('work_started_at', { withTimezone: true }),
  scheduleState: text('schedule_state').notNull().default('not_started'),
  ticketKey: text('ticket_key').notNull().default(''),
  splitSuggested: boolean('split_suggested').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  projectIdx: index('tickets_project_idx').on(t.projectId),
  statusIdx: index('tickets_status_idx').on(t.status),
  ticketKeyUidx: uniqueIndex('tickets_ticket_key_uidx').on(t.ticketKey),
}));

export const ticketEvidence = pgTable('ticket_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  content: text('content').notNull(),
  evidenceType: evidenceTypeEnum('evidence_type'),
  screenshots: jsonb('screenshots').notNull().default([]),
  videoPath: varchar('video_path', { length: 500 }),
  logs: text('logs').notNull().default(''),
  reproSteps: jsonb('repro_steps').notNull().default([]),
  environment: jsonb('environment').notNull().default({}),
  codeDiff: text('code_diff'),
  testOutput: text('test_output'),
  commitHash: varchar('commit_hash', { length: 100 }),
  createdBySkillId: uuid('created_by_skill_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ticketIdx: index('ticket_evidence_ticket_idx').on(t.ticketId) }));
