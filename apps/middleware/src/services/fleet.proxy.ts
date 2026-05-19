/**
 * Middleware → Java Fleet Commander proxy (V27.9 §17.4 + §18I).
 *
 * The Java backend is the source of truth for fleet events; the middleware proxies REST
 * calls for the dashboard + relays interesting events onto the WebSocket hub so the System
 * Health page can react live.
 */

import { validateEnv } from '../config/env';
import { AppError } from '../middleware/error.middleware';

export interface FleetOutcomeRow {
  id: string;
  epicId: string;
  topic: string;
  payload: string;
  agentId: string;
  signature: string;
  createdAt: string;
}

export interface ContractDebtRow {
  id: string;
  sessionId?: string;
  producerAgent: string;
  consumerAgents: string;
  draftContractRef?: string;
  reconciledAt?: string;
  createdAt: string;
}

async function call<T>(method: string, path: string, bearer: string, body?: unknown): Promise<T> {
  const env = validateEnv();
  const res = await fetch(`${env.BACKEND_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error');
    throw new AppError(`Fleet backend error (${res.status}): ${text}`, res.status >= 500 ? 502 : res.status);
  }
  return (await res.json()) as T;
}

export const fleetProxy = {
  register:        (agentId: string, agentFamily: string, bearer: string) =>
                     call('POST', '/api/fleet/agents', bearer, { agentId, agentFamily }),
  publish:         (envelope: { epicId: string; topic: string; payload: string; agentId: string; signature: string }, bearer: string) =>
                     call<FleetOutcomeRow>('POST', '/api/fleet/events', bearer, envelope),
  recent:          (bearer: string, epicId?: string) =>
                     call<FleetOutcomeRow[]>('GET', '/api/fleet/events' + (epicId ? `?epicId=${encodeURIComponent(epicId)}` : ''), bearer),
  heartbeat:       (body: unknown, bearer: string) =>
                     call('POST', '/api/fleet/heartbeats', bearer, body),
  healScan:        (bearer: string) =>
                     call<{ cycles_detected: number; cycles: string[][] }>('POST', '/api/fleet/heal/scan', bearer),
  deadlockSweep:   (bearer: string) =>
                     call<ContractDebtRow[]>('POST', '/api/fleet/deadlock/sweep', bearer),
  openShadow:      (ticketRef: string, speculativeDiff: string, bearer: string) =>
                     call<{ branch: string }>('POST', '/api/fleet/shadow', bearer, { ticketRef, speculativeDiff }),
  openDebts:       (bearer: string) =>
                     call<ContractDebtRow[]>('GET', '/api/fleet/debts', bearer),
  openBreakers:    (bearer: string) =>
                     call('GET', '/api/fleet/breakers', bearer),
};
