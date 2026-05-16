import { db } from '@aria/db';
import { tickets, projects } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { CreateTicketRequest, UpdateTicketRequest } from '@aria/shared';

function sanitiseString(s: string, max = 500): string {
  return s.trim().slice(0, max);
}

export async function listTickets(projectId: string, workspaceId: string) {
  if (!projectId) throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
  const p = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!p) throw new AppError('Project not found', 404, 'NOT_FOUND');
  return db.query.tickets.findMany({
    where: eq(tickets.projectId, projectId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

export async function createTicket(workspaceId: string, data: CreateTicketRequest) {
  if (!data.projectId) throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
  if (!data.title?.trim()) throw new AppError('title is required', 400, 'VALIDATION_ERROR');
  if (!data.description?.trim()) throw new AppError('description is required', 400, 'VALIDATION_ERROR');
  const p = await db.query.projects.findFirst({
    where: and(eq(projects.id, data.projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!p) throw new AppError('Project not found', 404, 'NOT_FOUND');
  const [t] = await db.insert(tickets).values({
    projectId: data.projectId,
    type: data.type,
    title: sanitiseString(data.title, 200),
    description: sanitiseString(data.description, 2000),
    riskClass: data.riskClass ?? 'B',
    affectedDomains: data.affectedDomains ?? [],
  }).returning();
  return t;
}

export async function updateTicket(ticketId: string, workspaceId: string, data: UpdateTicketRequest) {
  if (!ticketId) throw new AppError('ticketId is required', 400, 'VALIDATION_ERROR');
  const existing = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  if (!existing) throw new AppError('Ticket not found', 404, 'NOT_FOUND');
  const p = await db.query.projects.findFirst({
    where: and(eq(projects.id, existing.projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!p) throw new AppError('Forbidden', 403, 'FORBIDDEN');
  const allowedFields: Partial<UpdateTicketRequest> = {};
  if (data.status !== undefined) allowedFields.status = data.status;
  if (data.title !== undefined) allowedFields.title = sanitiseString(data.title, 200);
  if (data.description !== undefined) allowedFields.description = sanitiseString(data.description, 2000);
  if (data.assignedTo !== undefined) allowedFields.assignedTo = data.assignedTo;
  if (data.riskClass !== undefined) allowedFields.riskClass = data.riskClass;
  if (data.affectedDomains !== undefined) allowedFields.affectedDomains = data.affectedDomains;
  const [updated] = await db.update(tickets)
    .set({ ...allowedFields, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))
    .returning();
  return updated;
}
