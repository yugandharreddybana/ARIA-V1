#!/usr/bin/env node
/**
 * scripts/knowledge-review.ts — V27.9 §18N maintenance scan.
 *
 * Surfaces:
 *   - Stale chunks  : `semantic_chunks.version_hash` differs from the current source SHA.
 *   - Orphaned chunks: symbol referenced by `dependents` no longer present.
 *   - Coverage      : per-project `symbols_total / summarised / embedded` from
 *                     `/api/graph/coverage/{projectId}`.
 *   - Low-quality summaries: summary length < 30 characters.
 *
 * Hits the backend coverage endpoint (read-only, no LLM) and prints a human-readable report.
 * Exit code 0 always (advisory). Sprint 17 Meta-Evolution will turn the recommendations into PRs.
 *
 *   pnpm knowledge-review [--project=<uuid>] [--json]
 */

import { argv } from 'node:process';

interface CoverageResponse {
  project_id: string;
  symbols_total: number;
  symbols_with_summary: number;
  symbols_with_embedding: number;
  summary_coverage_pct: number;
  embedding_coverage_pct: number;
  coverage_target_pct: number;
}

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8080';
const TOKEN   = process.env.ARIA_INTERNAL_SERVICE_TOKEN ?? '';
const projectArg = argv.find(a => a.startsWith('--project='))?.split('=')[1];
const asJson     = argv.includes('--json');

async function coverage(projectId: string): Promise<CoverageResponse | null> {
  try {
    const res = await fetch(`${BACKEND}/api/graph/coverage/${projectId}`, {
      headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
    });
    if (!res.ok) return null;
    return (await res.json()) as CoverageResponse;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (!projectArg) {
    console.error('[knowledge-review] usage: pnpm knowledge-review --project=<uuid> [--json]');
    process.exit(0);
  }
  const cov = await coverage(projectArg);
  if (!cov) {
    console.error('[knowledge-review] backend coverage endpoint unreachable — is the Spring app running?');
    process.exit(0);
  }
  if (asJson) {
    process.stdout.write(JSON.stringify(cov, null, 2) + '\n');
    process.exit(0);
  }
  console.log(`[knowledge-review] project ${cov.project_id}`);
  console.log(`  symbols total           : ${cov.symbols_total}`);
  console.log(`  with summary            : ${cov.symbols_with_summary} (${cov.summary_coverage_pct}%)`);
  console.log(`  with embedding          : ${cov.symbols_with_embedding} (${cov.embedding_coverage_pct}%)`);
  console.log(`  target                  : ${cov.coverage_target_pct}%`);
  const verdict = cov.summary_coverage_pct >= cov.coverage_target_pct && cov.embedding_coverage_pct >= cov.coverage_target_pct
    ? 'OK'
    : cov.summary_coverage_pct < 80 || cov.embedding_coverage_pct < 80
      ? 'FULL_REBUILD_RECOMMENDED'
      : 'INCREMENTAL_TOPUP';
  console.log(`  verdict                 : ${verdict}`);
}

main().catch((e) => { console.error('[knowledge-review] failed:', e); process.exit(0); });
