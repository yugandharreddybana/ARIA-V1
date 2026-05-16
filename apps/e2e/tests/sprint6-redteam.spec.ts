/**
 * Sprint 6 — Red Team probe-generator smoke tests.
 * Validates that probes are deterministic per seed and that severity floors
 * are observed (critical for IDOR + SQLi).
 */
import { test, expect } from '@playwright/test';
import { generateProbes, topSeverity, type ChangedRoute } from '../../middleware/src/services/redTeam.service';

const routes: ChangedRoute[] = [
  { method: 'POST', path: '/api/orchestrator/sessions',         acceptedFields: ['projectId','mode'] },
  { method: 'POST', path: '/api/orchestrator/sessions/:id/start' },
  { method: 'GET',  path: '/api/orchestrator/sessions/:id/status' },
];

test('S6-06 deterministic per seed', () => {
  const a = generateProbes(routes, 'sprint6-fixed');
  const b = generateProbes(routes, 'sprint6-fixed');
  expect(JSON.stringify(a.probes)).toBe(JSON.stringify(b.probes));
});

test('S6-07 top severity is critical for routes with :id', () => {
  const r = generateProbes(routes, 'sprint6-critical');
  expect(topSeverity(r)).toBe('critical');
});

test('S6-08 emits at least one probe per family on a mixed route set', () => {
  const r = generateProbes(routes, 'sprint6-family');
  expect(r.byFamily.sqli).toBeGreaterThan(0);
  expect(r.byFamily.xss).toBeGreaterThan(0);
  expect(r.byFamily.csrf).toBeGreaterThan(0);
  expect(r.byFamily.idor).toBeGreaterThan(0);
  expect(r.byFamily.mass_assign).toBeGreaterThan(0);
});
