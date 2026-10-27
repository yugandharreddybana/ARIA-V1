#!/usr/bin/env node
/**
 * Count tokens for ARIA agent skills (before vs after lean rewrite).
 * Method: tiktoken cl100k_base when available, else ceil(utf8Bytes/4).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

let encode;
let method = 'ceil(utf8Bytes/4)';
try {
  const { encoding_for_model } = require('tiktoken');
  const enc = encoding_for_model('gpt-4o');
  encode = (text) => enc.encode(text).length;
  method = 'tiktoken cl100k_base (gpt-4o)';
} catch {
  encode = (text) => Math.ceil(Buffer.byteLength(String(text), 'utf8') / 4);
}

function tokens(text) {
  return encode(text);
}

const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/agents/token-baseline.json'), 'utf8'));
const beforeById = Object.fromEntries(baseline.rows.map((row) => [row.id, row.tokens]));
const skillsDir = path.join(root, 'docs/agents/skills');
const base = JSON.parse(fs.readFileSync(path.join(skillsDir, '_base.json'), 'utf8'));

function composeInstructions(roleKey, flowNames = []) {
  const skill = JSON.parse(fs.readFileSync(path.join(skillsDir, `${roleKey}.json`), 'utf8'));
  const flows = flowNames.length ? `Own flows: ${flowNames.join(', ')}.` : 'No flow assigned.';
  return [
    `Role: ${skill.role} (${skill.roleKey}).`,
    `Tier: ${skill.modelTier}. Max out: ${skill.maxOutputTokens}.`,
    `Extends: ${skill.extends}.`,
    `Inputs: ${skill.inputs.join('; ')}.`,
    `Do: ${skill.do.join('; ')}.`,
    `Don't: ${[...skill.dont, ...base.dont].join('; ')}.`,
    `Done-when: ${skill.doneWhen.join('; ')}.`,
    `HardRules: ${base.hardRules.map((rule) => rule.id).join(',')}.`,
    `Context: ${skill.contextLoad.join(',')}; never ${base.neverLoad.join(',')}.`,
    flows,
    'Do not merge. User approves every merge and every idea.',
    'Output JSON matching role outputSchema only.',
  ].join('\n');
}

const rewriteRows = [];
for (const row of baseline.rows) {
  if (row.id === 'companyGenerator.instructionsFor') continue;
  let afterText;
  if (row.id === 'activities/prompts.ts' || row.id === '.entiresystem/SKILL.md') {
    afterText = fs.readFileSync(path.join(root, row.source), 'utf8');
  } else if (row.id.startsWith('.entiresystem/skills/')) {
    afterText = fs.readFileSync(path.join(root, row.source), 'utf8');
  } else continue;
  const afterTok = tokens(afterText);
  rewriteRows.push({ id: row.id, before: row.tokens, after: afterTok, saved: row.tokens - afterTok });
}
const rewriteBefore = rewriteRows.reduce((s, r) => s + r.before, 0);
const rewriteAfter = rewriteRows.reduce((s, r) => s + r.after, 0);

const roleKeys = fs.readdirSync(skillsDir)
  .filter((n) => n.endsWith('.json') && n !== '_base.json')
  .map((n) => n.replace(/\.json$/, ''))
  .sort();
const oldInstr = beforeById['companyGenerator.instructionsFor'] ?? 0;
const runtimeRows = roleKeys.map((roleKey) => ({
  roleKey,
  beforeApprox: oldInstr,
  after: tokens(composeInstructions(roleKey, ['ExampleFlow'])),
}));
const runtimeAfterSum = runtimeRows.reduce((s, r) => s + r.after, 0);
const runtimeMean = Math.round(runtimeAfterSum / runtimeRows.length);
const runtimeMax = Math.max(...runtimeRows.map((r) => r.after));

const catalogueRows = fs.readdirSync(skillsDir)
  .filter((n) => n.endsWith('.json'))
  .sort()
  .map((name) => ({
    id: `docs/agents/skills/${name}`,
    tokens: tokens(fs.readFileSync(path.join(skillsDir, name), 'utf8')),
  }));
const catalogueTotal = catalogueRows.reduce((s, r) => s + r.tokens, 0);
const baseOnly = catalogueRows.find((r) => r.id.endsWith('_base.json'))?.tokens ?? 0;

const report = {
  measuredAt: new Date().toISOString(),
  method,
  rewriteExisting: {
    before: rewriteBefore,
    after: rewriteAfter,
    saved: rewriteBefore - rewriteAfter,
    percent: rewriteBefore ? Math.round(((rewriteBefore - rewriteAfter) / rewriteBefore) * 1000) / 10 : 0,
    rows: rewriteRows,
  },
  runtimeComposedPrompt: {
    note: 'Per invocation: one role composeInstructions (hard-rule ids, not full _base prose). Before ≈ old short template repeated.',
    beforeTemplateTokens: oldInstr,
    beforeTotalApprox: oldInstr * roleKeys.length,
    afterTotalAllRoles: runtimeAfterSum,
    meanAfter: runtimeMean,
    maxAfter: runtimeMax,
    baseJsonTokens: baseOnly,
    rows: runtimeRows,
  },
  newCatalogue: {
    note: 'Net-new lean role files. Hard rules live once in _base (referenced, not copied).',
    totalTokens: catalogueTotal,
    files: catalogueRows.length,
    rows: catalogueRows,
  },
};

fs.writeFileSync(path.join(root, 'docs/agents/token-report.json'), JSON.stringify(report, null, 2) + '\n');

function pad(s, n) {
  return String(s).padEnd(n);
}
console.log(`Method: ${method}\n`);
console.log('## Rewritten existing files (.entiresystem + prompts.ts)');
console.log(`${pad('File', 48)}${pad('Before', 10)}${pad('After', 10)}Saved`);
for (const row of rewriteRows) {
  console.log(`${pad(row.id, 48)}${pad(row.before, 10)}${pad(row.after, 10)}${row.saved}`);
}
console.log(
  `${pad('TOTAL', 48)}${pad(rewriteBefore, 10)}${pad(rewriteAfter, 10)}${report.rewriteExisting.saved} (${report.rewriteExisting.percent}%)`,
);
console.log('\n## Runtime composed prompt (per role)');
console.log(
  `mean=${runtimeMean} max=${runtimeMax} sum=${runtimeAfterSum} beforeApprox(template×${roleKeys.length})=${oldInstr * roleKeys.length}`,
);
console.log(`\n## Catalogue docs/agents/skills: ${catalogueTotal} tokens / ${catalogueRows.length} files (base=${baseOnly})`);
console.log('Wrote docs/agents/token-report.json');
