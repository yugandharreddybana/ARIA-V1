import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AriaRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { AppError } from '../middleware/error.middleware';
import { db, projects } from '@aria/db';
import { and, eq } from 'drizzle-orm';
import { createSprintSchema, reassignPathOwnerSchema, updateSprintSchema } from '../schemas/tickets.schema';
import { createSprint, getSprint, listSprints, serializeSprint, updateSprint } from '../services/tickets/sprints';
import { listPathOwners, reassignPathOwner } from '../services/ownership/pathOwners';
import * as ticketSvc from '../services/tickets.service';

const uuidSchema = z.string().uuid();

function requireUuid(value: string | undefined, name: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new AppError(`${name} must be a uuid`, 400, 'VALIDATION_ERROR');
  return parsed.data;
}

async function ownedProject(projectId: string, workspaceId: string) {
  requireUuid(projectId, 'projectId');
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');
  return project;
}

export const projectM3bRouter = Router({ mergeParams: true });
projectM3bRouter.use(requireAuth);

projectM3bRouter.get('/:projectId/sprints', async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    const rows = await listSprints(req.params.projectId);
    res.json({ sprints: rows.map(serializeSprint) });
  } catch (err) { next(err); }
});

projectM3bRouter.post('/:projectId/sprints', validate(createSprintSchema), async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    const sprint = await createSprint({
      projectId: req.params.projectId,
      name: req.body.name,
      goal: req.body.goal,
      startsOn: req.body.startsOn,
      endsOn: req.body.endsOn,
      status: req.body.status,
    });
    res.status(201).json({ sprint: serializeSprint(sprint) });
  } catch (err) { next(err); }
});

projectM3bRouter.patch('/:projectId/sprints/:sprintId', validate(updateSprintSchema), async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    requireUuid(req.params.sprintId, 'sprintId');
    const sprint = await updateSprint({
      sprintId: req.params.sprintId,
      projectId: req.params.projectId,
      name: req.body.name,
      goal: req.body.goal,
      status: req.body.status,
    });
    res.json({ sprint: serializeSprint(sprint) });
  } catch (err) { next(err); }
});

projectM3bRouter.get('/:projectId/sprints/:sprintId', async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    requireUuid(req.params.sprintId, 'sprintId');
    const sprint = await getSprint(req.params.sprintId, req.params.projectId);
    const tickets = await ticketSvc.listTickets(req.params.projectId, req.user!.workspaceId, {
      sprintId: req.params.sprintId,
    });
    res.json({ sprint: serializeSprint(sprint), tickets });
  } catch (err) { next(err); }
});

projectM3bRouter.get('/:projectId/backlog', async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    const tickets = await ticketSvc.listTickets(req.params.projectId, req.user!.workspaceId, { backlog: true });
    res.json({ tickets });
  } catch (err) { next(err); }
});

projectM3bRouter.get('/:projectId/path-owners', async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    const rows = await listPathOwners(req.params.projectId);
    res.json({
      pathOwners: rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        pathGlob: row.path_glob,
        layer: row.layer,
        ownerAgentId: row.owner_agent_id,
        backupAgentId: row.backup_agent_id,
        source: row.source,
        lastTicketId: row.last_ticket_id,
        lastPrNumber: row.last_pr_number,
        ownerName: row.owner_name ?? null,
        backupName: row.backup_name ?? null,
      })),
    });
  } catch (err) { next(err); }
});

projectM3bRouter.post('/:projectId/path-owners/reassign', validate(reassignPathOwnerSchema), async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    const row = await reassignPathOwner({
      workspaceId: req.user!.workspaceId,
      projectId: req.params.projectId,
      pathOwnerId: req.body.pathOwnerId,
      toAgentId: req.body.toAgentId,
      ticketId: req.body.ticketId,
      handoverMd: req.body.handoverMd,
    });
    res.json({
      pathOwner: {
        id: row.id,
        projectId: row.project_id,
        pathGlob: row.path_glob,
        layer: row.layer,
        ownerAgentId: row.owner_agent_id,
        backupAgentId: row.backup_agent_id,
        source: row.source,
        ownerName: row.owner_name ?? null,
        backupName: row.backup_name ?? null,
      },
    });
  } catch (err) { next(err); }
});
