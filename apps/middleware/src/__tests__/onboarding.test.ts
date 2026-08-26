import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  onboardingCompanySchema,
  onboardingReposSchema,
  onboardingScoutSchema,
  onboardingAddSkillSchema,
  onboardingPatchSkillSchema,
} from '../schemas/onboarding.schemas';

// ─── Mock @aria/db so the service can be imported without Postgres ─────────
const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    query: {
      workspaces:          { findFirst: vi.fn() },
      projects:            { findFirst: vi.fn() },
      onboardingProposals: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'row-1' }]) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  },
}));

vi.mock('@aria/db', () => ({
  db: mockDb,
  workspaces: {}, projects: {}, projectRepos: {},
  skills: {}, teams: {}, teamMembers: {}, onboardingProposals: {},
}));

vi.mock('drizzle-orm', () => ({
  eq:  vi.fn(() => ({})),
  and: vi.fn(() => ({})),
}));

import * as Onboarding from '../services/onboarding.service';

// ─── Schemas ────────────────────────────────────────────────────────────────
describe('onboarding schemas (Zod strict)', () => {
  it('company: accepts valid payload and trims', () => {
    const parsed = onboardingCompanySchema.parse({
      companyName: '  Acme  ', companyDescription: 'We build rockets.',
    });
    expect(parsed.companyName).toBe('Acme');
  });

  it('company: rejects unknown keys (mass-assignment / IDOR defence)', () => {
    expect(() => onboardingCompanySchema.parse({
      companyName: 'Acme', companyDescription: 'x', workspaceId: 'attacker-ws',
    })).toThrow();
  });

  it('company: rejects empty companyDescription', () => {
    expect(() => onboardingCompanySchema.parse({ companyName: 'Acme', companyDescription: '  ' })).toThrow();
  });

  it('repos: rejects empty array and invalid repoUrl', () => {
    expect(() => onboardingReposSchema.parse({ repos: [] })).toThrow();
    expect(() => onboardingReposSchema.parse({
      repos: [{ repoUrl: 'not-a-url', repoName: 'r', fullName: 'o/r', branch: 'main' }],
    })).toThrow();
  });

  it('repos: defaults branch to main', () => {
    const parsed = onboardingReposSchema.parse({
      repos: [{ repoUrl: 'https://github.com/o/r', repoName: 'r', fullName: 'o/r' }],
    });
    expect(parsed.repos[0].branch).toBe('main');
  });

  it('scout: rejects missing scoutName', () => {
    expect(() => onboardingScoutSchema.parse({ scoutDescription: 'Scans repos.' })).toThrow();
  });

  it('addSkill: fills defaults and rejects server-owned fields', () => {
    const parsed = onboardingAddSkillSchema.parse({
      slug: 'data-engineer', realName: 'Kai Ito', roleTitle: 'Data Engineer',
      department: 'Engineering', hierarchyLevel: 5,
    });
    expect(parsed.riskClass).toBe('C');
    expect(parsed.ownedDomains).toEqual([]);
    expect(() => onboardingAddSkillSchema.parse({
      slug: 'x', realName: 'X', roleTitle: 'X', department: 'E', hierarchyLevel: 5,
      isAlwaysPresent: true, // server-owned — must be rejected
    })).toThrow();
  });

  it('patchSkill: requires at least one field and rejects unknown keys', () => {
    expect(() => onboardingPatchSkillSchema.parse({})).toThrow();
    expect(() => onboardingPatchSkillSchema.parse({ tempId: 'nope' })).toThrow();
    expect(onboardingPatchSkillSchema.parse({ realName: 'New Name' })).toEqual({ realName: 'New Name' });
  });
});

// ─── Service ────────────────────────────────────────────────────────────────
const WS = '00000000-0000-0000-0000-0000000000aa';
const proposalBase = {
  id: 'prop-1', workspaceId: WS, projectId: 'proj-1', status: 'ready',
  errorMessage: null, createdAt: new Date(), updatedAt: new Date(),
};

describe('onboarding.service', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('getStatus: reports completed=false with no onboardingCompletedAt', async () => {
    mockDb.query.workspaces.findFirst.mockResolvedValue({
      id: WS, onboardingCompletedAt: null, companyDescription: null, githubAccessTokenEncrypted: null,
    });
    mockDb.query.onboardingProposals.findFirst.mockResolvedValue(undefined);
    const status = await Onboarding.getStatus(WS);
    expect(status).toEqual({
      completed: false, onboardingCompletedAt: null, companyDescription: null,
      githubConnected: false, proposalStatus: null,
    });
  });

  it('getStatus: reports completed=true + github connected', async () => {
    const done = new Date('2026-08-26T00:00:00Z');
    mockDb.query.workspaces.findFirst.mockResolvedValue({
      id: WS, onboardingCompletedAt: done, companyDescription: 'Rockets', githubAccessTokenEncrypted: 'enc',
    });
    mockDb.query.onboardingProposals.findFirst.mockResolvedValue({ ...proposalBase, status: 'committed' });
    const status = await Onboarding.getStatus(WS);
    expect(status.completed).toBe(true);
    expect(status.onboardingCompletedAt).toBe(done.toISOString());
    expect(status.githubConnected).toBe(true);
    expect(status.proposalStatus).toBe('committed');
  });

  it('deleteProposalSkill: refuses to delete an isAlwaysPresent role', async () => {
    mockDb.query.onboardingProposals.findFirst.mockResolvedValue({
      ...proposalBase,
      proposedSkills: [{ tempId: 't1', roleTitle: 'CEO', isAlwaysPresent: true }],
    });
    await expect(Onboarding.deleteProposalSkill(WS, 't1'))
      .rejects.toMatchObject({ statusCode: 400, code: 'FORBIDDEN' });
  });

  it('deleteProposalSkill: removes a deletable skill', async () => {
    mockDb.query.onboardingProposals.findFirst.mockResolvedValue({
      ...proposalBase,
      proposedSkills: [
        { tempId: 't1', roleTitle: 'CEO', isAlwaysPresent: true },
        { tempId: 't2', roleTitle: 'QA Engineer', isAlwaysPresent: false },
      ],
    });
    const remaining = await Onboarding.deleteProposalSkill(WS, 't2');
    expect(remaining.map(s => s.tempId)).toEqual(['t1']);
  });

  it('patchProposalSkill: 404s on unknown tempId', async () => {
    mockDb.query.onboardingProposals.findFirst.mockResolvedValue({
      ...proposalBase, proposedSkills: [{ tempId: 't1' }],
    });
    await expect(Onboarding.patchProposalSkill(WS, 'missing', { skill: { realName: 'X' } }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('addProposalSkill: stamps isAiGenerated=false and a fresh tempId', async () => {
    mockDb.query.onboardingProposals.findFirst.mockResolvedValue({
      ...proposalBase, proposedSkills: [],
    });
    const skills = await Onboarding.addProposalSkill(WS, {
      slug: 'data-engineer', realName: 'Kai Ito', roleTitle: 'Data Engineer',
      department: 'Engineering', hierarchyLevel: 5, reportingManagerTempId: null,
      instructions: '', description: '', ownedDomains: [], ownedRepoPaths: [],
      triggerKeywords: [], riskClass: 'C', isAlwaysPresent: false, isAiGenerated: false,
    });
    expect(skills).toHaveLength(1);
    expect(skills[0].isAiGenerated).toBe(false);
    expect(skills[0].tempId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('commitProposal: rejects when proposal is not ready', async () => {
    mockDb.query.onboardingProposals.findFirst.mockResolvedValue({
      ...proposalBase, status: 'pending', proposedSkills: [],
    });
    await expect(Onboarding.commitProposal(WS))
      .rejects.toMatchObject({ statusCode: 400, code: 'CONFLICT' });
  });
});
