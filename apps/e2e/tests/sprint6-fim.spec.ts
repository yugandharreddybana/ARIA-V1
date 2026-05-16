/**
 * Sprint 6 — File Integrity Monitor smoke tests.
 *
 * These run as Node-side tests (no browser) and exercise the FIM service against
 * a temporary repo so they don't interfere with the real .entiresystem/.
 */
import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync, mkdirSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FileIntegrityMonitor } from '../../middleware/src/services/fim.service';

function fakeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'aria-fim-e2e-'));
  mkdirSync(resolve(root, '.entiresystem'), { recursive: true });
  writeFileSync(resolve(root, '.entiresystem/CORE_VALUES.yml'), 'priorities:\n  - Safety\n');
  writeFileSync(resolve(root, '.entiresystem/DESIGN.md'),       '# DESIGN\n');
  writeFileSync(resolve(root, '.entiresystem/DOMAIN_BOUNDARIES.json'), '{}');
  writeFileSync(resolve(root, '.entiresystem/SKILL.md'),        '---\nname: stub\n---\n');
  return root;
}

test('S6-03 FIM signs and validates a clean repo', () => {
  const root = fakeRepo();
  const fim = new FileIntegrityMonitor({ repoRoot: root });
  fim.signAllTracked();
  expect(fim.hasDrift()).toBe(false);
  rmSync(root, { recursive: true, force: true });
});

test('S6-04 FIM raises drift on tampered file', () => {
  const root = fakeRepo();
  const fim = new FileIntegrityMonitor({ repoRoot: root });
  fim.signAllTracked();
  writeFileSync(resolve(root, '.entiresystem/CORE_VALUES.yml'), 'priorities:\n  - Profit\n');
  expect(fim.hasDrift()).toBe(true);
  rmSync(root, { recursive: true, force: true });
});

test('S6-05 FIM raises drift on deleted file', () => {
  const root = fakeRepo();
  const fim = new FileIntegrityMonitor({ repoRoot: root });
  fim.signAllTracked();
  unlinkSync(resolve(root, '.entiresystem/DESIGN.md'));
  expect(fim.hasDrift()).toBe(true);
  rmSync(root, { recursive: true, force: true });
});
