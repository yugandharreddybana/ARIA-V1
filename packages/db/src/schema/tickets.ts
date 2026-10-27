import { pgTable, uuid, varchar, text, boolean, integer, timestamp, pgEnum, jsonb, index, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { sessions } from './sessions';
import { skills } from './skills';
import { businessFlows } from './knowledge';
import { sprints } from './sprints';

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
  issueType: text('issue_type').notNull().default('story'),
  parentId: uuid('parent_id').references((): AnyPgColumn => tickets.id, { onDelete: 'cascade' }),
  epicId: uuid('epic_id').references((): AnyPgColumn => tickets.id, { onDelete: 'set null' }),
  acceptanceCriteria: jsonb('acceptance_criteria').notNull().default([]),
  behaviourNotes: text('behaviour_notes'),
  uiAffected: boolean('ui_affected').notNull().default(false),
  uiMockStatus: text('ui_mock_status').notNull().default('not_required'),
  apiContract: jsonb('api_contract'),
  dorChecklist: jsonb('dor_checklist').notNull().default([]),
  dodChecklist: jsonb('dod_checklist').notNull().default([]),
  readinessStatus: text('readiness_status').notNull().default('not_ready'),
  rollbackPlan: text('rollback_plan'),
  sprintId: uuid('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
  assigneeAgentId: uuid('assignee_agent_id').references(() => skills.id, { onDelete: 'set null' }),
  predictedPaths: jsonb('predicted_paths').notNull().default([]),
  // FK to idea_cards added in V23 (M3C); column is nullable here.
  ideaCardId: uuid('idea_card_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  projectIdx: index('tickets_project_idx').on(t.projectId),
  statusIdx: index('tickets_status_idx').on(t.status),
  ticketKeyUidx: uniqueIndex('tickets_ticket_key_uidx').on(t.ticketKey),
  parentIdx: index('tickets_parent_idx').on(t.parentId),
  epicIdx: index('tickets_epic_idx').on(t.epicId),
  sprintIdx: index('tickets_sprint_idx').on(t.sprintId),
  assigneeAgentIdx: index('tickets_assignee_agent_idx').on(t.assigneeAgentId),
  issueTypeIdx: index('tickets_issue_type_idx').on(t.issueType),
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
