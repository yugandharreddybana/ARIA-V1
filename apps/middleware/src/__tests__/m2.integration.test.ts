import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import { db, skills } from '@aria/db';
import { eq } from 'drizzle-orm';
import { getPgPool } from '../services/db.client';
import { listTicketEvents, verifyChain } from '../services/tickets/ticketEvents';
import { storeReport, evidenceAllowsMerge } from '../services/evidence/reports';
import { applyTransition } from '../services/tickets/ticketActions';
import { scanSchedule } from '../services/tickets/ticketActions';
import { claim, enqueue } from '../services/runs/runQueue';
import { processRunById } from '../services/runs/runWorker';
import { reserveRun, releaseRun } from '../services/runs/budget';
import { onProjectEvent } from '../services/runs/hub';
import { watchPullRequests } from '../services/tickets/prWatcher';
import { saveGithubToken } from '../services/githubClient.service';

async function signup(email: string) {
  const res = await request(app).post('/api/auth/signup').send({ name: 'M2 Owner', email, password: 'Test1234!' });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken as string, workspaceId: res.body.user.workspaceId as string, auth: { Authorization: `Bearer ${res.body.accessToken as string}` } };
}

const devReport = [
  '## Commands', 'unit: pnpm test',
  '## Before', 'failed',
  '## After', 'passed',
  '## Screenshots', 'ui_affected: no',
  '## Logs', 'ok',
  '## Summary', 'fixed the guard',
].join('\n');

const qaReport = [
  '## Previous behaviour', 'blocked',
  '## Current behaviour', 'allowed',
  '## Diff', 'ticketPipeline.ts',
  '## Scenarios', 'happy: pass',
  '## Regression', 'pass',
  '## Screenshots', 'ui_affected: no',
  '## Verdict', 'pass',
].join('\n');

describe('ticket events, schedule, and evidence gate', () => {
  it('appends an immutable hash chain and exports it', async () => {
    const owner = await signup(`m2-events-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Events' });
    const projectId = project.body.project.id as string;
    const created = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId, title: 'Short', description: 'A tiny change for the board.', type: 'feature', storyPoints: 13,
    });
    expect(created.status).toBe(201);
    const ticket = created.body.ticket as { id: string; storyPoints: number; splitSuggested: boolean; ticketKey: string };
    expect(ticket.storyPoints).toBe(13);
    expect(ticket.splitSuggested).toBe(true);
    const events = await listTicketEvents(ticket.id, {});
    expect(verifyChain(events).ok).toBe(true);
    await expect(getPgPool().query(`UPDATE ticket_events SET summary = 'tamper' WHERE ticket_id = $1`, [ticket.id])).rejects.toThrow(/append-only/);
    await expect(getPgPool().query(`DELETE FROM ticket_events WHERE ticket_id = $1`, [ticket.id])).rejects.toThrow(/append-only/);
    const exported = await request(app).get(`/api/tickets/${ticket.id}/events/export?format=markdown`).set(owner.auth);
    expect(exported.status).toBe(200);
    expect(exported.text).toContain(ticket.ticketKey);
    const other = await signup(`m2-other-${Date.now()}@aria.dev`);
    const denied = await request(app).get(`/api/tickets/${ticket.id}/events`).set(other.auth);
    expect(denied.status).toBe(404);
  });

  it('flags overdue once and blocks awaiting_merge without evidence', async () => {
    const owner = await signup(`m2-gate-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Gate' });
    const projectId = project.body.project.id as string;
    const company = await request(app).post(`/api/projects/${projectId}/company`).set(owner.auth).send({
      size: 8,
      mix: { business: 1, qa: 2, frontend: 1, backend: 1, fullstack: 1, junior: 0, aiml: 0, devops: 0, security: 0 },
    });
    expect(company.status).toBe(201);
    const created = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId, title: 'Gate', description: 'Need both reports before the owner merges.', type: 'feature', storyPoints: 2,
    });
    const ticketId = created.body.ticket.id as string;
    const dev = (company.body.agents as Array<{ id: string; roleKey: string }>).find((agent) => agent.roleKey === 'fullstack' || agent.roleKey === 'frontend');
    await getPgPool().query(`UPDATE tickets SET assigned_skill_id = $2::uuid, human_approved = true, status = 'in_qa' WHERE id = $1::uuid`, [ticketId, dev!.id]);
    await expect(applyTransition(ticketId, 'qa_passed', { actorKind: 'system' })).resolves.toMatchObject({ status: 'in_progress' });
    const ticket = await getPgPool().query<{ workspace_id: string; ticket_key: string }>(
      `SELECT p.workspace_id, t.ticket_key FROM tickets t JOIN projects p ON p.id = t.project_id WHERE t.id = $1`,
      [ticketId],
    );
    await storeReport({
      workspaceId: ticket.rows[0].workspace_id, projectId, ticketId, ticketKey: ticket.rows[0].ticket_key,
      kind: 'dev', markdown: devReport, storyPoints: 2, agents: ['dev'], runId: null, commitSha: 'abc',
    });
    await storeReport({
      workspaceId: ticket.rows[0].workspace_id, projectId, ticketId, ticketKey: ticket.rows[0].ticket_key,
      kind: 'qa', markdown: qaReport, storyPoints: 2, agents: ['qa'], runId: null, commitSha: 'abc',
    });
    await getPgPool().query(`UPDATE tickets SET status = 'in_qa' WHERE id = $1`, [ticketId]);
    expect((await evidenceAllowsMerge(ticketId)).ok).toBe(true);
    await expect(applyTransition(ticketId, 'qa_passed', { actorKind: 'system' })).resolves.toMatchObject({ status: 'awaiting_merge' });
    const pdf = await request(app).get(`/api/tickets/${ticketId}/reports/dev.pdf`).set(owner.auth);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const foreign = await request(app).get(`/api/tickets/${ticketId}/reports/qa.md`).set((await signup(`m2-pdf-${Date.now()}@aria.dev`)).auth);
    expect(foreign.status).toBe(404);
    await getPgPool().query(
      `UPDATE tickets SET status = 'in_progress', work_started_at = NOW() - interval '10 days', due_at = NOW() - interval '1 day', schedule_state = 'on_track' WHERE id = $1`,
      [ticketId],
    );
    await scanSchedule();
    await scanSchedule();
    const flags = await getPgPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ticket_events WHERE ticket_id = $1 AND event_type = 'schedule' AND summary LIKE '%overdue%'`,
      [ticketId],
    );
    expect(Number(flags.rows[0].n)).toBe(1);
  });
});

const zeroMix = { business: 0, qa: 0, frontend: 0, backend: 0, fullstack: 0, junior: 0, aiml: 0, devops: 0, security: 0 };

describe('planner output, pull watcher, budget, and claim race', () => {
  it('applies an AI company roster and falls back after two invalid plans', async () => {
    const owner = await signup(`m2-ai-co-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'AI Co' });
    const projectId = project.body.project.id as string;
    const ai = await enqueue({
      workspaceId: owner.workspaceId,
      projectId,
      activity: 'company_generation',
      taskType: 'company_generation',
      runtime: 'cursor_local',
      idempotencyKey: `company-ai-${Date.now()}`,
      input: { size: 3, mix: zeroMix, fixture: '[[stub:company-ok]]' },
    });
    await processRunById(ai.id);
    const ceo = await getPgPool().query<{ real_name: string; company_source: string }>(
      `SELECT s.real_name, p.company_source FROM skills s JOIN projects p ON p.id = s.project_id WHERE s.project_id = $1 AND s.slug = 'ceo'`,
      [projectId],
    );
    expect(ceo.rows[0]).toMatchObject({ real_name: 'Maya Chen', company_source: 'ai' });
    const instructions = await getPgPool().query<{ instructions: string; enabled: number }>(
      `SELECT s.instructions, (SELECT COUNT(*)::int FROM skills WHERE project_id = $1 AND enabled) AS enabled
         FROM skills s WHERE s.project_id = $1 AND s.slug = 'ceo'`,
      [projectId],
    );
    expect(instructions.rows[0].instructions).toContain('Do not merge');
    expect(instructions.rows[0].enabled).toBe(3);

    const project2 = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Template Co' });
    const fallbackId = project2.body.project.id as string;
    const fallback = await enqueue({
      workspaceId: owner.workspaceId,
      projectId: fallbackId,
      activity: 'company_generation',
      taskType: 'company_generation',
      runtime: 'cursor_local',
      idempotencyKey: `company-fb-${Date.now()}`,
      input: { size: 3, mix: zeroMix },
    });
    await processRunById(fallback.id);
    const templated = await getPgPool().query<{ company_source: string; slug: string }>(
      `SELECT p.company_source, s.slug FROM projects p JOIN skills s ON s.project_id = p.id WHERE p.id = $1 AND s.slug = 'ceo'`,
      [fallbackId],
    );
    expect(templated.rows[0].company_source).toBe('template');
    expect(templated.rows[0].slug).toBe('ceo');

    const project3 = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Cycle Co' });
    const cycleId = project3.body.project.id as string;
    const cycled = await enqueue({
      workspaceId: owner.workspaceId,
      projectId: cycleId,
      activity: 'company_generation',
      taskType: 'company_generation',
      runtime: 'cursor_local',
      idempotencyKey: `company-cycle-${Date.now()}`,
      input: { size: 3, mix: zeroMix, fixture: '[[stub:company-cycle]]' },
    });
    await processRunById(cycled.id);
    const cycleSource = await getPgPool().query<{ company_source: string }>(
      `SELECT company_source FROM projects WHERE id = $1`,
      [cycleId],
    );
    expect(cycleSource.rows[0].company_source).toBe('template');
    const cycleLog = await getPgPool().query<{ message: string }>(
      `SELECT message FROM agent_run_logs WHERE run_id = $1 AND message LIKE '%failed validation%'`,
      [cycled.id],
    );
    expect(cycleLog.rows.length).toBeGreaterThan(0);
  });

  it('merges an AI knowledge map and keeps owner-edited layers', async () => {
    const owner = await signup(`m2-km-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Map' });
    const projectId = project.body.project.id as string;
    const company = await request(app).post(`/api/projects/${projectId}/company`).set(owner.auth).send({ size: 3, mix: zeroMix });
    expect(company.status).toBe(201);
    const ceo = await getPgPool().query<{ id: string }>(
      `SELECT id FROM skills WHERE project_id = $1 AND slug = 'ceo'`,
      [projectId],
    );
    const map = await getPgPool().query<{ id: string }>(
      `INSERT INTO knowledge_maps (project_id, workspace_id, summary, tech_stack, modules, source)
       VALUES ($1, $2, 'Signup lets a user create an account.', $3::jsonb, $4::jsonb, 'template')
       RETURNING id`,
      [projectId, owner.workspaceId, JSON.stringify([{ name: 'Node' }]), JSON.stringify([{ name: 'web', path: 'apps/web/package.json', fileCount: 1 }])],
    );
    const flow = await getPgPool().query<{ id: string }>(
      `INSERT INTO business_flows (project_id, knowledge_map_id, flow_key, name, kind, description, layer, entry_points)
       VALUES ($1, $2, 'signup', 'Signup', 'ui', 'old', 'backend', $3::jsonb)
       RETURNING id`,
      [projectId, map.rows[0].id, JSON.stringify(['apps/web/src/app/signup/page.tsx'])],
    );
    await getPgPool().query(
      `INSERT INTO flow_owners (flow_id, agent_id, layer, role) VALUES ($1, $2, 'backend', 'owner')`,
      [flow.rows[0].id, ceo.rows[0].id],
    );
    const run = await enqueue({
      workspaceId: owner.workspaceId,
      projectId,
      activity: 'knowledge_map',
      taskType: 'knowledge_map',
      runtime: 'cursor_local',
      idempotencyKey: `km-ai-${Date.now()}`,
      input: { fixture: '[[stub:knowledge]]' },
    });
    await processRunById(run.id);
    const saved = await getPgPool().query<{ source: string; summary: string; tech_stack: unknown; modules: unknown }>(
      `SELECT source, summary, tech_stack, modules FROM knowledge_maps WHERE id = $1`,
      [map.rows[0].id],
    );
    expect(saved.rows[0].source).toBe('ai');
    expect(saved.rows[0].summary.toLowerCase()).toContain('signup');
    expect(JSON.stringify(saved.rows[0].tech_stack)).toContain('TypeScript');
    expect(JSON.stringify(saved.rows[0].modules)).toContain('apps/web/package.json');
    expect(JSON.stringify(saved.rows[0].modules)).not.toContain('no/such/file.ts');
    const flows = await getPgPool().query<{ flow_key: string; layer: string; entry_points: unknown }>(
      `SELECT flow_key, layer, entry_points FROM business_flows WHERE project_id = $1 ORDER BY flow_key`,
      [projectId],
    );
    const signupFlow = flows.rows.find((row) => row.flow_key === 'signup');
    const entryPoints = typeof signupFlow?.entry_points === 'string' ? JSON.parse(signupFlow.entry_points) as string[] : signupFlow?.entry_points;
    expect(signupFlow?.layer).toBe('backend');
    expect(entryPoints).toEqual(['apps/web/src/app/signup/page.tsx']);
    expect(flows.rows.map((row) => row.flow_key)).toContain('billing');
    const owners = await getPgPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM flow_owners WHERE flow_id = $1`,
      [flow.rows[0].id],
    );
    expect(Number(owners.rows[0].n)).toBe(1);

    const invalid = await enqueue({
      workspaceId: owner.workspaceId,
      projectId,
      activity: 'knowledge_map',
      taskType: 'knowledge_map',
      runtime: 'cursor_local',
      idempotencyKey: `km-bad-${Date.now()}`,
      input: { fixture: '[[stub:map-invalid]]' },
    });
    await processRunById(invalid.id);
    const reverted = await getPgPool().query<{ source: string; summary: string }>(
      `SELECT source, summary FROM knowledge_maps WHERE id = $1`,
      [map.rows[0].id],
    );
    expect(reverted.rows[0].source).toBe('template');
    expect(reverted.rows[0].summary.toLowerCase()).toContain('signup');
    const still = await getPgPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM business_flows WHERE project_id = $1 AND flow_key = 'signup'`,
      [projectId],
    );
    expect(Number(still.rows[0].n)).toBe(1);
  });

  it('estimates story points with the planner and falls back to the heuristic', async () => {
    const owner = await signup(`m2-points-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Points' });
    const projectId = project.body.project.id as string;
    const saved = await request(app).patch('/api/workspace/llm-config').set(owner.auth).send({
      provider: 'cursor', model: 'cursor-agent', apiKey: 'aria-mock-key',
    });
    expect(saved.status).toBe(200);
    const planned = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId, title: 'Short title', description: 'A tiny change.', type: 'feature',
    });
    expect(planned.status).toBe(201);
    expect(planned.body.ticket.storyPoints).toBe(5);
    const events = await listTicketEvents(planned.body.ticket.id as string, { limit: 10 });
    expect(events.some((event) => event.detail && (event.detail as { source?: string }).source === 'planner')).toBe(true);

    const heuristic = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId, title: 'Hi', description: '[[stub:points-bad]]', type: 'feature',
    });
    expect(heuristic.body.ticket.storyPoints).toBe(1);
    const heuristicEvents = await listTicketEvents(heuristic.body.ticket.id as string, { limit: 10 });
    expect(heuristicEvents.some((event) => (event.detail as { source?: string }).source === 'heuristic')).toBe(true);
  });

  it('moves a merged pull to done and a closed pull to rejected', async () => {
    const owner = await signup(`m2-watch-${Date.now()}@aria.dev`);
    await saveGithubToken(owner.workspaceId, 'ghp_watch');
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Watch' });
    const projectId = project.body.project.id as string;
    const base = process.env.GITHUB_API_BASE || '';
    const opened = await fetch(`${base}/repos/acme/demo-app/pulls`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const pull = await opened.json() as { number: number };
    const created = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId, title: 'Ship', description: 'Ready for the owner.', type: 'feature', storyPoints: 2,
    });
    const ticketId = created.body.ticket.id as string;
    await getPgPool().query(`UPDATE tickets SET status = 'awaiting_merge' WHERE id = $1`, [ticketId]);
    const run = await enqueue({
      workspaceId: owner.workspaceId, projectId, ticketId, activity: 'develop', taskType: 'coding', runtime: 'cursor_cloud',
      idempotencyKey: `watch-dev-${Date.now()}`,
    });
    await getPgPool().query(
      `UPDATE agent_runs SET status = 'succeeded', pr_number = $2, pr_url = $3, finished_at = NOW() WHERE id = $1`,
      [run.id, pull.number, `https://github.com/acme/demo-app/pull/${pull.number}`],
    );
    const active = await enqueue({
      workspaceId: owner.workspaceId, projectId, ticketId, activity: 'qa', taskType: 'tests', runtime: 'cursor_cloud',
      idempotencyKey: `watch-qa-${Date.now()}`,
    });
    await watchPullRequests();
    const still = await getPgPool().query<{ status: string }>(`SELECT status FROM tickets WHERE id = $1`, [ticketId]);
    expect(still.rows[0].status).toBe('awaiting_merge');
    await fetch(`${base}/__stub/github/merge/${pull.number}`, { method: 'POST' });
    await watchPullRequests();
    const done = await getPgPool().query<{ status: string }>(`SELECT status FROM tickets WHERE id = $1`, [ticketId]);
    expect(done.rows[0].status).toBe('done');
    const log = await listTicketEvents(ticketId, { eventType: 'status_change', limit: 20 });
    expect(log.some((event) => event.summary.includes('done'))).toBe(true);
    const cancelled = await getPgPool().query<{ status: string }>(`SELECT status FROM agent_runs WHERE id = $1`, [active.id]);
    expect(cancelled.rows[0].status).toBe('cancelled');

    const closedPull = await fetch(`${base}/repos/acme/demo-app/pulls`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const closed = await closedPull.json() as { number: number };
    const other = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId, title: 'Abandon', description: 'Close this pull.', type: 'feature', storyPoints: 1,
    });
    const otherId = other.body.ticket.id as string;
    await getPgPool().query(`UPDATE tickets SET status = 'awaiting_merge' WHERE id = $1`, [otherId]);
    const otherRun = await enqueue({
      workspaceId: owner.workspaceId, projectId, ticketId: otherId, activity: 'develop', taskType: 'coding', runtime: 'cursor_cloud',
      idempotencyKey: `watch-close-${Date.now()}`,
    });
    await getPgPool().query(
      `UPDATE agent_runs SET status = 'succeeded', pr_number = $2, pr_url = $3 WHERE id = $1`,
      [otherRun.id, closed.number, `https://github.com/acme/demo-app/pull/${closed.number}`],
    );
    await fetch(`${base}/__stub/github/close/${closed.number}`, { method: 'POST' });
    await watchPullRequests();
    const rejected = await getPgPool().query<{ status: string }>(`SELECT status FROM tickets WHERE id = $1`, [otherId]);
    expect(rejected.rows[0].status).toBe('rejected');
    const closedLog = await listTicketEvents(otherId, { eventType: 'status_change', limit: 20 });
    expect(closedLog.some((event) => event.summary.includes('rejected'))).toBe(true);
  });

  it('warns at 80 percent and lets only one worker claim a run', async () => {
    const events: string[] = [];
    const stop = onProjectEvent((_id, event) => { events.push(event); });
    const workspaceId = '11111111-1111-4111-8111-111111111199';
    const projectId = '22222222-2222-4222-8222-222222222299';
    const reserved = await reserveRun({
      workspaceId, agentId: null, activity: 'company_generation', projectBudget: 70_000, agentBudget: null, projectId,
    });
    expect(reserved.ok).toBe(true);
    expect(events).toContain('budget:warn');
    await releaseRun(workspaceId, 'company_generation', reserved.reserved);
    stop();

    const owner = await signup(`m2-race-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Race' });
    const raceProject = project.body.project.id as string;
    await getPgPool().query(`UPDATE agent_runs SET status = 'cancelled' WHERE status = 'queued'`);
    const queued = await enqueue({
      workspaceId: owner.workspaceId, projectId: raceProject, activity: 'review', taskType: 'code_review', runtime: 'cursor_local',
      idempotencyKey: `race-${Date.now()}`,
    });
    const [first, second] = await Promise.all([
      claim('race-worker-a', ['cursor_local']),
      claim('race-worker-b', ['cursor_local']),
    ]);
    const winners = [first, second].filter((row) => row != null);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.id).toBe(queued.id);
    await getPgPool().query(`UPDATE agent_runs SET status = 'cancelled' WHERE id = $1`, [queued.id]);
  });

  it('refreshes a stale catalog and blocks a missing pin', async () => {
    const owner = await signup(`m2-catalog-${Date.now()}@aria.dev`);
    const project = await request(app).post('/api/setup/project').set(owner.auth).send({ name: 'Catalog' });
    const projectId = project.body.project.id as string;
    const company = await request(app).post(`/api/projects/${projectId}/company`).set(owner.auth).send({ size: 3, mix: zeroMix });
    expect(company.status).toBe(201);
    const saved = await request(app).patch('/api/workspace/llm-config').set(owner.auth).send({
      provider: 'cursor', model: 'cursor-agent', apiKey: 'aria-mock-key',
    });
    expect(saved.status).toBe(200);
    const roster = await db.query.skills.findMany({ where: eq(skills.projectId, projectId) });
    const ceo = roster.find((agent) => agent.slug === 'ceo');
    expect(ceo?.id).toBeTruthy();
    await db.update(skills).set({ modelOverride: 'missing-model' }).where(eq(skills.id, ceo!.id));
    await getPgPool().query(
      `UPDATE workspaces SET llm_catalog_refreshed_at = NOW() - interval '48 hours', llm_model_catalog = $2::jsonb WHERE id = $1`,
      [owner.workspaceId, JSON.stringify([{ id: 'stale-only' }])],
    );
    const run = await enqueue({
      workspaceId: owner.workspaceId, projectId, agentId: ceo!.id, activity: 'review', taskType: 'code_review', runtime: 'cursor_local',
      idempotencyKey: `catalog-${Date.now()}`,
    });
    await processRunById(run.id);
    const blocked = await getPgPool().query<{ status: string; error_code: string }>(
      `SELECT status, error_code FROM agent_runs WHERE id = $1`,
      [run.id],
    );
    expect(blocked.rows[0]).toMatchObject({ status: 'blocked', error_code: 'MODEL_UNAVAILABLE' });
    const catalog = await getPgPool().query<{ llm_model_catalog: unknown }>(
      `SELECT llm_model_catalog FROM workspaces WHERE id = $1`,
      [owner.workspaceId],
    );
    expect(JSON.stringify(catalog.rows[0].llm_model_catalog)).toContain('claude-opus-5');
  });
});
