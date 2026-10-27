import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as ioClient, type Socket } from 'socket.io-client';
import app from '../app';
import { getPgPool } from '../services/db.client';
import { listTicketEvents } from '../services/tickets/ticketEvents';
import { evidenceAllowsMerge } from '../services/evidence/reports';
import { dispatchReadyTickets } from '../services/tickets/ticketDispatcher';
import { watchPullRequests } from '../services/tickets/prWatcher';
import { processRunById } from '../services/runs/runWorker';
import { claimById, cancel, enqueue, getRun, heartbeat, reap, succeed } from '../services/runs/runQueue';
import { monthlyBucketId, releaseRun, reserveRun } from '../services/runs/budget';
import { diffTouchesUi } from '../services/github/diffGuards';
import {
  MergeForbiddenError,
  githubRequest,
  readGithubToken,
  saveGithubToken,
} from '../services/githubClient.service';
import { createWsServer, getIO } from '../ws';

const mix = { business: 0, qa: 1, frontend: 0, backend: 0, fullstack: 2, junior: 0, aiml: 0, devops: 0, security: 0 };
const githubMode = process.env.ARIA_GITHUB_MODE;

async function signup(email: string) {
  const res = await request(app).post('/api/auth/signup').send({ name: 'Review Owner', email, password: 'Test1234!' });
  expect(res.status).toBe(201);
  return {
    token: res.body.accessToken as string,
    userId: res.body.user.id as string,
    workspaceId: res.body.user.workspaceId as string,
    auth: { Authorization: `Bearer ${res.body.accessToken as string}` },
  };
}

async function quiet(workspaceId: string) {
  await getPgPool().query(
    `UPDATE agent_runs
        SET status = 'cancelled', error_code = 'CANCELLED', finished_at = NOW(), updated_at = NOW(),
            lease_owner = NULL, lease_expires_at = NULL
      WHERE workspace_id = $1::uuid AND status IN ('queued', 'running')`,
    [workspaceId],
  );
}

async function projectWithRepo(label: string, repoName: string) {
  const owner = await signup(`acc-${label}-${Date.now()}@aria.dev`);
  await saveGithubToken(owner.workspaceId, 'ghp_pipeline');
  const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: label });
  expect(project.status).toBe(201);
  const projectId = project.body.project.id as string;
  await getPgPool().query(
    `INSERT INTO project_repos (project_id, repo_url, repo_name) VALUES ($1::uuid, $2, $3)`,
    [projectId, `https://github.com/${repoName}`, repoName],
  );
  const company = await request(app).post(`/api/projects/${projectId}/company`).set(owner.auth).send({ size: 8, mix });
  expect(company.status).toBe(201);
  return { owner, projectId };
}

async function openTicket(auth: { Authorization: string }, projectId: string, title: string, description: string) {
  const created = await request(app).post('/api/tickets').set(auth).send({
    projectId, title, description, type: 'feature', storyPoints: 1,
  });
  expect(created.status).toBe(201);
  const ticketId = created.body.ticket.id as string;
  const approved = await request(app).patch(`/api/tickets/${ticketId}`).set(auth).send({ action: 'approve' });
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  expect(approved.body.ticket.status).toBe('ready_for_dev');
  return ticketId;
}

async function drain(projectId: string, limit = 8) {
  for (let step = 0; step < limit; step += 1) {
    const queued = await getPgPool().query<{ id: string }>(
      `SELECT id FROM agent_runs WHERE project_id = $1::uuid AND status = 'queued' ORDER BY created_at`,
      [projectId],
    );
    if (!queued.rows.length) return;
    for (const row of queued.rows) await processRunById(row.id);
  }
}

async function ticketStatus(ticketId: string) {
  const row = await getPgPool().query<{ status: string; pr_number: number | null; head_sha: string | null }>(
    `SELECT t.status, r.pr_number, r.head_sha
       FROM tickets t
       LEFT JOIN LATERAL (
         SELECT pr_number, head_sha FROM agent_runs
          WHERE ticket_id = t.id AND pr_number IS NOT NULL
          ORDER BY created_at DESC LIMIT 1
       ) r ON true
      WHERE t.id = $1::uuid`,
    [ticketId],
  );
  return row.rows[0];
}

describe('review acceptance', () => {
  beforeAll(() => {
    process.env.ARIA_GITHUB_MODE = 'live';
  });

  afterAll(() => {
    if (githubMode === undefined) delete process.env.ARIA_GITHUB_MODE;
    else process.env.ARIA_GITHUB_MODE = githubMode;
  });

  it('drives develop, review, and QA to awaiting_merge, then the owner merge', async () => {
    const { owner, projectId } = await projectWithRepo('pipeline', 'acme/demo-app');
    const ticketId = await openTicket(owner.auth, projectId, 'Ship the guard', 'Close the gate. [[stub:ui]] [[stub:omit_pr]]');
    expect(await dispatchReadyTickets()).toBeGreaterThanOrEqual(1);
    await drain(projectId, 8);
    const row = await ticketStatus(ticketId);
    expect(row.status).toBe('awaiting_merge');
    expect(row.pr_number).toBeTruthy();
    expect(row.head_sha).toBeTruthy();
    const heads = await getPgPool().query<{ activity: string; head_sha: string | null }>(
      `SELECT activity, head_sha FROM agent_runs
        WHERE ticket_id = $1::uuid AND activity IN ('develop', 'qa') AND status = 'succeeded'
        ORDER BY created_at`,
      [ticketId],
    );
    const developHead = heads.rows.find((item) => item.activity === 'develop')?.head_sha;
    const qaHead = heads.rows.find((item) => item.activity === 'qa')?.head_sha;
    expect(developHead).toBeTruthy();
    expect(qaHead).toBeTruthy();
    expect(qaHead).not.toBe(developHead);
    expect(row.head_sha).toBe(qaHead);
    const base = process.env.GITHUB_API_BASE || '';
    const files = await fetch(`${base}/repos/acme/demo-app/pulls/${row.pr_number}/files`).then((res) => res.json()) as Array<{ filename: string }>;
    const names = files.map((file) => file.filename);
    expect(names).toContain('apps/web/src/app/page.tsx');
    expect(diffTouchesUi(names)).toBe(true);
    expect((await evidenceAllowsMerge(ticketId, row.head_sha)).ok).toBe(true);
    expect((await evidenceAllowsMerge(ticketId, 'def')).ok).toBe(false);

    const token = await readGithubToken(owner.workspaceId);
    await expect(githubRequest(token, 'POST', `/repos/acme/demo-app/pulls/${row.pr_number}/merge`)).rejects.toBeInstanceOf(MergeForbiddenError);
    const before = await fetch(`${base}/__stub/violations`).then((res) => res.json()) as { violations: number };
    const refused = await fetch(`${base}/repos/acme/demo-app/merges`, { method: 'POST' });
    expect(refused.status).toBe(418);
    const after = await fetch(`${base}/__stub/violations`).then((res) => res.json()) as { violations: number };
    expect(after.violations).toBe(before.violations + 1);

    await watchPullRequests();
    expect((await ticketStatus(ticketId)).status).toBe('awaiting_merge');
    await fetch(`${base}/__stub/github/merge/${row.pr_number}`, { method: 'POST' });
    await watchPullRequests();
    expect((await ticketStatus(ticketId)).status).toBe('done');
    const log = await listTicketEvents(ticketId, { eventType: 'status_change', limit: 30 });
    expect(log.some((event) => event.summary.includes('done'))).toBe(true);

    const closedId = await openTicket(owner.auth, projectId, 'Abandon', 'Close without merging.');
    expect(await dispatchReadyTickets()).toBeGreaterThanOrEqual(1);
    await drain(projectId, 8);
    const closed = await ticketStatus(closedId);
    expect(closed.status).toBe('awaiting_merge');
    await fetch(`${base}/__stub/github/close/${closed.pr_number}`, { method: 'POST' });
    await watchPullRequests();
    expect((await ticketStatus(closedId)).status).toBe('rejected');
    await quiet(owner.workspaceId);
  }, 90_000);

  it('sends review changes through a fix and blocks when the round cap is hit', async () => {
    const { owner, projectId } = await projectWithRepo('rounds', 'acme/demo-app');
    const fixId = await openTicket(owner.auth, projectId, 'Needs a fix', '[[stub:review-changes]]');
    await dispatchReadyTickets();
    await drain(projectId, 8);
    expect((await ticketStatus(fixId)).status).toBe('awaiting_merge');
    const fixes = await getPgPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM agent_runs WHERE ticket_id = $1::uuid AND activity = 'fix' AND status = 'succeeded'`,
      [fixId],
    );
    expect(Number(fixes.rows[0].n)).toBeGreaterThanOrEqual(1);

    const capped = await openTicket(owner.auth, projectId, 'Always changes', '[[stub:review-always]]');
    await dispatchReadyTickets();
    await drain(projectId, 12);
    expect((await ticketStatus(capped)).status).toBe('blocked');
    const fixesCapped = await getPgPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM agent_runs WHERE ticket_id = $1::uuid AND activity = 'fix' AND status = 'succeeded'`,
      [capped],
    );
    expect(Number(fixesCapped.rows[0].n)).toBe(2);
    await quiet(owner.workspaceId);
  }, 90_000);

  it('covers cloud stub failures, a missing pull, and pending checks', async () => {
    const { owner, projectId } = await projectWithRepo('scenarios', 'acme/demo-app');

    const missing = await openTicket(owner.auth, projectId, 'No pull yet', '[[stub:no_pr]]');
    await dispatchReadyTickets();
    const develop = await getPgPool().query<{ id: string }>(
      `SELECT id FROM agent_runs WHERE ticket_id = $1::uuid AND activity = 'develop' AND status = 'queued'`,
      [missing],
    );
    await processRunById(develop.rows[0].id);
    const opened = await getRun(develop.rows[0].id);
    expect(opened?.status).toBe('succeeded');
    expect(opened?.pr_number).toBeTruthy();
    expect((await request(app).patch(`/api/tickets/${missing}`).set(owner.auth).send({ action: 'reject' })).status).toBe(200);

    const empty = await openTicket(owner.auth, projectId, 'No diff', '[[stub:no_changes]]');
    await dispatchReadyTickets();
    const emptyRun = await getPgPool().query<{ id: string }>(
      `SELECT id FROM agent_runs WHERE ticket_id = $1::uuid AND activity = 'develop' AND status = 'queued'`,
      [empty],
    );
    await processRunById(emptyRun.rows[0].id);
    expect((await getRun(emptyRun.rows[0].id))?.error_code).toBe('NO_CHANGES');
    expect((await ticketStatus(empty)).status).toBe('blocked');

    const denied = await openTicket(owner.auth, projectId, 'No repo', '[[stub:repo_access]]');
    await dispatchReadyTickets();
    const deniedRun = await getPgPool().query<{ id: string }>(
      `SELECT id FROM agent_runs WHERE ticket_id = $1::uuid AND activity = 'develop' AND status = 'queued'`,
      [denied],
    );
    await processRunById(deniedRun.rows[0].id);
    expect((await getRun(deniedRun.rows[0].id))?.error_code).toBe('REPO_ACCESS');

    const expired = await openTicket(owner.auth, projectId, 'Stream expired', '[[stub:stream_410]]');
    await dispatchReadyTickets();
    const streamRun = await getPgPool().query<{ id: string }>(
      `SELECT id FROM agent_runs WHERE ticket_id = $1::uuid AND activity = 'develop' AND status = 'queued'`,
      [expired],
    );
    await processRunById(streamRun.rows[0].id);
    expect((await getRun(streamRun.rows[0].id))?.status).toBe('succeeded');
    expect((await request(app).patch(`/api/tickets/${expired}`).set(owner.auth).send({ action: 'reject' })).status).toBe(200);

    const overCap = await openTicket(owner.auth, projectId, 'Usage hidden', '[[stub:usage=403]][[stub:estimate=9000000]]');
    await dispatchReadyTickets();
    const capRun = await getPgPool().query<{ id: string }>(
      `SELECT id FROM agent_runs WHERE ticket_id = $1::uuid AND activity = 'develop' AND status = 'queued'`,
      [overCap],
    );
    await processRunById(capRun.rows[0].id);
    expect((await getRun(capRun.rows[0].id))?.error_code).toBe('BUDGET_EXCEEDED');

    const broken = await openTicket(owner.auth, projectId, 'Cloud error', '[[stub:error]]');
    await dispatchReadyTickets();
    const errorRun = await getPgPool().query<{ id: string }>(
      `SELECT id FROM agent_runs WHERE ticket_id = $1::uuid AND activity = 'develop' AND status = 'queued'`,
      [broken],
    );
    await processRunById(errorRun.rows[0].id);
    const retried = await getRun(errorRun.rows[0].id);
    expect(retried?.status).toBe('queued');
    expect(retried?.error_code).toBe('RUN_ERROR');
    expect(retried?.attempt).toBeGreaterThan(0);
    await quiet(owner.workspaceId);

    const previousPoll = process.env.ARIA_QA_CHECK_POLL_MS;
    const previousTimeout = process.env.ARIA_QA_CHECK_TIMEOUT_MS;
    process.env.ARIA_QA_CHECK_POLL_MS = '40';
    process.env.ARIA_QA_CHECK_TIMEOUT_MS = '90000';
    const settled = await openTicket(owner.auth, projectId, 'Checks settle', '[[stub:checks=settle]]');
    await dispatchReadyTickets();
    await drain(projectId, 12);
    expect((await ticketStatus(settled)).status).toBe('awaiting_merge');
    process.env.ARIA_QA_CHECK_TIMEOUT_MS = '200';
    const pending = await openTicket(owner.auth, projectId, 'Checks pending', '[[stub:checks=pending]]');
    await dispatchReadyTickets();
    await drain(projectId, 12);
    expect((await ticketStatus(pending)).status).not.toBe('awaiting_merge');
    const qaLog = await listTicketEvents(pending, { limit: 40 });
    expect(qaLog.some((event) => event.summary.includes('qa_failed'))).toBe(true);
    if (previousPoll === undefined) delete process.env.ARIA_QA_CHECK_POLL_MS;
    else process.env.ARIA_QA_CHECK_POLL_MS = previousPoll;
    if (previousTimeout === undefined) delete process.env.ARIA_QA_CHECK_TIMEOUT_MS;
    else process.env.ARIA_QA_CHECK_TIMEOUT_MS = previousTimeout;
    await quiet(owner.workspaceId);
  }, 90_000);

  it('blocks an unprotected default branch before spending tokens', async () => {
    const { owner, projectId } = await projectWithRepo('guard', 'acme/unprotected');
    const before = await getPgPool().query<{ n: string }>(
      `SELECT COALESCE(SUM(tokens_reserved + tokens_used), 0)::text AS n FROM token_ledger WHERE session_id = $1::uuid`,
      [monthlyBucketId(owner.workspaceId)],
    );
    const ticketId = await openTicket(owner.auth, projectId, 'Unsafe base', 'Do not code on this branch.');
    await dispatchReadyTickets();
    const develop = await getPgPool().query<{ id: string }>(
      `SELECT id FROM agent_runs WHERE ticket_id = $1::uuid AND activity = 'develop'`,
      [ticketId],
    );
    await processRunById(develop.rows[0].id);
    const run = await getRun(develop.rows[0].id);
    expect(run?.status).toBe('blocked');
    expect(run?.error_code).toBe('MERGE_GUARD');
    const after = await getPgPool().query<{ n: string }>(
      `SELECT COALESCE(SUM(tokens_reserved + tokens_used), 0)::text AS n FROM token_ledger WHERE session_id = $1::uuid`,
      [monthlyBucketId(owner.workspaceId)],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
    await quiet(owner.workspaceId);
  }, 30_000);

  it('cancels a run while the cloud stream is still open', async () => {
    const { owner, projectId } = await projectWithRepo('slow', 'acme/demo-app');
    const ticketId = await openTicket(owner.auth, projectId, 'Slow agent', '[[stub:slow]]');
    await dispatchReadyTickets();
    const develop = await getPgPool().query<{ id: string }>(
      `SELECT id FROM agent_runs WHERE ticket_id = $1::uuid AND activity = 'develop' AND status = 'queued'`,
      [ticketId],
    );
    const before = await getPgPool().query<{ n: string }>(
      `SELECT COALESCE(SUM(tokens_reserved), 0)::text AS n FROM token_ledger WHERE session_id = $1::uuid`,
      [monthlyBucketId(owner.workspaceId)],
    );
    const pending = processRunById(develop.rows[0].id);
    let reserved = 0;
    for (let attempt = 0; attempt < 50 && reserved === 0; attempt += 1) {
      reserved = (await getRun(develop.rows[0].id))?.tokens_reserved ?? 0;
      if (reserved === 0) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(reserved).toBeGreaterThan(0);
    const cancelled = await request(app).post(`/api/runs/${develop.rows[0].id}/cancel`).set(owner.auth);
    expect(cancelled.status).toBe(200);
    await pending;
    expect((await getRun(develop.rows[0].id))?.status).toBe('cancelled');
    const after = await getPgPool().query<{ n: string }>(
      `SELECT COALESCE(SUM(tokens_reserved), 0)::text AS n FROM token_ledger WHERE session_id = $1::uuid`,
      [monthlyBucketId(owner.workspaceId)],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
    await quiet(owner.workspaceId);
  }, 30_000);

  it('refuses a second budget reservation and leaves the ledger unchanged', async () => {
    const workspaceId = randomUUID();
    const projectId = randomUUID();
    const input = {
      workspaceId, agentId: null, activity: 'story_points', projectBudget: 25_000, agentBudget: null, projectId,
    };
    const first = await reserveRun(input);
    expect(first.ok).toBe(true);
    const mid = await getPgPool().query<{ n: string }>(
      `SELECT COALESCE(SUM(tokens_reserved), 0)::text AS n FROM token_ledger WHERE session_id = $1::uuid`,
      [monthlyBucketId(workspaceId)],
    );
    const second = await reserveRun(input);
    expect(second.ok).toBe(false);
    expect(second.code).toBe('BUDGET_EXCEEDED');
    const after = await getPgPool().query<{ n: string }>(
      `SELECT COALESCE(SUM(tokens_reserved), 0)::text AS n FROM token_ledger WHERE session_id = $1::uuid`,
      [monthlyBucketId(workspaceId)],
    );
    expect(after.rows[0].n).toBe(mid.rows[0].n);
    await releaseRun(workspaceId, 'story_points', first.reserved, null, projectId, true);
  });

  it('drops a lost lease and keeps a retry idempotent', async () => {
    const owner = await signup(`acc-lease-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Lease' });
    const projectId = project.body.project.id as string;
    const queued = await enqueue({
      workspaceId: owner.workspaceId, projectId, activity: 'review', taskType: 'code_review', runtime: 'cursor_local',
      idempotencyKey: `lease-${Date.now()}`,
    });
    const claimed = await claimById(queued.id, 'reaper-test');
    expect(claimed?.id).toBe(queued.id);
    const held = await getPgPool().query<{ lease_owner: string | null }>(`SELECT lease_owner FROM agent_runs WHERE id = $1::uuid`, [queued.id]);
    expect(held.rows[0].lease_owner).toBe('reaper-test');
    await getPgPool().query(`UPDATE agent_runs SET lease_expires_at = NOW() - interval '2 minutes' WHERE id = $1::uuid`, [queued.id]);
    expect(await reap()).toBeGreaterThanOrEqual(1);
    const after = await getRun(queued.id);
    const released = await getPgPool().query<{ lease_owner: string | null }>(`SELECT lease_owner FROM agent_runs WHERE id = $1::uuid`, [queued.id]);
    expect(after?.status).not.toBe('running');
    expect(released.rows[0].lease_owner).toBeNull();
    expect(await heartbeat(queued.id, 'reaper-test')).toBe(false);
    expect(await succeed(queued.id, 'reaper-test', { result_text: 'late' })).toBe(false);
    if (after?.status === 'queued') await cancel(queued.id);

    const retrySource = await enqueue({
      workspaceId: owner.workspaceId, projectId, activity: 'review', taskType: 'code_review', runtime: 'cursor_local',
      idempotencyKey: `retry-src-${Date.now()}`,
    });
    expect((await request(app).post(`/api/runs/${retrySource.id}/cancel`).set(owner.auth)).status).toBe(200);
    const first = await request(app).post(`/api/runs/${retrySource.id}/retry`).set(owner.auth);
    const second = await request(app).post(`/api/runs/${retrySource.id}/retry`).set(owner.auth);
    expect(first.status).toBe(202);
    expect(first.body.created).toBe(true);
    expect(second.status).toBe(202);
    expect(second.body.created).toBe(false);
    expect(second.body.id).toBe(first.body.id);
    await cancel(first.body.id as string);
  });

  it('rejects foreign runs, foreign flow owners, client agent events, and a bad limit', async () => {
    const owner = await signup(`acc-auth-${Date.now()}@aria.dev`);
    const other = await signup(`acc-other-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Auth' });
    const projectId = project.body.project.id as string;
    const foreignProject = await request(app).post('/api/setup/project').set(other.auth).send({ name: 'Foreign' });
    const foreignProjectId = foreignProject.body.project.id as string;
    const company = await request(app).post(`/api/projects/${projectId}/company`).set(owner.auth).send({ size: 8, mix });
    const foreignCompany = await request(app).post(`/api/projects/${foreignProjectId}/company`).set(other.auth).send({ size: 8, mix });
    expect(company.status).toBe(201);
    expect(foreignCompany.status).toBe(201);
    const run = await enqueue({
      workspaceId: owner.workspaceId, projectId, activity: 'review', taskType: 'code_review', runtime: 'cursor_local',
      idempotencyKey: `idor-${Date.now()}`,
    });
    const hidden = await request(app).get(`/api/runs/${run.id}`).set(other.auth);
    expect(hidden.status).toBe(404);
    const badLimit = await request(app).get(`/api/runs/${run.id}/logs?limit=abc`).set(owner.auth);
    expect(badLimit.status).toBe(400);

    const created = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId, title: 'Notes', description: 'Human notes only.', type: 'feature', storyPoints: 1,
    });
    const ticketId = created.body.ticket.id as string;
    const agentEvent = await request(app).post(`/api/tickets/${ticketId}/events`).set(owner.auth).send({
      eventType: 'progress', summary: 'agent wrote this', agentId: randomUUID(),
    });
    expect(agentEvent.status).toBe(400);
    const humanEvent = await request(app).post(`/api/tickets/${ticketId}/events`).set(owner.auth).send({
      eventType: 'progress', summary: 'owner wrote this',
    });
    expect(humanEvent.status).toBe(201);
    expect(humanEvent.body.event.actor_kind).toBe('human');
    expect(humanEvent.body.event.detail.userId).toBe(owner.userId);

    const strayFlow = randomUUID();
    const badFlow = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId, title: 'Wrong flow', description: 'Flow from nowhere.', type: 'feature', storyPoints: 1, flowId: strayFlow,
    });
    expect(badFlow.status).toBe(422);
    expect(badFlow.body.code).toBe('FLOW_NOT_IN_PROJECT');

    const map = await getPgPool().query<{ id: string }>(
      `INSERT INTO knowledge_maps (project_id, workspace_id, summary) VALUES ($1::uuid, $2::uuid, 'auth') RETURNING id`,
      [projectId, owner.workspaceId],
    );
    const flow = await getPgPool().query<{ id: string }>(
      `INSERT INTO business_flows (project_id, knowledge_map_id, flow_key, name) VALUES ($1::uuid, $2::uuid, 'signup', 'Signup') RETURNING id`,
      [projectId, map.rows[0].id],
    );
    const foreignAgent = (foreignCompany.body.agents as Array<{ id: string; roleKey: string }>).find((agent) => agent.roleKey === 'fullstack');
    const ownAgent = (company.body.agents as Array<{ id: string; roleKey: string }>).find((agent) => agent.roleKey === 'fullstack');
    const idor = await request(app).put(`/api/projects/${projectId}/flows/${flow.rows[0].id}/owners`).set(owner.auth).send({
      owners: [{ agentId: foreignAgent!.id, layer: 'fullstack', role: 'owner' }],
    });
    expect(idor.status).toBe(403);
    const allowed = await request(app).put(`/api/projects/${projectId}/flows/${flow.rows[0].id}/owners`).set(owner.auth).send({
      owners: [{ agentId: ownAgent!.id, layer: 'fullstack', role: 'owner' }],
    });
    expect(allowed.status).toBe(200);

    const queued = await enqueue({
      workspaceId: owner.workspaceId, projectId, ticketId, activity: 'review', taskType: 'code_review', runtime: 'cursor_local',
      idempotencyKey: `human-status-${Date.now()}`,
    });
    const moved = await request(app).patch(`/api/tickets/${ticketId}`).set(owner.auth).send({ status: 'done' });
    expect(moved.status).toBe(200);
    expect((await getRun(queued.id))?.status).toBe('cancelled');
    const events = await listTicketEvents(ticketId, { eventType: 'status_change', limit: 10 });
    expect(events.some((event) => (event.detail as { userId?: string }).userId === owner.userId)).toBe(true);
    const illegal = await request(app).patch(`/api/tickets/${ticketId}`).set(owner.auth).send({ status: 'ready_for_dev' });
    expect(illegal.status).toBe(422);
    await quiet(owner.workspaceId);
  });

  it('dispatches one ready ticket per agent', async () => {
    const { owner, projectId } = await projectWithRepo('dispatch', 'acme/demo-app');
    const first = await openTicket(owner.auth, projectId, 'First', 'One task.');
    const second = await openTicket(owner.auth, projectId, 'Second', 'Still one task.');
    await dispatchReadyTickets();
    const rows = await getPgPool().query<{ id: string; status: string }>(
      `SELECT id, status FROM tickets WHERE id = ANY($1::uuid[])`,
      [[first, second]],
    );
    const statuses = new Map(rows.rows.map((row) => [row.id, row.status]));
    expect([statuses.get(first), statuses.get(second)].sort()).toEqual(['in_progress', 'ready_for_dev']);
    await quiet(owner.workspaceId);
  });

  it('does not join a project room in another workspace', async () => {
    const owner = await signup(`acc-ws-${Date.now()}@aria.dev`);
    const other = await signup(`acc-ws-other-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Rooms' });
    const projectId = project.body.project.id as string;
    const http: Server = createServer();
    createWsServer(http);
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', () => resolve()));
    const port = (http.address() as AddressInfo).port;
    const connect = (token: string) => new Promise<Socket>((resolve, reject) => {
      const socket = ioClient(`http://127.0.0.1:${port}`, {
        path: '/ws',
        auth: { token },
        transports: ['websocket'],
      });
      socket.once('hello', () => resolve(socket));
      socket.once('connect_error', reject);
    });
    const own = await connect(owner.token);
    const foreign = await connect(other.token);
    own.emit('join:project', { projectId });
    foreign.emit('join:project', { projectId });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const ownHit = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 500);
      own.once('ticket:updated', () => { clearTimeout(timer); resolve(true); });
    });
    let foreignHit = false;
    foreign.once('ticket:updated', () => { foreignHit = true; });
    getIO().to(`project:${projectId}`).emit('ticket:updated', { id: projectId });
    expect(await ownHit).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(foreignHit).toBe(false);
    own.close();
    foreign.close();
    getIO().close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });

  it('does not join another workspace session or agent room', async () => {
    const owner = await signup(`acc-room-${Date.now()}@aria.dev`);
    const other = await signup(`acc-room-other-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Rooms' });
    const projectId = project.body.project.id as string;
    const skill = await getPgPool().query<{ id: string }>(
      `INSERT INTO skills (project_id, slug, real_name, role_title, name, role)
       VALUES ($1, 'ceo', 'Ada Lovelace', 'CEO', 'Ada Lovelace', 'CEO') RETURNING id`,
      [projectId],
    );
    const session = await getPgPool().query<{ id: string }>(
      `INSERT INTO sessions (project_id, workspace_id) VALUES ($1, $2) RETURNING id`,
      [projectId, owner.workspaceId],
    );
    const http: Server = createServer();
    createWsServer(http);
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', () => resolve()));
    const port = (http.address() as AddressInfo).port;
    const connect = (token: string) => new Promise<Socket>((resolve, reject) => {
      const socket = ioClient(`http://127.0.0.1:${port}`, { path: '/ws', auth: { token }, transports: ['websocket'] });
      socket.once('hello', () => resolve(socket));
      socket.once('connect_error', reject);
    });
    const own = await connect(owner.token);
    const foreign = await connect(other.token);
    own.emit('subscribe', { room: `session.${session.rows[0].id}` });
    own.emit('subscribe', { room: `agent.${skill.rows[0].id}` });
    own.emit('subscribe', { room: 'session.not-a-uuid' });
    foreign.emit('subscribe', { room: `session.${session.rows[0].id}` });
    foreign.emit('subscribe', { room: `agent.${skill.rows[0].id}` });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const saw = (socket: Socket, event: string) => new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 400);
      socket.once(event, () => { clearTimeout(timer); resolve(true); });
    });
    const ownSession = saw(own, 'session.update');
    const foreignSession = saw(foreign, 'session.update');
    const ownAgent = saw(own, 'agent.status');
    const foreignAgent = saw(foreign, 'agent.status');
    getIO().to(`session.${session.rows[0].id}`).emit('session.update', { sessionId: session.rows[0].id });
    getIO().to(`agent.${skill.rows[0].id}`).emit('agent.status', { agentId: skill.rows[0].id });
    expect(await ownSession).toBe(true);
    expect(await ownAgent).toBe(true);
    expect(await foreignSession).toBe(false);
    expect(await foreignAgent).toBe(false);
    own.close();
    foreign.close();
    getIO().close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
});
