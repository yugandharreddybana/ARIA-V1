import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import { getPgPool } from '../services/db.client';
import { listTicketEvents, verifyChain } from '../services/tickets/ticketEvents';
import { storeReport, evidenceAllowsMerge } from '../services/evidence/reports';
import { applyTransition } from '../services/tickets/ticketActions';
import { scanSchedule } from '../services/tickets/ticketActions';

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
