import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db, projects } from '@aria/db';
import { requireAuth, type AriaRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { AppError } from '../middleware/error.middleware';
import {
  agentCreateSchema,
  agentPatchSchema,
  analyzeSchema,
  companyGenerateSchema,
  connectReposSchema,
  flowAssignSchema,
  githubTokenSchema,
  modelTierPatchSchema,
  setupProjectSchema,
} from '../schemas/setup.schema';
import { createProject, connectRepo } from '../services/projects.service';
import { parseRepoFullName } from '../services/githubClient.service';
import { saveGithubToken, listGithubRepos } from '../services/githubClient.service';
import { enqueueProjectAnalysis } from '../services/analysisWorker.service';
import {
  createAgent,
  deleteAgent,
  assignFlow,
  generateProjectCompany,
  getCompany,
  getKnowledge,
  getSetupState,
  updateAgent,
  updateModelTiers,
} from '../services/company.service';

const router = Router();

router.get('/state', requireAuth, async (req: AriaRequest, res, next) => {
  try {
    res.json(await getSetupState(req.user!.workspaceId));
  } catch (err) { next(err); }
});

router.post('/project', requireAuth, validate(setupProjectSchema), async (req: AriaRequest, res, next) => {
  try {
    const project = await createProject(req.user!.workspaceId, req.body.name, req.body.description);
    res.status(201).json({ project: { id: project.id, name: project.name, description: project.description } });
  } catch (err) { next(err); }
});

router.post('/repos', requireAuth, validate(connectReposSchema), async (req: AriaRequest, res, next) => {
  try {
    const workspaceId = req.user!.workspaceId;
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, req.body.projectId), eq(projects.workspaceId, workspaceId)),
    });
    if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');
    const connected = [];
    for (const repo of req.body.repos as Array<{ fullName: string; branch: string }>) {
      const parsed = parseRepoFullName(repo.fullName);
      const repoUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;
      connected.push(await connectRepo(project.id, workspaceId, repoUrl, repo.branch));
    }
    const queued = await enqueueProjectAnalysis(project.id, workspaceId);
    res.status(201).json({
      repos: connected.map((repo) => ({ id: repo.id, repoName: repo.repoName, branch: repo.branch })),
      queued,
    });
  } catch (err) { next(err); }
});

router.post('/analyze', requireAuth, validate(analyzeSchema), async (req: AriaRequest, res, next) => {
  try {
    const workspaceId = req.user!.workspaceId;
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, req.body.projectId), eq(projects.workspaceId, workspaceId)),
    });
    if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');
    const queued = await enqueueProjectAnalysis(project.id, workspaceId);
    res.status(202).json({ queued });
  } catch (err) { next(err); }
});

export default router;

export const githubConnectRouter = Router();
githubConnectRouter.use(requireAuth);
githubConnectRouter.post('/token', validate(githubTokenSchema), async (req: AriaRequest, res, next) => {
  try {
    await saveGithubToken(req.user!.workspaceId, req.body.token);
    res.json({ connected: true });
  } catch (err) { next(err); }
});
githubConnectRouter.get('/repos', async (req: AriaRequest, res, next) => {
  try {
    const repos = await listGithubRepos(req.user!.workspaceId);
    res.json({ repos });
  } catch (err) { next(err); }
});

export const projectInsightRouter = Router();
projectInsightRouter.use(requireAuth);

projectInsightRouter.get('/:projectId/knowledge', async (req: AriaRequest, res, next) => {
  try {
    res.json(await getKnowledge(req.params.projectId, req.user!.workspaceId));
  } catch (err) { next(err); }
});

projectInsightRouter.get('/:projectId/company', async (req: AriaRequest, res, next) => {
  try {
    res.json(await getCompany(req.params.projectId, req.user!.workspaceId));
  } catch (err) { next(err); }
});

projectInsightRouter.post('/:projectId/company', validate(companyGenerateSchema), async (req: AriaRequest, res, next) => {
  try {
    const company = await generateProjectCompany(
      req.params.projectId,
      req.user!.workspaceId,
      req.body.size,
      req.body.mix,
      req.body.modelTiers,
      req.body.force === true,
    );
    res.status(201).json(company);
  } catch (err) { next(err); }
});

projectInsightRouter.patch('/:projectId/model-tiers', validate(modelTierPatchSchema), async (req: AriaRequest, res, next) => {
  try {
    const company = await updateModelTiers(req.params.projectId, req.user!.workspaceId, req.body);
    res.json(company);
  } catch (err) { next(err); }
});

projectInsightRouter.post('/:projectId/agents', validate(agentCreateSchema), async (req: AriaRequest, res, next) => {
  try {
    const agent = await createAgent(req.params.projectId, req.user!.workspaceId, req.body);
    res.status(201).json({ agent });
  } catch (err) { next(err); }
});

projectInsightRouter.patch('/:projectId/agents/:agentId', validate(agentPatchSchema), async (req: AriaRequest, res, next) => {
  try {
    const agent = await updateAgent(req.params.projectId, req.user!.workspaceId, req.params.agentId, req.body);
    res.json({ agent });
  } catch (err) { next(err); }
});

projectInsightRouter.patch('/:projectId/flows/:flowId', validate(flowAssignSchema), async (req: AriaRequest, res, next) => {
  try {
    const company = await assignFlow(req.params.projectId, req.user!.workspaceId, req.params.flowId, req.body);
    res.json(company);
  } catch (err) { next(err); }
});

projectInsightRouter.delete('/:projectId/agents/:agentId', async (req: AriaRequest, res, next) => {
  try {
    await deleteAgent(req.params.projectId, req.user!.workspaceId, req.params.agentId);
    res.status(204).end();
  } catch (err) { next(err); }
});
