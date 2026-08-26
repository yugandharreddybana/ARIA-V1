/**
 * onboarding.types.ts
 * -------------------
 * Onboarding types moved to @aria/shared so the web wizard and the
 * middleware share one definition. Re-exported here so existing
 * middleware imports keep working.
 */

export type {
  OnboardingCompanyPayload,
  OnboardingReposPayload,
  SelectedRepo,
  GitHubRepoListItem,
  OnboardingScoutPayload,
  RepoSignals,
  CodebaseProfile,
  ProposedSkill,
  ProposalSkillPatch,
  ProposalStatus,
  OnboardingProposal,
  OnboardingStatus,
  CommitProposalResponse,
} from '@aria/shared';
