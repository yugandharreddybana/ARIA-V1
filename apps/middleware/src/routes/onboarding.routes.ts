/**
 * onboarding.routes.ts
 * --------------------
 * All endpoints for the 6-step onboarding wizard.
 *
 * POST   /api/onboarding/company               ─ Step 1: save company name + description
 * GET    /api/onboarding/github/repos           ─ Step 3: list GitHub repos for picker
 * POST   /api/onboarding/repos                 ─ Step 3: save selected repos
 * POST   /api/onboarding/scout                 ─ Step 4: save scout persona + trigger analysis
 * GET    /api/onboarding/proposal              ─ Step 5: poll for proposal status + skills
 * PATCH  /api/onboarding/proposal/:tempId      ─ Step 5: edit one skill in the tree
 * POST   /api/onboarding/proposal/skill        ─ Step 5: add a custom skill
 * DELETE /api/onboarding/proposal/:tempId      ─ Step 5: delete a skill from the tree
 * POST   /api/onboarding/commit                ─ Step 6: commit → write to DB + go live
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as OnboardingService from '../services/onboarding.service';
import * as GithubService from '../services/github.service';

const router = Router();

// All onboarding routes require auth
router.use(authenticate);

// ── Step 1: Company info ────────────────────────────────────────────────────────
router.post('/company', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OnboardingService.saveCompanyInfo(req.user!.workspaceId, req.body);
    res.json({ ok: true, workspace: result });
  } catch (e) { next(e); }
});

// ── Step 3a: List GitHub repos ──────────────────────────────────────────────────
router.get('/github/repos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = await GithubService.listUserRepos(req.user!.workspaceId);
    res.json({ ok: true, repos });
  } catch (e) { next(e); }
});

// ── Step 3b: Save selected repos ───────────────────────────────────────────────
router.post('/repos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OnboardingService.saveRepos(req.user!.workspaceId, req.body);
    res.status(201).json({ ok: true, ...result });
  } catch (e) { next(e); }
});

// ── Step 4: Scout persona + trigger analysis ──────────────────────────────────
router.post('/scout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OnboardingService.saveScoutAndAnalyse(req.user!.workspaceId, req.body);
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

// ── Step 5: Poll proposal ─────────────────────────────────────────────────────────
router.get('/proposal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposal = await OnboardingService.getProposal(req.user!.workspaceId);
    res.json({ ok: true, proposal });
  } catch (e) { next(e); }
});

// ── Step 5: Patch a skill in the proposal ──────────────────────────────────────
router.patch('/proposal/:tempId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await OnboardingService.patchProposalSkill(
      req.user!.workspaceId, req.params.tempId, req.body,
    );
    res.json({ ok: true, skill: updated });
  } catch (e) { next(e); }
});

// ── Step 5: Add a custom skill ──────────────────────────────────────────────────
router.post('/proposal/skill', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skill = await OnboardingService.addProposalSkill(req.user!.workspaceId, req.body);
    res.status(201).json({ ok: true, skill });
  } catch (e) { next(e); }
});

// ── Step 5: Delete a skill ────────────────────────────────────────────────────────
router.delete('/proposal/:tempId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await OnboardingService.deleteProposalSkill(req.user!.workspaceId, req.params.tempId);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Step 6: Commit proposal → agents go live ───────────────────────────────────
router.post('/commit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OnboardingService.commitProposal(req.user!.workspaceId);
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

export default router;
