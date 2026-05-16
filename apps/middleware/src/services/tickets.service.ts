import { db } from '@aria/db';
import { tickets, projects } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { CreateTicketRequest, UpdateTicketRequest } from '@aria/shared';

function sanitise(s: string, max: number): string {
  return s.trim().slice(0, max);
}

export async function listTickets(projectId: string, workspaceId: string) {
  if (!projectId) throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found or access denied', 404, 'NOT_FOUND');
  return db.query.tickets.findMany({
    where: eq(tickets.projectId, projectId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

export async function createTicket(
  workspaceId: string,
  data: CreateTicketRequest,
) {
  if (!data.projectId) throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
  if (!data.title?.trim()) throw new AppError('title is required', 400, 'VALIDATION_ERROR');
  if (!data.description?.trim()) throw new AppError('description is required', 400, 'VALIDATION_ERROR');
  if (!data.type) throw new AppError('type is required', 400, 'VALIDATION_ERROR');

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, data.projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found or access denied', 404, 'NOT_FOUND');

  const [ticket] = await db
    .insert(tickets)
    .values({
      projectId: data.projectId,
      type: data.type,
      title: sanitise(data.title, 500),
      description: sanitise(data.description, 5000),
      riskClass: data.riskClass ?? 'B',
      affectedDomains: data.affectedDomains ?? [],
    })
    .returning();
  return ticket;
}

export async function updateTicket(
  ticketId: string,
  workspaceId: string,
  data: UpdateTicketRequest,
) {
  if (!ticketId) throw new AppError('ticketId is required', 400, 'VALIDATION_ERROR');

  const existing = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
  });
  if (!existing) throw new AppError('Ticket not found', 404, 'NOT_FOUND');

  // Verify workspace ownership before allowing mutation
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, existing.projectId),
      eq(projects.workspaceId, workspaceId),
    ),
  });
  if (!project) throw new AppError('Forbidden', 403, 'FORBIDDEN');

  // Strict allowlist — only fields defined in UpdateTicketRequest
  // UpdateTicketRequest: status, assignedSkillId, humanApproved, title, description
  const patch: Partial<{
    status: typeof existing.status;
    assignedSkillId: string | null;
    humanApproved: boolean;
    title: string;
    description: string;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (data.status !== undefined) patch.status = data.status;
  if (data.assignedSkillId !== undefined) patch.assignedSkillId = data.assignedSkillId;
  if (data.humanApproved !== undefined) patch.humanApproved = data.humanApproved;
  if (data.title !== undefined) patch.title = sanitise(data.title, 500);
  if (data.description !== undefined) patch.description = sanitise(data.description, 5000);

  const [updated] = await db
    .update(tickets)
    .set(patch)
    .where(eq(tickets.id, ticketId))
    .returning();
  return updated;
}
