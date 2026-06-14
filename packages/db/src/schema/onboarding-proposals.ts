import { pgTable, uuid, text, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workspaces } from './workspaces';

export const proposalStatusEnum = pgEnum('proposal_status', [
  'pending',    // analysis triggered, LLM not yet responded
  'ready',      // AI-generated team proposal ready for user review (Step 5)
  'committed',  // user clicked "Create Company" — skills written to DB
  'failed',     // analysis or skill-generation failed
]);

/**
 * onboarding_proposals
 * --------------------
 * One row per workspace onboarding run.
 * `proposedSkills` is a ProposedSkill[] JSONB array (see onboarding.types.ts).
 * Users review/edit this in Step 5 before committing in Step 6.
 */
export const onboardingProposals = pgTable('onboarding_proposals', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Project created in Step 1 — linked here for easy commit
  projectId: uuid('project_id'),

  status: proposalStatusEnum('status').notNull().default('pending'),

  // Full AI-generated proposed team — ProposedSkill[] JSON array
  proposedSkills: jsonb('proposed_skills').notNull().default([]),

  // Raw codebase profile from repoAnalysis.service — stored for debugging
  codebaseProfile: jsonb('codebase_profile'),

  // Populated when status = 'failed'
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const onboardingProposalsRelations = relations(onboardingProposals, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [onboardingProposals.workspaceId],
    references: [workspaces.id],
  }),
}));
