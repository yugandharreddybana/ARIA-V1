import { RiskClass, SkillStatus, IdleMode } from '../constants/enums';

export interface Skill {
  id: string;
  projectId: string;
  slug: string;
  realName: string;
  roleTitle: string;
  teamId: string;
  riskClass: RiskClass;
  status: SkillStatus;
  idleMode: IdleMode;
  ownedDomains: string[];
  ownedRepoPaths: string[];
  triggerKeywords: string[];
  description: string;
  skillMdPath: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Team {
  id: string;
  projectId: string;
  name: string;         // e.g. "Product Team", "Platform Team"
  leadSkillId: string | null;
  scrumMasterSkillId: string | null;
  createdAt: Date;
}

export interface TeamMember {
  id: string;
  teamId: string;
  skillId: string;
  role: 'lead' | 'member' | 'scrum_master' | 'observer';
  createdAt: Date;
}
