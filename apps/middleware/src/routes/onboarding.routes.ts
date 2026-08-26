/**
 * onboarding.routes.ts
 * --------------------
 * All endpoints for the 6-step onboarding wizard.
 *
 * GET   /api/onboarding/status            — wizard routing gate (completed?)
 * POST  /api/onboarding/company           — Step 1: save company name + description
 * PATCH /api/onboarding/llm               — Step 2: delegates to existing workspace LLM config
 * POST  /api/onboarding/repos             — Step 3: save selected GitHub repos
 * GET   /api/onboarding/github/repos      — Step 3 utility: list user's GitHub repos
 * POST  /api/onboarding/scout             — Step 4: save scout persona + trigger background analysis
 * GET   /api/onboarding/proposal          — Step 5: poll for ready proposal
 * PATCH /api/onboarding/proposal/:tempId  — Step 5: edit a proposed skill
 * POST  /api/onboarding/proposal/skill    — Step 5: add a custom skill
 * DELETE /api/onboarding/proposal/:tempId — Step 5: delete a skill
 * POST  /api/onboarding/commit            — Step 6: commit proposal → write skills to DB
 *
 * IDOR: workspaceId ALWAYS comes from the JWT (req.user), never from the body.
 */

import { Router, type Response, type NextFunction } from 'express';
import { requireAuth, type AriaRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  onboardingCompanySchema,
  onboardingReposSchema,
  onboardingScoutSchema,
  onboardingAddSkillSchema,
  onboardingPatchSkillSchema,
  type OnboardingAddSkillInput,
  type OnboardingPatchSkillInput,
} from '../schemas/onboarding.schemas';
import * as Onboarding from '../services/onboarding.service';
import { listUserRepos } from '../services/github.service';
import type { ProposedSkill } from '../types/onboarding.types';

const router = Router();

// All onboarding routes require authentication
router.use(requireAuth);

const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ ok: true, data });
const wid = (req: AriaRequest): string => req.user!.workspaceId;

// ─── Routing gate: has this workspace finished onboarding? ───────────────────
router.get('/status', async (req: AriaRequest, res: Response, next: NextFunction) => {
  try {
    ok(res, await Onboarding.getStatus(wid(req)));
  } catch (e) { next(e); }
});

// ─── Step 1: Company ─────────────────────────────────────────────────────────
router.post('/company', validate(onboardingCompanySchema), async (req: AriaRequest, res: Response, next: NextFunction) => {
  try {
    await Onboarding.saveCompany(wid(req), req.body);
    ok(res, { message: 'Company saved' });
  } catch (e) { next(e); }
});

// ─── Step 2: LLM config — reuse existing workspace route (PATCH /api/workspace/llm-config)
// Frontend calls /api/workspace/llm-config directly — no new route needed here.

// ─── Step 3: GitHub repo selection ───────────────────────────────────────────
router.post('/repos', validate(onboardingReposSchema), async (req: AriaRequest, res: Response, next: NextFunction) => {
  try {
    ok(res, await Onboarding.saveRepos(wid(req), req.body));
  } catch (e) { next(e); }
});

// ─── Step 3 utility: list GitHub repos the user can access ───────────────────
router.get('/github/repos', async (req: AriaRequest, res: Response, next: NextFunction) => {
  try {
    ok(res, await listUserRepos(wid(req)));
  } catch (e) { next(e); }
});

// ─── Step 4: Scout persona + trigger analysis ─────────────────────────────────
router.post('/scout', validate(onboardingScoutSchema), async (req: AriaRequest, res: Response, next: NextFunction) => {
  try {
    ok(res, await Onboarding.saveScoutAndTriggerAnalysis(wid(req), req.body), 202);
  } catch (e) { next(e); }
});

// ─── Step 5: Poll proposal ────────────────────────────────────────────────────
router.get('/proposal', async (req: AriaRequest, res: Response, next: NextFunction) => {
  try {
    ok(res, await Onboarding.getProposal(wid(req)));
  } catch (e) { next(e); }
});

// ─── Step 5: Patch a skill ────────────────────────────────────────────────────
router.patch('/proposal/:tempId', validate(onboardingPatchSkillSchema), async (req: AriaRequest, res: Response, next: NextFunction) => {
  try {
    const patch = req.body as OnboardingPatchSkillInput;
    ok(res, await Onboarding.patchProposalSkill(wid(req), req.params.tempId, { skill: patch }));
  } catch (e) { next(e); }
});

// ─── Step 5: Add custom skill ─────────────────────────────────────────────────
router.post('/proposal/skill', validate(onboardingAddSkillSchema), async (req: AriaRequest, res: Response, next: NextFunction) => {
  try {
    const input = req.body as OnboardingAddSkillInput;
    const newSkill: Omit<ProposedSkill, 'tempId'> = { ...input, isAlwaysPresent: false, isAiGenerated: false };
    ok(res, await Onboarding.addProposalSkill(wid(req), newSkill), 201);
  } catch (e) { next(e); }
});

// ─── Step 5: Delete skill ─────────────────────────────────────────────────────
router.delete('/proposal/:tempId', async (req: AriaRequest, res: Response, next: NextFunction) => {
  try {
    ok(res, await Onboarding.deleteProposalSkill(wid(req), req.params.tempId));
  } catch (e) { next(e); }
});

// ─── Step 6: Commit → create company ─────────────────────────────────────────
router.post('/commit', async (req: AriaRequest, res: Response, next: NextFunction) => {
  try {
    ok(res, await Onboarding.commitProposal(wid(req)), 201);
  } catch (e) { next(e); }
});

export default router;
