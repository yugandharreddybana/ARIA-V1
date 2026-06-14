import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import { agentCreateTicket, agentUpdateTicketStatus } from '../services/agentTicket.service';
import { getIO } from '../ws';
import type { TicketStatus } from '@aria/shared';

/**
 * POST /api/agent/tickets
 * Called by agent skills to create a ticket on the Kanban board.
 * Broadcasts `ticket:created` to both the session room and project room
 * so the frontend updates in real-time without polling.
 */
export async function agentCreateTicketHandler(
  req: AriaRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const {
      sessionId,
      skillId,
      projectId,
      title,
      description,
      type,
      riskClass,
      affectedDomains,
      promptBlock,
    } = req.body as {
      sessionId: string;
      skillId: string;
      projectId: string;
      title: string;
      description: string;
      type: string;
      riskClass?: 'A' | 'B' | 'C';
      affectedDomains?: string[];
      promptBlock?: unknown;
    };

    const ticket = await agentCreateTicket({
      sessionId,
      skillId,
      workspaceId: req.user!.workspaceId,
      projectId,
      title,
      description,
      type: type as import('@aria/shared').TicketType,
      riskClass,
      affectedDomains,
      promptBlock,
    });

    // Real-time broadcast — both rooms may have listeners
    try {
      const io = getIO();
      io.to(`session.${sessionId}`).emit('ticket:created', { ticket });
      io.to(`project:${projectId}`).emit('ticket:created', { ticket });
    } catch {
      // WS not ready in test environment — non-fatal
    }

    res.status(201).json({ ticket });
  } catch (e) {
    next(e);
  }
}

/**
 * PATCH /api/agent/tickets/:id/status
 * Called by agent skills to move a ticket to a new status.
 * Broadcasts `ticket:updated` to project room and optionally session room.
 */
export async function agentUpdateTicketStatusHandler(
  req: AriaRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { status, skillId, sessionId } = req.body as {
      status: TicketStatus;
      skillId: string;
      sessionId?: string;
    };

    const ticket = await agentUpdateTicketStatus(
      req.params.id,
      req.user!.workspaceId,
      status,
      skillId,
    );

    try {
      const io = getIO();
      io.to(`project:${ticket.projectId}`).emit('ticket:updated', { ticket });
      if (sessionId) io.to(`session.${sessionId}`).emit('ticket:updated', { ticket });
    } catch {
      // WS not ready in test environment — non-fatal
    }

    res.json({ ticket });
  } catch (e) {
    next(e);
  }
}
