import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { db, workspaces } from '@aria/db';
import app from '../app';
import { decryptSecret } from '../services/crypto.service';
import { getPgPool } from '../services/db.client';
import { processNextAnalysisJob } from '../services/analysisWorker.service';
import { completeThroughGateway } from '../services/guardedLlm.service';

async function signup(email: string) {
  const res = await request(app).post('/api/auth/signup').send({
    name: 'Milestone Owner',
    email,
    password: 'Test1234!',
  });
    expect(res.status).toBe(201);
    return { token: res.body.accessToken as string, workspaceId: res.body.user.workspaceId as string };
  }

describe('milestone 1 setup integration', () => {
  it('stores secrets encrypted, builds a knowledge map, and refuses an OFF agent', async () => {
    const owner = await signup(`m1-${Date.now()}@aria.dev`);
    const token = owner.token;
    const auth = { Authorization: `Bearer ${token}` };

    const project = await request(app).post('/api/setup/project').set(auth).send({ name: 'Demo Shop' });
    expect(project.status).toBe(201);
    const projectId = project.body.project.id as string;

    const tested = await request(app).post('/api/workspace/llm-config/test').set(auth).send({
      provider: 'cursor',
      model: 'cursor-agent',
      apiKey: 'aria-mock-key',
    });
    expect(tested.status).toBe(200);
    expect(tested.body.ok).toBe(true);
    expect(JSON.stringify(tested.body)).not.toContain('aria-mock-key');

    const saved = await request(app).patch('/api/workspace/llm-config').set(auth).send({
      provider: 'cursor',
      model: 'cursor-agent',
      apiKey: 'aria-mock-key',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.config.hasApiKey).toBe(true);
    expect(saved.body.config.provider).toBe('cursor');
    expect(saved.body.config.topModel).toBeTruthy();
    expect(saved.body.config.autoModel).toBeTruthy();
    expect(JSON.stringify(saved.body)).not.toContain('aria-mock-key');
    const stored = await db.query.workspaces.findFirst({ where: eq(workspaces.id, owner.workspaceId) });
    expect(stored?.llmApiKeyEncrypted).toBeTruthy();
    expect(stored?.llmApiKeyEncrypted).not.toContain('aria-mock-key');
    expect(decryptSecret(stored!.llmApiKeyEncrypted!, { workspaceId: owner.workspaceId, column: 'llm_api_key_encrypted' })).toBe('aria-mock-key');

    const bad = await request(app).post('/api/github/token').set(auth).send({ token: 'aria-mock-github', extra: true });
    expect(bad.status).toBe(400);

    const connected = await request(app).post('/api/github/token').set(auth).send({ token: 'aria-mock-github' });
    expect(connected.status).toBe(200);
    expect(connected.body).toEqual({ connected: true });

    const repos = await request(app).get('/api/github/repos').set(auth);
    expect(repos.status).toBe(200);
    expect(repos.body.repos[0].fullName).toBe('acme/demo-app');
    expect(JSON.stringify(repos.body)).not.toContain('aria-mock-github');

    const linked = await request(app).post('/api/setup/repos').set(auth).send({
      projectId,
      repos: [{ fullName: 'acme/demo-app', branch: 'main' }],
    });
    expect(linked.status).toBe(201);
    for (let attempt = 0; attempt < 12; attempt++) {
      const rows = await getPgPool().query(`SELECT status FROM analysis_jobs WHERE project_id = $1`, [projectId]);
      const statuses = rows.rows.map((row: { status: string }) => row.status);
      if (statuses.length > 0 && statuses.every((status) => status === 'done')) break;
      expect(statuses).not.toContain('failed');
      if (await processNextAnalysisJob() === 'idle') break;
    }

    const knowledge = await request(app).get(`/api/projects/${projectId}/knowledge`).set(auth);
    expect(knowledge.status).toBe(200);
    expect(knowledge.body.flows.map((flow: { flowKey: string }) => flow.flowKey)).toEqual(
      expect.arrayContaining(['signup', 'login', 'homepage']),
    );

    const company = await request(app).post(`/api/projects/${projectId}/company`).set(auth).send({
      size: 8,
      mix: { business: 1, qa: 2, frontend: 1, backend: 1, fullstack: 1, junior: 0, aiml: 0, devops: 0, security: 0 },
    });
    expect(company.status).toBe(201);
    const agents = company.body.agents as Array<{ id: string; roleKey: string; realName: string; enabled: boolean; slug: string }>;
    expect(agents.some((agent) => agent.roleKey === 'ceo')).toBe(true);
    expect(new Set(agents.map((agent) => agent.realName)).size).toBe(agents.length);
    const specialist = agents.find((agent) => agent.roleKey !== 'ceo');
    expect(specialist).toBeTruthy();

    const toggled = await request(app).patch(`/api/projects/${projectId}/agents/${specialist!.id}`).set(auth).send({ enabled: false });
    expect(toggled.status).toBe(200);
    expect(toggled.body.agent.enabled).toBe(false);

    await expect(completeThroughGateway({
      workspaceId: owner.workspaceId,
      agentId: specialist!.id,
      taskType: 'coding',
      config: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'aria-mock-key' },
      messages: [{ role: 'user', content: 'Say hello' }],
    })).rejects.toMatchObject({ code: 'AGENT_DISABLED' });

    const other = await signup(`m1-other-${Date.now()}@aria.dev`);
    const denied = await request(app).get(`/api/projects/${projectId}/company`).set({ Authorization: `Bearer ${other.token}` });
    expect(denied.status).toBe(404);
  });
});
