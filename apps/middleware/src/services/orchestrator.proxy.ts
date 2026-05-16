/**
 * Middleware → Java Orchestrator HTTP proxy.
 * The Orchestrator endpoints live at ${BACKEND_URL}/api/orchestrator/*.
 */

import { validateEnv } from '../config/env';
import { AppError } from '../middleware/error.middleware';

export interface OrchestratorSession {
  id: string;
  projectId: string;
  workspaceId: string;
  state: string;
  mode: string;
  environment: string;
  missionType: string;
  tokenBudget: number | null;
  startedAt: string;
  endedAt: string | null;
}

async function pass<T>(method: string, path: string, userToken: string, body?: unknown): Promise<T> {
  const env = validateEnv();
  const res = await fetch(`${env.BACKEND_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${userToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error');
    throw new AppError(`Backend orchestrator error (${res.status}): ${text}`, res.status >= 500 ? 502 : res.status);
  }
  return (await res.json()) as T;
}

export const orchestratorProxy = {
  start:  (sid: string, token: string) => pass<OrchestratorSession>('POST', `/api/orchestrator/sessions/${sid}/start`, token),
  pause:  (sid: string, token: string) => pass<OrchestratorSession>('POST', `/api/orchestrator/sessions/${sid}/pause`, token),
  stop:   (sid: string, token: string) => pass<OrchestratorSession>('POST', `/api/orchestrator/sessions/${sid}/stop`, token),
  status: (sid: string, token: string) => pass<OrchestratorSession>('GET',  `/api/orchestrator/sessions/${sid}/status`, token),
};
