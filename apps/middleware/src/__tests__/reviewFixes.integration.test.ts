import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { db, tickets, workspaces } from '@aria/db';
import app from '../app';
import { getPgPool } from '../services/db.client';
import { processNextAnalysisJob } from '../services/analysisWorker.service';
import { completeThroughGateway } from '../services/guardedLlm.service';
import { monthlyBucketId } from '../services/runs/budget';

const MIX = { business: 1, qa: 2, frontend: 1, backend: 1, fullstack: 1, junior: 0, aiml: 0, devops: 0, security: 0 };

async function signup(email: string) {
  const res = await request(app).post('/api/auth/signup').send({
    name: 'Review Owner',
    email,
    password: 'Test1234!',
  });
  expect(res.status).toBe(201);
  return {
    token: res.body.accessToken as string,
    workspaceId: res.body.user.workspaceId as string,
    auth: { Authorization: `Bearer ${res.body.accessToken as string}` },
  };
}

async function jobStatuses(projectId: string): Promise<string[]> {
  const result = await getPgPool().query(`SELECT status FROM analysis_jobs WHERE project_id = $1`, [projectId]);
  return result.rows.map((row: { status: string }) => row.status);
}

async function finishProjectJobs(projectId: string): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const statuses = await jobStatuses(projectId);
    if (statuses.some((status) => status === 'failed')) {
      throw new Error(`analysis failed: ${statuses.join(',')}`);
    }
    if (statuses.length > 0 && statuses.every((status) => status === 'done')) return;
    const step = await processNextAnalysisJob();
    if (step === 'idle') break;
  }
  const statuses = await jobStatuses(projectId);
  expect(statuses.every((status) => status === 'done')).toBe(true);
}

async function analyzedProject(label: string) {
  const owner = await signup(`${label}-${Date.now()}@aria.dev`);
  const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: label });
  expect(project.status).toBe(201);
  const projectId = project.body.project.id as string;
  await request(app).patch('/api/workspace/llm-config').set(owner.auth).send({
    provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'aria-mock-key',
  });
  expect((await request(app).post('/api/github/token').set(owner.auth).send({ token: 'aria-mock-github' })).status).toBe(200);
  const linked = await request(app).post('/api/setup/repos').set(owner.auth).send({
    projectId,
    repos: [{ fullName: 'acme/demo-app', branch: 'main' }],
  });
  expect(linked.status).toBe(201);
  const duplicate = await request(app).post('/api/setup/analyze').set(owner.auth).send({ projectId });
  expect(duplicate.status).toBe(202);
  expect(duplicate.body.queued).toBe(0);
  await finishProjectJobs(projectId);
  return { owner, projectId };
}

describe('review fixes', () => {
  it('rejects unsafe repo names and a caller-supplied base URL on a fixed host', async () => {
    const owner = await signup(`names-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Names' });
    const projectId = project.body.project.id as string;
    const evil = await request(app).post('/api/setup/repos').set(owner.auth).send({
      projectId,
      repos: [{ fullName: 'https://evil.example/github.com/a/b' }],
    });
    expect(evil.status).toBe(400);
    const dots = await request(app).post('/api/setup/repos').set(owner.auth).send({
      projectId,
      repos: [{ fullName: '../secret' }],
    });
    expect(dots.status).toBe(400);

    const saved = await request(app).patch('/api/workspace/llm-config').set(owner.auth).send({
      provider: 'cursor',
      model: 'cursor-agent',
      apiKey: 'aria-mock-key',
      baseUrl: 'https://evil.example',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.config.baseUrl).toBeNull();
  });

  it('merges two repos, keeps flow owners, and requeues a stuck job', async () => {
    const owner = await signup(`repos-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Repos' });
    const projectId = project.body.project.id as string;
    expect((await request(app).post('/api/github/token').set(owner.auth).send({ token: 'aria-mock-github' })).status).toBe(200);
    const linked = await request(app).post('/api/setup/repos').set(owner.auth).send({
      projectId,
      repos: [
        { fullName: 'acme/demo-app', branch: 'main' },
        { fullName: 'acme/other-app', branch: 'main' },
      ],
    });
    expect(linked.status).toBe(201);
    expect(linked.body.queued).toBe(2);
    await finishProjectJobs(projectId);

    const company = await request(app).post(`/api/projects/${projectId}/company`).set(owner.auth).send({ size: 8, mix: MIX });
    expect(company.status).toBe(201);
    const knowledge = await request(app).get(`/api/projects/${projectId}/knowledge`).set(owner.auth);
    const repoIds = new Set((knowledge.body.map.techStack as Array<{ repoId?: string }>).map((item) => item.repoId));
    expect(repoIds.size).toBe(2);
    const flow = knowledge.body.flows[0] as { id: string; ownerAgentId: string };
    expect(flow.ownerAgentId).toBeTruthy();

    const again = await request(app).post('/api/setup/analyze').set(owner.auth).send({ projectId });
    expect(again.body.queued).toBe(2);
    await finishProjectJobs(projectId);
    const kept = await request(app).get(`/api/projects/${projectId}/knowledge`).set(owner.auth);
    const same = (kept.body.flows as Array<{ id: string; ownerAgentId: string }>).find((item) => item.id === flow.id);
    expect(same?.ownerAgentId).toBe(flow.ownerAgentId);

    for (let attempt = 0; attempt < 12; attempt++) {
      if (await processNextAnalysisJob() === 'idle') break;
    }
    await getPgPool().query(
      `UPDATE analysis_jobs SET status = 'running', updated_at = NOW() WHERE project_id = $1`,
      [projectId],
    );
    expect(await processNextAnalysisJob()).toBe('idle');
    expect((await jobStatuses(projectId)).every((status) => status === 'running')).toBe(true);

    await getPgPool().query(
      `UPDATE analysis_jobs SET status = 'running', updated_at = NOW() - INTERVAL '20 minutes' WHERE project_id = $1`,
      [projectId],
    );
    expect(await processNextAnalysisJob()).toBe('done');
    expect((await jobStatuses(projectId)).every((status) => status !== 'running')).toBe(true);
  });

  it('refuses regeneration while tickets exist unless force is set, and promotes a backup', async () => {
    const { owner, projectId } = await analyzedProject('regen');
    const company = await request(app).post(`/api/projects/${projectId}/company`).set(owner.auth).send({ size: 8, mix: MIX });
    expect(company.status).toBe(202);
    await db.insert(tickets).values({
      projectId,
      type: 'feature',
      title: 'Keep this ticket',
      description: 'Regeneration must not delete it unless force is set.',
    });
    const blocked = await request(app).post(`/api/projects/${projectId}/company`).set(owner.auth).send({ size: 8, mix: MIX });
    expect(blocked.status).toBe(409);

    const knowledge = await request(app).get(`/api/projects/${projectId}/knowledge`).set(owner.auth);
    const flow = (knowledge.body.flows as Array<{ id: string; ownerAgentId: string | null; backupAgentId: string | null }>)
      .find((item) => item.ownerAgentId && item.backupAgentId);
    expect(flow).toBeTruthy();
    const removed = await request(app).delete(`/api/projects/${projectId}/agents/${flow!.ownerAgentId}`).set(owner.auth);
    expect(removed.status).toBe(204);
    const after = await request(app).get(`/api/projects/${projectId}/knowledge`).set(owner.auth);
    const promoted = (after.body.flows as Array<{ id: string; ownerAgentId: string | null }>).find((item) => item.id === flow!.id);
    expect(promoted?.ownerAgentId).toBe(flow!.backupAgentId);

    const forced = await request(app).post(`/api/projects/${projectId}/company`).set(owner.auth).send({ size: 8, mix: MIX, force: true });
    expect(forced.status).toBe(202);
    expect(forced.body.agents.some((agent: { roleKey: string; enabled: boolean }) => agent.roleKey === 'documentation' && agent.enabled === false)).toBe(true);
    expect(forced.body.agents.some((agent: { roleKey: string; enabled: boolean }) => agent.roleKey === 'pr_coordinator' && agent.enabled === false)).toBe(true);
  });

  it('blocks every mutating route from another workspace and a foreign manager', async () => {
    const { owner, projectId } = await analyzedProject('scope');
    const company = await request(app).post(`/api/projects/${projectId}/company`).set(owner.auth).send({ size: 8, mix: MIX });
    const agentId = company.body.agents[0].id as string;
    const other = await signup(`scope-other-${Date.now()}@aria.dev`);
    const own = await request(app).post('/api/setup/project').set(other.auth).send({ name: 'Other' });
    const otherProject = own.body.project.id as string;

    const routes: Array<{ method: 'post' | 'patch' | 'delete'; url: string; body?: unknown }> = [
      { method: 'post', url: '/api/setup/repos', body: { projectId, repos: [{ fullName: 'acme/demo-app' }] } },
      { method: 'post', url: '/api/setup/analyze', body: { projectId } },
      { method: 'patch', url: `/api/projects/${projectId}/model-tiers`, body: { planning: 'top', development: 'auto' } },
      { method: 'patch', url: `/api/projects/${projectId}/agents/${agentId}`, body: { enabled: false } },
      { method: 'delete', url: `/api/projects/${projectId}/agents/${agentId}` },
      { method: 'post', url: `/api/projects/${projectId}/agents`, body: { realName: 'Intruder', roleTitle: 'Engineer', roleKey: 'fullstack', instructions: 'Do not create this agent.' } },
    ];
    for (const route of routes) {
      const sent = request(app)[route.method](route.url).set(other.auth);
      const res = route.body ? await sent.send(route.body) : await sent;
      expect(res.status).toBe(404);
    }

    const foreignManager = await request(app).post(`/api/projects/${otherProject}/agents`).set(other.auth).send({
      realName: 'Pat Manager',
      roleTitle: 'Engineer',
      roleKey: 'fullstack',
      instructions: 'This manager id belongs to another project.',
      managerId: agentId,
    });
    expect(foreignManager.status).toBe(400);

    const legacy = await request(app).post(`/api/projects/${projectId}/skills`).set(owner.auth).send({ name: 'shadow' });
    expect(legacy.status).toBe(410);
  });

  it('accumulates token usage on one gateway ledger', async () => {
    const owner = await signup(`ledger-${Date.now()}@aria.dev`);
    const pool = getPgPool();
    const read = async () => {
      const result = await pool.query(
        `SELECT COALESCE(SUM(tokens_used), 0)::int AS used FROM token_ledger WHERE session_id = $1`,
        [monthlyBucketId(owner.workspaceId)],
      );
      return result.rows[0].used as number;
    };
    const before = await read();
    const call = () => completeThroughGateway({
      workspaceId: owner.workspaceId,
      agentId: 'coder',
      taskType: 'coding',
      config: { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'aria-mock-key' },
      messages: [{ role: 'user', content: 'Say hello from the ledger test.' }],
    });
    await call();
    await call();
    expect(await read()).toBeGreaterThan(before);
  });

  it('does not treat the mock key as live credentials', async () => {
    const previousLlm = process.env.ARIA_LLM_MODE;
    const previousGithub = process.env.ARIA_GITHUB_MODE;
    const previousCursor = process.env.CURSOR_API_BASE;
    const previousGithubBase = process.env.GITHUB_API_BASE;
    process.env.ARIA_LLM_MODE = 'live';
    process.env.ARIA_GITHUB_MODE = 'live';
    process.env.CURSOR_API_BASE = 'http://127.0.0.1:1';
    process.env.GITHUB_API_BASE = 'http://127.0.0.1:1';
    try {
      const owner = await signup(`live-${Date.now()}@aria.dev`);
      const tested = await request(app).post('/api/workspace/llm-config/test').set(owner.auth).send({
        provider: 'cursor', model: 'cursor-agent', apiKey: 'aria-mock-key',
      });
      expect(tested.status).toBe(422);
      expect(tested.body.ok).toBe(false);
      expect(String(tested.body.message).toLowerCase()).not.toContain('mock');
      const repos = await request(app).post('/api/github/token').set(owner.auth).send({ token: 'aria-mock-github' });
      expect(repos.status).toBe(200);
      const listed = await request(app).get('/api/github/repos').set(owner.auth);
      expect(listed.status).not.toBe(200);
    } finally {
      process.env.ARIA_LLM_MODE = previousLlm;
      process.env.ARIA_GITHUB_MODE = previousGithub;
      process.env.CURSOR_API_BASE = previousCursor;
      process.env.GITHUB_API_BASE = previousGithubBase;
    }
  });

  it('stores model ids returned by the provider catalog', async () => {
    const previousLlm = process.env.ARIA_LLM_MODE;
    const previousCursor = process.env.CURSOR_API_BASE;
    const child: ChildProcess = spawn(process.execPath, [path.resolve(__dirname, '../../../../scripts/provider-stub.mjs')], {
      env: { ...process.env, STUB_PORT: '4019' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('stub did not start')), 5000);
      child.stdout?.on('data', () => { clearTimeout(timer); resolve(); });
      child.on('error', reject);
    });
    process.env.ARIA_LLM_MODE = 'live';
    process.env.CURSOR_API_BASE = 'http://127.0.0.1:4019';
    try {
      const owner = await signup(`catalog-${Date.now()}@aria.dev`);
      const tested = await request(app).post('/api/workspace/llm-config/test').set(owner.auth).send({
        provider: 'cursor', model: 'cursor-agent', apiKey: 'live-stub-key',
      });
      expect(tested.body.ok).toBe(true);
      expect(tested.body.topModel).toBe('claude-opus-5');
      expect(tested.body.autoModel).toBe('auto');
      const saved = await request(app).patch('/api/workspace/llm-config').set(owner.auth).send({
        provider: 'cursor', model: 'cursor-agent', apiKey: 'live-stub-key',
      });
      expect(saved.status).toBe(200);
      expect(saved.body.config.topModel).toBe('claude-opus-5');
      expect(saved.body.config.autoModel).toBe('auto');
      const unknown = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Catalog' });
      const rejected = await request(app).patch(`/api/projects/${unknown.body.project.id}/model-tiers`).set(owner.auth).send({
        planning: 'top', development: 'auto', topModel: 'claude-4.6-opus-thinking',
      });
      expect(rejected.status).toBe(422);
    } finally {
      process.env.ARIA_LLM_MODE = previousLlm;
      process.env.CURSOR_API_BASE = previousCursor;
      child.kill();
    }
  });

  it('rejects a model id missing from an object-shaped catalog', async () => {
    const owner = await signup(`catalog-shape-${Date.now()}@aria.dev`);
    // Only the catalog shape matters here. Do not touch llm_provider — older local
    // databases still store that column as an enum without every provider id.
    await db.update(workspaces).set({
      llmModelCatalog: [{ id: 'claude-opus-5' }, { id: 'auto', aliases: ['auto-smart'] }],
    }).where(eq(workspaces.id, owner.workspaceId));
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Catalog shape' });
    expect(project.status).toBe(201);
    const rejected = await request(app).patch(`/api/projects/${project.body.project.id}/model-tiers`).set(owner.auth).send({
      planning: 'top',
      development: 'auto',
      topModel: 'not-a-real-model',
    });
    expect(rejected.status).toBe(422);
    expect(rejected.body.error).toMatch(/not in the provider catalog/);
    const accepted = await request(app).patch(`/api/projects/${project.body.project.id}/model-tiers`).set(owner.auth).send({
      planning: 'top',
      development: 'auto',
      topModel: 'auto-smart',
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.modelTiers.planningModel).toBe('auto-smart');
  });
});
