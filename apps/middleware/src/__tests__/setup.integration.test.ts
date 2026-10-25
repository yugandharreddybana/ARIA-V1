import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import { processNextAnalysisJob } from '../services/analysisWorker.service';
import { completeThroughGateway } from '../services/guardedLlm.service';

async function signup(email: string) {
  const res = await request(app).post('/api/auth/signup').send({
    name: 'Milestone Owner',
    email,
    password: 'Test1234!',
  });
  expect(res.status).toBe(201);
  return res.body.accessToken as string;
}

describe('milestone 1 setup integration', () => {
  it('stores secrets encrypted, builds a knowledge map, and refuses an OFF agent', async () => {
    const token = await signup(`m1-${Date.now()}@aria.dev`);
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
    expect(JSON.stringify(saved.body)).not.toContain('aria-mock-key');

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
    expect(await processNextAnalysisJob()).toBe('done');

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
      workspaceId: project.body.project.id,
      agentId: specialist!.id,
      taskType: 'coding',
      config: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'aria-mock-key' },
      messages: [{ role: 'user', content: 'Say hello' }],
    })).rejects.toMatchObject({ code: 'AGENT_DISABLED' });

    const other = await signup(`m1-other-${Date.now()}@aria.dev`);
    const denied = await request(app).get(`/api/projects/${projectId}/company`).set({ Authorization: `Bearer ${other}` });
    expect(denied.status).toBe(404);
  });
});
