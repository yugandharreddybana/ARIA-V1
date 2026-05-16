/**
 * Local Red Team Saboteur (V27.9 §13 / §18E).
 * Generates deterministic adversarial payloads from a seeded RNG so the same
 * commit produces the same probe set in CI.
 *
 * Probe families (Sprint 6 scope; chaos sandbox + Blue Team integration are Sprint 14):
 *   - SQL injection
 *   - XSS (reflected + DOM markers)
 *   - CSRF (missing-token / token-confusion templates)
 *   - IDOR (sibling-user id substitution)
 *   - Mass assignment (extra-field smuggling)
 *
 * Each probe is classified critical / high / medium / low. Critical/high MUST block
 * the PR. The runner is intentionally storage-agnostic — the CI step calls `probe()`
 * with the changed-route catalogue and pipes findings to red_team_findings table.
 */

export type ProbeFamily = 'sqli' | 'xss' | 'csrf' | 'idor' | 'mass_assign';
export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface Probe {
  family: ProbeFamily;
  payload: unknown;
  severity: Severity;
  note: string;
}

export interface ChangedRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  acceptedFields?: string[];
}

export interface ProbeReport {
  runId: string;
  generatedAt: string;
  totalProbes: number;
  byFamily: Record<ProbeFamily, number>;
  probes: Array<Probe & { target: ChangedRoute }>;
}

/** Deterministic LCG seeded from a string — same seed = same probe set in CI. */
class SeededRng {
  private state: number;
  constructor(seed: string) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    this.state = h || 1;
  }
  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0xffffffff;
  }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
}

const SQLI_PAYLOADS = [
  `' OR '1'='1`,
  `'; DROP TABLE users; --`,
  `' UNION SELECT NULL,NULL,NULL --`,
  `' OR sleep(5)--`,
];
const XSS_PAYLOADS = [
  `<script>alert(1)</script>`,
  `"><img src=x onerror=alert(1)>`,
  `javascript:alert(document.cookie)`,
  `<svg/onload=alert(1)>`,
];
const CSRF_TEMPLATES = [
  { headers: { /* missing CSRF token */ },                         note: 'missing-csrf-token' },
  { headers: { 'X-CSRF-Token': 'WRONG_VALUE' },                    note: 'token-confusion' },
  { headers: { origin: 'https://attacker.example' },               note: 'cross-origin' },
];
const MASS_ASSIGN_EXTRAS = ['isAdmin', 'role', 'is_active', 'userId', 'workspaceId', 'riskClass'];

/**
 * Build a deterministic probe set for the given changed-route catalogue.
 */
export function generateProbes(routes: ChangedRoute[], runId: string): ProbeReport {
  const rng = new SeededRng(runId);
  const probes: ProbeReport['probes'] = [];

  for (const route of routes) {
    const isWrite = route.method !== 'GET';

    // SQLi — query/body string parameter substitution
    probes.push({
      family: 'sqli', payload: rng.pick(SQLI_PAYLOADS), severity: 'critical',
      note: 'string param replaced with classic SQL-injection payload', target: route,
    });

    // XSS — reflected payload in any string body field
    probes.push({
      family: 'xss', payload: rng.pick(XSS_PAYLOADS), severity: 'high',
      note: 'reflected XSS payload — assert content-type/escaping on response', target: route,
    });

    // CSRF — only meaningful for writes
    if (isWrite) {
      probes.push({
        family: 'csrf', payload: rng.pick(CSRF_TEMPLATES), severity: 'high',
        note: 'unauthenticated cross-origin write should be rejected', target: route,
      });
    }

    // IDOR — substitute foreign uuid into path
    if (route.path.includes(':id') || route.path.includes(':projectId')) {
      probes.push({
        family: 'idor',
        payload: { id: '00000000-0000-0000-0000-000000000000', actorUserId: 'other-user' },
        severity: 'critical',
        note: 'request resource owned by another user — expect 404/403', target: route,
      });
    }

    // Mass assignment — smuggle extra privileged fields in body
    if (isWrite && route.acceptedFields?.length) {
      const extras = MASS_ASSIGN_EXTRAS.filter(k => !route.acceptedFields!.includes(k));
      if (extras.length) {
        probes.push({
          family: 'mass_assign',
          payload: Object.fromEntries(extras.slice(0, 3).map(k => [k, 'MALICIOUS'])),
          severity: 'high',
          note: 'extra fields must be stripped by Zod (.strict())', target: route,
        });
      }
    }
  }

  const byFamily: Record<ProbeFamily, number> = { sqli: 0, xss: 0, csrf: 0, idor: 0, mass_assign: 0 };
  for (const p of probes) byFamily[p.family]++;

  return { runId, generatedAt: new Date().toISOString(), totalProbes: probes.length, byFamily, probes };
}

/** Convenience: highest severity in a report. Critical > high > medium > low. */
export function topSeverity(report: ProbeReport): Severity | null {
  if (report.probes.some(p => p.severity === 'critical')) return 'critical';
  if (report.probes.some(p => p.severity === 'high'))     return 'high';
  if (report.probes.some(p => p.severity === 'medium'))   return 'medium';
  if (report.probes.some(p => p.severity === 'low'))      return 'low';
  return null;
}
