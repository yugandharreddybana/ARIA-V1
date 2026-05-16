import { db } from '@aria/db';
import { skills, teams, projects } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { CreateSkillRequest, CreateTeamRequest } from '@aria/shared';

export async function listSkills(projectId: string, workspaceId: string) {
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)) });
  if (!p) throw new AppError('Project not found', 404);
  return db.query.skills.findMany({
    where: eq(skills.projectId, projectId),
    orderBy: (s, { asc }) => [asc(s.roleTitle)],
  });
}

export async function createSkill(projectId: string, workspaceId: string, data: CreateSkillRequest) {
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)) });
  if (!p) throw new AppError('Project not found', 404);
  const [s] = await db.insert(skills).values({
    projectId,
    slug: data.slug,
    realName: data.realName,
    roleTitle: data.roleTitle,
    description: data.description ?? '',
    riskClass: (data.riskClass as 'A' | 'B' | 'C' | 'D') ?? 'B',
    ownedDomains: data.ownedDomains ?? [],
    triggerKeywords: data.triggerKeywords ?? [],
  }).returning();
  return s;
}

export async function listTeams(projectId: string, workspaceId: string) {
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)) });
  if (!p) throw new AppError('Project not found', 404);
  return db.query.teams.findMany({
    where: eq(teams.projectId, projectId),
    with: { members: { with: { skill: true } } },
  });
}

export async function createTeam(workspaceId: string, data: CreateTeamRequest) {
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, data.projectId), eq(projects.workspaceId, workspaceId)) });
  if (!p) throw new AppError('Project not found', 404);
  const [t] = await db.insert(teams).values({ projectId: data.projectId, name: data.name }).returning();
  return t;
}
