import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db, workspaces } from '@aria/db';
import { requireAuth, type AriaRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  activateCredentialSchema,
  createCredentialSchema,
  testCredentialSchema,
} from '../schemas/providers.schema';
import {
  activateCredential,
  createCredential,
  listCatalog,
  listCredentials,
  retireCredential,
  testCredential,
} from '../services/providers/credentials.service';
import type { ProviderTier } from '../services/providers/types';

const router = Router();

router.get('/', requireAuth, async (req: AriaRequest, res, next) => {
  try {
    const tier = req.query.tier === 'coding' || req.query.tier === 'planning'
      ? req.query.tier as ProviderTier
      : undefined;
    res.json({ providers: await listCatalog(tier) });
  } catch (err) { next(err); }
});

router.get('/credentials', requireAuth, async (req: AriaRequest, res, next) => {
  try {
    const credentials = await listCredentials(req.user!.workspaceId);
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, req.user!.workspaceId),
    });
    res.json({
      credentials,
      activePlanningCredentialId: workspace?.activePlanningCredentialId ?? null,
      activeCodingCredentialId: workspace?.activeCodingCredentialId ?? null,
    });
  } catch (err) { next(err); }
});

router.post('/credentials', requireAuth, validate(createCredentialSchema), async (req: AriaRequest, res, next) => {
  try {
    const credential = await createCredential(req.user!.workspaceId, req.body);
    res.status(201).json({ credential });
  } catch (err) { next(err); }
});

router.post('/credentials/:id/test', requireAuth, validate(testCredentialSchema), async (req: AriaRequest, res, next) => {
  try {
    const out = await testCredential(req.user!.workspaceId, req.params.id, req.body);
    res.status(out.result.ok ? 200 : 422).json(out);
  } catch (err) { next(err); }
});

router.post('/credentials/:id/activate', requireAuth, validate(activateCredentialSchema), async (req: AriaRequest, res, next) => {
  try {
    const active = await activateCredential(
      req.user!.workspaceId,
      req.params.id,
      req.body.tier,
      req.body.projectId,
    );
    res.json(active);
  } catch (err) { next(err); }
});

router.post('/credentials/:id/retire', requireAuth, async (req: AriaRequest, res, next) => {
  try {
    const credential = await retireCredential(req.user!.workspaceId, req.params.id);
    res.json({ credential });
  } catch (err) { next(err); }
});

export default router;
