export type SkillStatus = 'idle' | 'active' | 'thinking' | 'blocked' | 'offline';
export type IdleMode = 'sleep' | 'monitor' | 'research';

export interface Skill {
  id: string;
  teamId: string;
  name: string;
  role: string;
  status: SkillStatus;
  systemPrompt?: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  skillId: string;
  joinedAt: string;
}
