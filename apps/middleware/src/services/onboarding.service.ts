/**
 * onboarding.service.ts
 * ---------------------
 * Orchestrates all 6 onboarding steps.
 *
 * Step 1 → saveCompany()          — update workspace name + description
 * Step 2 → handled by existing    — PATCH /api/workspace/llm-config (reused)
 * Step 3 → saveRepos()             — upsert project_repos
 * Step 4 → saveScout()             — save scout name/description + trigger analysis
 * Step 5 → getProposal()           — poll for ready proposal
 *           patchProposalSkill()   — edit a proposed skill in-place
 *           addProposalSkill()     — add a custom skill
 *           deleteProposalSkill()  — remove a skill (guards isAlwaysPresent)
 * Step 6 → commitProposal()        — write all skills + teams to DB
 */

import { randomUUID }  from 'crypto';
import { db }          from '@aria/db';
import {
  workspaces, projects, projectRepos,
  skills, teams, teamMembers,
  onboardingProposals,
} from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError }   from '../middleware/error.middleware';
import { decryptApiKey } from './workspace.service';
import { analyseRepos }  from './repoAnalysis.service';
import { generateTeamProposal } from './skillFactory.service';
import type {
  OnboardingCompanyPayload,
  OnboardingReposPayload,
  OnboardingScoutPayload,
  ProposedSkill,
  ProposalSkillPatch,
  CommitProposalResponse,
} from '../types/onboarding.types';

// ─── helpers ───────────────────────────────────────────────────────────────
async function getWorkspace(workspaceId: string) {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new AppError('Workspace not found', 404, 'NOT_FOUND');
  return ws;
}

async function getActiveProposal(workspaceId: string) {
  const proposal = await db.query.onboardingProposals.findFirst({
    where: and(
      eq(onboardingProposals.workspaceId, workspaceId),
      // Only return proposals that haven't been committed yet
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  return proposal;
}

// ─── Step 1 ─────────────────────────────────────────────────────────────────
export async function saveCompany(
  workspaceId: string,
  payload: OnboardingCompanyPayload,
): Promise<void> {
  await getWorkspace(workspaceId);
  await db.update(workspaces)
    .set({ name: payload.companyName.trim(), companyDescription: payload.companyDescription.trim(), updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
}

// ─── Step 3 ─────────────────────────────────────────────────────────────────
export async function saveRepos(
  workspaceId: string,
  payload: OnboardingReposPayload,
): Promise<{ projectId: string }> {
  await getWorkspace(workspaceId);
  if (!payload.repos.length) throw new AppError('At least one repo must be selected', 400, 'VALIDATION');

  // Find or create the onboarding project for this workspace
  let project = await db.query.projects.findFirst({
    where: and(eq(projects.workspaceId, workspaceId), eq(projects.status, 'active')),
  });

  if (!project) {
    const ws = await getWorkspace(workspaceId);
    const [p] = await db.insert(projects).values({
      workspaceId,
      name:        ws.name,
      description: ws.companyDescription ?? '',
      status:      'active',
    }).returning();
    project = p;
  }

  // Delete old repos for this project and re-insert selected ones
  await db.delete(projectRepos).where(eq(projectRepos.projectId, project.id));
  if (payload.repos.length) {
    await db.insert(projectRepos).values(
      payload.repos.map(r => ({
        projectId: project!.id,
        repoUrl:   r.repoUrl,
        repoName:  r.repoName,
        branch:    r.branch || 'main',
      })),
    );
  }

  return { projectId: project.id };
}

// ─── Step 4: save scout + trigger async analysis ─────────────────────────────
export async function saveScoutAndTriggerAnalysis(
  workspaceId: string,
  payload: OnboardingScoutPayload,
): Promise<{ proposalId: string }> {
  const ws = await getWorkspace(workspaceId);

  // Save scout persona
  await db.update(workspaces)
    .set({
      scoutAgentName:        payload.scoutName.trim(),
      scoutAgentDescription: payload.scoutDescription.trim(),
      updatedAt:             new Date(),
    })
    .where(eq(workspaces.id, workspaceId));

  // Find the active project for this workspace
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.workspaceId, workspaceId), eq(projects.status, 'active')),
    with:  { repos: true },
  });
  if (!project) throw new AppError('No active project found. Complete Step 3 first.', 400, 'VALIDATION');
  if (!project.repos?.length) throw new AppError('No repos connected. Complete Step 3 first.', 400, 'VALIDATION');

  // Create a pending proposal row immediately so the UI can poll for it
  const [proposal] = await db.insert(onboardingProposals).values({
    workspaceId,
    projectId:  project.id,
    status:     'pending',
  }).returning();

  // Get GitHub token for repo analysis (stored encrypted on workspace)
  const ghTokenRaw = ws.githubAccessTokenEncrypted
    ? decryptApiKey(ws.githubAccessTokenEncrypted)
    : null;

  // Fire-and-forget: run analysis + skill generation in background
  runAnalysisInBackground(proposal.id, workspaceId, project, ghTokenRaw).catch(async (err) => {
    await db.update(onboardingProposals)
      .set({ status: 'failed', errorMessage: String(err), updatedAt: new Date() })
      .where(eq(onboardingProposals.id, proposal.id));
  });

  return { proposalId: proposal.id };
}

async function runAnalysisInBackground(
  proposalId:  string,
  workspaceId: string,
  project:     { id: string; name: string; repos: { repoUrl: string; repoName: string; branch: string }[] },
  ghToken:     string | null,
): Promise<void> {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) throw new Error('Workspace not found during background analysis');

  // Step A: analyse repos (read GitHub file trees + dependencies)
  const selectedRepos = project.repos.map(r => ({
    repoUrl:  r.repoUrl,
    repoName: r.repoName,
    branch:   r.branch,
    // Extract fullName from repoUrl: https://github.com/owner/repo → owner/repo
    fullName: r.repoUrl.replace('https://github.com/', '').replace('.git', ''),
  }));

  const profile = ghToken
    ? await analyseRepos(selectedRepos, ghToken)
    : buildFallbackProfile(project.repos.map(r => r.repoName));

  // Step B: generate team proposal via LLM
  const proposedSkills = await generateTeamProposal(profile, ws.name, workspaceId);

  // Step C: save to proposal row
  await db.update(onboardingProposals)
    .set({
      status:          'ready',
      proposedSkills:  proposedSkills as unknown as Record<string, unknown>[],
      codebaseProfile: profile as unknown as Record<string, unknown>,
      updatedAt:       new Date(),
    })
    .where(eq(onboardingProposals.id, proposalId));
}

function buildFallbackProfile(repoNames: string[]) {
  return {
    repos:          repoNames.map(n => ({
      repoName: n, hasFrontend: false, hasBackend: true, hasAiMl: false,
      hasInfra: false, hasCiCd: false, hasCloud: false, hasMobile: false,
      primaryLang: 'Unknown', frameworks: [], description: '',
    })),
    hasFrontend:    false,
    hasBackend:     true,
    hasAiMl:        false,
    hasInfra:       false,
    hasCiCd:        false,
    hasCloud:       false,
    hasMobile:      false,
    allFrameworks:  [],
    allLangs:       [],
    projectSummary: `Project with repos: ${repoNames.join(', ')}.`,
  };
}

// ─── Step 5: poll + edit proposal ──────────────────────────────────────────
export async function getProposal(workspaceId: string) {
  const proposal = await getActiveProposal(workspaceId);
  if (!proposal) throw new AppError('No proposal found. Complete Step 4 first.', 404, 'NOT_FOUND');
  return proposal;
}

export async function patchProposalSkill(
  workspaceId: string,
  tempId: string,
  patch: ProposalSkillPatch,
): Promise<ProposedSkill[]> {
  const proposal = await getActiveProposal(workspaceId);
  if (!proposal) throw new AppError('No proposal found', 404, 'NOT_FOUND');
  if (proposal.status === 'committed') throw new AppError('Proposal already committed', 400, 'CONFLICT');

  const skills = proposal.proposedSkills as unknown as ProposedSkill[];
  const idx = skills.findIndex(s => s.tempId === tempId);
  if (idx === -1) throw new AppError('Skill not found in proposal', 404, 'NOT_FOUND');

  skills[idx] = { ...skills[idx], ...patch.skill };

  await db.update(onboardingProposals)
    .set({ proposedSkills: skills as unknown as Record<string, unknown>[], updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));

  return skills;
}

export async function addProposalSkill(
  workspaceId: string,
  newSkill: Omit<ProposedSkill, 'tempId'>,
): Promise<ProposedSkill[]> {
  const proposal = await getActiveProposal(workspaceId);
  if (!proposal) throw new AppError('No proposal found', 404, 'NOT_FOUND');
  if (proposal.status === 'committed') throw new AppError('Proposal already committed', 400, 'CONFLICT');

  const skillsArr = proposal.proposedSkills as unknown as ProposedSkill[];
  const added: ProposedSkill = { ...newSkill, tempId: randomUUID(), isAiGenerated: false, isAlwaysPresent: false };
  skillsArr.push(added);

  await db.update(onboardingProposals)
    .set({ proposedSkills: skillsArr as unknown as Record<string, unknown>[], updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));

  return skillsArr;
}

export async function deleteProposalSkill(
  workspaceId: string,
  tempId: string,
): Promise<ProposedSkill[]> {
  const proposal = await getActiveProposal(workspaceId);
  if (!proposal) throw new AppError('No proposal found', 404, 'NOT_FOUND');
  if (proposal.status === 'committed') throw new AppError('Proposal already committed', 400, 'CONFLICT');

  const skillsArr = proposal.proposedSkills as unknown as ProposedSkill[];
  const target = skillsArr.find(s => s.tempId === tempId);
  if (!target) throw new AppError('Skill not found in proposal', 404, 'NOT_FOUND');
  if (target.isAlwaysPresent) throw new AppError(`Cannot delete "${target.roleTitle}" — this role is required.`, 400, 'FORBIDDEN');

  const updated = skillsArr.filter(s => s.tempId !== tempId);
  await db.update(onboardingProposals)
    .set({ proposedSkills: updated as unknown as Record<string, unknown>[], updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));

  return updated;
}

// ─── Step 6: commit ─────────────────────────────────────────────────────────
export async function commitProposal(
  workspaceId: string,
): Promise<CommitProposalResponse> {
  const proposal = await getActiveProposal(workspaceId);
  if (!proposal) throw new AppError('No proposal found', 404, 'NOT_FOUND');
  if (proposal.status !== 'ready') throw new AppError('Proposal is not ready yet', 400, 'CONFLICT');
  if (!proposal.projectId) throw new AppError('No project linked to proposal', 400, 'CONFLICT');

  const proposedSkills = proposal.proposedSkills as unknown as ProposedSkill[];
  const projectId = proposal.projectId;

  // ── 1. Group skills by department to create teams ────────────────────────
  const deptMap = new Map<string, ProposedSkill[]>();
  for (const s of proposedSkills) {
    const arr = deptMap.get(s.department) ?? [];
    arr.push(s);
    deptMap.set(s.department, arr);
  }

  const teamRows: { id: string; department: string }[] = [];
  for (const [department] of deptMap) {
    const [team] = await db.insert(teams).values({ projectId, name: department, department }).returning();
    teamRows.push({ id: team.id, department });
  }

  // ── 2. Insert skills (two passes to handle self-referencing reportingManagerId) ─
  // Pass 1: insert all skills without reportingManagerId
  const tempIdToDbId = new Map<string, string>();
  for (const ps of proposedSkills) {
    const teamId = teamRows.find(t => t.department === ps.department)?.id;
    const [inserted] = await db.insert(skills).values({
      projectId,
      teamId:           teamId ?? null,
      slug:             ps.slug,
      realName:         ps.realName,
      roleTitle:        ps.roleTitle,
      department:       ps.department,
      hierarchyLevel:   ps.hierarchyLevel,
      riskClass:        ps.riskClass,
      description:      ps.description,
      instructions:     ps.instructions,
      ownedDomains:     ps.ownedDomains,
      ownedRepoPaths:   ps.ownedRepoPaths,
      triggerKeywords:  ps.triggerKeywords,
      status:           'active',
      idleMode:         'learning',
      // reportingManagerId set in Pass 2
    }).returning();
    tempIdToDbId.set(ps.tempId, inserted.id);
  }

  // Pass 2: update reportingManagerId now that all DB ids exist
  for (const ps of proposedSkills) {
    if (!ps.reportingManagerTempId) continue;
    const skillDbId   = tempIdToDbId.get(ps.tempId)!;
    const managerDbId = tempIdToDbId.get(ps.reportingManagerTempId);
    if (!managerDbId) continue;
    await db.update(skills)
      .set({ reportingManagerId: managerDbId, updatedAt: new Date() })
      .where(eq(skills.id, skillDbId));
  }

  // ── 3. Insert teamMembers ────────────────────────────────────────────────
  for (const ps of proposedSkills) {
    const teamId  = teamRows.find(t => t.department === ps.department)?.id;
    const skillId = tempIdToDbId.get(ps.tempId);
    if (!teamId || !skillId) continue;

    let memberRole: 'lead' | 'member' | 'scrum_master' | 'observer' = 'member';
    if (ps.slug === 'scrum-master') memberRole = 'scrum_master';
    else if (ps.hierarchyLevel <= 3) memberRole = 'lead';

    await db.insert(teamMembers).values({ teamId, skillId, role: memberRole });
  }

  // ── 4. Mark proposal committed + workspace onboarding complete ──────────
  await db.update(onboardingProposals)
    .set({ status: 'committed', updatedAt: new Date() })
    .where(eq(onboardingProposals.id, proposal.id));

  await db.update(workspaces)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  return {
    projectId,
    skillCount: proposedSkills.length,
    teamCount:  teamRows.length,
  };
}
