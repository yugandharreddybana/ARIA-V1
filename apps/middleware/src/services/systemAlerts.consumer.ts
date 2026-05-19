/**
 * V27.9 §17 — Redis `system.alerts` consumer.
 *
 * Subscribes to the `system.alerts` stream (or pub/sub channel) via ioredis. Each alert
 * payload is translated into a `POST /api/incidents` against the Java backend (via the
 * existing service-token). Sprint 14 (Chaos Sandbox) shifts producers to also include trace
 * IDs from OTel for direct Replay correlation.
 *
 * Payload contract (JSON):
 *   { source, severity (P0..P3), title, description, relatedSessionId?, relatedCommits? }
 *
 * Starts on demand from `index.ts` so unit tests that import the module are unaffected.
 */

import Redis from 'ioredis';
import { validateEnv } from '../config/env';

export interface SystemAlertPayload {
  source: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  title: string;
  description: string;
  relatedSessionId?: string;
  relatedCommits?: string[];
}

const STREAM = 'system.alerts';
const GROUP  = 'aria-middleware-alerts';
const CONSUMER = 'middleware-1';
const BLOCK_MS = 5_000;
const COUNT = 10;

let started = false;
let abort = false;

/** Idempotent — calling twice in the same process is a noop. */
export function startSystemAlertsConsumer(opts?: { onAlert?: (p: SystemAlertPayload) => Promise<void> }): void {
  if (started) return;
  started = true;
  abort = false;
  void runLoop(opts?.onAlert ?? defaultForwarder).catch(err => {
    console.error('[system-alerts] consumer crashed:', err);
    started = false;
  });
}

export function stopSystemAlertsConsumer(): void { abort = true; started = false; }

async function runLoop(handle: (p: SystemAlertPayload) => Promise<void>): Promise<void> {
  const env = validateEnv();
  const r = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
  try { await r.connect(); } catch (e) { console.warn('[system-alerts] redis connect failed:', (e as Error).message); started = false; return; }
  // Ensure the consumer group exists.
  try { await r.xgroup('CREATE', STREAM, GROUP, '$', 'MKSTREAM'); }
  catch (e) {
    // BUSYGROUP — group already exists, that's fine.
    if (!(e instanceof Error) || !e.message.includes('BUSYGROUP')) {
      console.warn('[system-alerts] xgroup create:', (e as Error).message);
    }
  }
  while (!abort) {
    try {
      const res = await r.xreadgroup('GROUP', GROUP, CONSUMER, 'COUNT', COUNT, 'BLOCK', BLOCK_MS, 'STREAMS', STREAM, '>') as
        Array<[string, Array<[string, string[]]>]> | null;
      if (!res) continue;
      for (const [, entries] of res) {
        for (const [id, kv] of entries) {
          const payload = kvToPayload(kv);
          if (payload) {
            try { await handle(payload); }
            catch (err) { console.error('[system-alerts] handler error', id, (err as Error).message); }
          }
          await r.xack(STREAM, GROUP, id).catch(() => undefined);
        }
      }
    } catch (e) {
      console.warn('[system-alerts] read error:', (e as Error).message);
      await new Promise(res => setTimeout(res, 2_000));
    }
  }
  await r.quit().catch(() => undefined);
}

function kvToPayload(kv: string[]): SystemAlertPayload | null {
  // Pairs: [key1, val1, key2, val2, ...]
  const m = new Map<string, string>();
  for (let i = 0; i < kv.length - 1; i += 2) m.set(kv[i], kv[i + 1]);
  const json = m.get('payload');
  if (!json) return null;
  try {
    const p = JSON.parse(json) as SystemAlertPayload;
    if (!p.severity || !p.title || !p.description) return null;
    return p;
  } catch { return null; }
}

/** Default — POST to the local backend `/api/incidents` with the internal service token. */
async function defaultForwarder(p: SystemAlertPayload): Promise<void> {
  const env = validateEnv();
  const token = process.env.ARIA_INTERNAL_SERVICE_TOKEN ?? '';
  try {
    await fetch(`${env.BACKEND_URL}/api/incidents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(p),
    });
  } catch (e) {
    console.warn('[system-alerts] forward to backend failed:', (e as Error).message);
  }
}
