import { IdeaStatus, RiskClass } from '../constants/enums';

export interface IdeaCard {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  proposedBySkillId: string | null;
  proposedByHumanId: string | null;
  affectedDomains: string[];
  potentialUserImpact: string;
  potentialBusinessImpact: string;
  roughEffortEstimate: string;
  riskAssessment: string;
  suggestedRiskClass: RiskClass;
  supportingEvidence: string[];
  status: IdeaStatus;
  humanApproved: boolean;
  humanApprovedById: string | null;
  humanApprovedAt: Date | null;
  linkedTicketIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureSpec {
  id: string;
  projectId: string;
  ideaCardId: string;
  title: string;
  problem: string;
  proposedSolution: string;
  userImpact: string;
  businessImpact: string;
  technicalApproach: string;
  risks: string;
  linkedTicketIds: string[];
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'in_development';
  humanApproved: boolean;
  humanApprovedById: string | null;
  humanApprovedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
