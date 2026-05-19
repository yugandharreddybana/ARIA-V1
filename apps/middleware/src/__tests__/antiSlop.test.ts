import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintFiles } from '../services/antiSlop.service';

function tmpFile(name: string, body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'aria-slop-'));
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

describe('Anti-Slop Gate', () => {
  it('passes on a clean tsx file with full score', () => {
    const file = tmpFile('clean.tsx', `
import { cn } from '@/lib/utils';
export function Hero() {
  return <h1 className={cn('text-foreground text-3xl')}>ARIA</h1>;
}
`);
    const r = lintFiles([file]);
    expect(r.pass).toBe(true);
    expect(r.totalScore).toBe(10);
  });

  it('hard-fails on a P0 inline hex colour', () => {
    const file = tmpFile('dirty.tsx', `
export function Hero() { return <h1 style={{ color: '#ff0099' }}>X</h1>; }
`);
    const r = lintFiles([file]);
    expect(r.pass).toBe(false);
    expect(r.findings.some(f => f.severity === 'p0' && f.rule === 'inline-hex')).toBe(true);
  });

  it('hard-fails on TODO/FIXME markers (specificity)', () => {
    const file = tmpFile('todo.tsx', `
// TODO: this is a slop marker
export function X() { return <span>hi</span>; }
`);
    const r = lintFiles([file]);
    expect(r.pass).toBe(false);
    expect(r.findings.some(f => f.rule === 'todo-marker')).toBe(true);
  });
});
