/**
 * Turn-1 Discovery Form (V27.9 §14) — required before any UI work.
 * Stores: Postgres `ui_discovery_forms` + YAML mirror under .entiresystem/ui_discovery/<ticket>.yml.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import type { UiDiscoveryInput } from '../schemas/uiDiscovery.schemas';

export interface UiDiscoveryRecord extends UiDiscoveryInput {
  createdAt: string;
  updatedAt: string;
}

export class UiDiscoveryService {
  constructor(
    private readonly pool: Pick<Pool, 'query'>,
    private readonly repoRoot: string,
  ) {}

  async upsert(input: UiDiscoveryInput, userId: string | null): Promise<UiDiscoveryRecord> {
    const { rows } = await this.pool.query<{ created_at: string; updated_at: string }>(
      `INSERT INTO ui_discovery_forms (
         ticket_id, audience, surface, tone, brand_context, constraints, success_metrics, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid)
       ON CONFLICT (ticket_id) DO UPDATE SET
         audience        = EXCLUDED.audience,
         surface         = EXCLUDED.surface,
         tone            = EXCLUDED.tone,
         brand_context   = EXCLUDED.brand_context,
         constraints     = EXCLUDED.constraints,
         success_metrics = EXCLUDED.success_metrics,
         updated_at      = NOW()
       RETURNING created_at, updated_at`,
      [
        input.ticketId, input.audience, input.surface, input.tone,
        input.brandContext ?? null,
        JSON.stringify(input.constraints),
        JSON.stringify(input.successMetrics),
        userId,
      ],
    );

    // Write the YAML mirror so the team can review via git.
    const dir = resolve(this.repoRoot, '.entiresystem/ui_discovery');
    mkdirSync(dir, { recursive: true });
    const safeId = input.ticketId.replace(/[^a-zA-Z0-9_.\-]/g, '_');
    const yaml = [
      `ticket_id: ${JSON.stringify(input.ticketId)}`,
      `audience: ${JSON.stringify(input.audience)}`,
      `surface: ${JSON.stringify(input.surface)}`,
      `tone: ${JSON.stringify(input.tone)}`,
      input.brandContext ? `brand_context: ${JSON.stringify(input.brandContext)}` : 'brand_context: null',
      `constraints: ${JSON.stringify(input.constraints)}`,
      `success_metrics: ${JSON.stringify(input.successMetrics)}`,
    ].join('\n') + '\n';
    writeFileSync(resolve(dir, `${safeId}.yml`), yaml);

    return { ...input, createdAt: rows[0].created_at, updatedAt: rows[0].updated_at };
  }

  async get(ticketId: string): Promise<UiDiscoveryRecord | null> {
    const { rows } = await this.pool.query<{
      ticket_id: string; audience: string; surface: string; tone: string;
      brand_context: string | null; constraints: string[]; success_metrics: string[];
      created_at: string; updated_at: string;
    }>(`SELECT * FROM ui_discovery_forms WHERE ticket_id = $1`, [ticketId]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      ticketId: r.ticket_id, audience: r.audience, surface: r.surface, tone: r.tone,
      brandContext: r.brand_context ?? undefined,
      constraints: Array.isArray(r.constraints) ? r.constraints : [],
      successMetrics: Array.isArray(r.success_metrics) ? r.success_metrics : [],
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }
}
