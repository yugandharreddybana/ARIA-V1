import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsertReturn = [{ id: 'ticket-1', projectId: 'p1', status: 'backlog', type: 'feature', title: 'Fix bug', description: 'Something broken', riskClass: 'B', affectedDomains: [], humanApproved: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
const mockUpdateReturn = [{ id: 'ticket-1', projectId: 'p1', status: 'in_progress', type: 'feature', title: 'Fix bug', description: 'Something broken', riskClass: 'B', affectedDomains: [], humanApproved: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];

const mockDb = {
  query: {
    skills:   { findFirst: vi.fn() },
    projects: { findFirst: vi.fn() },
    tickets:  { findFirst: vi.fn() },
  },
  insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue(mockInsertReturn) })) })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue(mockUpdateReturn) })) })) })),
};

vi.mock('@aria/db', () => ({
  db: mockDb,
  tickets:  {},
  projects: {},
  skills:   {},
}));

import { agentCreateTicket, agentUpdateTicketStatus } from '../services/agentTicket.service';

describe('agentCreateTicket', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws 403 when skill not found in workspace', async () => {
    mockDb.query.skills.findFirst.mockResolvedValue(null);
    await expect(
      agentCreateTicket({
        sessionId: '00000000-0000-0000-0000-000000000001',
        skillId:   '00000000-0000-0000-0000-000000000002',
        workspaceId: 'ws1',
        projectId: '00000000-0000-0000-0000-000000000003',
        title: 'T', description: 'D', type: 'feature',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('throws 404 when project not found in workspace', async () => {
    mockDb.query.skills.findFirst.mockResolvedValue({ id: 'sk1' });
    mockDb.query.projects.findFirst.mockResolvedValue(null);
    await expect(
      agentCreateTicket({
        sessionId: '00000000-0000-0000-0000-000000000001',
        skillId:   '00000000-0000-0000-0000-000000000002',
        workspaceId: 'ws1',
        projectId: '00000000-0000-0000-0000-000000000003',
        title: 'T', description: 'D', type: 'feature',
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('creates ticket and returns it with correct defaults', async () => {
    mockDb.query.skills.findFirst.mockResolvedValue({ id: 'sk1' });
    mockDb.query.projects.findFirst.mockResolvedValue({ id: 'p1' });
    const ticket = await agentCreateTicket({
      sessionId: '00000000-0000-0000-0000-000000000001',
      skillId:   '00000000-0000-0000-0000-000000000002',
      workspaceId: 'ws1',
      projectId: 'p1',
      title: 'Fix bug', description: 'Something broken', type: 'bug',
    });
    expect(ticket.id).toBe('ticket-1');
    expect(ticket.status).toBe('backlog');
    expect(ticket.humanApproved).toBe(false);
  });

  it('truncates title to 500 chars and description to 5000 chars', async () => {
    mockDb.query.skills.findFirst.mockResolvedValue({ id: 'sk1' });
    mockDb.query.projects.findFirst.mockResolvedValue({ id: 'p1' });
    const longTitle = 'A'.repeat(600);
    const longDesc  = 'B'.repeat(6000);
    await agentCreateTicket({
      sessionId: '00000000-0000-0000-0000-000000000001',
      skillId:   '00000000-0000-0000-0000-000000000002',
      workspaceId: 'ws1', projectId: 'p1',
      title: longTitle, description: longDesc, type: 'feature',
    });
    const insertCall = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertCall.title.length).toBe(500);
    expect(insertCall.description.length).toBe(5000);
  });
});

describe('agentUpdateTicketStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws 404 for unknown ticket', async () => {
    mockDb.query.tickets.findFirst.mockResolvedValue(null);
    await expect(
      agentUpdateTicketStatus('bad-id', 'ws1', 'in_progress', 'sk1'),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('throws 403 when ticket project not in workspace', async () => {
    mockDb.query.tickets.findFirst.mockResolvedValue({ id: 'ticket-1', projectId: 'p1' });
    mockDb.query.projects.findFirst.mockResolvedValue(null);
    await expect(
      agentUpdateTicketStatus('ticket-1', 'ws-other', 'in_progress', 'sk1'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('updates ticket status and returns updated ticket', async () => {
    mockDb.query.tickets.findFirst.mockResolvedValue({ id: 'ticket-1', projectId: 'p1' });
    mockDb.query.projects.findFirst.mockResolvedValue({ id: 'p1' });
    const updated = await agentUpdateTicketStatus('ticket-1', 'ws1', 'in_progress', 'sk1');
    expect(updated.status).toBe('in_progress');
  });
});
