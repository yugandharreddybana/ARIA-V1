#!/usr/bin/env node
/**
 * Source of truth: docs/agents/skills/*.json
 * Generates: apps/middleware/src/services/agentSkills/catalogue.generated.{cjs,d.cts}
 * Usage:
 *   node scripts/sync-agent-skills.mjs          # write
 *   node scripts/sync-agent-skills.mjs --check  # exit 1 on drift
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(root, 'docs/agents/skills');
const outDir = path.join(root, 'apps/middleware/src/services/agentSkills');
const outCjs = path.join(outDir, 'catalogue.generated.cjs');
const outDts = path.join(outDir, 'catalogue.generated.d.cts');
const checkOnly = process.argv.includes('--check');

/** Compressed one-line imperatives (ids match _base.hardRules). */
const IMPERATIVES = {
  wip_one: 'WIP=1: one active task only.',
  user_approves_merge: 'Never merge; user approves every merge and every idea.',
  dev_qa_evidence: 'Ship dev before/after local tests (md+pdf) and QA previous-vs-current with screenshots (md+pdf) before merge.',
  ticket_events_hash: 'Append-only hash-chained ticket_events; never rewrite history.',
  ac_gherkin: 'Acceptance criteria must be Given/When/Then.',
  story_points_fib: 'Points Fibonacci 1/2/3/5/8/13; day estimates ceil up to nearest Fib (4 days=5).',
  sprint_10: 'Sprints are 10 working days.',
  code_ownership: 'Builder owns flow/path; backup only if owner OFF/over WIP/reassigned; log handoff.',
  dep_gate: 'Dependency gate: A E2E-tests B whole implementation before B awaiting_merge.',
  ui_mock_gate: 'HTML+image mocks for every UI state; PO/SM review then user approval before develop.',
  api_contract: 'FE/BE changes need api_contract + contract_test before merge.',
  idea_lifecycle: 'Ideas: research → CEO/CFO comment validation → versioned revisions → user Approve/Decline.',
  red_blue_tickets: 'Red/blue findings become tickets; network egress denied by default; only an explicit local allowlist; strip secrets from red runtime.',
  context_load: 'Load only ticket, contract, owned paths; summaries/diffs; never whole repo.',
  no_secrets: 'Never print secrets, tokens, or credentials.',
};

/** Applicable hard-rule ids per role (do not give coding evidence rules to CFO, etc.). */
const RULE_MAP = {
  ceo: ['wip_one', 'user_approves_merge', 'idea_lifecycle', 'ticket_events_hash', 'sprint_10', 'context_load', 'no_secrets'],
  cfo: ['wip_one', 'user_approves_merge', 'idea_lifecycle', 'ticket_events_hash', 'context_load', 'no_secrets'],
  cto: ['wip_one', 'user_approves_merge', 'code_ownership', 'dep_gate', 'api_contract', 'story_points_fib', 'ticket_events_hash', 'context_load', 'no_secrets'],
  business: ['wip_one', 'user_approves_merge', 'idea_lifecycle', 'ticket_events_hash', 'context_load', 'no_secrets'],
  product_owner: ['wip_one', 'user_approves_merge', 'ac_gherkin', 'story_points_fib', 'sprint_10', 'ui_mock_gate', 'idea_lifecycle', 'ticket_events_hash', 'context_load', 'no_secrets'],
  scrum_master: ['wip_one', 'user_approves_merge', 'sprint_10', 'story_points_fib', 'code_ownership', 'ticket_events_hash', 'context_load', 'no_secrets'],
  ui_ux_designer: ['wip_one', 'user_approves_merge', 'ui_mock_gate', 'ac_gherkin', 'ticket_events_hash', 'context_load', 'no_secrets'],
  frontend: ['wip_one', 'user_approves_merge', 'dev_qa_evidence', 'ac_gherkin', 'code_ownership', 'dep_gate', 'api_contract', 'ui_mock_gate', 'ticket_events_hash', 'context_load', 'no_secrets'],
  backend: ['wip_one', 'user_approves_merge', 'dev_qa_evidence', 'ac_gherkin', 'code_ownership', 'dep_gate', 'api_contract', 'ticket_events_hash', 'context_load', 'no_secrets'],
  fullstack: ['wip_one', 'user_approves_merge', 'dev_qa_evidence', 'ac_gherkin', 'code_ownership', 'dep_gate', 'api_contract', 'ui_mock_gate', 'ticket_events_hash', 'context_load', 'no_secrets'],
  junior: ['wip_one', 'user_approves_merge', 'dev_qa_evidence', 'ac_gherkin', 'code_ownership', 'ticket_events_hash', 'context_load', 'no_secrets'],
  aiml: ['wip_one', 'user_approves_merge', 'dev_qa_evidence', 'code_ownership', 'api_contract', 'ticket_events_hash', 'context_load', 'no_secrets'],
  qa: ['wip_one', 'user_approves_merge', 'dev_qa_evidence', 'ac_gherkin', 'dep_gate', 'ticket_events_hash', 'context_load', 'no_secrets'],
  devops: ['wip_one', 'user_approves_merge', 'dev_qa_evidence', 'code_ownership', 'ticket_events_hash', 'context_load', 'no_secrets'],
  cybersecurity: ['wip_one', 'user_approves_merge', 'red_blue_tickets', 'code_ownership', 'ticket_events_hash', 'context_load', 'no_secrets'],
  red_team: ['wip_one', 'user_approves_merge', 'red_blue_tickets', 'ticket_events_hash', 'context_load', 'no_secrets'],
  blue_team: ['wip_one', 'user_approves_merge', 'red_blue_tickets', 'dev_qa_evidence', 'code_ownership', 'ticket_events_hash', 'context_load', 'no_secrets'],
  research: ['wip_one', 'user_approves_merge', 'idea_lifecycle', 'ticket_events_hash', 'context_load', 'no_secrets'],
  coach: ['wip_one', 'user_approves_merge', 'ticket_events_hash', 'context_load', 'no_secrets'],
  documentation: ['wip_one', 'user_approves_merge', 'code_ownership', 'ticket_events_hash', 'context_load', 'no_secrets'],
  pr_coordinator: ['wip_one', 'user_approves_merge', 'code_ownership', 'dep_gate', 'ticket_events_hash', 'context_load', 'no_secrets'],
};

const DEFAULT_CAPS = {
  high_light: { maxFiles: 5, maxBytes: 24_000, maxTokens: 4_000 },
  high: { maxFiles: 8, maxBytes: 40_000, maxTokens: 6_000 },
  low_code: { maxFiles: 20, maxBytes: 120_000, maxTokens: 16_000 },
  qa: { maxFiles: 15, maxBytes: 80_000, maxTokens: 12_000 },
  security: { maxFiles: 12, maxBytes: 60_000, maxTokens: 8_000 },
};

const CAP_MAP = {
  ceo: 'high_light',
  cfo: 'high_light',
  business: 'high_light',
  research: 'high_light',
  coach: 'high_light',
  cto: 'high',
  product_owner: 'high',
  scrum_master: 'high',
  ui_ux_designer: 'high',
  pr_coordinator: 'high',
  frontend: 'low_code',
  backend: 'low_code',
  fullstack: 'low_code',
  junior: 'low_code',
  aiml: 'low_code',
  devops: 'low_code',
  documentation: 'low_code',
  qa: 'qa',
  cybersecurity: 'security',
  red_team: 'security',
  blue_team: 'security',
};

function readDocs() {
  const base = JSON.parse(fs.readFileSync(path.join(docsDir, '_base.json'), 'utf8'));
  const roles = {};
  for (const name of fs.readdirSync(docsDir).filter((n) => n.endsWith('.json') && n !== '_base.json').sort()) {
    const roleKey = name.replace(/\.json$/, '');
    const skill = JSON.parse(fs.readFileSync(path.join(docsDir, name), 'utf8'));
    if (!RULE_MAP[roleKey]) throw new Error(`No RULE_MAP for ${roleKey}`);
    skill.hardRuleIds = RULE_MAP[roleKey];
    skill.contextCaps = DEFAULT_CAPS[CAP_MAP[roleKey]];
    // Keep docs JSON as authored fields + ensure hardRuleIds/contextCaps written back as source.
    roles[roleKey] = skill;
  }
  // Ensure base imperatives / red-blue wording stay aligned.
  for (const rule of base.hardRules) {
    if (IMPERATIVES[rule.id]) rule.rule = IMPERATIVES[rule.id].replace(/^[A-Z0-9_=]+:\s*/, (m) => {
      // Keep base.rule as full imperative; imperatives already complete sentences.
      return IMPERATIVES[rule.id].startsWith(m) ? '' : '';
    }) || IMPERATIVES[rule.id];
    if (IMPERATIVES[rule.id]) rule.rule = IMPERATIVES[rule.id];
  }
  return { base, roles };
}

function writeDocsEnriched({ base, roles }) {
  fs.writeFileSync(path.join(docsDir, '_base.json'), `${JSON.stringify(base, null, 2)}\n`);
  for (const [roleKey, skill] of Object.entries(roles)) {
    // Persist hardRuleIds + contextCaps into source JSON.
    const ordered = {
      roleKey: skill.roleKey,
      role: skill.role,
      extends: skill.extends,
      modelTier: skill.modelTier,
      maxOutputTokens: skill.maxOutputTokens,
      hardRuleIds: skill.hardRuleIds,
      contextCaps: skill.contextCaps,
      contextLoad: skill.contextLoad,
      inputs: skill.inputs,
      do: skill.do,
      dont: skill.dont,
      outputSchema: skill.outputSchema,
      doneWhen: skill.doneWhen,
    };
    fs.writeFileSync(path.join(docsDir, `${roleKey}.json`), `${JSON.stringify(ordered, null, 2)}\n`);
  }
}

function buildCjs({ base, roles }) {
  const payload = {
    BASE_SKILL: base,
    ROLE_SKILLS: roles,
    IMPERATIVES,
    RULE_MAP,
  };
  return `'use strict';
/* AUTO-GENERATED by scripts/sync-agent-skills.mjs — edit docs/agents/skills then re-run. */
const BASE_SKILL = ${JSON.stringify(payload.BASE_SKILL, null, 2)};
const ROLE_SKILLS = ${JSON.stringify(payload.ROLE_SKILLS, null, 2)};
const IMPERATIVES = ${JSON.stringify(payload.IMPERATIVES, null, 2)};
const RULE_MAP = ${JSON.stringify(payload.RULE_MAP, null, 2)};

function listRoleSkillKeys() {
  return Object.keys(ROLE_SKILLS).sort();
}

function loadBaseSkill() {
  return BASE_SKILL;
}

function loadRoleSkill(roleKey) {
  const skill = ROLE_SKILLS[roleKey];
  if (!skill) throw new Error('Missing skill for role ' + roleKey);
  return skill;
}

function applyContextCaps(roleKey, context) {
  const skill = loadRoleSkill(roleKey);
  const caps = skill.contextCaps;
  const files = Array.isArray(context?.files) ? context.files.slice(0, caps.maxFiles) : [];
  let text = typeof context?.text === 'string' ? context.text : '';
  if (Buffer.byteLength(text, 'utf8') > caps.maxBytes) {
    text = Buffer.from(text, 'utf8').subarray(0, caps.maxBytes).toString('utf8');
  }
  const approxTokens = Math.ceil(Buffer.byteLength(text, 'utf8') / 4);
  if (approxTokens > caps.maxTokens) {
    const keep = caps.maxTokens * 4;
    text = Buffer.from(text, 'utf8').subarray(0, keep).toString('utf8');
  }
  return { files, text, caps, truncated: files.length !== (context?.files?.length ?? 0) || text !== (context?.text ?? '') };
}

function composeInstructions(roleKey, flowNames, context) {
  const base = BASE_SKILL;
  const skill = loadRoleSkill(roleKey);
  const ruleIds = skill.hardRuleIds || RULE_MAP[roleKey] || [];
  const rules = ruleIds.map((id) => {
    const line = IMPERATIVES[id] || (base.hardRules.find((r) => r.id === id) || {}).rule;
    if (!line) throw new Error('Missing imperative for ' + id);
    return '- [' + id + '] ' + line;
  });
  const flows = flowNames && flowNames.length ? 'Own flows: ' + flowNames.join(', ') + '.' : 'No flow assigned.';
  const caps = skill.contextCaps;
  const capped = context ? applyContextCaps(roleKey, context) : null;
  const lines = [
    'Role: ' + skill.role + ' (' + skill.roleKey + ').',
    'Tier: ' + skill.modelTier + '. Max out: ' + skill.maxOutputTokens + '.',
    'Extends: ' + skill.extends + '.',
    'Inputs: ' + skill.inputs.join('; ') + '.',
    'Do: ' + skill.do.join('; ') + '.',
    "Don't: " + [...skill.dont, ...base.dont].join('; ') + '.',
    'Done-when: ' + skill.doneWhen.join('; ') + '.',
    'HardRules:',
    ...rules,
    'ContextCaps: files<=' + caps.maxFiles + ' bytes<=' + caps.maxBytes + ' tokens<=' + caps.maxTokens + '.',
    'Context: ' + skill.contextLoad.join(',') + '; never ' + base.neverLoad.join(',') + '.',
    flows,
    'Output JSON matching role outputSchema only.',
  ];
  if (capped) {
    lines.push('ContextApplied: files=' + capped.files.length + ' truncated=' + capped.truncated + '.');
  }
  return lines.join('\\n');
}

module.exports = {
  BASE_SKILL,
  ROLE_SKILLS,
  IMPERATIVES,
  RULE_MAP,
  listRoleSkillKeys,
  loadBaseSkill,
  loadRoleSkill,
  applyContextCaps,
  composeInstructions,
};
`;
}

function buildDts() {
  return `/* AUTO-GENERATED by scripts/sync-agent-skills.mjs */
export const BASE_SKILL: {
  id: string;
  version: string;
  role: string;
  extends: null;
  hardRules: Array<{ id: string; rule: string }>;
  contextLoad: string[];
  neverLoad: string[];
  dont: string[];
};
export const ROLE_SKILLS: Record<string, {
  roleKey: string;
  role: string;
  extends: '_base';
  modelTier: 'high' | 'low';
  maxOutputTokens: number;
  hardRuleIds: string[];
  contextCaps: { maxFiles: number; maxBytes: number; maxTokens: number };
  contextLoad: string[];
  inputs: string[];
  do: string[];
  dont: string[];
  outputSchema: Record<string, unknown>;
  doneWhen: string[];
}>;
export const IMPERATIVES: Record<string, string>;
export const RULE_MAP: Record<string, string[]>;
export function listRoleSkillKeys(): string[];
export function loadBaseSkill(): typeof BASE_SKILL;
export function loadRoleSkill(roleKey: string): (typeof ROLE_SKILLS)[string];
export function applyContextCaps(
  roleKey: string,
  context: { files?: string[]; text?: string },
): { files: string[]; text: string; caps: { maxFiles: number; maxBytes: number; maxTokens: number }; truncated: boolean };
export function composeInstructions(
  roleKey: string,
  flowNames?: string[],
  context?: { files?: string[]; text?: string },
): string;
`;
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const docs = readDocs();
// Enrich docs JSON with hardRuleIds/contextCaps (source of truth stays docs/).
if (!checkOnly) writeDocsEnriched(docs);
const refreshed = readDocs();
const cjs = buildCjs(refreshed);
const dts = buildDts();

if (checkOnly) {
  const curCjs = fs.existsSync(outCjs) ? fs.readFileSync(outCjs, 'utf8') : '';
  const curDts = fs.existsSync(outDts) ? fs.readFileSync(outDts, 'utf8') : '';
  if (hash(curCjs) !== hash(cjs) || hash(curDts) !== hash(dts)) {
    console.error('skills:sync --check FAILED: catalogue drift. Run: node scripts/sync-agent-skills.mjs');
    process.exit(1);
  }
  // Also ensure docs role JSON already contain hardRuleIds/contextCaps matching RULE_MAP.
  for (const [roleKey, skill] of Object.entries(refreshed.roles)) {
    const onDisk = JSON.parse(fs.readFileSync(path.join(docsDir, `${roleKey}.json`), 'utf8'));
    if (JSON.stringify(onDisk.hardRuleIds) !== JSON.stringify(RULE_MAP[roleKey])) {
      console.error(`skills:sync --check FAILED: ${roleKey} hardRuleIds drift`);
      process.exit(1);
    }
    if (!onDisk.contextCaps) {
      console.error(`skills:sync --check FAILED: ${roleKey} missing contextCaps`);
      process.exit(1);
    }
  }
  console.log('skills:sync --check OK');
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outCjs, cjs);
fs.writeFileSync(outDts, dts);
// Remove obsolete mirrors.
const dataDir = path.join(outDir, 'data');
if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
const oldTs = path.join(outDir, 'catalogue.generated.ts');
if (fs.existsSync(oldTs)) fs.unlinkSync(oldTs);

console.log('synced', Object.keys(refreshed.roles).length, 'roles → catalogue.generated.cjs');
