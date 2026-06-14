/**
 * WebSocket hub for ARIA (V27.9 §2.1 + §18H).
 * Authenticates handshakes with RS256 JWT (same key as REST).
 * Rooms:
 *   - session.<id>      session-scoped events
 *   - agent.<id>        agent-scoped events
 *   - system.health     global system status
 *   - project:<id>      project-scoped events (ticket mutations from agents)
 *
 * Token Gateway and Orchestrator emit events through this hub so the web
 * client can render live session status, token warnings, and queue depth.
 */

import { Server as IOServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { validateEnv } from '../config/env';
import { getTokenGateway } from '../services/tokenGateway.factory';

export interface AriaSocketUser {
  userId: string;
  workspaceId: string;
  email: string;
}

interface AriaJwtPayload {
  sub: string;
  workspaceId: string;
  email: string;
  type: 'access';
}

let _io: IOServer | null = null;

/**
 * Returns the singleton Socket.IO server instance.
 * Throws if called before createWsServer().
 */
export function getIO(): IOServer {
  if (!_io) throw new Error('Socket.IO server not initialised — call createWsServer() first');
  return _io;
}

export function createWsServer(httpServer: HttpServer): IOServer {
  const env = validateEnv();
  const io = new IOServer(httpServer, {
    cors: { origin: env.CORS_ORIGINS.split(',').map(o => o.trim()), credentials: true },
    path: '/ws',
  });

  _io = io;

  // ── Handshake auth ──
  io.use((socket: Socket, next) => {
    try {
      const raw =
        (socket.handshake.auth?.token as string | undefined) ??
        (typeof socket.handshake.headers.authorization === 'string' &&
         socket.handshake.headers.authorization.startsWith('Bearer ')
           ? socket.handshake.headers.authorization.slice(7).trim()
           : undefined) ??
        parseCookie(socket.handshake.headers.cookie ?? '')?.aria_access_token;
      if (!raw) return next(new Error('WS_UNAUTHORIZED'));
      const publicKey = env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
      const payload = jwt.verify(raw, publicKey, { algorithms: ['RS256'] }) as AriaJwtPayload;
      if (payload.type !== 'access') return next(new Error('WS_BAD_TOKEN_TYPE'));
      (socket.data as { user: AriaSocketUser }).user = {
        userId: payload.sub,
        workspaceId: payload.workspaceId,
        email: payload.email,
      };
      next();
    } catch {
      next(new Error('WS_UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket.data as { user: AriaSocketUser }).user;
    socket.join(`workspace.${user.workspaceId}`);
    socket.emit('hello', { userId: user.userId, ts: new Date().toISOString() });

    // ── Legacy subscribe / unsubscribe (session.*, agent.*, system.health) ──
    socket.on('subscribe', (payload: { room: string }) => {
      if (!payload?.room) return;
      if (!payload.room.startsWith('session.') &&
          !payload.room.startsWith('agent.')   &&
          payload.room !== 'system.health') return;
      socket.join(payload.room);
    });

    socket.on('unsubscribe', (payload: { room: string }) => {
      if (payload?.room) socket.leave(payload.room);
    });

    // ── Project rooms (agent ticket mutations broadcast here) ──
    socket.on('join:project', (payload: { projectId: string }) => {
      if (typeof payload?.projectId === 'string' && payload.projectId.length > 0) {
        socket.join(`project:${payload.projectId}`);
      }
    });

    socket.on('leave:project', (payload: { projectId: string }) => {
      if (typeof payload?.projectId === 'string') {
        socket.leave(`project:${payload.projectId}`);
      }
    });
  });

  // ── Bridge Token Gateway events onto WS ──
  const gateway = getTokenGateway();
  gateway.events.on('token.warn',      (e) => io.to(`session.${e.sessionId}`).emit('token.warn', e));
  gateway.events.on('token.hard_stop', (e) => io.to(`session.${e.sessionId}`).emit('token.hard_stop', e));
  gateway.events.on('queue.depth',     (e) => io.to('system.health').emit('queue.depth', e));

  return io;
}

function parseCookie(header: string): Record<string, string> | undefined {
  if (!header) return undefined;
  const out: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const i = pair.indexOf('=');
    if (i < 0) continue;
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}
