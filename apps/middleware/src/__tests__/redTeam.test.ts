import { describe, it, expect } from 'vitest';
import { generateProbes, topSeverity, type ChangedRoute } from '../services/redTeam.service';

const routes: ChangedRoute[] = [
  { method: 'POST', path: '/api/orchestrator/sessions',         acceptedFields: ['projectId','mode','environment'] },
  { method: 'POST', path: '/api/orchestrator/sessions/:id/start' },
  { method: 'GET',  path: '/api/orchestrator/sessions/:id/status' },
];

describe('Red Team probe generator', () => {
  it('produces a deterministic set of probes for the same seed', () => {
    const a = generateProbes(routes, 'run-1');
    const b = generateProbes(routes, 'run-1');
    expect(JSON.stringify(a.probes)).toEqual(JSON.stringify(b.probes));
  });

  it('always emits sqli + xss probes per route', () => {
    const r = generateProbes(routes, 'run-2');
    const families = new Set(r.probes.map(p => p.family));
    expect(families.has('sqli')).toBe(true);
    expect(families.has('xss')).toBe(true);
  });

  it('emits csrf only on writes and mass_assign when fields are declared', () => {
    const r = generateProbes(routes, 'run-3');
    const csrf = r.probes.filter(p => p.family === 'csrf');
    expect(csrf.every(p => p.target.method !== 'GET')).toBe(true);
    const massAssign = r.probes.find(p => p.family === 'mass_assign');
    expect(massAssign).toBeDefined();
  });

  it('emits IDOR probes for routes with :id placeholders', () => {
    const r = generateProbes(routes, 'run-4');
    const idor = r.probes.filter(p => p.family === 'idor');
    expect(idor.length).toBeGreaterThan(0);
    expect(idor.every(p => p.target.path.includes(':'))).toBe(true);
  });

  it('reports the highest severity in the run', () => {
    const r = generateProbes(routes, 'run-5');
    expect(topSeverity(r)).toBe('critical');
  });
});
