import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import { getPgPool } from '../services/db.client';
import { listTicketEvents, verifyChain } from '../services/tickets/ticketEvents';
import {
  agentEligible,
  resolveTicketOwner,
  upsertPathOwnersFromMerge,
} from '../services/ownership/pathOwners';
import { dispatchReadyTickets } from '../services/tickets/ticketDispatcher';

async function signup(email: string) {
  const res = await request(app).post('/api/auth/signup').send({ name: 'M3B Owner', email, password: 'Test1234!' });
  expect(res.status).toBe(201);
  return {
    token: res.body.accessToken as string,
    workspaceId: res.body.user.workspaceId as string,
    auth: { Authorization: `Bearer ${res.body.accessToken as string}` },
  };
}

async function seedProject(auth: { Authorization: string }) {
  const project = await request(app).post('/api/setup/project').set(auth).send({ name: `M3B ${Date.now()}` });
  expect(project.status).toBe(201);
  const projectId = project.body.project.id as string;
  const company = await request(app).post(`/api/projects/${projectId}/company`).set(auth).send({
    size: 8,
    mix: { business: 1, qa: 2, frontend: 1, backend: 1, fullstack: 1, junior: 0, aiml: 0, devops: 0, security: 0 },
  });
  expect(company.status).toBe(201);
  const agents = await getPgPool().query<{ id: string; role_key: string; real_name: string }>(
    `SELECT id, role_key, real_name FROM skills WHERE project_id = $1::uuid AND enabled = true ORDER BY role_key, created_at`,
    [projectId],
  );
  expect(agents.rows.length).toBeGreaterThanOrEqual(2);
  return { projectId, agents: agents.rows };
}

describe('m3b jira hierarchy and ownership', () => {
  it('creates epic > story > sub-task with G/W/T and ceilFib points', async () => {
    const owner = await signup(`m3b-hier-${Date.now()}@aria.dev`);
    const { projectId } = await seedProject(owner.auth);

    const epic = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId,
      title: 'Checkout epic',
      description: 'Deliver checkout end to end',
      type: 'feature',
      issueType: 'epic',
      storyPoints: 13,
    });
    expect(epic.status).toBe(201);
    expect(epic.body.ticket.issueType).toBe('epic');

    const story = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId,
      title: 'Pay with card',
      description: 'User pays with a saved card',
      type: 'feature',
      issueType: 'story',
      epicId: epic.body.ticket.id,
      estimatedDays: 4,
      acceptanceCriteria: [
        { given: 'a signed-in shopper', when: 'they submit a card', then: 'the order is paid' },
      ],
    });
    expect(story.status).toBe(201);
    expect(story.body.ticket.issueType).toBe('story');
    expect(story.body.ticket.storyPoints).toBe(5);
    expect(story.body.ticket.epicId).toBe(epic.body.ticket.id);

    const sub = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId,
      title: 'Wire payment API',
      description: 'Backend charge endpoint',
      type: 'feature',
      issueType: 'sub_task',
      parentId: story.body.ticket.id,
      acceptanceCriteria: [
        { given: 'a valid intent', when: 'POST /charge runs', then: 'the ledger row is written' },
      ],
    });
    expect(sub.status).toBe(201);
    expect(sub.body.ticket.issueType).toBe('sub_task');
    expect(sub.body.ticket.parentId).toBe(story.body.ticket.id);
    expect(sub.body.ticket.epicId).toBe(epic.body.ticket.id);

    const detail = await request(app).get(`/api/tickets/${story.body.ticket.id}`).set(owner.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.ticket.subTasks.some((row: { id: string }) => row.id === sub.body.ticket.id)).toBe(true);

    const blocked = await request(app).patch(`/api/tickets/${story.body.ticket.id}`).set(owner.auth).send({
      status: 'ready_for_dev',
      acceptanceCriteria: [],
    });
    expect(blocked.status).toBe(422);

    const events = await listTicketEvents(sub.body.ticket.id, {});
    expect(verifyChain(events).ok).toBe(true);
    expect(events.some((row) => row.event_type === 'agent_action')).toBe(true);
  });

  it('creates a 10-working-day sprint and lists backlog vs sprint board', async () => {
    const owner = await signup(`m3b-sprint-${Date.now()}@aria.dev`);
    const { projectId } = await seedProject(owner.auth);

    const sprint = await request(app).post(`/api/projects/${projectId}/sprints`).set(owner.auth).send({
      name: 'Sprint 1',
      startsOn: '2026-10-05',
      status: 'active',
    });
    expect(sprint.status).toBe(201);
    expect(sprint.body.sprint.endsOn).toBe('2026-10-16');

    const backlogTicket = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId,
      title: 'Backlog item',
      description: 'Stays in backlog',
      type: 'feature',
      storyPoints: 1,
      acceptanceCriteria: [{ given: 'g', when: 'w', then: 't' }],
    });
    const sprintTicket = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId,
      title: 'Sprint item',
      description: 'In the active sprint',
      type: 'feature',
      storyPoints: 2,
      sprintId: sprint.body.sprint.id,
      acceptanceCriteria: [{ given: 'g', when: 'w', then: 't' }],
    });
    expect(backlogTicket.status).toBe(201);
    expect(sprintTicket.status).toBe(201);

    const backlog = await request(app).get(`/api/projects/${projectId}/backlog`).set(owner.auth);
    expect(backlog.status).toBe(200);
    expect(backlog.body.tickets.some((row: { id: string }) => row.id === backlogTicket.body.ticket.id)).toBe(true);
    expect(backlog.body.tickets.some((row: { id: string }) => row.id === sprintTicket.body.ticket.id)).toBe(false);

    const board = await request(app).get(`/api/projects/${projectId}/sprints/${sprint.body.sprint.id}`).set(owner.auth);
    expect(board.status).toBe(200);
    expect(board.body.tickets.some((row: { id: string }) => row.id === sprintTicket.body.ticket.id)).toBe(true);
  });

  it('upserts path owners on merge paths and routes the next story to the owner', async () => {
    const owner = await signup(`m3b-path-${Date.now()}@aria.dev`);
    const { projectId, agents } = await seedProject(owner.auth);
    const fe = agents.find((row) => row.role_key === 'frontend') ?? agents[0];
    const backup = agents.find((row) => row.id !== fe.id)!;
    expect(fe).toBeTruthy();
    expect(backup).toBeTruthy();

    const ticket = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId,
      title: 'Auth polish',
      description: 'Touch the auth pages',
      type: 'feature',
      storyPoints: 2,
      assigneeAgentId: fe!.id,
      predictedPaths: ['apps/web/src/app/(auth)/login/page.tsx'],
      acceptanceCriteria: [{ given: 'g', when: 'w', then: 't' }],
    });
    expect(ticket.status).toBe(201);

    const upserted = await upsertPathOwnersFromMerge({
      projectId,
      agentId: fe!.id,
      ticketId: ticket.body.ticket.id,
      prNumber: 42,
      paths: ['apps/web/src/app/(auth)/login/page.tsx'],
      backupAgentId: backup!.id,
    });
    expect(upserted).toBeGreaterThan(0);

    const listed = await request(app).get(`/api/projects/${projectId}/path-owners`).set(owner.auth);
    expect(listed.status).toBe(200);
    expect(listed.body.pathOwners[0].ownerAgentId).toBe(fe!.id);
    expect(listed.body.pathOwners[0].pathGlob).toBe('apps/web/**');

    const next = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId,
      title: 'Forgot password',
      description: 'Same auth area',
      type: 'feature',
      storyPoints: 1,
      predictedPaths: ['apps/web/src/app/(auth)/forgot/page.tsx'],
      acceptanceCriteria: [{ given: 'g', when: 'w', then: 't' }],
    });
    expect(next.status).toBe(201);
    const resolved = await resolveTicketOwner({
      workspaceId: owner.workspaceId,
      projectId,
      ticketId: next.body.ticket.id,
      assigneeAgentId: null,
      flowId: null,
      layer: 'frontend',
      predictedPaths: ['apps/web/src/app/(auth)/forgot/page.tsx'],
      allowBackupOnWip: true,
    });
    expect(resolved.agentId).toBe(fe!.id);
    expect(resolved.ownershipSource).toBe('path');
  });

  it('hands off to backup when owner is OFF and logs ownership_handoff', async () => {
    const owner = await signup(`m3b-off-${Date.now()}@aria.dev`);
    const { projectId, agents } = await seedProject(owner.auth);
    const fe = agents.find((row) => row.role_key === 'frontend') ?? agents[0]!;
    const backup = agents.find((row) => row.id !== fe.id)!;

    await upsertPathOwnersFromMerge({
      projectId,
      agentId: fe.id,
      ticketId: (await request(app).post('/api/tickets').set(owner.auth).send({
        projectId, title: 'Seed', description: 'seed', type: 'feature', storyPoints: 1,
        acceptanceCriteria: [{ given: 'g', when: 'w', then: 't' }],
      })).body.ticket.id,
      prNumber: 7,
      paths: ['apps/web/src/components/Button.tsx'],
      backupAgentId: backup.id,
    });

    await getPgPool().query(`UPDATE skills SET enabled = false WHERE id = $1::uuid`, [fe.id]);
    const ticket = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId,
      title: 'Needs backup',
      description: 'Owner is off',
      type: 'feature',
      storyPoints: 1,
      predictedPaths: ['apps/web/src/components/Button.tsx'],
      acceptanceCriteria: [{ given: 'g', when: 'w', then: 't' }],
    });
    const resolved = await resolveTicketOwner({
      workspaceId: owner.workspaceId,
      projectId,
      ticketId: ticket.body.ticket.id,
      assigneeAgentId: null,
      flowId: null,
      layer: 'frontend',
      predictedPaths: ['apps/web/src/components/Button.tsx'],
      allowBackupOnWip: true,
    });
    expect(resolved.agentId).toBe(backup.id);
    expect(resolved.handedOff).toBe(true);
    expect(resolved.handoffReason).toBe('owner_off');
    const events = await listTicketEvents(ticket.body.ticket.id, { eventType: 'ownership_handoff' });
    expect(events.length).toBeGreaterThan(0);
    expect(verifyChain(await listTicketEvents(ticket.body.ticket.id, {})).ok).toBe(true);
  });

  it('hands off to backup when owner is over WIP and logs ownership_handoff', async () => {
    const owner = await signup(`m3b-wip-backup-${Date.now()}@aria.dev`);
    const { projectId, agents } = await seedProject(owner.auth);
    const fe = agents.find((row) => row.role_key === 'frontend') ?? agents[0]!;
    const backup = agents.find((row) => row.id !== fe.id)!;

    const holding = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId,
      title: 'Holds WIP',
      description: 'active slot',
      type: 'feature',
      storyPoints: 2,
      assigneeAgentId: fe.id,
      acceptanceCriteria: [{ given: 'g', when: 'w', then: 't' }],
    });
    await getPgPool().query(
      `UPDATE tickets SET status = 'in_progress', human_approved = true WHERE id = $1::uuid`,
      [holding.body.ticket.id],
    );

    await upsertPathOwnersFromMerge({
      projectId,
      agentId: fe.id,
      ticketId: holding.body.ticket.id,
      prNumber: 11,
      paths: ['apps/web/src/pages/Cart.tsx'],
      backupAgentId: backup.id,
    });

    const elig = await agentEligible(fe.id);
    expect(elig.ok).toBe(false);
    expect(elig.reason).toBe('wip_exceeded');

    const ticket = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId,
      title: 'Needs WIP backup',
      description: 'Owner is over WIP',
      type: 'feature',
      storyPoints: 1,
      assigneeAgentId: fe.id,
      predictedPaths: ['apps/web/src/pages/Cart.tsx'],
      acceptanceCriteria: [{ given: 'g', when: 'w', then: 't' }],
    });
    const resolved = await resolveTicketOwner({
      workspaceId: owner.workspaceId,
      projectId,
      ticketId: ticket.body.ticket.id,
      assigneeAgentId: fe.id,
      flowId: null,
      layer: 'frontend',
      predictedPaths: ['apps/web/src/pages/Cart.tsx'],
      allowBackupOnWip: true,
    });
    expect(resolved.agentId).toBe(backup.id);
    expect(resolved.handedOff).toBe(true);
    expect(resolved.handoffReason).toBe('wip_exceeded');
    const events = await listTicketEvents(ticket.body.ticket.id, { eventType: 'ownership_handoff' });
    expect(events.length).toBeGreaterThan(0);
    expect(verifyChain(await listTicketEvents(ticket.body.ticket.id, {})).ok).toBe(true);
  });

  it('enforces WIP=1 and logs user reassign handoff', async () => {
    const owner = await signup(`m3b-wip-${Date.now()}@aria.dev`);
    const { projectId, agents } = await seedProject(owner.auth);
    const fe = agents.find((row) => row.role_key === 'frontend') ?? agents[0]!;
    const other = agents.find((row) => row.id !== fe.id)!;

    const first = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId,
      title: 'Active one',
      description: 'holds the WIP slot',
      type: 'feature',
      storyPoints: 2,
      assigneeAgentId: fe.id,
      acceptanceCriteria: [{ given: 'g', when: 'w', then: 't' }],
    });
    await getPgPool().query(
      `UPDATE tickets SET status = 'in_progress', human_approved = true WHERE id = $1::uuid`,
      [first.body.ticket.id],
    );
    const elig = await agentEligible(fe.id);
    expect(elig.ok).toBe(false);
    expect(elig.reason).toBe('wip_exceeded');

    const second = await request(app).post('/api/tickets').set(owner.auth).send({
      projectId,
      title: 'Queued',
      description: 'should stay ready until WIP frees',
      type: 'feature',
      storyPoints: 1,
      assigneeAgentId: fe.id,
      acceptanceCriteria: [{ given: 'g', when: 'w', then: 't' }],
    });
    await getPgPool().query(
      `UPDATE tickets SET status = 'ready_for_dev', human_approved = true WHERE id = $1::uuid`,
      [second.body.ticket.id],
    );
    const dispatched = await dispatchReadyTickets();
    expect(dispatched).toBe(0);
    const still = await getPgPool().query<{ status: string }>(`SELECT status FROM tickets WHERE id = $1::uuid`, [second.body.ticket.id]);
    expect(still.rows[0]?.status).toBe('ready_for_dev');

    const reassigned = await request(app).patch(`/api/tickets/${second.body.ticket.id}`).set(owner.auth).send({
      assigneeAgentId: other.id,
    });
    expect(reassigned.status).toBe(200);
    const events = await listTicketEvents(second.body.ticket.id, { eventType: 'ownership_handoff' });
    expect(events.some((row) => (row.detail as { reason?: string })?.reason === 'user_reassign')).toBe(true);
  });

  it('denies path-owner list for a foreign workspace', async () => {
    const owner = await signup(`m3b-idor-${Date.now()}@aria.dev`);
    const other = await signup(`m3b-idor-other-${Date.now()}@aria.dev`);
    const { projectId } = await seedProject(owner.auth);
    const denied = await request(app).get(`/api/projects/${projectId}/path-owners`).set(other.auth);
    expect(denied.status).toBe(404);
  });
});
