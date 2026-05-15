export type IdeaStatus = 'draft' | 'ready_for_review' | 'approved' | 'rejected' | 'in_development';
export type FeatureSpecStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'in_development';

export interface IdeaCard {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  proposedBySkillId?: string | null;
  proposedByHumanId?: string | null;
  affectedDomains: string[];
  potentialUserImpact: string;
  potentialBusinessImpact: string;
  roughEffortEstimate?: string | null;
  riskAssessment?: string | null;
  suggestedRiskClass: string;
  supportingEvidence: string[];
  status: IdeaStatus;
  humanApproved: boolean;
  humanApprovedById?: string | null;
  humanApprovedAt?: string | null;
  linkedTicketIds: string[];
  createdAt: string;
  updatedAt: string;
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
  status: FeatureSpecStatus;
  humanApproved: boolean;
  humanApprovedById?: string | null;
  humanApprovedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIdeaRequest {
  projectId: string;
  title: string;
  summary: string;
  potentialUserImpact: string;
  potentialBusinessImpact: string;
  affectedDomains?: string[];
  roughEffortEstimate?: string;
  suggestedRiskClass?: string;
}
