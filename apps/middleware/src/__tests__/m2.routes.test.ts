import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import { getPgPool } from '../services/db.client';
import { monthlyBucketId, releaseRun, reserveRun } from '../services/runs/budget';
import { enqueue } from '../services/runs/runQueue';
import { parseMonthlyBudget, safeHref, ticketFromSocket } from '@aria/shared';

async function signup(email: string) {
  const res = await request(app).post('/api/auth/signup').send({ name: 'Route Owner', email, password: 'Test1234!' });
  expect(res.status).toBe(201);
  return {
    token: res.body.accessToken as string,
    workspaceId: res.body.user.workspaceId as string,
    auth: { Authorization: `Bearer ${res.body.accessToken as string}` },
  };
}

describe('socket and budget helpers', () => {
  it('reads both ticket event shapes and only allows http links', () => {
    expect(ticketFromSocket({ id: 't1', status: 'in_progress', projectId: 'p1' })).toEqual({
      id: 't1', status: 'in_progress', projectId: 'p1',
    });
    expect(ticketFromSocket({ ticket: { id: 't2', projectId: 'p2', status: 'done' } })?.ticket?.id).toBe('t2');
    expect(ticketFromSocket({ ticket: {} })).toBeNull();
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('https://github.com/acme/demo/pull/1')).toBe('https://github.com/acme/demo/pull/1');
    expect(parseMonthlyBudget('1,000')).toEqual({ ok: true, value: 1000 });
    expect(parseMonthlyBudget('abc').ok).toBe(false);
    expect(parseMonthlyBudget('')).toEqual({ ok: true, value: null });
  });
});

describe('milestone 2 routes', () => {
  it('reports project usage against a project limit when the workspace bucket is larger', async () => {
    const owner = await signup(`budget-scope-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Budget' });
    const projectId = project.body.project.id as string;
    await getPgPool().query(`UPDATE projects SET token_budget_monthly = 1000000 WHERE id = $1::uuid`, [projectId]);
    const bucket = monthlyBucketId(owner.workspaceId);
    await getPgPool().query(`DELETE FROM token_ledger WHERE session_id = $1::uuid`, [bucket]);
    await getPgPool().query(
      `INSERT INTO token_ledger (session_id, backend_id, tokens_used, tokens_reserved)
       VALUES ($1::uuid, 'cursor-cloud', 5000000, 0)`,
      [bucket],
    );
    const budget = await request(app).get(`/api/projects/${projectId}/budget`).set(owner.auth);
    expect(budget.status).toBe(200);
    expect(budget.body).toMatchObject({ limit: 1_000_000, projectLimit: 1_000_000, used: 0, reserved: 0 });
    const admitted = await reserveRun({
      workspaceId: owner.workspaceId, agentId: null, activity: 'review', projectBudget: 1_000_000, agentBudget: null, projectId,
    });
    expect(admitted.ok).toBe(true);
    await releaseRun(owner.workspaceId, 'review', admitted.reserved, null, projectId, true);

    const malformed = await request(app).get('/api/projects/zzz/budget').set(owner.auth);
    expect(malformed.status).toBe(400);
    const renamed = await request(app).patch('/api/projects/not-a-uuid').set(owner.auth).send({ name: 'Nope' });
    expect(renamed.status).toBe(400);
    const other = await signup(`budget-other-${Date.now()}@aria.dev`);
    const hidden = await request(app).get(`/api/projects/${projectId}/budget`).set(other.auth);
    expect(hidden.status).toBe(404);
  });

  it('loads a ticket by id after archive and rejects bad ids', async () => {
    const owner = await signup(`ticket-id-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Tickets' });
    const projectId = project.body.project.id as string;
    const created = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId, title: 'Keep me', description: 'Still readable after archive.', type: 'feature', storyPoints: 2,
    });
    expect(created.status).toBe(201);
    const ticketId = created.body.ticket.id as string;
    const loaded = await request(app).get(`/api/tickets/${ticketId}`).set(owner.auth);
    expect(loaded.status).toBe(200);
    expect(loaded.body.ticket.id).toBe(ticketId);
    const events = await request(app).get(`/api/tickets/${ticketId}/events`).set(owner.auth);
    expect(events.status).toBe(200);
    expect(events.body.chain.ok).toBe(true);
    const reports = await request(app).get(`/api/tickets/${ticketId}/reports`).set(owner.auth);
    expect(reports.status).toBe(200);
    expect(reports.body.gate.ok).toBe(false);

    const archived = await request(app).delete(`/api/projects/${projectId}`).set(owner.auth);
    expect(archived.status).toBe(204);
    const still = await request(app).get(`/api/tickets/${ticketId}`).set(owner.auth);
    expect(still.status).toBe(200);
    expect(still.body.ticket.title).toBe('Keep me');

    expect((await request(app).get('/api/tickets/nope').set(owner.auth)).status).toBe(400);
    expect((await request(app).get('/api/tickets/nope/reports').set(owner.auth)).status).toBe(400);
    expect((await request(app).get('/api/runs/not-a-uuid').set(owner.auth)).status).toBe(400);
    const other = await signup(`ticket-other-${Date.now()}@aria.dev`);
    expect((await request(app).get(`/api/tickets/${ticketId}`).set(other.auth)).status).toBe(404);
    expect((await request(app).get(`/api/tickets/${ticketId}/reports`).set(other.auth)).status).toBe(404);
  });

  it('pages run logs from the tail and keeps pull requests outside the last 50 rows', async () => {
    const owner = await signup(`logs-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Logs' });
    const projectId = project.body.project.id as string;
    const ticket = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId, title: 'Logged', description: 'Has a pull request.', type: 'feature', storyPoints: 1,
    });
    const ticketId = ticket.body.ticket.id as string;
    const queued = await enqueue({
      workspaceId: owner.workspaceId, projectId, ticketId, activity: 'develop', taskType: 'coding', runtime: 'cursor_local',
      idempotencyKey: `logs-${Date.now()}`,
    });
    await getPgPool().query(
      `INSERT INTO agent_run_logs (run_id, seq, kind, message) VALUES
         ($1::uuid, 1, 'status', 'one'),
         ($1::uuid, 2, 'status', 'two'),
         ($1::uuid, 3, 'status', 'three')`,
      [queued.id],
    );
    const tail = await request(app).get(`/api/runs/${queued.id}/logs?tail=1&limit=2`).set(owner.auth);
    expect(tail.status).toBe(200);
    expect(tail.body.lines.map((line: { seq: number }) => line.seq)).toEqual([2, 3]);
    const earlier = await request(app).get(`/api/runs/${queued.id}/logs?beforeSeq=2&limit=500`).set(owner.auth);
    expect(earlier.body.lines.map((line: { message: string }) => line.message)).toEqual(['one']);

    await getPgPool().query(
      `UPDATE agent_runs
          SET status = 'blocked', blocked_reason = 'old block', pr_url = NULL, created_at = NOW() - interval '2 hours'
        WHERE id = $1::uuid`,
      [queued.id],
    );
    const newer = await enqueue({
      workspaceId: owner.workspaceId, projectId, ticketId, activity: 'review', taskType: 'code_review', runtime: 'cursor_local',
      idempotencyKey: `logs-pr-${Date.now()}`,
    });
    await getPgPool().query(
      `UPDATE agent_runs
          SET status = 'succeeded', pr_url = 'https://github.com/acme/demo/pull/4', pr_number = 4, blocked_reason = NULL
        WHERE id = $1::uuid`,
      [newer.id],
    );
    const signals = await request(app).get(`/api/projects/${projectId}/run-signals`).set(owner.auth);
    expect(signals.status).toBe(200);
    const row = signals.body.signals.find((item: { ticketId: string }) => item.ticketId === ticketId);
    expect(row).toMatchObject({ prUrl: 'https://github.com/acme/demo/pull/4', prNumber: 4, blockedReason: null });
    const badSignals = await request(app).get('/api/projects/not-a-uuid/run-signals').set(owner.auth);
    expect(badSignals.status).toBe(400);
  });
});
