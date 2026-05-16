'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';

/**
 * ARIA WebSocket hook. Authenticates with the same RS256 access token used
 * for REST calls, auto-reconnects, and exposes a typed event surface.
 *
 * Rooms:
 *   - `session.<id>`      session-scoped events (status transitions, token warnings)
 *   - `agent.<id>`        agent-scoped events (heartbeat, current task)
 *   - `system.health`     global system status (queue depth, rate-limit alerts)
 */

export type AriaSocketEvent =
  | { type: 'hello'; userId: string; ts: string }
  | { type: 'session.update'; sessionId: string; state: string; mode: string }
  | { type: 'agent.status'; agentId: string; status: 'idle' | 'working' | 'blocked' }
  | { type: 'token.warn'; sessionId: string; projected: number; warnLimit: number }
  | { type: 'token.hard_stop'; sessionId: string; projected: number; hardLimit: number }
  | { type: 'queue.depth'; data: { totalQueueDepth: number; acceptingRequests: boolean } };

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

export function useAriaSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<AriaSocketEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('aria_token');
    if (!token) return;

    const socket = io(WS_URL, {
      path: '/ws',
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    const fan = (type: AriaSocketEvent['type']) =>
      (payload: Record<string, unknown>) => setLastEvent({ type, ...(payload as object) } as AriaSocketEvent);

    socket.on('hello',          fan('hello'));
    socket.on('session.update', fan('session.update'));
    socket.on('agent.status',   fan('agent.status'));
    socket.on('token.warn',     fan('token.warn'));
    socket.on('token.hard_stop', fan('token.hard_stop'));
    socket.on('queue.depth',    fan('queue.depth'));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const subscribe = useCallback((room: string) => {
    socketRef.current?.emit('subscribe', { room });
  }, []);

  const unsubscribe = useCallback((room: string) => {
    socketRef.current?.emit('unsubscribe', { room });
  }, []);

  return { connected, lastEvent, subscribe, unsubscribe };
}
