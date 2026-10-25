/**
 * Adapter kept for the existing onboarding commit path.
 * The only team generator is companyGenerator.ts. This file does not call a model.
 */

import type { CodebaseProfile, ProposedSkill } from '../types/onboarding.types';
import { generateCompany, type CompanyMix } from './companyGenerator';

function mixFromProfile(profile: CodebaseProfile): CompanyMix {
  return {
    business: 1,
    qa: 1,
    frontend: profile.hasFrontend ? 1 : 0,
    backend: profile.hasBackend ? 1 : 0,
    fullstack: 1,
    junior: 0,
    aiml: profile.hasAiMl ? 1 : 0,
    devops: profile.hasInfra || profile.hasCiCd ? 1 : 0,
    security: profile.hasCloud || profile.hasInfra ? 1 : 0,
  };
}

export async function generateTeamProposal(
  profile: CodebaseProfile,
  _companyName: string,
  workspaceId: string,
): Promise<ProposedSkill[]> {
  const { agents } = generateCompany({
    size: 8,
    mix: mixFromProfile(profile),
    seed: workspaceId,
    flows: [],
  });
  return agents.map((agent) => ({
    tempId: agent.tempId,
    slug: agent.slug,
    realName: agent.realName,
    roleTitle: agent.roleTitle,
    department: agent.department,
    hierarchyLevel: agent.hierarchyLevel,
    reportingManagerTempId: agent.managerTempId,
    instructions: agent.instructions,
    description: agent.description,
    ownedDomains: agent.skills,
    ownedRepoPaths: [],
    triggerKeywords: agent.skills,
    riskClass: agent.roleKey === 'red_team' || agent.roleKey === 'cybersecurity' ? 'A' : 'B',
    isAlwaysPresent: agent.hierarchyLevel <= 2,
    isAiGenerated: false,
  }));
}
