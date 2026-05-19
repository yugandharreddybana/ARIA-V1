/**
 * Sprint 7 — /model-transfer smoke test.
 * Validates that the daemon can refresh .backend/<workspace>/ without making any LLM call.
 */
import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ModelTransferService } from '../../middleware/src/services/modelTransfer.service';

function fakeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'aria-mt-e2e-'));
  mkdirSync(resolve(root, '.entiresystem/skills/backend-api-specialist'), { recursive: true });
  writeFileSync(resolve(root, '.entiresystem/CORE_VALUES.yml'), 'priorities:\n  - Safety\n');
  writeFileSync(resolve(root, '.entiresystem/skills/backend-api-specialist/SKILL.md'),
`---
name: backend-api-specialist
description: stub
risk_class: C
domains: ["api"]
source: local
version: "0.0.1"
---
body
`);
  writeFileSync(resolve(root, '.entiresystem/skills/backend-api-specialist/experience.yml'),
`skill: backend-api-specialist
tickets_touched: 0
best_practices: []
anti_patterns: []
failure_stories: []
`);
  return root;
}

test('S7-05 model-transfer writes a complete backend workspace', () => {
  const root = fakeRepo();
  const r = new ModelTransferService(root).run('default');
  expect(r.filesIndexed).toBeGreaterThan(0);
  expect(r.skillsIndexed).toBe(1);
  expect(existsSync(join(r.outputDir, 'file_index.json'))).toBe(true);
  const headers = JSON.parse(readFileSync(join(r.outputDir, 'skill_headers.json'), 'utf-8'));
  expect(headers[0].slug).toBe('backend-api-specialist');
  rmSync(root, { recursive: true, force: true });
});

test('S7-06 POST /api/experience/model-transfer requires auth', async ({ request }) => {
  const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';
  const res = await request.post(`${API}/api/experience/model-transfer`, { data: {} });
  expect([401, 403]).toContain(res.status());
});
