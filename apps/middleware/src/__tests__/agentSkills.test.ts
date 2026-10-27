import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLE_KEYS } from '../services/companyGenerator';
import {
  composeInstructions,
  listRoleSkillKeys,
  loadBaseSkill,
  loadRoleSkill,
  runtimeSkillsDir,
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
      expect(skill.modelTier === 'high' || skill.modelTier === 'low').toBe(true);
      expect(skill.maxOutputTokens).toBeGreaterThan(0);
      expect(skill.inputs.length).toBeGreaterThan(0);
      expect(skill.do.length).toBeGreaterThan(0);
      expect(skill.dont.length).toBeGreaterThan(0);
      expect(skill.doneWhen.length).toBeGreaterThan(0);
      expect(skill.outputSchema).toBeTruthy();
      expect(Object.keys(skill)).toEqual(
        expect.arrayContaining(['roleKey', 'role', 'extends', 'modelTier', 'maxOutputTokens', 'inputs', 'do', 'dont', 'outputSchema', 'doneWhen']),
      );
    }
  });

  it('base skill contains every required hard rule id and checklist keywords', () => {
    const base = loadBaseSkill();
    const ids = base.hardRules.map((rule) => rule.id);
    for (const id of HARD_RULE_IDS) {
      expect(ids).toContain(id);
    }
    const blob = JSON.stringify(base);
    const requiredSnippets = [
      'WIP=1',
      'never merge',
      'md+pdf',
      'screenshots',
      'hash-chained ticket_events',
      'Given/When/Then',
      '1/2/3/5/8/13',
      '4 days = 5',
      '10 working days',
      'backup only when owner OFF',
      'E2E-tests B',
      'HTML+image mocks',
      'api_contract',
      'versioned revisions',
      'findings become tickets',
      'User approves every merge',
    ];
    for (const snippet of requiredSnippets) {
      expect(blob.toLowerCase()).toContain(snippet.toLowerCase());
    }
  });

  it('composeInstructions references base and stays lean', () => {
    const text = composeInstructions('frontend', ['Signup']);
    expect(text).toContain('Extends: _base');
    expect(text).toContain('HardRules:');
    for (const id of HARD_RULE_IDS) {
      expect(text).toContain(id);
    }
    expect(text).toContain('Own flows: Signup');
    expect(text.length).toBeLessThan(1500);
  });

  it('docs/agents/skills mirrors runtime data byte-for-byte', () => {
    const runtime = runtimeSkillsDir();
    const docsNames = fs.readdirSync(DOCS_SKILLS_DIR).filter((n) => n.endsWith('.json')).sort();
    const runtimeNames = fs.readdirSync(runtime).filter((n) => n.endsWith('.json')).sort();
    expect(docsNames).toEqual(runtimeNames);
    for (const name of docsNames) {
      expect(fs.readFileSync(path.join(DOCS_SKILLS_DIR, name), 'utf8')).toBe(
        fs.readFileSync(path.join(runtime, name), 'utf8'),
      );
    }
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
