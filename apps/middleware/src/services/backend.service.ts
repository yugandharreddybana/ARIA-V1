/**
 * Backend service — all HTTP calls from middleware to Spring Boot backend.
 * Single source of truth for backend URL usage.
 */
import { validateEnv } from '../config/env';
import { AppError } from '../middleware/error.middleware';
import type { AnalysisJobResponse, ConceptGraphResponse } from '../types/backend.types';

function backendUrl(path: string): string {
  const env = validateEnv();
  return `${env.BACKEND_URL}${path}`;
}

async function backendFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(backendUrl(path), {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    });
  } catch (err) {
    throw new AppError('Backend unreachable', 503);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new AppError(`Backend error ${res.status}: ${text}`, res.status >= 500 ? 502 : res.status);
  }
  return res.json() as Promise<T>;
}

// ── Analysis Jobs ─────────────────────────────────────────────────────────────

export async function createAnalysisJob(payload: {
  projectId: string;
  repoId: string;
  repoUrl: string;
  branch: string;
  workspaceId: string;
}): Promise<AnalysisJobResponse> {
  return backendFetch<AnalysisJobResponse>('/api/analysis/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listAnalysisJobs(workspaceId: string): Promise<AnalysisJobResponse[]> {
  return backendFetch<AnalysisJobResponse[]>(`/api/analysis/jobs?workspaceId=${workspaceId}`);
}

export async function getAnalysisJob(jobId: string): Promise<AnalysisJobResponse> {
  return backendFetch<AnalysisJobResponse>(`/api/analysis/jobs/${jobId}`);
}

// ── Concept Graph ─────────────────────────────────────────────────────────────

export async function getConceptGraph(projectId: string): Promise<ConceptGraphResponse> {
  return backendFetch<ConceptGraphResponse>(`/api/concept-graph/projects/${projectId}`);
}

export async function clearConceptGraph(projectId: string): Promise<void> {
  return backendFetch<void>(`/api/concept-graph/projects/${projectId}`, { method: 'DELETE' });
}
