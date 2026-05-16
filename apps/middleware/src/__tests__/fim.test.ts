import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FileIntegrityMonitor } from '../services/fim.service';

function setupFakeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'aria-fim-'));
  mkdirSync(resolve(root, '.entiresystem'), { recursive: true });
  writeFileSync(resolve(root, '.entiresystem/CORE_VALUES.yml'),
    'priorities:\n  - Safety\n  - Trust\n  - Long-term growth\n  - Short-term revenue\n');
  writeFileSync(resolve(root, '.entiresystem/DESIGN.md'), '# DESIGN.md\n\n(brand contract stub)\n');
  writeFileSync(resolve(root, '.entiresystem/DOMAIN_BOUNDARIES.json'), '{ "services": [] }\n');
  writeFileSync(resolve(root, '.entiresystem/SKILL.md'), '---\nname: stub\n---\n');
  return root;
}

describe('FileIntegrityMonitor', () => {
  let root: string;
  beforeEach(() => { root = setupFakeRepo(); });

  it('signs every tracked file and reports ok on a clean repo', () => {
    const fim = new FileIntegrityMonitor({ repoRoot: root });
    const entries = fim.signAllTracked();
    expect(entries).toHaveLength(4);
    const results = fim.checkAll();
    expect(results.every(r => r.status === 'ok')).toBe(true);
    expect(fim.hasDrift()).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('detects modified files as drift', () => {
    const fim = new FileIntegrityMonitor({ repoRoot: root });
    fim.signAllTracked();
    writeFileSync(resolve(root, '.entiresystem/CORE_VALUES.yml'), 'priorities:\n  - Revenue (compromised)\n');
    const results = fim.checkAll();
    const core = results.find(r => r.path.endsWith('CORE_VALUES.yml'))!;
    expect(core.status).toBe('modified');
    expect(fim.hasDrift()).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('detects untracked changes to non-existent registry as untracked', () => {
    const fim = new FileIntegrityMonitor({ repoRoot: root });
    const results = fim.checkAll();
    // signAllTracked NOT called → all four files exist on disk but the registry is empty
    expect(results.filter(r => r.status === 'untracked')).toHaveLength(4);
    rmSync(root, { recursive: true, force: true });
  });

  it('detects missing tracked file', () => {
    const fim = new FileIntegrityMonitor({ repoRoot: root });
    fim.signAllTracked();
    unlinkSync(resolve(root, '.entiresystem/DESIGN.md'));
    const results = fim.checkAll();
    const design = results.find(r => r.path.endsWith('DESIGN.md'))!;
    expect(design.status).toBe('missing');
    rmSync(root, { recursive: true, force: true });
  });

  it('detects tampered registry signature', () => {
    const fim = new FileIntegrityMonitor({ repoRoot: root });
    fim.signAllTracked();
    // Tamper with one entry's signature directly.
    const regPath = resolve(root, '.entiresystem/fim_registry.json');
    const reg = JSON.parse(readFileSync(regPath, 'utf-8'));
    reg.entries['.entiresystem/CORE_VALUES.yml'].signature = Buffer.alloc(64).toString('base64');
    writeFileSync(regPath, JSON.stringify(reg));
    const results = fim.checkAll();
    const core = results.find(r => r.path.endsWith('CORE_VALUES.yml'))!;
    expect(core.status).toBe('invalid_signature');
    rmSync(root, { recursive: true, force: true });
  });
});
