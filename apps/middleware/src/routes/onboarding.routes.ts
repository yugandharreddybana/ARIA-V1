/**
 * onboarding.routes.ts
 * --------------------
 * All API routes for the 6-step onboarding wizard.
 *
 * POST   /api/onboarding/company           — Step 1
 * POST   /api/onboarding/llm               — Step 2 (delegates to workspace LLM config)
 * POST   /api/onboarding/repos             — Step 3
 * POST   /api/onboarding/scout             — Step 4 (triggers async analysis)
 * GET    /api/onboarding/proposal          — Step 5: poll for proposal status
 * PATCH  /api/onboarding/proposal/:tempId  — Step 5: edit an agent in the tree
 * POST   /api/onboarding/proposal          — Step 5: add a custom agent
 * DELETE /api/onboarding/proposal/:tempId  — Step 5: remove an agent
 * POST   /api/onboarding/commit            — Step 6: write to DB, go live
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as OnboardingService from '../services/onboarding.service';
import type {
  OnboardingCompanyPayload,
  OnboardingRepoSelection,
  OnboardingScoutPayload,
  ProposedSkill,
} from '../types/onboarding.types';

const router = Router();

// All onboarding routes require a valid session
router.use(authenticate);

// ---------------------------------------------------------------------------
// Step 1 — Company name + description
// ---------------------------------------------------------------------------
router.post('/company', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OnboardingService.saveCompany(
      req.user!.workspaceId,
      req.body as OnboardingCompanyPayload,
    );
    res.status(200).json(result);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Step 2 — LLM / agent provider selection
// Reuses the existing workspace LLM-config endpoint logic.
// The frontend calls PATCH /api/workspace/llm-config directly for this step.
// We expose a forwarding endpoint here for wizard consistency.
// ---------------------------------------------------------------------------
router.post('/llm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Import inline to avoid circular deps with workspace.service
    const { updateLlmConfig } = await import('../services/workspace.service');
    const result = await updateLlmConfig(req.user!.workspaceId, req.body);
    res.status(200).json(result);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Step 3 — GitHub repo selection (multi-select)
// ---------------------------------------------------------------------------
router.post('/repos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OnboardingService.saveRepos(
      req.user!.workspaceId,
      req.body as OnboardingRepoSelection,
    );
    res.status(200).json(result);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Step 4 — Scout persona + trigger async analysis
// ---------------------------------------------------------------------------
router.post('/scout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OnboardingService.saveScoutAndTrigger(
      req.user!.workspaceId,
      req.body as OnboardingScoutPayload,
    );
    // 202 Accepted: analysis running in background, client should poll /proposal
    res.status(202).json({ ...result, message: 'Analysis started. Poll GET /api/onboarding/proposal for status.' });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Step 5 — Get proposal (frontend polls until status = 'ready' or 'failed')
// ---------------------------------------------------------------------------
router.get('/proposal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposal = await OnboardingService.getProposal(req.user!.workspaceId);
    res.status(200).json(proposal);
  } catch (err) { next(err); }
});

// Step 5 — Edit an agent in the tree
router.patch('/proposal/:tempId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await OnboardingService.patchSkill(
      req.user!.workspaceId,
      req.params.tempId,
      req.body.skill as Partial<Omit<ProposedSkill, 'tempId'>>,
    );
    res.status(200).json(updated);
  } catch (err) { next(err); }
});

// Step 5 — Add a custom agent
router.post('/proposal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const newSkill = await OnboardingService.addSkill(
      req.user!.workspaceId,
      req.body as Omit<ProposedSkill, 'tempId' | 'isAiGenerated'>,
    );
    res.status(201).json(newSkill);
  } catch (err) { next(err); }
});

// Step 5 — Delete an agent from the proposal
router.delete('/proposal/:tempId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OnboardingService.deleteSkill(
      req.user!.workspaceId,
      req.params.tempId,
    );
    res.status(200).json(result);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Step 6 — Commit: write all agents to DB + redirect to dashboard
// ---------------------------------------------------------------------------
router.post('/commit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OnboardingService.commitProposal(req.user!.workspaceId);
    res.status(200).json({ ...result, message: 'Company created. All agents are live.' });
  } catch (err) { next(err); }
});

export default router;
