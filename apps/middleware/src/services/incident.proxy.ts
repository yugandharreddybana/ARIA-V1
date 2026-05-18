/**
 * Middleware → Java IncidentCommander proxy (V27.9 §17).
 *
 * Posts declared incidents to `${BACKEND_URL}/api/incidents` and exposes a paginated list
 * to the dashboard. The middleware also raises incidents directly when:
 *   - Token Gateway emits `token.hard_stop` (auto-declare a P2 budget incident).
 *   - Sanitizer rate guard trips (auto-declare a P1 abuse incident).
 *
 * Both auto-declarations are wired in `index.ts` so they survive process restarts via the
 * EventEmitter subscription.
 */

import { validateEnv } from '../config/env';
import { AppError } from '../middleware/error.middleware';

export type Severity = 'P0' | 'P1' | 'P2' | 'P3';

export interface IncidentRow {
  id: string;
  detectedAt: string;
  source: string;
  severity: Severity;
  title: string;
  description: string;
  status: 'open' | 'investigating' | 'mitigated' | 'resolved' | 'postmortem';
  relatedSessionId?: string;
  jiraRef?: string;
  resolvedAt?: string;
}

export interface DeclareIncidentInput {
  source: string;
  severity: Severity;
  title: string;
  description: string;
  relatedSessionId?: string;
  relatedCommits?: string[];
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
    throw new AppError(`Backend incident error (${res.status}): ${text}`, res.status >= 500 ? 502 : res.status);
  }
  return (await res.json()) as T;
}

export const incidentProxy = {
  declare:    (body: DeclareIncidentInput, bearer: string) => call<IncidentRow>('POST', '/api/incidents', bearer, body),
  list:       (bearer: string)                              => call<IncidentRow[]>('GET',  '/api/incidents', bearer),
  get:        (id: string, bearer: string)                  => call<IncidentRow>('GET',  `/api/incidents/${id}`, bearer),
  transition: (id: string, to: IncidentRow['status'], bearer: string) =>
                call<IncidentRow>('POST', `/api/incidents/${id}/transition`, bearer, { to }),
};
