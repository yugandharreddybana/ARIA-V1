import { pgTable, uuid, text, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workspaces } from './workspaces';

export const proposalStatusEnum = pgEnum('proposal_status', [
  'pending',   // analysis triggered, AI team generation in progress
  'ready',     // AI proposal ready — awaiting user review in Step 5
  'committed', // user clicked "Create Company" — skills written to DB
  'failed',    // analysis or skill generation failed
]);

/**
 * onboarding_proposals
 * --------------------
 * One row per workspace onboarding run.
 * `proposedSkills` JSONB holds the ProposedSkill[] array.
 * The user reviews and edits this in Step 5 (org tree) before committing.
 */
export const onboardingProposals = pgTable('onboarding_proposals', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // The project created in Step 1
  projectId: uuid('project_id'),

  status: proposalStatusEnum('status').notNull().default('pending'),

  // Full AI-generated team — ProposedSkill[] JSON (see onboarding.types.ts)
  proposedSkills: jsonb('proposed_skills').notNull().default([]),

  // CodebaseProfile produced by repoAnalysis.service — stored for audit/debug
  codebaseProfile: jsonb('codebase_profile'),

  // Error message when status = 'failed'
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const onboardingProposalsRelations = relations(onboardingProposals, ({ one }) => ({
  workspace: one(workspaces, {
    fields:     [onboardingProposals.workspaceId],
    references: [workspaces.id],
  }),
}));
