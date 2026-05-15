import { pgTable, uuid, varchar, text, boolean, timestamp, pgEnum, jsonb, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { sessions } from './sessions';
import { skills } from './skills';

export const ticketTypeEnum = pgEnum('ticket_type', ['bug','feature','tech_debt','incident','process']);
export const ticketStatusEnum = pgEnum('ticket_status', ['backlog','ready_for_dev','in_progress','ready_for_qa','in_qa','ready_for_review','done','rejected']);
export const evidenceTypeEnum = pgEnum('evidence_type', ['bug_report','fix','feature_design','qa_verification']);

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => sessions.id),
  type: ticketTypeEnum('type').notNull(),
  status: ticketStatusEnum('status').notNull().default('backlog'),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description').notNull(),
  promptBlock: jsonb('prompt_block'),
  riskClass: varchar('risk_class', { length: 1 }).notNull().default('B'),
  affectedDomains: jsonb('affected_domains').notNull().default([]),
  assignedSkillId: uuid('assigned_skill_id').references(() => skills.id),
  jiraIssueKey: varchar('jira_issue_key', { length: 100 }),
  createdBySkillId: uuid('created_by_skill_id').references(() => skills.id),
  humanApproved: boolean('human_approved').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({ projectIdx: index('tickets_project_idx').on(t.projectId), statusIdx: index('tickets_status_idx').on(t.status) }));

export const ticketEvidence = pgTable('ticket_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  evidenceType: evidenceTypeEnum('evidence_type').notNull(),
  screenshots: jsonb('screenshots').notNull().default([]),
  videoPath: varchar('video_path', { length: 500 }),
  logs: text('logs').notNull().default(''),
  reproSteps: jsonb('repro_steps').notNull().default([]),
  environment: jsonb('environment').notNull().default({}),
  codeDiff: text('code_diff'),
  testOutput: text('test_output'),
  commitHash: varchar('commit_hash', { length: 100 }),
  createdBySkillId: uuid('created_by_skill_id').references(() => skills.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({ ticketIdx: index('ticket_evidence_ticket_idx').on(t.ticketId) }));
