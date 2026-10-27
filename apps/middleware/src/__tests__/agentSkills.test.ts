import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLE_KEYS } from '../services/companyGenerator';
import {
  RULE_MAP,
  applyContextCaps,
  composeInstructions,
  listRoleSkillKeys,
  loadBaseSkill,
  loadRoleSkill,
} from '../services/agentSkills/loadSkills';
import { HARD_RULE_IDS } from '../services/agentSkills/types';

const DOCS_SKILLS_DIR = (() => {
  const candidates = [
    path.join(process.cwd(), 'docs/agents/skills'),
    path.join(process.cwd(), '../../docs/agents/skills'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, '_base.json'))) return dir;
  }
  throw new Error('docs/agents/skills missing');
})();

describe('agent skills catalogue', () => {
  it('has a skill file for every ROLE_KEY and each extends _base', () => {
    const keys = listRoleSkillKeys();
    for (const roleKey of ROLE_KEYS) {
      expect(keys).toContain(roleKey);
      const skill = loadRoleSkill(roleKey);
      expect(skill.extends).toBe('_base');
      expect(skill.roleKey).toBe(roleKey);
      expect(skill.hardRuleIds.length).toBeGreaterThan(0);
      expect(skill.contextCaps.maxFiles).toBeGreaterThan(0);
      expect(skill.contextCaps.maxBytes).toBeGreaterThan(0);
      expect(skill.contextCaps.maxTokens).toBeGreaterThan(0);
      expect(skill.modelTier === 'high' || skill.modelTier === 'low').toBe(true);
    }
  });

  it('catalogue matches docs/agents/skills (single source of truth)', () => {
    const docsKeys = fs
      .readdirSync(DOCS_SKILLS_DIR)
      .filter((n) => n.endsWith('.json') && n !== '_base.json')
      .map((n) => n.replace(/\.json$/, ''))
      .sort();
    expect(listRoleSkillKeys()).toEqual(docsKeys);
    for (const roleKey of docsKeys) {
      const docs = JSON.parse(fs.readFileSync(path.join(DOCS_SKILLS_DIR, `${roleKey}.json`), 'utf8'));
      const embedded = loadRoleSkill(roleKey);
      expect(embedded.hardRuleIds).toEqual(docs.hardRuleIds);
      expect(embedded.contextCaps).toEqual(docs.contextCaps);
      expect(embedded.do).toEqual(docs.do);
      expect(RULE_MAP[roleKey]).toEqual(docs.hardRuleIds);
    }
    const baseDocs = JSON.parse(fs.readFileSync(path.join(DOCS_SKILLS_DIR, '_base.json'), 'utf8'));
    expect(loadBaseSkill().hardRules.map((r) => r.id)).toEqual(baseDocs.hardRules.map((r: { id: string }) => r.id));
  });

  it('composed prompt includes mapped hard-rule imperatives only', () => {
    for (const roleKey of ROLE_KEYS) {
      const mapped = RULE_MAP[roleKey] as string[];
      const text = composeInstructions(roleKey, ['ExampleFlow']);
      expect(text).toContain('HardRules:');
      expect(text).toContain('ContextCaps:');
      for (const id of mapped) {
        expect(text).toContain(`[${id}]`);
      }
      for (const id of HARD_RULE_IDS) {
        if (!mapped.includes(id)) {
          expect(text).not.toContain(`[${id}]`);
        }
      }
      // CFO must not get coding evidence rules
      if (roleKey === 'cfo') {
        expect(text).not.toContain('[dev_qa_evidence]');
        expect(text).not.toContain('[api_contract]');
        expect(text).toContain('[idea_lifecycle]');
      }
      if (roleKey === 'frontend') {
        expect(text).toContain('[dev_qa_evidence]');
        expect(text).toContain('md+pdf');
      }
      if (roleKey === 'red_team' || roleKey === 'blue_team') {
        expect(text.toLowerCase()).toContain('egress denied by default');
        expect(text.toLowerCase()).toContain('explicit local allowlist');
      }
    }
  });

  it('applyContextCaps enforces numeric caps', () => {
    const caps = loadRoleSkill('ceo').contextCaps;
    const huge = 'x'.repeat(caps.maxBytes + 5000);
    const many = Array.from({ length: caps.maxFiles + 10 }, (_, i) => `f${i}.ts`);
    const applied = applyContextCaps('ceo', { files: many, text: huge });
    expect(applied.files).toHaveLength(caps.maxFiles);
    expect(Buffer.byteLength(applied.text, 'utf8')).toBeLessThanOrEqual(caps.maxBytes);
    expect(Math.ceil(Buffer.byteLength(applied.text, 'utf8') / 4)).toBeLessThanOrEqual(caps.maxTokens);
    expect(applied.truncated).toBe(true);
    const prompt = composeInstructions('ceo', [], { files: many, text: huge });
    expect(prompt).toContain('truncated=true');
  });

  it('domain SKILL.md files reference _base', () => {
    const root = path.join(DOCS_SKILLS_DIR, '../../../.entiresystem/skills');
    const dirs = fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isDirectory());
    expect(dirs.length).toBeGreaterThan(0);
    for (const name of dirs) {
      const md = fs.readFileSync(path.join(root, name, 'SKILL.md'), 'utf8');
      expect(md).toMatch(/extends:\s*docs\/agents\/skills\/_base\.json/);
    }
  });
});
