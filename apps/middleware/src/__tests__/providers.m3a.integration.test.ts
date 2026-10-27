import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';
import { getPgPool } from '../services/db.client';

async function signup() {
  const email = `m3a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aria.dev`;
  const res = await request(app).post('/api/auth/signup').send({
    name: 'M3A Owner',
    email,
    password: 'Test1234!',
  });
  expect(res.status).toBe(201);
  return { auth: { Authorization: `Bearer ${res.body.accessToken}` }, workspaceId: res.body.user.workspaceId as string };
}

describe('M3A provider credentials API', () => {
  it('lists capability-filtered providers and never returns secrets', async () => {
    const { auth } = await signup();
    const planning = await request(app).get('/api/providers?tier=planning').set(auth);
    const coding = await request(app).get('/api/providers?tier=coding').set(auth);
    expect(planning.status).toBe(200);
    expect(coding.status).toBe(200);
    expect(coding.body.providers.map((p: { id: string }) => p.id)).toEqual([
      'cursor', 'claude_code', 'codex', 'antigravity',
    ]);
    expect(coding.body.providers.some((p: { id: string }) => p.id === 'ollama')).toBe(false);

    const created = await request(app).post('/api/providers/credentials').set(auth).send({
      provider: 'cursor',
      label: 'work',
      apiKey: 'aria-mock-key-work',
    });
    expect(created.status).toBe(201);
    expect(created.body.credential.apiKey).toBeUndefined();
    expect(created.body.credential.apiKeyEncrypted).toBeUndefined();
    expect(JSON.stringify(created.body)).not.toMatch(/gcm:v2:/);

    const tested = await request(app).post(`/api/providers/credentials/${created.body.credential.id}/test`).set(auth).send({});
    expect(tested.status).toBe(200);
    expect(tested.body.result.ok).toBe(true);
    expect(JSON.stringify(tested.body)).not.toMatch(/gcm:v2:|aria-mock-key/);

    const activated = await request(app).post(`/api/providers/credentials/${created.body.credential.id}/activate`).set(auth).send({
      tier: 'planning',
    });
    expect(activated.status).toBe(200);
    expect(activated.body.activePlanningCredentialId).toBe(created.body.credential.id);

    await request(app).post(`/api/providers/credentials/${created.body.credential.id}/activate`).set(auth).send({
      tier: 'coding',
    }).expect(200);

    const complete = await request(app).post('/api/setup/complete').set(auth);
    expect(complete.status).toBe(200);

    const listed = await request(app).get('/api/providers/credentials').set(auth);
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toMatch(/gcm:v2:|api_key_encrypted/i);
  });

  it('blocks setup complete without activated coding credential', async () => {
    const { auth } = await signup();
    const blocked = await request(app).post('/api/setup/complete').set(auth);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('SETUP_INCOMPLETE');
  });

  it('refuses activate before Test Connection succeeds', async () => {
    const { auth } = await signup();
    const created = await request(app).post('/api/providers/credentials').set(auth).send({
      provider: 'claude_code',
      label: 'personal',
      apiKey: 'aria-mock-claude-key',
    });
    expect(created.status).toBe(201);
    const activate = await request(app).post(`/api/providers/credentials/${created.body.credential.id}/activate`).set(auth).send({
      tier: 'coding',
    });
    expect(activate.status).toBe(409);
    expect(activate.body.code).toBe('TEST_REQUIRED');
  });

  it('supports several labeled keys per provider and encrypts at rest', async () => {
    const { auth, workspaceId } = await signup();
    for (const label of ['personal', 'work']) {
      const created = await request(app).post('/api/providers/credentials').set(auth).send({
        provider: 'codex',
        label,
        apiKey: `aria-mock-codex-${label}`,
      });
      expect(created.status).toBe(201);
      await request(app).post(`/api/providers/credentials/${created.body.credential.id}/test`).set(auth).send({}).expect(200);
    }
    const row = await getPgPool().query<{ api_key_encrypted: string; label: string }>(
      `SELECT api_key_encrypted, label FROM provider_credentials WHERE workspace_id = $1::uuid AND provider = 'codex' ORDER BY label`,
      [workspaceId],
    );
    expect(row.rows).toHaveLength(2);
    for (const item of row.rows) {
      expect(item.api_key_encrypted).toMatch(/^gcm:v2:/);
      expect(item.api_key_encrypted).not.toContain('aria-mock-codex');
    }
  });

  it('mirrors legacy llm-config into provider_credentials', async () => {
    const { auth } = await signup();
    const saved = await request(app).patch('/api/workspace/llm-config').set(auth).send({
      provider: 'cursor',
      model: 'cursor-agent',
      apiKey: 'aria-mock-key-legacy',
    });
    expect(saved.status).toBe(200);
    const listed = await request(app).get('/api/providers/credentials').set(auth);
    expect(listed.body.credentials.some((c: { provider: string }) => c.provider === 'cursor')).toBe(true);
    expect(listed.body.activePlanningCredentialId).toBeTruthy();
  });
});
