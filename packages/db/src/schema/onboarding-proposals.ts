import { pgTable, uuid, text, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workspaces } from './workspaces';

export const proposalStatusEnum = pgEnum('proposal_status', [
  'pending',    // analysis triggered, AI not yet done
  'ready',      // AI proposal generated, awaiting user review in Step 5
  'committed',  // user clicked "Create Company" — skills written to DB
  'failed',     // analysis or LLM generation failed
]);

/**
 * onboarding_proposals
 * --------------------
 * One row per workspace onboarding run.
 * proposedSkills  → ProposedSkill[]  (full AI team, editable in Step 5)
 * codebaseProfile → CodebaseProfile  (stored for audit/debug)
 */
export const onboardingProposals = pgTable('onboarding_proposals', {
  id:              uuid('id').primaryKey().defaultRandom(),
  workspaceId:     uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId:       uuid('project_id'),  // set after project row is created
  status:          proposalStatusEnum('status').notNull().default('pending'),
  proposedSkills:  jsonb('proposed_skills').notNull().default([]),
  codebaseProfile: jsonb('codebase_profile'),
  errorMessage:    text('error_message'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const onboardingProposalsRelations = relations(onboardingProposals, ({ one }) => ({
  workspace: one(workspaces, {
    fields:     [onboardingProposals.workspaceId],
    references: [workspaces.id],
  }),
}));
