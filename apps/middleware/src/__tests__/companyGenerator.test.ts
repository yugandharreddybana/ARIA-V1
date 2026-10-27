import { describe, expect, it } from 'vitest';
import { generateCompany } from '../services/companyGenerator';

const mix = { business: 1, qa: 3, frontend: 2, backend: 2, fullstack: 1, junior: 0, aiml: 0, devops: 0, security: 1 };

describe('generateCompany', () => {
  it('keeps a CEO, unique names, and a backup for every agent at the requested size', () => {
    const { agents } = generateCompany({ size: 10, mix, seed: 'project-a', flows: [] });
    const seated = agents.filter((agent) => agent.enabled);
    expect(seated).toHaveLength(10);
    const disabled = agents.filter((agent) => !agent.enabled).map((agent) => agent.roleKey).sort();
    for (const role of ['ui_ux_designer', 'documentation', 'pr_coordinator', 'research', 'coach']) {
      expect(disabled).toContain(role);
    }
    expect(agents.some((agent) => agent.roleKey === 'red_team')).toBe(true);
    expect(agents.some((agent) => agent.roleKey === 'blue_team')).toBe(true);
    expect(agents.some((agent) => agent.roleKey === 'ceo' && agent.managerTempId === null)).toBe(true);
    expect(new Set(agents.map((agent) => agent.realName)).size).toBe(agents.length);
    expect(new Set(agents.map((agent) => agent.slug)).size).toBe(agents.length);
    for (const agent of agents) {
      expect(agent.instructions.length).toBeGreaterThan(40);
      expect(agent.instructions).toContain('Extends: _base');
      expect(agent.instructions).toContain('Do not merge');
      if (agents.length > 1) expect(agent.backupTempId).not.toBe(agent.tempId);
    }
  });

  it('keeps D13 seed extras on when the company has seats for them', () => {
    const { agents } = generateCompany({ size: 12, mix, seed: 'large', flows: [] });
    expect(agents.filter((agent) => agent.enabled)).toHaveLength(12);
    const extras = ['ui_ux_designer', 'documentation', 'pr_coordinator', 'research', 'coach'] as const;
    expect(agents.filter((agent) => extras.includes(agent.roleKey as typeof extras[number])).every((agent) => agent.enabled)).toBe(true);
    expect(agents.some((agent) => agent.roleKey === 'red_team')).toBe(true);
    expect(agents.some((agent) => agent.roleKey === 'blue_team')).toBe(true);
  });

  it('is deterministic for the same seed and assigns UI flows to a frontend owner', () => {
    const flows = [
      { id: 'flow-signup', flowKey: 'signup', name: 'Signup', kind: 'ui' },
      { id: 'flow-api', flowKey: 'auth-api', name: 'Auth API', kind: 'api' },
    ];
    const first = generateCompany({ size: 8, mix, seed: 'same', flows });
    const second = generateCompany({ size: 8, mix, seed: 'same', flows });
    expect(first.agents.map((agent) => agent.realName)).toEqual(second.agents.map((agent) => agent.realName));
    const signupOwner = first.flowOwners.get('flow-signup');
    const owner = first.agents.find((agent) => agent.tempId === signupOwner?.owner);
    expect(owner?.roleKey === 'frontend' || owner?.roleKey === 'fullstack').toBe(true);
    expect(owner?.ownedFlowIds).toContain('flow-signup');
  });

  it('rejects a company that is too small to staff', () => {
    expect(() => generateCompany({ size: 2, mix, seed: 'x', flows: [] })).toThrow(/3 to 40/);
  });
});
