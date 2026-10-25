import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { analysisJobs, businessFlows, db, knowledgeMaps, projectRepos, projects } from '@aria/db';
import { getPgPool } from './db.client';
import { logger } from '../config/logger';
import { readGithubToken, readRepository } from './githubClient.service';
import { buildKnowledgeMap } from './knowledgeMap';
import { completeThroughGateway, loadWorkspaceLlm } from './guardedLlm.service';

interface ClaimedJob {
  id: string;
  project_id: string;
  repo_id: string;
  repo_url: string;
  branch: string;
  workspace_id: string;
}

let timer: NodeJS.Timeout | null = null;
let ticking = false;

export function startAnalysisWorker(intervalMs = 2000): void {
  if (timer) return;
  timer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    processNextAnalysisJob()
      .catch((err) => {
        logger.error('Analysis worker tick failed', { message: err instanceof Error ? err.message : 'error' });
      })
      .finally(() => { ticking = false; });
  }, intervalMs);
  timer.unref?.();
}

export function stopAnalysisWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function enqueueProjectAnalysis(projectId: string, workspaceId: string): Promise<number> {
  const repos = await db.query.projectRepos.findMany({ where: eq(projectRepos.projectId, projectId) });
  for (const repo of repos) {
    await db.insert(analysisJobs).values({
      id: randomUUID(),
      projectId,
      repoId: repo.id,
      repoUrl: repo.repoUrl,
      branch: repo.branch,
      workspaceId,
      status: 'queued',
    });
  }
  return repos.length;
}

export async function processNextAnalysisJob(): Promise<'idle' | 'done' | 'failed'> {
  const job = await claimJob();
  if (!job) return 'idle';
  try {
    await runJob(job);
    return 'done';
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    await db.update(analysisJobs).set({
      status: 'failed',
      errorMessage: message.slice(0, 500),
      updatedAt: new Date(),
    }).where(eq(analysisJobs.id, job.id));
    logger.error('Analysis job failed', { jobId: job.id, message: message.slice(0, 200) });
    return 'failed';
  }
}

async function claimJob(): Promise<ClaimedJob | null> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query<{ id: string }>(
      `SELECT id FROM analysis_jobs WHERE status = 'queued' ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    if (!selected.rows[0]) {
      await client.query('COMMIT');
      return null;
    }
    const updated = await client.query<ClaimedJob>(
      `UPDATE analysis_jobs SET status = 'running', updated_at = NOW() WHERE id = $1 RETURNING id, project_id, repo_id, repo_url, branch, workspace_id`,
      [selected.rows[0].id],
    );
    await client.query('COMMIT');
    return updated.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function runJob(job: ClaimedJob): Promise<void> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, job.project_id),
  });
  if (!project || project.workspaceId !== job.workspace_id) {
    throw new Error('Project does not belong to the job workspace');
  }
  const token = await readGithubToken(job.workspace_id);
  const snapshot = await readRepository(token, job.repo_url, job.branch || 'main');
  const draft = buildKnowledgeMap(snapshot.paths, snapshot.files);
  let summary = draft.summary;
  const llm = await loadWorkspaceLlm(job.workspace_id);
  if (llm) {
    try {
      const extra = await completeThroughGateway({
        workspaceId: job.workspace_id,
        projectId: job.project_id,
        agentId: 'analyst',
        skillSlug: 'analyst',
        taskType: 'knowledge_map',
        config: llm,
        messages: [
          { role: 'system', content: 'Summarize this repository map in two sentences. Do not invent files.' },
          { role: 'user', content: draft.summary },
        ],
      });
      if (extra.trim()) summary = extra.trim().slice(0, 2000);
    } catch (err) {
      logger.info('Knowledge enrichment skipped', { jobId: job.id, message: err instanceof Error ? err.message : 'skipped' });
    }
  }

  await db.delete(businessFlows).where(eq(businessFlows.projectId, job.project_id));
  await db.delete(knowledgeMaps).where(eq(knowledgeMaps.projectId, job.project_id));
  const [map] = await db.insert(knowledgeMaps).values({
    projectId: job.project_id,
    workspaceId: job.workspace_id,
    techStack: draft.techStack,
    modules: draft.modules,
    dataModel: draft.dataModel,
    apis: draft.apis,
    summary,
  }).returning();
  if (draft.flows.length) {
    await db.insert(businessFlows).values(draft.flows.map((flow) => ({
      projectId: job.project_id,
      knowledgeMapId: map.id,
      flowKey: flow.flowKey,
      name: flow.name,
      kind: flow.kind,
      description: flow.description,
      entryPoints: flow.entryPoints,
    })));
  }
  const resultSummary = `${draft.flows.length} flows, ${draft.modules.length} modules, ${draft.techStack.length} technologies`;
  await db.update(analysisJobs).set({
    status: 'done',
    resultSummary,
    errorMessage: null,
    updatedAt: new Date(),
  }).where(eq(analysisJobs.id, job.id));
  logger.info('Analysis job finished', { jobId: job.id, repo: job.repo_url, resultSummary });
}
