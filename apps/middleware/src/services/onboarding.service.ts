/**
 * onboarding.service.ts
 * ---------------------
 * Orchestrates all 6 onboarding steps.
 *
 * Step 1 ─ saveCompanyInfo      → updates workspace name + description
 * Step 2 ─ saveLlmConfig        → delegated to workspace.service (already exists)
 * Step 3 ─ saveRepos            → creates project + project_repos rows
 * Step 4 ─ saveScoutAndAnalyse  → saves scout persona, triggers repo analysis
 *                                  + skill generation → stores in onboarding_proposals
 * Step 5 ─ getProposal          → returns current ProposedSkill[] for the tree
 *          patchSkill           → update one skill in the proposal
 *          addSkill             → add a new custom skill
 *          deleteSkill          → remove a skill (never allowed for isAlwaysPresent)
 * Step 6 ─ commitProposal       → writes all skills + teams to DB, marks onboarding done
 */

import { db } from '@aria/db';
import {
  workspaces, projects, projectRepos,
  onboardingProposals, skills, teams, teamMembers,
} from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { AppError } from '../middleware/error.middleware';
import { buildCodebaseProfile, decryptGithubToken } from './repoAnalysis.service';
import { buildProposedSkills } from './skillFactory.service';
import type {
  OnboardingCompanyPayload,
  OnboardingRepoSelection,
  OnboardingScoutPayload,
  ProposedSkill,
  ProposalSkillPatch,
  CommitProposalResponse,
} from '../types/onboarding.types';

// ── Step 1 ───────────────────────────────────────────────────────────────────
export async function saveCompanyInfo(workspaceId: string, payload: OnboardingCompanyPayload) {
  const [ws] = await db
    .update(workspaces)
    .set({ name: payload.companyName, companyDescription: payload.companyDescription, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning();
  if (!ws) throw new AppError('Workspace not found', 404);
  return ws;
}

// ── Step 3 ───────────────────────────────────────────────────────────────────
export async function saveRepos(workspaceId: string, payload: OnboardingRepoSelection) {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new AppError('Workspace not found', 404);
  if (!payload.repos.length) throw new AppError('Select at least one repository', 400);

  // Create the project named after the workspace / company
  const [project] = await db.insert(projects).values({
    id:          randomUUID(),
    workspaceId,
    name:        ws.name,
    description: ws.companyDescription ?? '',
    status:      'onboarding',
  }).returning();

  // Insert all selected repos
  const repoRows = payload.repos.map(r => ({
    id:        randomUUID(),
    projectId: project.id,
    repoUrl:   r.repoUrl,
    repoName:  r.repoName,
    branch:    r.branch,
  }));
  await db.insert(projectRepos).values(repoRows);

  // Create a placeholder onboarding proposal
  const [proposal] = await db.insert(onboardingProposals).values({
    id:          randomUUID(),
    workspaceId,
    projectId:   project.id,
    status:      'pending',
  }).returning();

  return { project, proposal };
}

// ── Step 4 ───────────────────────────────────────────────────────────────────
export async function saveScoutAndAnalyse(
  workspaceId: string,
  payload: OnboardingScoutPayload,
): Promise<{ proposalId: string; status: 'pending' }> {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new AppError('Workspace not found', 404);

  // 1. Persist scout persona
  await db.update(workspaces).set({
    scoutAgentName:        payload.scoutName,
    scoutAgentDescription: payload.scoutDescription,
    updatedAt:             new Date(),
  }).where(eq(workspaces.id, workspaceId));

  // 2. Find the pending proposal for this workspace
  const proposal = await db.query.onboardingProposals.findFirst({
    where: and(
      eq(onboardingProposals.workspaceId, workspaceId),
      eq(onboardingProposals.status, 'pending'),
    ),
  });
  if (!proposal) throw new AppError('No pending proposal found. Complete Step 3 first.', 400);

  // 3. Kick off analysis in background (non-blocking — respond immediately)
  setImmediate(async () => {
    try {
      // Load repos for this project
      const repos = await db.query.projectRepos.findMany({
        where: eq(projectRepos.projectId, proposal.projectId!),
      });

      const selectedRepos = repos.map(r => ({
        repoUrl:  r.repoUrl,
        repoName: r.repoName,
        fullName: r.repoUrl
          .replace('https://github.com/', '')
          .replace(/\.git$/, ''),
        branch:   r.branch,
      }));

      // Decrypt GitHub token
      const ghToken = decryptGithubToken(ws.githubAccessTokenEncrypted);

      // Analyse repos
      const profile = await buildCodebaseProfile(selectedRepos, ghToken);

      // Generate skill proposals
      const proposedSkills = buildProposedSkills(profile, ws.name);

      // Save to DB
      await db.update(onboardingProposals).set({
        status:          'ready',
        proposedSkills:  proposedSkills as unknown as typeof onboardingProposals.$inferInsert['proposedSkills'],
        codebaseProfile: profile as unknown as typeof onboardingProposals.$inferInsert['codebaseProfile'],
        updatedAt:       new Date(),
      }).where(eq(onboardingProposals.id, proposal.id));
    } catch (err) {
      await db.update(onboardingProposals).set({
        status:       'failed',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        updatedAt:    new Date(),
      }).where(eq(onboardingProposals.id, proposal!.id));
    }
  });

  return { proposalId: proposal.id, status: 'pending' };
}

// ── Step 5: get proposal ────────────────────────────────────────────────────────
export async function getProposal(workspaceId: string) {
  const proposal = await db.query.onboardingProposals.findFirst({
    where: eq(onboardingProposals.workspaceId, workspaceId),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });
  if (!proposal) throw new AppError('No onboarding proposal found', 404);
  return proposal;
}

// ── Step 5: patch one skill in the proposal ─────────────────────────────────────
export async function patchProposalSkill(
  workspaceId: string,
  tempId: string,
  patch: ProposalSkillPatch,
) {
  const proposal = await getProposal(workspaceId);
  if (proposal.status === 'committed') throw new AppError('Proposal already committed', 400);

  const current = (proposal.proposedSkills as ProposedSkill[]);
  const idx = current.findIndex(s => s.tempId === tempId);
  if (idx === -1) throw new AppError(`Skill ${tempId} not found in proposal`, 404);

  current[idx] = { ...current[idx], ...patch.skill };

  await db.update(onboardingProposals).set({
    proposedSkills: current as unknown as typeof onboardingProposals.$inferInsert['proposedSkills'],
    updatedAt: new Date(),
  }).where(eq(onboardingProposals.id, proposal.id));

  return current[idx];
}

// ── Step 5: add a custom skill ─────────────────────────────────────────────────────
export async function addProposalSkill(workspaceId: string, skill: ProposedSkill) {
  const proposal = await getProposal(workspaceId);
  if (proposal.status === 'committed') throw new AppError('Proposal already committed', 400);

  const current = (proposal.proposedSkills as ProposedSkill[]);
  const newSkill: ProposedSkill = { ...skill, isAiGenerated: false, tempId: skill.tempId || `custom-${randomUUID().slice(0,8)}` };
  current.push(newSkill);

  await db.update(onboardingProposals).set({
    proposedSkills: current as unknown as typeof onboardingProposals.$inferInsert['proposedSkills'],
    updatedAt: new Date(),
  }).where(eq(onboardingProposals.id, proposal.id));

  return newSkill;
}

// ── Step 5: delete a skill from the proposal ─────────────────────────────────
export async function deleteProposalSkill(workspaceId: string, tempId: string) {
  const proposal = await getProposal(workspaceId);
  if (proposal.status === 'committed') throw new AppError('Proposal already committed', 400);

  const current = (proposal.proposedSkills as ProposedSkill[]);
  const target = current.find(s => s.tempId === tempId);
  if (!target) throw new AppError(`Skill ${tempId} not found`, 404);
  if (target.isAlwaysPresent) throw new AppError(`Cannot delete a core role (${target.roleTitle})`, 403);

  const updated = current.filter(s => s.tempId !== tempId);

  await db.update(onboardingProposals).set({
    proposedSkills: updated as unknown as typeof onboardingProposals.$inferInsert['proposedSkills'],
    updatedAt: new Date(),
  }).where(eq(onboardingProposals.id, proposal.id));
}

// ── Step 6: commit proposal → write skills + teams to DB ─────────────────────────
export async function commitProposal(workspaceId: string): Promise<CommitProposalResponse> {
  const proposal = await getProposal(workspaceId);
  if (proposal.status === 'committed') throw new AppError('Already committed', 400);
  if (proposal.status === 'pending')   throw new AppError('Analysis still running. Please wait.', 409);
  if (proposal.status === 'failed')    throw new AppError('Analysis failed. Re-run from Step 4.', 400);

  const proposedSkills = proposal.proposedSkills as ProposedSkill[];
  const projectId = proposal.projectId!;

  // ── 1. Group skills by department → create teams ───────────────────────────────
  const deptSet = new Set(proposedSkills.map(s => s.department));
  const teamMap: Record<string, string> = {}; // department → team DB id

  for (const dept of deptSet) {
    const [team] = await db.insert(teams).values({
      id: randomUUID(), projectId, name: dept, department: dept,
    }).returning();
    teamMap[dept] = team.id;
  }

  // ── 2. Insert skills (two passes: first without reportingManagerId, then update) ──
  // Pass 1: insert all skills, get their DB IDs
  const tempIdToDbId: Record<string, string> = {};

  for (const ps of proposedSkills) {
    const [s] = await db.insert(skills).values({
      id:             randomUUID(),
      projectId,
      teamId:         teamMap[ps.department],
      slug:           ps.slug,
      realName:       ps.realName,
      roleTitle:      ps.roleTitle,
      department:     ps.department,
      hierarchyLevel: ps.hierarchyLevel,
      description:    ps.description,
      instructions:   ps.instructions,
      ownedDomains:   ps.ownedDomains,
      ownedRepoPaths: ps.ownedRepoPaths,
      triggerKeywords: ps.triggerKeywords,
      riskClass:      ps.riskClass,
      status:         'active',
    }).returning();
    tempIdToDbId[ps.tempId] = s.id;
  }

  // Pass 2: wire up reportingManagerId now that all DB IDs are known
  for (const ps of proposedSkills) {
    if (ps.reportingManagerTempId) {
      const managerDbId = tempIdToDbId[ps.reportingManagerTempId];
      if (managerDbId) {
        await db.update(skills)
          .set({ reportingManagerId: managerDbId })
          .where(eq(skills.id, tempIdToDbId[ps.tempId]));
      }
    }
  }

  // ── 3. Wire team lead / scrum master onto each team ─────────────────────────────
  for (const ps of proposedSkills) {
    const isLead        = ps.roleTitle.toLowerCase().includes('lead') || ps.roleTitle.includes('CTO') || ps.roleTitle.includes('CPO');
    const isScrumMaster = ps.roleTitle === 'Scrum Master';
    if (isLead || isScrumMaster) {
      const teamId = teamMap[ps.department];
      if (teamId) {
        await db.update(teams).set(
          isLead ? { leadSkillId: tempIdToDbId[ps.tempId] } : { scrumMasterSkillId: tempIdToDbId[ps.tempId] },
        ).where(eq(teams.id, teamId));
      }
    }
    // Insert team_members junction row
    await db.insert(teamMembers).values({
      id:      randomUUID(),
      teamId:  teamMap[ps.department],
      skillId: tempIdToDbId[ps.tempId],
      role:    ps.hierarchyLevel <= 3 ? 'lead' : ps.roleTitle === 'Scrum Master' ? 'scrum_master' : 'member',
    });
  }

  // ── 4. Mark proposal committed + project active ───────────────────────────────
  await db.update(onboardingProposals)
    .set({ status: 'committed', updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));

  await db.update(projects)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await db.update(workspaces)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  return {
    projectId,
    skillCount: proposedSkills.length,
    teamCount:  Object.keys(teamMap).length,
  };
}
