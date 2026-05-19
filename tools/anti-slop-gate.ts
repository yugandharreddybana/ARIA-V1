#!/usr/bin/env node
/**
 * tools/anti-slop-gate.ts — CI wrapper around the Anti-Slop service.
 *
 *   Usage: tsx tools/anti-slop-gate.ts <file>...
 *
 * The CI workflow passes `git diff --name-only origin/main...HEAD -- '*.tsx' '*.css'`.
 * Exits with code 1 on any P0 finding or a total score below 6.
 */

import { lintFiles } from '../apps/middleware/src/services/antiSlop.service';

const files = process.argv.slice(2).filter(f => /\.(tsx?|css|scss)$/.test(f));
if (files.length === 0) {
  console.log('[anti-slop] no eligible files; skipping.');
  process.exit(0);
}

const report = lintFiles(files);
console.log(`[anti-slop] files=${report.files.length} findings=${report.findings.length} score=${report.totalScore}/10`);
for (const f of report.findings) {
  console.log(`  [${f.severity.toUpperCase()}] ${f.file}:${f.line} (${f.axis}/${f.rule}) — ${f.evidence}`);
}
console.log(`[anti-slop] axis scores: ${JSON.stringify(report.scoreByAxis)}`);
process.exit(report.pass ? 0 : 1);
