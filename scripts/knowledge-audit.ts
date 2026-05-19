#!/usr/bin/env node
/**
 * scripts/knowledge-audit.ts — `/knowledge-audit` CLI.
 *
 * Reads every `.entiresystem/skills/<slug>/experience.yml`, scores each entry via the
 * Knowledge Veracity service, and prints a per-skill report:
 *   - entry counts by veracity
 *   - stale `ai-only` entries (decayed below 10% of weight)
 *   - stale `human-approved` entries (decayed below 50%)
 *
 * Exit code 0 always (advisory). Sprint 17 hooks this into Meta-Evolution to propose
 * pruning PRs.
 *
 *   pnpm -F @aria/middleware exec tsx ../../scripts/knowledge-audit.ts [--json]
 */

import { ExperienceService } from '../apps/middleware/src/services/experience.service';
import { auditSkill } from '../apps/middleware/src/services/veracity.service';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..');
const svc = new ExperienceService(repoRoot);
const skills = svc.listSkills();
const asJson = process.argv.includes('--json');

const report = skills.map(slug => ({ slug, ...auditSkill(svc.read(slug)) }));

if (asJson) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(0);
}

console.log(`[knowledge-audit] ${skills.length} skill(s) under .entiresystem/skills/`);
for (const r of report) {
  console.log(`\n  • ${r.skill}`);
  console.log(`      total entries          : ${r.totalEntries}`);
  console.log(`      human-authored          : ${r.byVeracity['human-authored']}`);
  console.log(`      human-approved          : ${r.byVeracity['human-approved']}`);
  console.log(`      ai-only                 : ${r.byVeracity['ai-only']}`);
  console.log(`      stale ai-only (<0.10)   : ${r.staleAiOnly.length}`);
  console.log(`      stale human-approved (<0.50): ${r.staleHumanApproved.length}`);
  for (const s of r.staleAiOnly.slice(0, 3)) {
    const text = 'text' in s.entry ? s.entry.text : `${s.entry.id}: ${s.entry.description}`;
    console.log(`        ↳ ${text.slice(0, 100)} (score ${s.score.toFixed(3)}, age ${s.ageDays.toFixed(0)}d)`);
  }
}
console.log('\n[knowledge-audit] done.');
