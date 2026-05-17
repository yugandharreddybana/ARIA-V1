import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ModelTransferService } from '../services/modelTransfer.service';

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'aria-mt-'));
  mkdirSync(resolve(root, '.entiresystem/EXPERIENCE'), { recursive: true });
  mkdirSync(resolve(root, '.entiresystem/skills/backend-api-specialist'), { recursive: true });
  mkdirSync(resolve(root, '.entiresystem/skills/qa-e2e'), { recursive: true });
  writeFileSync(resolve(root, '.entiresystem/CORE_VALUES.yml'), 'priorities:\n  - Safety\n');
  writeFileSync(resolve(root, '.entiresystem/DESIGN.md'),       '# DESIGN\n');
  writeFileSync(resolve(root, '.entiresystem/EXPERIENCE/EXPERIENCE.md'), '# EXPERIENCE\n');
  writeFileSync(resolve(root, '.entiresystem/skills/backend-api-specialist/SKILL.md'),
`---
name: backend-api-specialist
description: stub
trigger_keywords: ["api"]
risk_class: C
domains: ["api"]
source: local
version: "0.0.1"
---
body
`);
  writeFileSync(resolve(root, '.entiresystem/skills/backend-api-specialist/experience.yml'),
`skill: backend-api-specialist
tickets_touched: 1
best_practices:
  - text: "use IDOR ownership"
    veracity: human-approved
    captured_at: "2026-05-16T00:00:00Z"
anti_patterns: []
failure_stories: []
`);
  writeFileSync(resolve(root, '.entiresystem/skills/qa-e2e/SKILL.md'),
`---
name: qa-e2e
description: stub
trigger_keywords: ["e2e"]
risk_class: B
domains: ["qa"]
source: local
version: "0.0.1"
---
body
`);
  return root;
}

describe('ModelTransferService', () => {
  let root: string;
  beforeEach(() => { root = tempRepo(); });

  it('produces a deterministic workspace under .backend/<workspace>/', () => {
    const result = new ModelTransferService(root).run('default');
    expect(result.workspace).toBe('default');
    expect(result.filesIndexed).toBeGreaterThan(0);
    expect(result.skillsIndexed).toBe(2);
    expect(existsSync(join(result.outputDir, 'file_index.json'))).toBe(true);
    expect(existsSync(join(result.outputDir, 'skill_headers.json'))).toBe(true);
    expect(existsSync(join(result.outputDir, 'experience.json'))).toBe(true);
    expect(existsSync(join(result.outputDir, 'prompts/backend-api-specialist.md'))).toBe(true);
    expect(existsSync(join(result.outputDir, 'prompts/qa-e2e.md'))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('skill headers include frontmatter from SKILL.md', () => {
    const result = new ModelTransferService(root).run();
    const headers = JSON.parse(readFileSync(join(result.outputDir, 'skill_headers.json'), 'utf-8'));
    const backend = headers.find((h: { slug: string }) => h.slug === 'backend-api-specialist');
    expect(backend.frontmatter.name).toBe('backend-api-specialist');
    expect(backend.frontmatter.risk_class).toBe('C');
    expect(Array.isArray(backend.frontmatter.trigger_keywords)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('experience digest includes ranked entries with scores', () => {
    const result = new ModelTransferService(root).run();
    const digest = JSON.parse(readFileSync(join(result.outputDir, 'experience.json'), 'utf-8'));
    expect(digest.entries.length).toBeGreaterThan(0);
    expect(digest.entries[0]).toMatchObject({ skill: expect.any(String), kind: expect.any(String), veracity: expect.any(String) });
    rmSync(root, { recursive: true, force: true });
  });

  it('does not contact the network and does not require Ollama', () => {
    // Smoke: just running the service over a temp dir without DATABASE_URL etc. must succeed.
    const r = new ModelTransferService(root).run('smoke');
    expect(r.outputDir).toContain('.backend/smoke');
    rmSync(root, { recursive: true, force: true });
  });
});
