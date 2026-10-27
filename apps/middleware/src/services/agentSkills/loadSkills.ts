import path from 'node:path';
import { BASE_SKILL, ROLE_SKILLS, composeInstructions, type EmbeddedRoleKey } from './catalogue.generated';
import type { BaseSkill, RoleSkill } from './types';

export { composeInstructions };

export function listRoleSkillKeys(): string[] {
  return Object.keys(ROLE_SKILLS).sort();
}

export function loadBaseSkill(): BaseSkill {
  return BASE_SKILL as unknown as BaseSkill;
}

export function loadRoleSkill(roleKey: string): RoleSkill {
  const skill = ROLE_SKILLS[roleKey as EmbeddedRoleKey];
  if (!skill) throw new Error(`Missing skill for role ${roleKey}`);
  return skill as unknown as RoleSkill;
}

export function clearSkillCache(): void {
  // embedded catalogue — nothing to clear
}

/** On-disk mirror of the embedded catalogue (kept in sync by scripts/sync-agent-skills.mjs). */
export function runtimeSkillsDir(): string {
  return path.join(__dirname, 'data');
}
