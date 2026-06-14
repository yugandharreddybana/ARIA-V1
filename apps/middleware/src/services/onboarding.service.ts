/**
 * onboarding.service.ts
 * ---------------------
 * Orchestrates all 6 onboarding steps.
 *
 * Step 1  — saveCompany       : update workspace name + description, create project
 * Step 2  — saveLlmConfig     : delegate to existing workspace LLM config logic
 * Step 3  — saveRepos         : upsert projectRepos rows
 * Step 4  — saveScout         : save scout agent name/description, trigger async analysis
 * Step 5  — (poll)            : GET proposal status / proposed skills
 *           patchSkill        : edit one skill in the proposal JSON
 *           addSkill          : add a custom skill to the proposal
 *           deleteSkill       : remove a skill from the proposal (not isAlwaysPresent)
 * Step 6  — commitProposal    : write all skills + teams to DB, mark onboarding complete
 */

import { randomUUID } from 'crypto';
import { db } from '@aria/db';
import { workspaces, projects, projectRepos, skills, teams, teamMembers, onboardingProposals } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type {
  OnboardingCompanyPayload,
  OnboardingRepoSelectionPayload,
  OnboardingScoutPayload,
  ProposedSkill,
  ProposalSkillPatchPayload,
  CommitProposalResponse,
} from '../types/onboarding.types';
import { buildCodebaseProfile } from './repoAnalysis.service';
import { generateTeamProposal  } from './skillFactory.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getWorkspace(workspaceId: string) {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new AppError('Workspace not found', 404);
  return ws;
}

async function getOrCreateProposal(workspaceId: string, projectId?: string) {
  const existing = await db.query.onboardingProposals.findFirst({
    where: eq(onboardingProposals.workspaceId, workspaceId),
  });
  if (existing) return existing;
  const [created] = await db.insert(onboardingProposals).values({
    workspaceId,
    projectId:      projectId ?? null,
    status:         'pending',
    proposedSkills: [],
  }).returning();
  return created;
}

// ── Step 1 ────────────────────────────────────────────────────────────────────

export async function saveCompany(workspaceId: string, data: OnboardingCompanyPayload) {
  const [ws] = await db.update(workspaces)
    .set({ name: data.companyName, companyDescription: data.companyDescription, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning();

  // Create the project row (one project per onboarding)
  const [project] = await db.insert(projects).values({
    workspaceId,
    name:        data.companyName,
    description: data.companyDescription,
    status:      'active',
  }).returning();

  await getOrCreateProposal(workspaceId, project.id);
  return { workspace: ws, project };
}

// ── Step 3 ────────────────────────────────────────────────────────────────────

export async function saveRepos(workspaceId: string, data: OnboardingRepoSelectionPayload) {
  const proposal = await getOrCreateProposal(workspaceId);
  if (!proposal.projectId) throw new AppError('Complete Step 1 before selecting repos', 400);

  // Delete existing repos for this project then re-insert (idempotent)
  await db.delete(projectRepos).where(eq(projectRepos.projectId, proposal.projectId));

  if (data.repos.length === 0) throw new AppError('Select at least one repository', 400);

  const inserted = await db.insert(projectRepos).values(
    data.repos.map(r => ({
      projectId: proposal.projectId!,
      repoUrl:   r.repoUrl,
      repoName:  r.repoName,
      branch:    r.branch || 'main',
    })),
  ).returning();

  return inserted;
}

// ── Step 4 ────────────────────────────────────────────────────────────────────
// Saves scout config and fires async analysis + skill generation.
// Returns immediately — the frontend polls GET /api/onboarding/proposal for status.

export async function saveScoutAndTriggerAnalysis(
  workspaceId: string,
  data: OnboardingScoutPayload,
  ghToken: string,
) {
  const ws = await getWorkspace(workspaceId);

  // Persist scout config
  await db.update(workspaces)
    .set({ scoutAgentName: data.scoutName, scoutAgentDescription: data.scoutDescription, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  const proposal = await getOrCreateProposal(workspaceId);
  if (!proposal.projectId) throw new AppError('Complete Steps 1–3 before launching scout', 400);

  // Load repos
  const repos = await db.query.projectRepos.findMany({
    where: eq(projectRepos.projectId, proposal.projectId),
  });
  if (repos.length === 0) throw new AppError('No repos found — complete Step 3 first', 400);

  // Mark proposal as pending
  await db.update(onboardingProposals)
    .set({ status: 'pending', errorMessage: null, updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));

  // Fire async analysis (do NOT await — returns immediately to client)
  runAnalysisAsync(workspaceId, proposal.id, ws.name, repos.map(r => ({
    repoUrl:  r.repoUrl,
    repoName: r.repoName,
    fullName: r.repoUrl.replace('https://github.com/', ''),
    branch:   r.branch,
  })), ghToken).catch(console.error);

  return { status: 'pending', proposalId: proposal.id };
}

async function runAnalysisAsync(
  workspaceId: string,
  proposalId:  string,
  companyName: string,
  repos: Array<{ repoUrl: string; repoName: string; fullName: string; branch: string }>,
  ghToken: string,
) {
  try {
    const profile  = await buildCodebaseProfile(repos, ghToken);
    const proposed = await generateTeamProposal(workspaceId, profile, companyName);

    await db.update(onboardingProposals).set({
      status:          'ready',
      proposedSkills:  proposed,
      codebaseProfile: profile,
      updatedAt:       new Date(),
    }).where(eq(onboardingProposals.id, proposalId));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(onboardingProposals).set({
      status:       'failed',
      errorMessage: msg,
      updatedAt:    new Date(),
    }).where(eq(onboardingProposals.id, proposalId));
  }
}

// ── Step 5 helpers ──────────────────────────────────────────────────────────────

export async function getProposal(workspaceId: string) {
  const proposal = await db.query.onboardingProposals.findFirst({
    where: eq(onboardingProposals.workspaceId, workspaceId),
  });
  if (!proposal) throw new AppError('No proposal found — complete Steps 1–4 first', 404);
  return proposal;
}

export async function patchSkill(workspaceId: string, tempId: string, patch: ProposalSkillPatchPayload) {
  const proposal = await getProposal(workspaceId);
  const skills   = (proposal.proposedSkills as ProposedSkill[]);
  const idx      = skills.findIndex(s => s.tempId === tempId);
  if (idx === -1) throw new AppError(`Skill tempId ${tempId} not found`, 404);

  skills[idx] = { ...skills[idx], ...patch.skill };
  await db.update(onboardingProposals)
    .set({ proposedSkills: skills, updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));
  return skills[idx];
}

export async function addSkill(workspaceId: string, skillData: Omit<ProposedSkill, 'tempId'>) {
  const proposal = await getProposal(workspaceId);
  const current  = (proposal.proposedSkills as ProposedSkill[]);
  const newSkill: ProposedSkill = {
    ...skillData,
    tempId:        `tmp_custom_${randomUUID().slice(0, 8)}`,
    isAiGenerated: false,
  };
  const updated = [...current, newSkill];
  await db.update(onboardingProposals)
    .set({ proposedSkills: updated, updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));
  return newSkill;
}

export async function deleteSkill(workspaceId: string, tempId: string) {
  const proposal = await getProposal(workspaceId);
  const current  = (proposal.proposedSkills as ProposedSkill[]);
  const target   = current.find(s => s.tempId === tempId);
  if (!target)              throw new AppError(`Skill ${tempId} not found`, 404);
  if (target.isAlwaysPresent) throw new AppError('Cannot delete a core leadership role', 403);

  const updated = current.filter(s => s.tempId !== tempId);
  await db.update(onboardingProposals)
    .set({ proposedSkills: updated, updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));
}

// ── Step 6 ────────────────────────────────────────────────────────────────────

export async function commitProposal(workspaceId: string): Promise<CommitProposalResponse> {
  const proposal = await getProposal(workspaceId);
  if (proposal.status !== 'ready') {
    throw new AppError(`Proposal is not ready (status: ${proposal.status})`, 409);
  }
  if (!proposal.projectId) throw new AppError('No project linked to proposal', 500);

  const proposedSkills = proposal.proposedSkills as ProposedSkill[];

  // ── Group skills by department to create teams ──────────────────────────────────
  const deptMap = new Map<string, ProposedSkill[]>();
  for (const s of proposedSkills) {
    const dept = s.department || 'General';
    if (!deptMap.has(dept)) deptMap.set(dept, []);
    deptMap.get(dept)!.push(s);
  }

  // Insert teams
  const teamRows = await db.insert(teams).values(
    [...deptMap.keys()].map(dept => ({
      projectId:  proposal.projectId!,
      name:       dept,
      department: dept,
    })),
  ).returning();

  const teamByDept = new Map(teamRows.map(t => [t.name, t.id]));

  // ── Insert skills in hierarchy order (parents first) so self-ref FK resolves ─
  const sorted = [...proposedSkills].sort((a, b) => a.hierarchyLevel - b.hierarchyLevel);

  // tempId → real DB id map (built as we insert)
  const idMap = new Map<string, string>();

  const skillRows = [];
  for (const s of sorted) {
    const realManagerId = s.reportingManagerTempId ? idMap.get(s.reportingManagerTempId) ?? null : null;
    const [row] = await db.insert(skills).values({
      projectId:          proposal.projectId!,
      teamId:             teamByDept.get(s.department) ?? null,
      slug:               s.slug,
      realName:           s.realName,
      roleTitle:          s.roleTitle,
      department:         s.department,
      hierarchyLevel:     s.hierarchyLevel,
      reportingManagerId: realManagerId ?? undefined,
      description:        s.description,
      instructions:       s.instructions,
      ownedDomains:       s.ownedDomains,
      ownedRepoPaths:     s.ownedRepoPaths,
      triggerKeywords:    s.triggerKeywords,
      riskClass:          s.riskClass,
      status:             'active',
    }).returning();
    idMap.set(s.tempId, row.id);
    skillRows.push(row);
  }

  // ── Insert teamMembers ──────────────────────────────────────────────────────────────
  const memberValues = skillRows
    .filter(r => r.teamId)
    .map(r => ({ teamId: r.teamId!, skillId: r.id, role: 'member' as const }));
  if (memberValues.length > 0) {
    await db.insert(teamMembers).values(memberValues);
  }

  // ── Mark onboarding complete ────────────────────────────────────────────────────────
  await db.update(workspaces)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  await db.update(onboardingProposals)
    .set({ status: 'committed', updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));

  return {
    projectId:  proposal.projectId,
    skillCount: skillRows.length,
    teamCount:  teamRows.length,
  };
}
