/**
 * Distillation proxy + Pre-Flight Estimator (V27.9 §18N + §7).
 *
 * `distill()` forwards to the Java engine at `${BACKEND_URL}/api/distill` and merges in
 * `experienceNotes` / `antiPatterns` from the file-side ExperienceService (which lives in the
 * middleware). The returned payload is what the Orchestrator hands to specialist agents.
 *
 * `preFlight()` uses the running compression-ratio average per (project, agent) to project
 * the actual token cost of an upcoming LLM call. Used by the Token Gateway to reject
 * underfunded sessions BEFORE the dispatch happens.
 *
 * The estimator is intentionally storage-agnostic for unit tests — `PreFlightEstimatorDeps`
 * accepts a `loadRunningRatio` callback the test can stub.
 */

import { validateEnv } from '../config/env';
import { AppError } from '../middleware/error.middleware';
import { ExperienceService } from './experience.service';
import { rank } from './veracity.service';
import { resolve } from 'node:path';
import { getPgPool } from './db.client';

export interface DistilledContextPayload {
  taskId: string;
  agentId: string;
  distillationTimestamp: string;
  totalTokensEstimated: number;
  rawTokensWouldHaveBeen: number;
  compressionRatio: number;
  affectedSymbols: Array<{ symbol: string; summary: string; filePath: string; lineStart: number | null; lineEnd: number | null }>;
  moduleContext:  Array<{ module: string; summary: string }>;
  domainConcepts: Array<{ concept: string; summary: string }>;
  governingDecisions: Array<{ adrId: string; title: string; summary: string }>;
  experienceNotes: string[];
  antiPatterns: string[];
  durationMs: number;
}

export interface DistillInput {
  projectId: string;
  sessionId?: string;
  agentId: string;
  taskDescription: string;
  affectedSkill?: string;            // optional — used to enrich with skill-specific experience
  maxAffectedSymbols?: number;
  maxModuleContext?: number;
  maxDomainConcepts?: number;
  maxDecisions?: number;
}

const REPO_ROOT = resolve(process.cwd(), '..', '..');

export async function distill(input: DistillInput, bearerToken: string): Promise<DistilledContextPayload> {
  const env = validateEnv();
  const res = await fetch(`${env.BACKEND_URL}/api/distill`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error');
    throw new AppError(`Distillation backend error (${res.status}): ${text}`, res.status >= 500 ? 502 : res.status);
  }
  const payload = (await res.json()) as DistilledContextPayload;

  // Enrich with file-side experience + anti-patterns (top-3 of each, scored by veracity).
  if (input.affectedSkill) {
    const svc = new ExperienceService(REPO_ROOT);
    const exp = svc.read(input.affectedSkill);
    payload.experienceNotes = rank(exp.best_practices).slice(0, 3).map(r => r.entry.text);
    payload.antiPatterns    = rank(exp.anti_patterns).slice(0, 3).map(r => r.entry.text);
  }
  return payload;
}

// ── Pre-Flight Estimator ──────────────────────────────────────────────────

export interface PreFlightEstimateInput {
  projectId: string;
  agentId: string;
  rawPromptTokens: number;
}

export interface PreFlightEstimate {
  /** Running compression ratio over the last `windowSamples` distillation runs. */
  compressionRatio: number;
  /** Projected actual tokens that will hit the LLM after distillation. */
  projectedTokens: number;
  /** Sample size used. */
  sampleCount: number;
}

const DEFAULT_RATIO = 1.0;        // when no history exists, assume no compression
const WINDOW = 20;                // moving average over last 20 distillation runs

export async function preFlight(input: PreFlightEstimateInput): Promise<PreFlightEstimate> {
  const pool = getPgPool();
  try {
    const { rows } = await pool.query<{ ratio: string; count: string }>(
      `SELECT COALESCE(AVG(compression_ratio), $3)::text AS ratio, COUNT(*)::text AS count
         FROM (SELECT compression_ratio FROM distillation_runs
                WHERE project_id = $1::uuid AND agent_id = $2
             ORDER BY created_at DESC LIMIT ${WINDOW}) t`,
      [input.projectId, input.agentId, DEFAULT_RATIO],
    );
    const ratio = Number(rows[0]?.ratio ?? DEFAULT_RATIO);
    const sampleCount = Number(rows[0]?.count ?? 0);
    const projected = ratio > 0 ? Math.ceil(input.rawPromptTokens / ratio) : input.rawPromptTokens;
    return { compressionRatio: ratio, projectedTokens: projected, sampleCount };
  } catch {
    // If the table doesn't exist yet (e.g. early test environments), fall back gracefully.
    return { compressionRatio: DEFAULT_RATIO, projectedTokens: input.rawPromptTokens, sampleCount: 0 };
  }
}
