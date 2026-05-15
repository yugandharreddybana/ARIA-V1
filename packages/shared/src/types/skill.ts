export type SkillStatus = 'active' | 'future' | 'inactive' | 'quarantined';
export type IdleMode = 'learning' | 'creative' | 'reflection' | 'off';
export type TeamMemberRole = 'lead' | 'member' | 'scrum_master' | 'observer';

export interface Skill {
  id: string;
  projectId: string;
  teamId?: string | null;
  slug: string;
  realName: string;
  roleTitle: string;
  riskClass: string;
  status: SkillStatus;
  idleMode: IdleMode;
  ownedDomains: string[];
  ownedRepoPaths: string[];
  triggerKeywords: string[];
  description: string;
  skillMdPath?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  projectId: string;
  name: string;
  leadSkillId?: string | null;
  scrumMasterSkillId?: string | null;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  skillId: string;
  role: TeamMemberRole;
  createdAt: string;
}

export interface CreateSkillRequest {
  slug: string;
  realName: string;
  roleTitle: string;
  description?: string;
  riskClass?: string;
  ownedDomains?: string[];
  triggerKeywords?: string[];
}

export interface CreateTeamRequest {
  name: string;
  projectId: string;
}
