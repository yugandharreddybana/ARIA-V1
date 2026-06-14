/**
 * onboarding.service.ts
 * ---------------------
 * Orchestrates all 6 onboarding steps:
 *
 * Step 1 — saveCompany         : update workspace name + description, create project
 * Step 2 — saveLlmConfig       : delegates to existing workspace LLM config logic
 * Step 3 — saveRepos           : persist selected GitHub repos to project_repos
 * Step 4 — saveScout + trigger : save scout persona, run repoAnalysis, run skillFactory,
 *                                 store ProposedSkill[] in onboarding_proposals
 * Step 5 — getProposal         : return current proposal (poll until status = 'ready')
 *           patchSkill          : edit a skill in the proposal
 *           addSkill            : add a custom skill to the proposal
 *           deleteSkill         : remove a skill from the proposal
 * Step 6 — commitProposal      : write all skills + teams to DB, mark onboarding complete
 */

import { db } from '@aria/db';
import {
  workspaces, projects, projectRepos,
  skills as skillsTable, teams as teamsTable,
  teamMembers as teamMembersTable, onboardingProposals,
} from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { AppError } from '../middleware/error.middleware';
import { analyseRepos } from './repoAnalysis.service';
import { generateTeamProposal } from './skillFactory.service';
import { encrypt } from '../utils/crypto.utils';
import type {
  OnboardingCompanyPayload, OnboardingRepoSelection,
  OnboardingScoutPayload, ProposedSkill, CommitProposalResponse,
} from '../types/onboarding.types';

// ============================================================================
// Step 1 — Company name + description
// ============================================================================

export async function saveCompany(workspaceId: string, payload: OnboardingCompanyPayload) {
  const { companyName, companyDescription } = payload;
  if (!companyName?.trim()) throw new AppError('Company name is required', 400);

  // Update workspace name and description
  const [ws] = await db
    .update(workspaces)
    .set({ name: companyName.trim(), companyDescription: companyDescription?.trim() ?? '' })
    .where(eq(workspaces.id, workspaceId))
    .returning();
  if (!ws) throw new AppError('Workspace not found', 404);

  // Create the project for this onboarding run (if not yet created)
  const existing = await db.query.projects.findFirst({
    where: eq(projects.workspaceId, workspaceId),
  });
  if (existing) return { workspace: ws, project: existing };

  const [project] = await db.insert(projects).values({
    workspaceId,
    name:        companyName.trim(),
    description: companyDescription?.trim() ?? '',
    status:      'active',
  }).returning();

  return { workspace: ws, project };
}

// ============================================================================
// Step 3 — GitHub repo selection
// ============================================================================

export async function saveRepos(workspaceId: string, payload: OnboardingRepoSelection) {
  if (!payload.repos?.length) throw new AppError('Select at least one repo', 400);

  const project = await getProject(workspaceId);

  // Delete previously saved repos for this project (idempotent re-submit)
  await db.delete(projectRepos).where(eq(projectRepos.projectId, project.id));

  await db.insert(projectRepos).values(
    payload.repos.map(r => ({
      projectId: project.id,
      repoUrl:   r.repoUrl,
      repoName:  r.repoName,
      branch:    r.branch || 'main',
    })),
  );

  return { projectId: project.id, repoCount: payload.repos.length };
}

// ============================================================================
// Step 4 — Scout persona + trigger analysis + skill generation
// ============================================================================

export async function saveScoutAndTrigger(
  workspaceId: string,
  payload: OnboardingScoutPayload,
): Promise<{ proposalId: string }> {
  const { scoutName, scoutDescription } = payload;
  if (!scoutName?.trim()) throw new AppError('Scout name is required', 400);

  // Persist scout persona
  await db
    .update(workspaces)
    .set({
      scoutAgentName:        scoutName.trim(),
      scoutAgentDescription: scoutDescription?.trim() ?? '',
    })
    .where(eq(workspaces.id, workspaceId));

  const project = await getProject(workspaceId);

  // Upsert a 'pending' proposal row
  const [proposal] = await db
    .insert(onboardingProposals)
    .values({
      workspaceId,
      projectId: project.id,
      status: 'pending',
      proposedSkills: [],
    })
    .onConflictDoUpdate({
      target: [onboardingProposals.workspaceId],
      set: { status: 'pending', proposedSkills: [], errorMessage: null },
    })
    .returning();

  // Run analysis + generation asynchronously (do not await — client polls)
  runAnalysisAndGenerate(workspaceId, project.id, proposal.id).catch(() => {
    // Errors are written to the proposal row — client sees 'failed' status
  });

  return { proposalId: proposal.id };
}

async function runAnalysisAndGenerate(
  workspaceId: string,
  projectId:   string,
  proposalId:  string,
): Promise<void> {
  try {
    const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
    if (!ws) throw new Error('Workspace not found');

    // Analyse repos
    const profile = await analyseRepos(workspaceId, projectId);

    // Generate team
    const proposed = await generateTeamProposal(workspaceId, ws.name, profile);

    // Store result
    await db
      .update(onboardingProposals)
      .set({
        status:          'ready',
        proposedSkills:  proposed as unknown as Record<string, unknown>[],
        codebaseProfile: profile as unknown as Record<string, unknown>,
        updatedAt:       new Date(),
      })
      .where(eq(onboardingProposals.id, proposalId));
  } catch (err) {
    await db
      .update(onboardingProposals)
      .set({
        status:       'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        updatedAt:    new Date(),
      })
      .where(eq(onboardingProposals.id, proposalId));
  }
}

// ============================================================================
// Step 5 — Proposal CRUD (user reviews & edits tree)
// ============================================================================

export async function getProposal(workspaceId: string) {
  const proposal = await db.query.onboardingProposals.findFirst({
    where: eq(onboardingProposals.workspaceId, workspaceId),
  });
  if (!proposal) throw new AppError('No proposal found — complete Step 4 first', 404);
  return proposal;
}

export async function patchSkill(
  workspaceId: string,
  tempId:      string,
  patch:       Partial<Omit<ProposedSkill, 'tempId'>>,
) {
  const proposal = await requireReadyProposal(workspaceId);
  const skills   = proposal.proposedSkills as unknown as ProposedSkill[];
  const idx      = skills.findIndex(s => s.tempId === tempId);
  if (idx === -1) throw new AppError('Skill not found in proposal', 404);

  skills[idx] = { ...skills[idx], ...patch };

  await db
    .update(onboardingProposals)
    .set({ proposedSkills: skills as unknown as Record<string, unknown>[], updatedAt: new Date() })
    .where(eq(onboardingProposals.workspaceId, workspaceId));

  return skills[idx];
}

export async function addSkill(
  workspaceId: string,
  skill: Omit<ProposedSkill, 'tempId' | 'isAiGenerated'>,
) {
  const proposal = await requireReadyProposal(workspaceId);
  const skills   = proposal.proposedSkills as unknown as ProposedSkill[];
  const newSkill: ProposedSkill = { ...skill, tempId: randomUUID(), isAiGenerated: false };
  skills.push(newSkill);

  await db
    .update(onboardingProposals)
    .set({ proposedSkills: skills as unknown as Record<string, unknown>[], updatedAt: new Date() })
    .where(eq(onboardingProposals.workspaceId, workspaceId));

  return newSkill;
}

export async function deleteSkill(workspaceId: string, tempId: string) {
  const proposal = await requireReadyProposal(workspaceId);
  const skills   = proposal.proposedSkills as unknown as ProposedSkill[];
  const target   = skills.find(s => s.tempId === tempId);
  if (!target)            throw new AppError('Skill not found', 404);
  if (target.isAlwaysPresent) throw new AppError('Core leadership roles cannot be deleted', 400);

  const filtered = skills.filter(s => s.tempId !== tempId);

  await db
    .update(onboardingProposals)
    .set({ proposedSkills: filtered as unknown as Record<string, unknown>[], updatedAt: new Date() })
    .where(eq(onboardingProposals.workspaceId, workspaceId));

  return { deleted: tempId };
}

// ============================================================================
// Step 6 — Commit: write to DB, mark onboarding complete
// ============================================================================

export async function commitProposal(workspaceId: string): Promise<CommitProposalResponse> {
  const proposal = await requireReadyProposal(workspaceId);
  const proposed = proposal.proposedSkills as unknown as ProposedSkill[];
  const projectId = proposal.projectId!;

  // tempId → real DB uuid map (built as we insert)
  const tempToReal = new Map<string, string>();

  // We must insert in hierarchy order (top-down) so reportingManagerId
  // can reference already-inserted real IDs.
  const sorted = [...proposed].sort((a, b) => a.hierarchyLevel - b.hierarchyLevel);

  // Group into departments → create teams first
  const departmentSet = [...new Set(sorted.map(s => s.department))];
  const deptToTeamId  = new Map<string, string>();

  for (const dept of departmentSet) {
    const [team] = await db.insert(teamsTable).values({
      projectId,
      name:       dept,
      department: dept,
    }).returning();
    deptToTeamId.set(dept, team.id);
  }

  // Insert skills in hierarchy order
  for (const s of sorted) {
    const realId     = randomUUID();
    const managerId  = s.reportingManagerTempId ? (tempToReal.get(s.reportingManagerTempId) ?? null) : null;
    const teamId     = deptToTeamId.get(s.department) ?? null;

    await db.insert(skillsTable).values({
      id:                 realId,
      projectId,
      teamId,
      slug:               s.slug,
      realName:           s.realName,
      roleTitle:          s.roleTitle,
      department:         s.department,
      hierarchyLevel:     s.hierarchyLevel,
      reportingManagerId: managerId,
      description:        s.description,
      instructions:       s.instructions,
      ownedDomains:       s.ownedDomains,
      ownedRepoPaths:     s.ownedRepoPaths,
      triggerKeywords:    s.triggerKeywords,
      riskClass:          s.riskClass,
      status:             'active',
      idleMode:           'learning',
    });

    tempToReal.set(s.tempId, realId);

    // Insert team membership
    if (teamId) {
      await db.insert(teamMembersTable).values({
        teamId,
        skillId: realId,
        role:    s.hierarchyLevel <= 3 ? 'lead' : s.slug === 'scrum-master' ? 'scrum_master' : 'member',
      });
    }
  }

  // Mark proposal committed + onboarding complete
  await db
    .update(onboardingProposals)
    .set({ status: 'committed', updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));

  await db
    .update(workspaces)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  return {
    projectId,
    skillCount: sorted.length,
    teamCount:  departmentSet.length,
  };
}

// ============================================================================
// Helpers
// ============================================================================

async function getProject(workspaceId: string) {
  const p = await db.query.projects.findFirst({
    where: eq(projects.workspaceId, workspaceId),
  });
  if (!p) throw new AppError('Project not found — complete Step 1 first', 404);
  return p;
}

async function requireReadyProposal(workspaceId: string) {
  const proposal = await db.query.onboardingProposals.findFirst({
    where: eq(onboardingProposals.workspaceId, workspaceId),
  });
  if (!proposal)                 throw new AppError('No proposal found', 404);
  if (proposal.status === 'pending') throw new AppError('Analysis is still in progress — please wait', 202);
  if (proposal.status === 'failed')  throw new AppError(`Analysis failed: ${proposal.errorMessage}`, 500);
  if (proposal.status === 'committed') throw new AppError('Proposal already committed', 409);
  return proposal;
}
