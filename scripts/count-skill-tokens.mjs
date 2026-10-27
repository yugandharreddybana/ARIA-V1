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
const { composeInstructions, listRoleSkillKeys, loadRoleSkill } = require(
  path.join(root, 'apps/middleware/src/services/agentSkills/catalogue.generated.cjs'),
);

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

const roleKeys = listRoleSkillKeys();
const oldInstr = beforeById['companyGenerator.instructionsFor'] ?? 0;
const runtimeRows = roleKeys.map((roleKey) => ({
  roleKey,
  beforeApprox: oldInstr,
  after: tokens(composeInstructions(roleKey, ['ExampleFlow'])),
  hardRules: loadRoleSkill(roleKey).hardRuleIds.length,
  caps: loadRoleSkill(roleKey).contextCaps,
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
const generatedCjs = tokens(fs.readFileSync(path.join(root, 'apps/middleware/src/services/agentSkills/catalogue.generated.cjs'), 'utf8'));

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
    note: 'Per invocation: one role composeInstructions with mapped hard-rule imperatives + context caps.',
    beforeTemplateTokens: oldInstr,
    beforeTotalApprox: oldInstr * roleKeys.length,
    afterTotalAllRoles: runtimeAfterSum,
    meanAfter: runtimeMean,
    maxAfter: runtimeMax,
    baseJsonTokens: baseOnly,
    generatedCatalogueTokens: generatedCjs,
    rows: runtimeRows,
  },
  newCatalogue: {
    note: 'docs/agents/skills is source of truth; catalogue.generated.cjs is the runtime embed.',
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
console.log(`\n## Catalogue docs/agents/skills: ${catalogueTotal} tokens / ${catalogueRows.length} files (base=${baseOnly}; generated.cjs=${generatedCjs})`);
console.log('Wrote docs/agents/token-report.json');
