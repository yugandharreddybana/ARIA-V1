#!/usr/bin/env node
/**
 * tools/anti-test-dodging.ts — static linter that fails CI if a test file:
 *   1. contains zero `expect(` calls
 *   2. contains only trivial expectations (`expect(true).toBe(true)`, `expect(1).toBe(1)`)
 *   3. contains `it.skip` / `it.todo` / `xit(` / `xdescribe(` with no replacement
 *
 * Pure regex-based (fast, no TypeScript compile). Run on
 *   `git diff --name-only origin/main...HEAD -- 'apps/**\/*.test.ts' 'apps/**\/*.spec.ts'`
 */

import { readFileSync } from 'node:fs';

const TRIVIAL_PATTERNS = [
  /expect\(\s*true\s*\)\.\s*to(Be|Equal|BeTruthy)\s*\(\s*true\s*\)/,
  /expect\(\s*1\s*\)\.\s*to(Be|Equal)\s*\(\s*1\s*\)/,
  /expect\(\s*['"`][^'"`]*['"`]\s*\)\.\s*to(Be|Equal)\s*\(\s*['"`][^'"`]*['"`]\s*\)/,
];

const SKIP_PATTERNS = [
  /\b(it|test|describe)\.(skip|todo)\b/,
  /\b(xit|xtest|xdescribe)\s*\(/,
];

const files = process.argv.slice(2).filter(f => /\.(test|spec)\.(ts|tsx|js)$/.test(f));
if (files.length === 0) {
  console.log('[anti-test-dodging] no test files; skipping.');
  process.exit(0);
}

let failed = 0;
for (const file of files) {
  let content: string;
  try { content = readFileSync(file, 'utf-8'); } catch { continue; }

  const expectCount = (content.match(/\bexpect\s*\(/g) ?? []).length;
  if (expectCount === 0) {
    console.error(`[anti-test-dodging] FAIL ${file}: zero expect() calls`);
    failed++;
    continue;
  }

  for (const re of TRIVIAL_PATTERNS) {
    if (re.test(content) && expectCount <= 2) {
      console.error(`[anti-test-dodging] FAIL ${file}: trivial assertion (\`${re.source}\`)`);
      failed++;
    }
  }
  for (const re of SKIP_PATTERNS) {
    if (re.test(content)) {
      console.error(`[anti-test-dodging] FAIL ${file}: contains skipped/todo test`);
      failed++;
    }
  }
}

if (failed > 0) {
  console.error(`[anti-test-dodging] ${failed} violation(s) — failing.`);
  process.exit(1);
}
console.log(`[anti-test-dodging] ${files.length} file(s) ok.`);
process.exit(0);
