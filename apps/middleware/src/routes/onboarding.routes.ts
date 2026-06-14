/**
 * onboarding.routes.ts
 * --------------------
 * All routes for the 6-step onboarding wizard.
 * All routes require a valid JWT (requireAuth middleware).
 *
 * POST /api/onboarding/company          — Step 1: save company name + description
 * POST /api/onboarding/repos            — Step 3: save selected GitHub repos
 * POST /api/onboarding/scout            — Step 4: save scout persona, trigger analysis
 * GET  /api/onboarding/proposal         — Step 5 poll: get proposal status + skills
 * PATCH /api/onboarding/proposal/:tempId — Step 5 edit: update a proposed skill
 * POST /api/onboarding/proposal/skill   — Step 5 add: add a custom skill
 * DELETE /api/onboarding/proposal/:tempId — Step 5 delete: remove a skill
 * POST /api/onboarding/commit           — Step 6: commit proposal to DB
 * GET  /api/onboarding/status           — Resume: get last completed step
 *
 * Note: Step 2 (LLM config) reuses the existing PATCH /api/workspace/llm-config
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import * as OnboardingService from '../services/onboarding.service';
import type { AuthenticatedRequest } from '../types/express';

const router = Router();

function workspaceId(req: AuthenticatedRequest): string {
  const wid = req.user?.workspaceId;
  if (!wid) throw new AppError('No workspace associated with this user', 403);
  return wid;
}

// ── Step 1: Company info ─────────────────────────────────────────────────────
router.post('/company', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { companyName, companyDescription } = req.body as { companyName?: string; companyDescription?: string };
    if (!companyName?.trim())        throw new AppError('companyName is required', 400);
    if (!companyDescription?.trim()) throw new AppError('companyDescription is required', 400);
    await OnboardingService.saveCompanyInfo(workspaceId(req), { companyName: companyName.trim(), companyDescription: companyDescription.trim() });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Step 3: GitHub repo selection ────────────────────────────────────────────
router.post('/repos', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { repos } = req.body as { repos?: unknown[] };
    if (!Array.isArray(repos) || repos.length === 0)
      throw new AppError('At least one repo must be selected', 400);
    const result = await OnboardingService.saveRepos(workspaceId(req), { repos: repos as never });
    res.json(result);
  } catch (err) { next(err); }
});

// ── Step 4: Scout persona + trigger analysis ─────────────────────────────────
router.post('/scout', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { scoutName, scoutDescription } = req.body as { scoutName?: string; scoutDescription?: string };
    if (!scoutName?.trim())        throw new AppError('scoutName is required', 400);
    if (!scoutDescription?.trim()) throw new AppError('scoutDescription is required', 400);
    const result = await OnboardingService.saveScoutAndTriggerAnalysis(workspaceId(req), {
      scoutName: scoutName.trim(),
      scoutDescription: scoutDescription.trim(),
    });
    res.json(result);
  } catch (err) { next(err); }
});

// ── Step 5 poll: get proposal ─────────────────────────────────────────────────
router.get('/proposal', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const proposal = await OnboardingService.getProposal(workspaceId(req));
    res.json(proposal);
  } catch (err) { next(err); }
});

// ── Step 5 edit: patch a skill ────────────────────────────────────────────────
router.patch('/proposal/:tempId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { tempId } = req.params;
    const updated = await OnboardingService.patchSkill(workspaceId(req), tempId, req.body);
    res.json({ proposedSkills: updated });
  } catch (err) { next(err); }
});

// ── Step 5 add: add custom skill ─────────────────────────────────────────────
router.post('/proposal/skill', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const updated = await OnboardingService.addSkill(workspaceId(req), req.body);
    res.json({ proposedSkills: updated });
  } catch (err) { next(err); }
});

// ── Step 5 delete: remove skill ──────────────────────────────────────────────
router.delete('/proposal/:tempId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { tempId } = req.params;
    const updated = await OnboardingService.deleteSkill(workspaceId(req), tempId);
    res.json({ proposedSkills: updated });
  } catch (err) { next(err); }
});

// ── Step 6: Commit ───────────────────────────────────────────────────────────
router.post('/commit', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await OnboardingService.commitProposal(workspaceId(req));
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// ── Status (resume interrupted onboarding) ───────────────────────────────────
router.get('/status', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const status = await OnboardingService.getOnboardingStatus(workspaceId(req));
    res.json(status);
  } catch (err) { next(err); }
});

// ── GitHub repos list (for Step 3 multi-select) ───────────────────────────────
// Returns all repos the user can access via their stored GitHub OAuth token
router.get('/github/repos', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { db: dbClient } = await import('@aria/db');
    const { workspaces: wsTable } = await import('@aria/db');
    const { eq: eqFn } = await import('drizzle-orm');
    const { decryptApiKey } = await import('../services/workspace.service');

    const ws = await dbClient.query.workspaces.findFirst({ where: eqFn(wsTable.id, workspaceId(req)) });
    if (!ws?.githubAccessTokenEncrypted) throw new AppError('GitHub not connected', 400);
    const token = decryptApiKey(ws.githubAccessTokenEncrypted);

    // Paginate through all repos (up to 300)
    const allRepos: { full_name: string; name: string; html_url: string; default_branch: string; private: boolean; description: string | null }[] = [];
    for (let page = 1; page <= 3; page++) {
      const res2 = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res2.ok) break;
      const batch = await res2.json() as typeof allRepos;
      allRepos.push(...batch);
      if (batch.length < 100) break;
    }

    res.json(allRepos.map(r => ({
      fullName:      r.full_name,
      repoName:      r.name,
      repoUrl:       r.html_url,
      defaultBranch: r.default_branch,
      isPrivate:     r.private,
      description:   r.description,
    })));
  } catch (err) { next(err); }
});

export default router;
