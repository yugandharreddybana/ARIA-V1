import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ExperienceService } from '../services/experience.service';

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'aria-exp-'));
  mkdirSync(resolve(root, '.entiresystem/skills/x/'), { recursive: true });
  mkdirSync(resolve(root, '.entiresystem/skills/y/'), { recursive: true });
  writeFileSync(resolve(root, '.entiresystem/skills/x/experience.yml'),
`skill: x
tickets_touched: 7
best_practices:
  - text: "use IDOR ownership checks"
    veracity: human-authored
    captured_at: "2026-01-01T00:00:00Z"
anti_patterns: []
failure_stories: []
`);
  return root;
}

describe('ExperienceService', () => {
  let root: string;
  beforeEach(() => { root = tempRepo(); });

  it('lists skills sorted alphabetically', () => {
    const svc = new ExperienceService(root);
    expect(svc.listSkills()).toEqual(['x', 'y']);
    rmSync(root, { recursive: true, force: true });
  });

  it('reads existing yaml and preserves tickets_touched + best_practices', () => {
    const svc = new ExperienceService(root);
    const exp = svc.read('x');
    expect(exp.skill).toBe('x');
    expect(exp.tickets_touched).toBe(7);
    expect(exp.best_practices).toHaveLength(1);
    expect(exp.best_practices[0].veracity).toBe('human-authored');
    rmSync(root, { recursive: true, force: true });
  });

  it('returns empty profile for an unknown slug without throwing', () => {
    const svc = new ExperienceService(root);
    const exp = svc.read('not-a-skill');
    expect(exp.skill).toBe('not-a-skill');
    expect(exp.tickets_touched).toBe(0);
    expect(exp.best_practices).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  it('appends entries idempotently and round-trips through write+read', () => {
    const svc = new ExperienceService(root);
    svc.appendAntiPattern('x', 'never SELECT *', 'human-approved');
    svc.appendAntiPattern('x', 'never SELECT *', 'human-approved');  // dedup
    const exp = svc.read('x');
    expect(exp.anti_patterns).toHaveLength(1);
    expect(exp.anti_patterns[0].veracity).toBe('human-approved');
    const written = readFileSync(resolve(root, '.entiresystem/skills/x/experience.yml'), 'utf-8');
    expect(written).toContain('anti_patterns:');
    expect(written).toContain('never SELECT *');
    rmSync(root, { recursive: true, force: true });
  });

  it('appendFailureStory preserves id + dedups', () => {
    const svc = new ExperienceService(root);
    svc.appendFailureStory('x', {
      id: 'F1', description: 'bug', root_cause: 'a', resolution: 'b', veracity: 'human-authored',
    });
    svc.appendFailureStory('x', {
      id: 'F1', description: 'bug', root_cause: 'a', resolution: 'b', veracity: 'human-authored',
    });
    expect(svc.read('x').failure_stories).toHaveLength(1);
    rmSync(root, { recursive: true, force: true });
  });

  it('incrementTicketsTouched is additive', () => {
    const svc = new ExperienceService(root);
    svc.incrementTicketsTouched('x', 3);
    svc.incrementTicketsTouched('x', 2);
    expect(svc.read('x').tickets_touched).toBe(12);
    rmSync(root, { recursive: true, force: true });
  });
});
