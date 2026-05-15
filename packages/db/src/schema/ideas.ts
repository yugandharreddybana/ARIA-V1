import { pgTable, uuid, varchar, text, boolean, timestamp, pgEnum, jsonb, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { skills } from './skills';

export const ideaStatusEnum = pgEnum('idea_status', ['draft','ready_for_review','approved','rejected','in_development']);
export const featureSpecStatusEnum = pgEnum('feature_spec_status', ['draft','pending_approval','approved','rejected','in_development']);

export const ideaCards = pgTable('idea_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  summary: text('summary').notNull(),
  proposedBySkillId: uuid('proposed_by_skill_id').references(() => skills.id),
  proposedByHumanId: uuid('proposed_by_human_id'),
  affectedDomains: jsonb('affected_domains').notNull().default([]),
  potentialUserImpact: text('potential_user_impact').notNull(),
  potentialBusinessImpact: text('potential_business_impact').notNull(),
  roughEffortEstimate: varchar('rough_effort_estimate', { length: 100 }),
  riskAssessment: text('risk_assessment'),
  suggestedRiskClass: varchar('suggested_risk_class', { length: 1 }).notNull().default('B'),
  supportingEvidence: jsonb('supporting_evidence').notNull().default([]),
  status: ideaStatusEnum('status').notNull().default('draft'),
  humanApproved: boolean('human_approved').notNull().default(false),
  humanApprovedById: uuid('human_approved_by_id'),
  humanApprovedAt: timestamp('human_approved_at'),
  linkedTicketIds: jsonb('linked_ticket_ids').notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({ projectIdx: index('idea_cards_project_idx').on(t.projectId) }));

export const featureSpecs = pgTable('feature_specs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  ideaCardId: uuid('idea_card_id').notNull().references(() => ideaCards.id),
  title: varchar('title', { length: 500 }).notNull(),
  problem: text('problem').notNull(),
  proposedSolution: text('proposed_solution').notNull(),
  userImpact: text('user_impact').notNull(),
  businessImpact: text('business_impact').notNull(),
  technicalApproach: text('technical_approach').notNull(),
  risks: text('risks').notNull(),
  linkedTicketIds: jsonb('linked_ticket_ids').notNull().default([]),
  status: featureSpecStatusEnum('status').notNull().default('draft'),
  humanApproved: boolean('human_approved').notNull().default(false),
  humanApprovedById: uuid('human_approved_by_id'),
  humanApprovedAt: timestamp('human_approved_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({ projectIdx: index('feature_specs_project_idx').on(t.projectId) }));
