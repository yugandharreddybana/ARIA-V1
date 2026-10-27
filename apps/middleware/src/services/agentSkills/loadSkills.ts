/**
 * Single loader for agent skills. Implementation lives in catalogue.generated.cjs
 * (CJS) so both vitest/tsc and the Node strip-types ESM planner child can load it.
 */
export {
  BASE_SKILL,
  ROLE_SKILLS,
  IMPERATIVES,
  RULE_MAP,
  listRoleSkillKeys,
  loadBaseSkill,
  loadRoleSkill,
  applyContextCaps,
  composeInstructions,
} from './catalogue.generated.cjs';
