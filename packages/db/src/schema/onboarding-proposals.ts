import { pgTable, uuid, text, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workspaces } from './workspaces';

export const proposalStatusEnum = pgEnum('proposal_status', [
  'pending',    // analysis triggered, not yet complete
  'ready',      // AI has generated the team proposal, awaiting user review
  'committed',  // user clicked "Create Company" — skills written to DB
  'failed',     // analysis or skill generation failed
]);

/**
 * onboarding_proposals
 * One row per workspace onboarding run.
 * proposedSkills JSONB = ProposedSkill[] (see types/onboarding.types.ts)
 * Users review/edit this in Step 5 before committing in Step 6.
 */
export const onboardingProposals = pgTable('onboarding_proposals', {
  id:              uuid('id').primaryKey().defaultRandom(),
  workspaceId:     uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId:       uuid('project_id'),
  status:          proposalStatusEnum('status').notNull().default('pending'),
  proposedSkills:  jsonb('proposed_skills').notNull().default([]),
  codebaseProfile: jsonb('codebase_profile'),
  errorMessage:    text('error_message'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const onboardingProposalsRelations = relations(onboardingProposals, ({ one }) => ({
  workspace: one(workspaces, { fields: [onboardingProposals.workspaceId], references: [workspaces.id] }),
}));
