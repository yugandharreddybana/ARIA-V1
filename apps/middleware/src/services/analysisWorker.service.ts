import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
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
  let queued = 0;
  for (const repo of repos) {
    const active = await db.query.analysisJobs.findFirst({
      where: and(
        eq(analysisJobs.projectId, projectId),
        eq(analysisJobs.repoId, repo.id),
        inArray(analysisJobs.status, ['queued', 'running']),
      ),
    });
    if (active) continue;
    await db.insert(analysisJobs).values({
      id: randomUUID(),
      projectId,
      repoId: repo.id,
      repoUrl: repo.repoUrl,
      branch: repo.branch,
      workspaceId,
      status: 'queued',
    });
    queued += 1;
  }
  return queued;
}

async function recoverStuckJobs(): Promise<void> {
  await getPgPool().query(
    `UPDATE analysis_jobs
        SET status = 'queued', updated_at = NOW(),
            error_message = 'Requeued after the worker stopped'
      WHERE status = 'running' AND updated_at < NOW() - INTERVAL '10 minutes'`,
  );
}

export async function processNextAnalysisJob(): Promise<'idle' | 'done' | 'failed'> {
  await recoverStuckJobs();
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
      if (extra.trim()) {
        const extraText = extra.trim().slice(0, 1800);
        const names = draft.flows.map((flow) => flow.name);
        const missing = names.filter((name) => !extraText.toLowerCase().includes(name.toLowerCase()));
        summary = missing.length ? `${extraText} Detected flows: ${names.join(', ')}.` : extraText;
      }
    } catch (err) {
      logger.info('Knowledge enrichment skipped', { jobId: job.id, message: err instanceof Error ? err.message : 'skipped' });
    }
  }

  await persistKnowledge(job, draft, summary, new Set(snapshot.paths));
  const resultSummary = `${draft.flows.length} flows, ${draft.modules.length} modules, ${draft.techStack.length} technologies`;
  await db.update(analysisJobs).set({
    status: 'done',
    resultSummary,
    errorMessage: null,
    updatedAt: new Date(),
  }).where(eq(analysisJobs.id, job.id));
  logger.info('Analysis job finished', { jobId: job.id, repo: job.repo_url, resultSummary });
  const pending = await getPgPool().query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM analysis_jobs WHERE project_id = $1::uuid AND status IN ('queued', 'running')`,
    [job.project_id],
  );
  if (Number(pending.rows[0]?.n ?? 0) === 0) {
    try {
      const map = await db.query.knowledgeMaps.findFirst({ where: eq(knowledgeMaps.projectId, job.project_id) });
      const stamp = map?.updatedAt ? new Date(map.updatedAt).toISOString() : 'draft';
      const { enqueue } = await import('./runs/runQueue');
      await enqueue({
        workspaceId: job.workspace_id,
        projectId: job.project_id,
        activity: 'knowledge_map',
        taskType: 'knowledge_map',
        runtime: 'cursor_local',
        idempotencyKey: `km:${job.project_id}:${stamp}`,
        input: { repoId: job.repo_id },
      });
    } catch (err) {
      logger.info('Knowledge map run was not queued', { projectId: job.project_id, message: err instanceof Error ? err.message.slice(0, 160) : 'skipped' });
    }
  }
}

function replaceRepoSlice<T>(previous: Array<T & { repoId?: string }>, repoId: string, next: T[]): Array<T & { repoId?: string }> {
  return [
    ...previous.filter((item) => item.repoId !== repoId),
    ...next.map((item) => ({ ...item, repoId })),
  ];
}

async function persistKnowledge(
  job: ClaimedJob,
  draft: ReturnType<typeof buildKnowledgeMap>,
  summary: string,
  repoPaths: Set<string>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx.query.knowledgeMaps.findFirst({ where: eq(knowledgeMaps.projectId, job.project_id) });
    const techStack = replaceRepoSlice((existing?.techStack as Array<typeof draft.techStack[number] & { repoId?: string }> | undefined) ?? [], job.repo_id, draft.techStack);
    const modules = replaceRepoSlice((existing?.modules as Array<typeof draft.modules[number] & { repoId?: string }> | undefined) ?? [], job.repo_id, draft.modules);
    const dataModel = replaceRepoSlice((existing?.dataModel as Array<typeof draft.dataModel[number] & { repoId?: string }> | undefined) ?? [], job.repo_id, draft.dataModel);
    const apis = replaceRepoSlice((existing?.apis as Array<typeof draft.apis[number] & { repoId?: string }> | undefined) ?? [], job.repo_id, draft.apis);
    const [map] = existing
      ? await tx.update(knowledgeMaps).set({
        techStack, modules, dataModel, apis, summary, updatedAt: new Date(),
      }).where(eq(knowledgeMaps.id, existing.id)).returning()
      : await tx.insert(knowledgeMaps).values({
        projectId: job.project_id,
        workspaceId: job.workspace_id,
        techStack, modules, dataModel, apis, summary,
      }).returning();

    const current = await tx.query.businessFlows.findMany({ where: eq(businessFlows.projectId, job.project_id) });
    const seen = new Set(draft.flows.map((flow) => flow.flowKey));
    for (const flow of draft.flows) {
      const row = current.find((item) => item.flowKey === flow.flowKey);
      const previous = Array.isArray(row?.entryPoints) ? row.entryPoints.filter((entry): entry is string => typeof entry === 'string') : [];
      const kept = previous.filter((entry) => !repoPaths.has(entry));
      const entryPoints = [...new Set([...kept, ...flow.entryPoints])];
      if (row) {
        await tx.update(businessFlows).set({
          knowledgeMapId: map.id,
          name: flow.name,
          kind: flow.kind,
          description: flow.description,
          entryPoints,
          updatedAt: new Date(),
        }).where(eq(businessFlows.id, row.id));
      } else {
        await tx.insert(businessFlows).values({
          projectId: job.project_id,
          knowledgeMapId: map.id,
          flowKey: flow.flowKey,
          name: flow.name,
          kind: flow.kind,
          description: flow.description,
          entryPoints,
        });
      }
    }
    for (const row of current) {
      if (seen.has(row.flowKey)) continue;
      const previous = Array.isArray(row.entryPoints) ? row.entryPoints.filter((entry): entry is string => typeof entry === 'string') : [];
      const kept = previous.filter((entry) => !repoPaths.has(entry));
      const owners = await getPgPool().query(`SELECT 1 FROM flow_owners WHERE flow_id = $1::uuid LIMIT 1`, [row.id]);
      const hasOwner = owners.rows.length > 0;
      if (kept.length === 0 && !hasOwner) {
        await tx.delete(businessFlows).where(eq(businessFlows.id, row.id));
      } else if (kept.length !== previous.length) {
        await tx.update(businessFlows).set({ entryPoints: kept, updatedAt: new Date() }).where(eq(businessFlows.id, row.id));
      }
    }
  });
}
