import { db } from '@aria/db';
import { tickets, projects } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { CreateTicketRequest, UpdateTicketRequest } from '@aria/shared';

export async function listTickets(projectId: string, workspaceId: string) {
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)) });
  if (!p) throw new AppError('Project not found', 404);
  return db.query.tickets.findMany({
    where: eq(tickets.projectId, projectId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

export async function createTicket(workspaceId: string, data: CreateTicketRequest) {
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, data.projectId), eq(projects.workspaceId, workspaceId)) });
  if (!p) throw new AppError('Project not found', 404);
  const [t] = await db.insert(tickets).values({
    projectId: data.projectId,
    type: data.type,
    title: data.title,
    description: data.description,
    riskClass: data.riskClass ?? 'B',
    affectedDomains: data.affectedDomains ?? [],
  }).returning();
  return t;
}

export async function updateTicket(ticketId: string, workspaceId: string, data: UpdateTicketRequest) {
  const existing = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  if (!existing) throw new AppError('Ticket not found', 404);
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, existing.projectId), eq(projects.workspaceId, workspaceId)) });
  if (!p) throw new AppError('Forbidden', 403);
  const [updated] = await db.update(tickets)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))
    .returning();
  return updated;
}
