/**
 * onboarding.routes.ts
 * --------------------
 * All REST endpoints driving the 6-step onboarding wizard.
 *
 * POST /api/onboarding/company          — Step 1
 * POST /api/onboarding/repos            — Step 3 (Step 2 reuses /api/workspace/llm-config)
 * POST /api/onboarding/scout            — Step 4 (triggers async analysis)
 * GET  /api/onboarding/proposal         — Step 5 poll (returns status + proposedSkills)
 * PATCH /api/onboarding/proposal/:tempId— Step 5 edit one skill
 * POST /api/onboarding/proposal/skill   — Step 5 add custom skill
 * DELETE /api/onboarding/proposal/:tempId — Step 5 delete skill
 * POST /api/onboarding/commit           — Step 6 "Create Company"
 * GET  /api/onboarding/status           — check if onboarding is complete
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as Onboarding from '../services/onboarding.service';
import { db } from '@aria/db';
import { users } from '@aria/db';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';

const router = Router();

// All onboarding routes require a valid JWT
router.use(authenticate);

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ ok: true, data });
}

// Decrypt GitHub token from workspace for repo analysis
async function getGhToken(workspaceId: string): Promise<string> {
  // The GitHub access token is stored in workspaces.github_access_token_encrypted.
  // In this codebase the field is currently stored as plain-text (encrypted field
  // name is a migration target). We read it directly.
  const { workspaces } = await import('@aria/db');
  const { db } = await import('@aria/db');
  const ws = await db.query.workspaces.findFirst({
    where: (w, { eq }) => eq(w.id, workspaceId),
  });
  if (!ws?.githubAccessTokenEncrypted) {
    throw new AppError('GitHub not connected — complete OAuth in Step 3', 400);
  }
  return ws.githubAccessTokenEncrypted;
}

// ── GET /api/onboarding/status ─────────────────────────────────────────────────
// Returns whether this workspace has completed onboarding.
// Frontend uses this to redirect /onboarding → /dashboard if already done.

router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = (req as unknown as { user: { workspaceId: string } }).user.workspaceId;
    const { workspaces } = await import('@aria/db');
    const { db } = await import('@aria/db');
    const ws = await db.query.workspaces.findFirst({ where: (w, { eq }) => eq(w.id, workspaceId) });
    ok(res, { completed: !!ws?.onboardingCompletedAt, completedAt: ws?.onboardingCompletedAt ?? null });
  } catch (e) { next(e); }
});

// ── POST /api/onboarding/company  (Step 1) ─────────────────────────────────────

router.post('/company', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = (req as unknown as { user: { workspaceId: string } }).user.workspaceId;
    const { companyName, companyDescription } = req.body as { companyName?: string; companyDescription?: string };
    if (!companyName?.trim()) throw new AppError('companyName is required', 400);
    if (!companyDescription?.trim()) throw new AppError('companyDescription is required', 400);
    const result = await Onboarding.saveCompany(workspaceId, { companyName: companyName.trim(), companyDescription: companyDescription.trim() });
    ok(res, result, 201);
  } catch (e) { next(e); }
});

// ── POST /api/onboarding/repos  (Step 3) ──────────────────────────────────────

router.post('/repos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = (req as unknown as { user: { workspaceId: string } }).user.workspaceId;
    const { repos } = req.body as { repos?: unknown };
    if (!Array.isArray(repos) || repos.length === 0) throw new AppError('repos must be a non-empty array', 400);
    const result = await Onboarding.saveRepos(workspaceId, { repos });
    ok(res, result);
  } catch (e) { next(e); }
});

// ── POST /api/onboarding/scout  (Step 4) ──────────────────────────────────────

router.post('/scout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = (req as unknown as { user: { workspaceId: string } }).user.workspaceId;
    const { scoutName, scoutDescription } = req.body as { scoutName?: string; scoutDescription?: string };
    if (!scoutName?.trim())        throw new AppError('scoutName is required', 400);
    if (!scoutDescription?.trim()) throw new AppError('scoutDescription is required', 400);
    const ghToken = await getGhToken(workspaceId);
    const result  = await Onboarding.saveScoutAndTriggerAnalysis(
      workspaceId,
      { scoutName: scoutName.trim(), scoutDescription: scoutDescription.trim() },
      ghToken,
    );
    ok(res, result);
  } catch (e) { next(e); }
});

// ── GET /api/onboarding/proposal  (Step 5 poll) ───────────────────────────────

router.get('/proposal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = (req as unknown as { user: { workspaceId: string } }).user.workspaceId;
    const proposal = await Onboarding.getProposal(workspaceId);
    ok(res, {
      id:             proposal.id,
      status:         proposal.status,
      proposedSkills: proposal.proposedSkills,
      errorMessage:   proposal.errorMessage,
      updatedAt:      proposal.updatedAt,
    });
  } catch (e) { next(e); }
});

// ── PATCH /api/onboarding/proposal/:tempId  (Step 5 edit) ─────────────────────

router.patch('/proposal/:tempId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = (req as unknown as { user: { workspaceId: string } }).user.workspaceId;
    const { tempId }  = req.params;
    const { skill }   = req.body as { skill?: unknown };
    if (!skill || typeof skill !== 'object') throw new AppError('skill payload required', 400);
    const updated = await Onboarding.patchSkill(workspaceId, tempId, { skill: skill as ProposalSkillPatchPayload['skill'] });
    ok(res, updated);
  } catch (e) { next(e); }
});

// ── POST /api/onboarding/proposal/skill  (Step 5 add) ────────────────────────
// Note: this route must be BEFORE /:tempId to avoid param collision

router.post('/proposal/skill', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = (req as unknown as { user: { workspaceId: string } }).user.workspaceId;
    const body = req.body as Record<string, unknown>;
    if (!body.slug || !body.roleTitle) throw new AppError('slug and roleTitle are required', 400);
    const newSkill = await Onboarding.addSkill(workspaceId, body as Parameters<typeof Onboarding.addSkill>[1]);
    ok(res, newSkill, 201);
  } catch (e) { next(e); }
});

// ── DELETE /api/onboarding/proposal/:tempId  (Step 5 delete) ─────────────────

router.delete('/proposal/:tempId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = (req as unknown as { user: { workspaceId: string } }).user.workspaceId;
    const { tempId }  = req.params;
    await Onboarding.deleteSkill(workspaceId, tempId);
    ok(res, { deleted: true });
  } catch (e) { next(e); }
});

// ── POST /api/onboarding/commit  (Step 6) ─────────────────────────────────────

router.post('/commit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = (req as unknown as { user: { workspaceId: string } }).user.workspaceId;
    const result = await Onboarding.commitProposal(workspaceId);
    ok(res, result, 201);
  } catch (e) { next(e); }
});

export default router;

// Import type for patch payload (avoids circular import)
import type { ProposalSkillPatchPayload } from '../types/onboarding.types';
