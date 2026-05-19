#!/usr/bin/env node
/**
 * tools/no-direct-llm.ts — CI lint that bans direct LLM provider calls.
 *
 * V27.9 §18H — every LLM call must route through the Token Gateway (ADR-0003). Direct fetches
 * to provider URLs or SDK imports (anthropic / openai) outside of the Token Gateway
 * dispatchers fail CI.
 *
 *   pnpm exec tsx tools/no-direct-llm.ts <changed-files...>
 */

import { readFileSync } from 'node:fs';

const ALLOWED_PATHS = [
  'apps/middleware/src/services/dispatcher.ollama.ts',
  'apps/middleware/src/services/dispatcher.anthropic.ts',
  'apps/middleware/src/services/tokenGateway.factory.ts',
  'tools/no-direct-llm.ts',
];

const BANNED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /https?:\/\/api\.anthropic\.com/i, reason: 'direct Anthropic API URL' },
  { re: /https?:\/\/api\.openai\.com/i,    reason: 'direct OpenAI API URL' },
  { re: /from\s+['"]@anthropic-ai\/sdk['"]/, reason: 'direct @anthropic-ai/sdk import' },
  { re: /from\s+['"]openai['"]/,             reason: 'direct openai SDK import' },
  // Ollama can only be called from the dispatcher.
  { re: /\/api\/(chat|generate|embeddings)['"]/, reason: 'direct Ollama API call' },
];

const files = process.argv.slice(2).filter(f => /\.(ts|tsx|js|java)$/.test(f));
if (files.length === 0) {
  console.log('[no-direct-llm] no eligible files; skipping.');
  process.exit(0);
}

let failed = 0;
for (const file of files) {
  // Normalise path for the allow-list.
  const normalised = file.replace(/^\.\//, '');
  if (ALLOWED_PATHS.some(p => normalised === p || normalised.endsWith(p))) continue;

  let content: string;
  try { content = readFileSync(file, 'utf-8'); } catch { continue; }

  for (const { re, reason } of BANNED_PATTERNS) {
    if (re.test(content)) {
      console.error(`[no-direct-llm] FAIL ${file}: ${reason} — route through the Token Gateway (ADR-0003).`);
      failed++;
    }
  }
}

if (failed > 0) {
  console.error(`[no-direct-llm] ${failed} violation(s) — failing.`);
  process.exit(1);
}
console.log(`[no-direct-llm] ${files.length} file(s) ok.`);
process.exit(0);
