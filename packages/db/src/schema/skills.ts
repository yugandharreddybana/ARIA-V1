import { pgTable, uuid, varchar, text, boolean, timestamp, pgEnum, index, jsonb } from 'drizzle-orm/pg-core';
import { projects } from './projects';

export const riskClassEnum = pgEnum('risk_class', ['A','B','C','D']);
export const skillStatusEnum = pgEnum('skill_status', ['active','future','inactive','quarantined']);
export const idleModeEnum = pgEnum('idle_mode', ['learning','creative','reflection','off']);
export const teamMemberRoleEnum = pgEnum('team_member_role', ['lead','member','scrum_master','observer']);

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  leadSkillId: uuid('lead_skill_id'),
  scrumMasterSkillId: uuid('scrum_master_skill_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({ projectIdx: index('teams_project_idx').on(t.projectId) }));

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id').references(() => teams.id),
  slug: varchar('slug', { length: 100 }).notNull(),
  realName: varchar('real_name', { length: 255 }).notNull(),
  roleTitle: varchar('role_title', { length: 255 }).notNull(),
  riskClass: riskClassEnum('risk_class').notNull().default('B'),
  status: skillStatusEnum('status').notNull().default('active'),
  idleMode: idleModeEnum('idle_mode').notNull().default('learning'),
  ownedDomains: jsonb('owned_domains').notNull().default([]),
  ownedRepoPaths: jsonb('owned_repo_paths').notNull().default([]),
  triggerKeywords: jsonb('trigger_keywords').notNull().default([]),
  description: text('description').notNull().default(''),
  skillMdPath: varchar('skill_md_path', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({ projectIdx: index('skills_project_idx').on(t.projectId) }));

export const teamMembers = pgTable('team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  skillId: uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  role: teamMemberRoleEnum('role').notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({ teamIdx: index('team_members_team_idx').on(t.teamId) }));
