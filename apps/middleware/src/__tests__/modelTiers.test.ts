import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../app';
import { completeThroughGateway } from '../services/guardedLlm.service';
import {
  CURSOR_AUTO_MODEL,
  CURSOR_TOP_MODEL,
  TASK_TYPES,
  cursorWireSelection,
  defaultTierModels,
  resolveModelRoute,
  taskClassOf,
} from '../services/modelTiers';

describe('model tiers', () => {
  it('sends planning to the top model and development to Auto', () => {
    for (const taskType of TASK_TYPES) {
      const route = resolveModelRoute({ provider: 'cursor', taskType });
      if (taskClassOf(taskType) === 'planning') {
        expect(route.tier).toBe('top');
        expect(route.modelId).toBe(CURSOR_TOP_MODEL);
      } else {
        expect(route.tier).toBe('auto');
        expect(route.modelId).toBe(CURSOR_AUTO_MODEL);
      }
    }
  });

  it('uses a premium model and a standard model for other providers', () => {
    for (const provider of ['gemini', 'groq', 'openai', 'anthropic', 'nvidia'] as const) {
      const models = defaultTierModels(provider);
      expect(models.top).not.toBe(models.auto);
      expect(resolveModelRoute({ provider, taskType: 'architecture' }).modelId).toBe(models.top);
      expect(resolveModelRoute({ provider, taskType: 'tests' }).modelId).toBe(models.auto);
    }
    expect(defaultTierModels('ollama', 'qwen2.5-coder:7b')).toEqual({
      top: 'qwen2.5-coder:7b',
      auto: 'qwen2.5-coder:7b',
    });
  });

  it('lets the project and the agent override the tier and the model id', () => {
    const project = resolveModelRoute({
      provider: 'openai',
      taskType: 'coding',
      projectTaskTiers: { development: 'top' },
    });
    expect(project.modelId).toBe(defaultTierModels('openai').top);
    expect(project.source).toBe('project_tier');

    const agent = resolveModelRoute({
      provider: 'cursor',
      taskType: 'security_review',
      projectTaskTiers: { planning: 'top' },
      agentTaskTiers: { planning: 'auto' },
    });
    expect(agent.modelId).toBe(CURSOR_AUTO_MODEL);
    expect(agent.source).toBe('agent_tier');

    const pinned = resolveModelRoute({
      provider: 'cursor',
      taskType: 'knowledge_map',
      projectTierModels: { top: 'composer-2' },
      agentModelOverride: 'claude-4.6-sonnet-thinking',
    });
    expect(pinned).toMatchObject({ modelId: 'claude-4.6-sonnet-thinking', tier: 'override', source: 'agent_model' });

    const customTop = resolveModelRoute({
      provider: 'cursor',
      taskType: 'idea_analysis',
      projectTierModels: { top: 'composer-2' },
    });
    expect(customTop.modelId).toBe('composer-2');
  });

  it('maps Cursor Auto onto the Cloud Agents router id', () => {
    expect(cursorWireSelection(CURSOR_AUTO_MODEL)).toEqual({
      id: 'auto-smart',
      params: [{ id: 'optimize_for', value: 'cost' }],
    });
    expect(cursorWireSelection(CURSOR_TOP_MODEL)).toEqual({ id: CURSOR_TOP_MODEL });
  });

  it('queues the resolved model and names it when Cursor cannot complete', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const planning = await completeThroughGateway({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      agentId: 'analyst',
      taskType: 'knowledge_map',
      config: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'aria-mock-key' },
      messages: [{ role: 'user', content: 'Summarize the signup module.' }],
    });
    expect(planning).toContain(`[${defaultTierModels('openai').top}]`);

    const routine = await completeThroughGateway({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      agentId: 'coder',
      taskType: 'fixes',
      config: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'aria-mock-key' },
      messages: [{ role: 'user', content: 'Fix the failing test.' }],
    });
    expect(routine).toContain(`[${defaultTierModels('openai').auto}]`);

    await expect(completeThroughGateway({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      agentId: 'coder',
      taskType: 'coding',
      config: { provider: 'cursor', model: 'cursor-agent', apiKey: 'aria-mock-key' },
      messages: [{ role: 'user', content: 'Update the readme.' }],
    })).rejects.toThrow(/model auto/);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('model tier API', () => {
  it('saves project and agent overrides and keeps them inside the workspace', async () => {
    const signup = await request(app).post('/api/auth/signup').send({
      name: 'Tier Owner',
      email: `tiers-${Date.now()}@aria.dev`,
      password: 'Test1234!',
    });
    expect(signup.status).toBe(201);
    const token = signup.body.accessToken as string;
    const workspaceId = signup.body.user.workspaceId as string;
    const auth = { Authorization: `Bearer ${token}` };

    const saved = await request(app).patch('/api/workspace/llm-config').set(auth).send({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'aria-mock-key',
    });
    expect(saved.status).toBe(200);
    expect(JSON.stringify(saved.body)).not.toContain('aria-mock-key');

    const project = await request(app).post('/api/setup/project').set(auth).send({ name: 'Tier Shop' });
    expect(project.status).toBe(201);
    const projectId = project.body.project.id as string;

    const company = await request(app).post(`/api/projects/${projectId}/company`).set(auth).send({
      size: 3,
      mix: { business: 0, qa: 0, frontend: 0, backend: 0, fullstack: 0, junior: 0, aiml: 0, devops: 0, security: 0 },
      modelTiers: { planning: 'top', development: 'auto', autoModel: 'gpt-4o-mini' },
    });
    expect(company.status).toBe(201);
    expect(company.body.modelTiers.planningModel).toBe(defaultTierModels('openai').top);
    expect(company.body.modelTiers.developmentModel).toBe('gpt-4o-mini');
    expect(JSON.stringify(company.body)).not.toContain('aria-mock-key');

    const agent = company.body.agents[0] as { id: string };
    const patched = await request(app).patch(`/api/projects/${projectId}/agents/${agent.id}`).set(auth).send({
      planningTier: 'auto',
      modelOverride: 'gpt-4o-mini',
    });
    expect(patched.status).toBe(200);
    expect(patched.body.agent.planningTier).toBe('auto');
    expect(patched.body.agent.modelOverride).toBe('gpt-4o-mini');

    const text = await completeThroughGateway({
      workspaceId,
      projectId,
      agentId: agent.id,
      taskType: 'knowledge_map',
      config: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'aria-mock-key' },
      messages: [{ role: 'user', content: 'Describe the homepage.' }],
    });
    expect(text).toContain('[gpt-4o-mini]');

    const other = await request(app).post('/api/auth/signup').send({
      name: 'Other Owner',
      email: `tiers-other-${Date.now()}@aria.dev`,
      password: 'Test1234!',
    });
    const denied = await request(app).patch(`/api/projects/${projectId}/model-tiers`).set({
      Authorization: `Bearer ${other.body.accessToken}`,
    }).send({ planning: 'auto', development: 'auto' });
    expect(denied.status).toBe(404);

    const bad = await request(app).patch(`/api/projects/${projectId}/model-tiers`).set(auth).send({
      planning: 'premium',
      development: 'auto',
    });
    expect(bad.status).toBe(400);
  });
});
