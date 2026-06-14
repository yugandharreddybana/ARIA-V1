/**
 * onboarding.service.ts
 * ---------------------
 * Orchestrates the 6-step onboarding flow.
 *
 * Step 1 ─ saveCompanyInfo       → updates workspace name + description
 * Step 2 ─ saveLlmConfig         → reuses workspace.service (already exists)
 * Step 3 ─ saveRepos             → creates project + projectRepos rows
 * Step 4 ─ saveScout             → saves scout persona, triggers async analysis
 * Step 5 ─ getProposal           → polls proposal status + returns ProposedSkill[]
 *         patchSkill             → edits a skill in the proposal JSON
 *         addSkill               → adds a new skill to the proposal
 *         deleteSkill            → removes a skill (guards isAlwaysPresent)
 * Step 6 ─ commitProposal        → writes all skills + teams to DB, marks onboarding complete
 */

import { randomUUID } from 'crypto';
import { db } from '@aria/db';
import { workspaces, projects, projectRepos, skills, teams, teamMembers, onboardingProposals } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import { buildCodebaseProfile } from './repoAnalysis.service';
import { generateProposedSkills } from './skillFactory.service';
import type {
  OnboardingCompanyPayload,
  OnboardingRepoSelection,
  OnboardingScoutPayload,
  ProposedSkill,
  ProposalPatchPayload,
  CommitProposalResponse,
  OnboardingStatusResponse,
} from '../types/onboarding.types';

// ---- Helpers ---------------------------------------------------------------

function requireWorkspace(workspaceId: string) {
  return db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) }).then(ws => {
    if (!ws) throw new AppError('Workspace not found', 404);
    return ws;
  });
}

function requireProposal(workspaceId: string) {
  return db.query.onboardingProposals.findFirst({
    where: eq(onboardingProposals.workspaceId, workspaceId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  }).then(p => {
    if (!p) throw new AppError('No onboarding proposal found — complete Step 3 first', 404);
    return p;
  });
}

// ---- Step 1 ----------------------------------------------------------------

export async function saveCompanyInfo(
  workspaceId: string,
  payload: OnboardingCompanyPayload,
): Promise<void> {
  await requireWorkspace(workspaceId);
  await db.update(workspaces)
    .set({ name: payload.companyName, companyDescription: payload.companyDescription, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
}

// ---- Step 3 ----------------------------------------------------------------

export async function saveRepos(
  workspaceId: string,
  payload: OnboardingRepoSelection,
): Promise<{ projectId: string }> {
  const ws = await requireWorkspace(workspaceId);

  // Create the onboarding project (one project per onboarding)
  const [project] = await db.insert(projects)
    .values({ workspaceId, name: ws.name, description: ws.companyDescription ?? '', status: 'active' })
    .returning();

  // Insert all selected repos
  if (payload.repos.length > 0) {
    await db.insert(projectRepos).values(
      payload.repos.map(r => ({
        projectId: project.id,
        repoUrl:   r.repoUrl,
        repoName:  r.fullName,   // stored as owner/repo for GitHub API calls
        branch:    r.branch,
      })),
    );
  }

  return { projectId: project.id };
}

// ---- Step 4 ----------------------------------------------------------------

export async function saveScoutAndTriggerAnalysis(
  workspaceId: string,
  payload: OnboardingScoutPayload,
): Promise<{ proposalId: string }> {
  const ws = await requireWorkspace(workspaceId);

  // Save scout persona
  await db.update(workspaces)
    .set({
      scoutAgentName:        payload.scoutName,
      scoutAgentDescription: payload.scoutDescription,
      updatedAt:             new Date(),
    })
    .where(eq(workspaces.id, workspaceId));

  // Find the project created in Step 3
  const project = await db.query.projects.findFirst({
    where: eq(projects.workspaceId, workspaceId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  if (!project) throw new AppError('Project not found — complete Step 3 first', 400);

  // Create a pending proposal row
  const [proposal] = await db.insert(onboardingProposals)
    .values({ workspaceId, projectId: project.id, status: 'pending' })
    .returning();

  // Trigger async analysis (fire and forget — client polls GET /proposal)
  void runAnalysisAndGenerate(workspaceId, project.id, proposal.id);

  return { proposalId: proposal.id };
}

/**
 * Background job: analyse repos → generate skills → update proposal to 'ready'.
 * Errors are caught and stored in proposal.errorMessage with status 'failed'.
 */
async function runAnalysisAndGenerate(
  workspaceId: string,
  projectId:   string,
  proposalId:  string,
): Promise<void> {
  try {
    const profile       = await buildCodebaseProfile(workspaceId, projectId);
    const proposedSkills = await generateProposedSkills(workspaceId, profile);

    await db.update(onboardingProposals)
      .set({
        status:          'ready',
        proposedSkills:  proposedSkills as unknown as Record<string, unknown>[],
        codebaseProfile: profile as unknown as Record<string, unknown>,
        updatedAt:       new Date(),
      })
      .where(eq(onboardingProposals.id, proposalId));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(onboardingProposals)
      .set({ status: 'failed', errorMessage: msg, updatedAt: new Date() })
      .where(eq(onboardingProposals.id, proposalId));
  }
}

// ---- Step 5 (poll + edit) --------------------------------------------------

export async function getProposal(workspaceId: string) {
  const proposal = await requireProposal(workspaceId);
  return {
    proposalId:     proposal.id,
    status:         proposal.status,
    proposedSkills: (proposal.proposedSkills as ProposedSkill[]) ?? [],
    errorMessage:   proposal.errorMessage,
  };
}

export async function patchSkill(
  workspaceId: string,
  tempId:      string,
  patch:       ProposalPatchPayload,
): Promise<ProposedSkill[]> {
  const proposal = await requireProposal(workspaceId);
  if (proposal.status !== 'ready') throw new AppError('Proposal is not ready for editing', 400);

  const skills = (proposal.proposedSkills as ProposedSkill[]);
  const idx = skills.findIndex(s => s.tempId === tempId);
  if (idx === -1) throw new AppError('Skill not found', 404);

  skills[idx] = { ...skills[idx], ...patch.skill };

  await db.update(onboardingProposals)
    .set({ proposedSkills: skills as unknown as Record<string, unknown>[], updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));

  return skills;
}

export async function addSkill(
  workspaceId: string,
  newSkill: Omit<ProposedSkill, 'tempId'>,
): Promise<ProposedSkill[]> {
  const proposal = await requireProposal(workspaceId);
  if (proposal.status !== 'ready') throw new AppError('Proposal is not ready for editing', 400);

  const updated = [
    ...(proposal.proposedSkills as ProposedSkill[]),
    { ...newSkill, tempId: randomUUID(), isAiGenerated: false },
  ];

  await db.update(onboardingProposals)
    .set({ proposedSkills: updated as unknown as Record<string, unknown>[], updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));

  return updated;
}

export async function deleteSkill(
  workspaceId: string,
  tempId:      string,
): Promise<ProposedSkill[]> {
  const proposal = await requireProposal(workspaceId);
  if (proposal.status !== 'ready') throw new AppError('Proposal is not ready for editing', 400);

  const current = (proposal.proposedSkills as ProposedSkill[]);
  const target  = current.find(s => s.tempId === tempId);
  if (!target)            throw new AppError('Skill not found', 404);
  if (target.isAlwaysPresent) throw new AppError('C-suite agents cannot be deleted', 400);

  const updated = current.filter(s => s.tempId !== tempId);

  await db.update(onboardingProposals)
    .set({ proposedSkills: updated as unknown as Record<string, unknown>[], updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));

  return updated;
}

// ---- Step 6 (commit) -------------------------------------------------------

export async function commitProposal(
  workspaceId: string,
): Promise<CommitProposalResponse> {
  const proposal = await requireProposal(workspaceId);
  if (proposal.status !== 'ready') throw new AppError('Proposal must be ready before committing', 400);
  if (!proposal.projectId)        throw new AppError('Proposal has no associated project', 500);

  const proposed = proposal.proposedSkills as ProposedSkill[];
  const projectId = proposal.projectId;

  // --- 1. Group by department to create teams ---------------------------------
  const deptToTeamId: Record<string, string> = {};
  const deptNames = [...new Set(proposed.map(s => s.department))];

  for (const dept of deptNames) {
    const [team] = await db.insert(teams)
      .values({ projectId, name: `${dept} Team`, department: dept })
      .returning();
    deptToTeamId[dept] = team.id;
  }

  // --- 2. Insert skills, building tempId → real DB id map --------------------
  const tempIdToDbId: Record<string, string> = {};
  // Insert in hierarchy order so reporting manager exists before direct reports
  const sorted = [...proposed].sort((a, b) => a.hierarchyLevel - b.hierarchyLevel);

  for (const s of sorted) {
    const reportingManagerId = s.reportingManagerTempId
      ? tempIdToDbId[s.reportingManagerTempId] ?? null
      : null;

    const [row] = await db.insert(skills).values({
      projectId,
      teamId:             deptToTeamId[s.department] ?? null,
      slug:               s.slug,
      realName:           s.realName,
      roleTitle:          s.roleTitle,
      department:         s.department,
      hierarchyLevel:     s.hierarchyLevel,
      reportingManagerId,
      instructions:       s.instructions,
      description:        s.description,
      ownedDomains:       s.ownedDomains,
      ownedRepoPaths:     s.ownedRepoPaths,
      triggerKeywords:    s.triggerKeywords,
      riskClass:          s.riskClass,
      status:             'active',
      idleMode:           'learning',
    }).returning();

    tempIdToDbId[s.tempId] = row.id;
  }

  // --- 3. Insert team members -----------------------------------------------
  for (const s of sorted) {
    const skillId = tempIdToDbId[s.tempId];
    const teamId  = deptToTeamId[s.department];
    if (!skillId || !teamId) continue;

    const memberRole =
      s.hierarchyLevel <= 3 ? 'lead' :
      s.roleTitle.toLowerCase().includes('scrum') ? 'scrum_master' : 'member';

    await db.insert(teamMembers).values({ teamId, skillId, role: memberRole });
  }

  // --- 4. Update proposal status + mark onboarding complete -----------------
  await db.update(onboardingProposals)
    .set({ status: 'committed', updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));

  await db.update(workspaces)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  return {
    projectId,
    skillCount: sorted.length,
    teamCount:  deptNames.length,
  };
}

// ---- Status (used by frontend to resume interrupted onboarding) -----------

export async function getOnboardingStatus(
  workspaceId: string,
): Promise<OnboardingStatusResponse> {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new AppError('Workspace not found', 404);

  const proposal = await db.query.onboardingProposals.findFirst({
    where: eq(onboardingProposals.workspaceId, workspaceId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  // Determine last completed step
  let step = 0;
  if (ws.name && ws.companyDescription)                       step = Math.max(step, 1);
  if (ws.llmProvider && ws.llmModel)                          step = Math.max(step, 2);
  if (proposal?.projectId)                                    step = Math.max(step, 3);
  if (ws.scoutAgentName && ws.scoutAgentName !== 'Aria Scout') step = Math.max(step, 4);
  if (proposal?.status === 'ready' || proposal?.status === 'committed') step = Math.max(step, 5);
  if (proposal?.status === 'committed')                       step = 6;

  return {
    step,
    companyName:         ws.name,
    scoutAgentName:      ws.scoutAgentName ?? null,
    proposalStatus:      proposal?.status ?? null,
    proposalId:          proposal?.id ?? null,
    onboardingCompleted: !!ws.onboardingCompletedAt,
  };
}
