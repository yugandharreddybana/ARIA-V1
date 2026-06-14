import {
  pgTable, uuid, varchar, text, integer,
  timestamp, pgEnum, index, jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { projects } from './projects';

export const riskClassEnum      = pgEnum('risk_class',       ['A', 'B', 'C', 'D']);
export const skillStatusEnum    = pgEnum('skill_status',     ['active', 'future', 'inactive', 'quarantined']);
export const idleModeEnum       = pgEnum('idle_mode',        ['learning', 'creative', 'reflection', 'off']);
export const teamMemberRoleEnum = pgEnum('team_member_role', ['lead', 'member', 'scrum_master', 'observer']);

// ── Teams ──────────────────────────────────────────────────────────────────
export const teams = pgTable('teams', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  projectId:          uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:               varchar('name', { length: 255 }).notNull(),
  department:         varchar('department', { length: 100 }),
  leadSkillId:        uuid('lead_skill_id'),
  scrumMasterSkillId: uuid('scrum_master_skill_id'),
  createdAt:          timestamp('created_at').notNull().defaultNow(),
}, (t) => ({ projectIdx: index('teams_project_idx').on(t.projectId) }));

// ── Skills (agents) ────────────────────────────────────────────────────────
export const skills = pgTable('skills', {
  id:        uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  teamId:    uuid('team_id').references(() => teams.id),

  // ── Org hierarchy ──────────────────────────────────────────────────────
  // null reportingManagerId  → this agent is the root (CEO)
  // hierarchyLevel: 1=CEO  2=C-suite  3=Directors/Leads  4=Scrum Master  5=ICs
  reportingManagerId: uuid('reporting_manager_id'),  // self-ref; FK enforced in migration
  hierarchyLevel:     integer('hierarchy_level').notNull().default(5),
  department:         varchar('department', { length: 100 }),

  // ── Identity ───────────────────────────────────────────────────────────
  slug:      varchar('slug',       { length: 100 }).notNull(),
  realName:  varchar('real_name',  { length: 255 }).notNull(),
  roleTitle: varchar('role_title', { length: 255 }).notNull(),

  // ── Risk & lifecycle ───────────────────────────────────────────────────
  riskClass: riskClassEnum('risk_class').notNull().default('B'),
  status:    skillStatusEnum('status').notNull().default('active'),
  idleMode:  idleModeEnum('idle_mode').notNull().default('learning'),

  // ── Domains & routing ──────────────────────────────────────────────────
  ownedDomains:    jsonb('owned_domains').notNull().default([]),
  ownedRepoPaths:  jsonb('owned_repo_paths').notNull().default([]),
  triggerKeywords: jsonb('trigger_keywords').notNull().default([]),

  // ── AI-generated instructions (written by skillFactory during onboarding) ─
  description:  text('description').notNull().default(''),
  instructions: text('instructions').notNull().default(''),
  skillMdPath:  varchar('skill_md_path', { length: 500 }),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({ projectIdx: index('skills_project_idx').on(t.projectId) }));

// ── Team members (skills ↔ teams junction) ────────────────────────────────
export const teamMembers = pgTable('team_members', {
  id:        uuid('id').primaryKey().defaultRandom(),
  teamId:    uuid('team_id').notNull().references(() => teams.id,   { onDelete: 'cascade' }),
  skillId:   uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  role:      teamMemberRoleEnum('role').notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({ teamIdx: index('team_members_team_idx').on(t.teamId) }));

// ── Drizzle relations ─────────────────────────────────────────────────────
export const skillsRelations = relations(skills, ({ one, many }) => ({
  project:          one(projects, { fields: [skills.projectId],          references: [projects.id] }),
  team:             one(teams,    { fields: [skills.teamId],             references: [teams.id] }),
  reportingManager: one(skills,   { fields: [skills.reportingManagerId], references: [skills.id], relationName: 'reports_to' }),
  directReports:    many(skills,  { relationName: 'reports_to' }),
  teamMemberships:  many(teamMembers),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  project: one(projects,    { fields: [teams.projectId], references: [projects.id] }),
  members: many(teamMembers),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team:  one(teams,  { fields: [teamMembers.teamId],  references: [teams.id] }),
  skill: one(skills, { fields: [teamMembers.skillId], references: [skills.id] }),
}));
