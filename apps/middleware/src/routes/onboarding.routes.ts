/**
 * onboarding.routes.ts
 * --------------------
 * All endpoints for the 6-step onboarding wizard.
 *
 * POST  /api/onboarding/company           — Step 1: save company name + description
 * PATCH /api/onboarding/llm               — Step 2: delegates to existing workspace LLM config
 * POST  /api/onboarding/repos             — Step 3: save selected GitHub repos
 * POST  /api/onboarding/scout             — Step 4: save scout persona + trigger background analysis
 * GET   /api/onboarding/proposal          — Step 5: poll for ready proposal
 * PATCH /api/onboarding/proposal/:tempId  — Step 5: edit a proposed skill
 * POST  /api/onboarding/proposal/skill    — Step 5: add a custom skill
 * DELETE /api/onboarding/proposal/:tempId — Step 5: delete a skill
 * POST  /api/onboarding/commit            — Step 6: commit proposal → write skills to DB
 *
 * GET   /api/onboarding/github/repos      — utility: list user's GitHub repos for Step 3
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import * as Onboarding from '../services/onboarding.service';
import { AppError } from '../middleware/error.middleware';

const router = Router();

// All onboarding routes require authentication
router.use(requireAuth);

const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ ok: true, data });
const wid = (req: Request): string => (req as Request & { user: { workspaceId: string } }).user.workspaceId;

// ─── Step 1: Company ─────────────────────────────────────────────────────────
router.post('/company', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { companyName, companyDescription } = req.body as { companyName: string; companyDescription: string };
    if (!companyName?.trim()) throw new AppError('companyName is required', 400, 'VALIDATION');
    if (!companyDescription?.trim()) throw new AppError('companyDescription is required', 400, 'VALIDATION');
    await Onboarding.saveCompany(wid(req), { companyName, companyDescription });
    ok(res, { message: 'Company saved' });
  } catch (e) { next(e); }
});

// ─── Step 2: LLM config — reuse existing workspace route (PATCH /api/workspace/llm-config)
// Frontend calls /api/workspace/llm-config directly — no new route needed here.

// ─── Step 3: GitHub repo selection ───────────────────────────────────────────
router.post('/repos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { repos } = req.body as { repos: unknown[] };
    if (!Array.isArray(repos) || !repos.length) throw new AppError('repos array is required', 400, 'VALIDATION');
    const result = await Onboarding.saveRepos(wid(req), { repos: repos as never });
    ok(res, result);
  } catch (e) { next(e); }
});

// ─── Step 3 utility: list GitHub repos the user can access ───────────────────
router.get('/github/repos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as Request & { user: { workspaceId: string } }).user;
    // Fetch from GitHub API using the stored access token
    const { db } = await import('@aria/db');
    const { workspaces } = await import('@aria/db');
    const { eq } = await import('drizzle-orm');
    const { decryptApiKey } = await import('../services/workspace.service');

    const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, user.workspaceId) });
    if (!ws?.githubAccessTokenEncrypted) {
      throw new AppError('GitHub not connected. Please complete GitHub OAuth first.', 400, 'GITHUB_NOT_CONNECTED');
    }
    const token = decryptApiKey(ws.githubAccessTokenEncrypted);

    // Paginate GitHub /user/repos (up to 100 per page, max 3 pages = 300 repos)
    const allRepos: unknown[] = [];
    for (let page = 1; page <= 3; page++) {
      const ghRes = await fetch(
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } },
      );
      if (!ghRes.ok) break;
      const batch = await ghRes.json() as unknown[];
      allRepos.push(...batch);
      if (batch.length < 100) break;
    }

    ok(res, allRepos);
  } catch (e) { next(e); }
});

// ─── Step 4: Scout persona + trigger analysis ─────────────────────────────────
router.post('/scout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scoutName, scoutDescription } = req.body as { scoutName: string; scoutDescription: string };
    if (!scoutName?.trim()) throw new AppError('scoutName is required', 400, 'VALIDATION');
    if (!scoutDescription?.trim()) throw new AppError('scoutDescription is required', 400, 'VALIDATION');
    const result = await Onboarding.saveScoutAndTriggerAnalysis(wid(req), { scoutName, scoutDescription });
    ok(res, result, 202);
  } catch (e) { next(e); }
});

// ─── Step 5: Poll proposal ────────────────────────────────────────────────────
router.get('/proposal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposal = await Onboarding.getProposal(wid(req));
    ok(res, proposal);
  } catch (e) { next(e); }
});

// ─── Step 5: Patch a skill ────────────────────────────────────────────────────
router.patch('/proposal/:tempId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tempId } = req.params;
    const updated = await Onboarding.patchProposalSkill(wid(req), tempId, { skill: req.body });
    ok(res, updated);
  } catch (e) { next(e); }
});

// ─── Step 5: Add custom skill ─────────────────────────────────────────────────
router.post('/proposal/skill', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await Onboarding.addProposalSkill(wid(req), req.body);
    ok(res, updated, 201);
  } catch (e) { next(e); }
});

// ─── Step 5: Delete skill ─────────────────────────────────────────────────────
router.delete('/proposal/:tempId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tempId } = req.params;
    const updated = await Onboarding.deleteProposalSkill(wid(req), tempId);
    ok(res, updated);
  } catch (e) { next(e); }
});

// ─── Step 6: Commit → create company ─────────────────────────────────────────
router.post('/commit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await Onboarding.commitProposal(wid(req));
    ok(res, result, 201);
  } catch (e) { next(e); }
});

export default router;
