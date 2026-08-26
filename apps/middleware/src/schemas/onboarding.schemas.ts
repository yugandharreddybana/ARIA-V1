import { z } from 'zod';

/**
 * Zod-strict request schemas for the 6-step onboarding wizard.
 * workspaceId is NEVER accepted from the body — it always comes
 * from the JWT (IDOR guard, see onboarding.routes.ts).
 */

// ── Step 1: company ─────────────────────────────────────────────────────
export const onboardingCompanySchema = z.object({
  companyName:        z.string().trim().min(1, 'companyName is required').max(255),
  companyDescription: z.string().trim().min(1, 'companyDescription is required').max(5000),
}).strict();

// ── Step 3: repos ───────────────────────────────────────────────────────
export const onboardingReposSchema = z.object({
  repos: z.array(
    z.object({
      repoUrl:  z.string().url('repoUrl must be a valid URL').max(500),
      repoName: z.string().trim().min(1).max(255),
      fullName: z.string().trim().min(1).max(255),
      branch:   z.string().trim().min(1).max(255).default('main'),
    }).strict(),
  ).min(1, 'At least one repo must be selected').max(50),
}).strict();

// ── Step 4: scout ───────────────────────────────────────────────────────
export const onboardingScoutSchema = z.object({
  scoutName:        z.string().trim().min(1, 'scoutName is required').max(100),
  scoutDescription: z.string().trim().min(1, 'scoutDescription is required').max(5000),
}).strict();

// ── Step 5: proposal edits ──────────────────────────────────────────────
const proposedSkillFields = {
  slug:                   z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be kebab-case'),
  realName:               z.string().trim().min(1).max(255),
  roleTitle:              z.string().trim().min(1).max(255),
  department:             z.string().trim().min(1).max(100),
  hierarchyLevel:         z.number().int().min(1).max(5),
  reportingManagerTempId: z.string().uuid().nullable(),
  instructions:           z.string().max(20_000),
  description:            z.string().max(2_000),
  ownedDomains:           z.array(z.string().max(100)).max(50),
  ownedRepoPaths:         z.array(z.string().max(500)).max(100),
  triggerKeywords:        z.array(z.string().max(100)).max(100),
  riskClass:              z.enum(['A', 'B', 'C', 'D']),
};

/** POST /proposal/skill — user-added agent. tempId/isAlwaysPresent/isAiGenerated are server-set. */
export const onboardingAddSkillSchema = z.object({
  ...proposedSkillFields,
  reportingManagerTempId: proposedSkillFields.reportingManagerTempId.default(null),
  instructions:           proposedSkillFields.instructions.default(''),
  description:            proposedSkillFields.description.default(''),
  ownedDomains:           proposedSkillFields.ownedDomains.default([]),
  ownedRepoPaths:         proposedSkillFields.ownedRepoPaths.default([]),
  triggerKeywords:        proposedSkillFields.triggerKeywords.default([]),
  riskClass:              proposedSkillFields.riskClass.default('C'),
}).strict();

/** PATCH /proposal/:tempId — partial edit; must contain at least one field. */
export const onboardingPatchSkillSchema = z.object(proposedSkillFields)
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'At least one field must be provided' });

export type OnboardingCompanyInput   = z.infer<typeof onboardingCompanySchema>;
export type OnboardingReposInput     = z.infer<typeof onboardingReposSchema>;
export type OnboardingScoutInput     = z.infer<typeof onboardingScoutSchema>;
export type OnboardingAddSkillInput  = z.infer<typeof onboardingAddSkillSchema>;
export type OnboardingPatchSkillInput = z.infer<typeof onboardingPatchSkillSchema>;
