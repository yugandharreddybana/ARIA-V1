/**
 * Onboarding — shared types for the 6-step wizard.
 * Used by apps/web (wizard UI) and apps/middleware (routes + services).
 */

// ── Step 1 ────────────────────────────────────────────────────────────────
export interface OnboardingCompanyPayload {
  companyName:        string;
  companyDescription: string;
}

// ── Step 3 ────────────────────────────────────────────────────────────────
export interface OnboardingReposPayload {
  repos: SelectedRepo[];
}

export interface SelectedRepo {
  repoUrl:  string;
  repoName: string;
  fullName: string;  // e.g. "yugandharreddybana/ARIA-V1"
  branch:   string;  // default 'main'
}

/** Item returned by GET /api/onboarding/github/repos (mapped from the GitHub API). */
export interface GitHubRepoListItem {
  id:            number;
  fullName:      string;
  name:          string;
  description:   string | null;
  private:       boolean;
  defaultBranch: string;
  language:      string | null;
  updatedAt:     string;
}

// ── Step 4 ────────────────────────────────────────────────────────────────
export interface OnboardingScoutPayload {
  scoutName:        string;
  scoutDescription: string;
}

// ── Codebase profile (produced by repoAnalysis.service) ───────────────────
export interface RepoSignals {
  repoName:    string;
  hasFrontend: boolean;  // React/Vue/Next/Angular/Svelte
  hasBackend:  boolean;  // Express/Fastify/NestJS/Django/Rails/Hono
  hasAiMl:     boolean;  // torch/transformers/langchain/openai-sdk
  hasInfra:    boolean;  // Dockerfile / docker-compose
  hasCiCd:     boolean;  // .github/workflows / .gitlab-ci / Jenkinsfile
  hasCloud:    boolean;  // terraform / pulumi / serverless.yml / AWS CDK
  hasMobile:   boolean;  // React Native / Flutter / Expo
  primaryLang: string;   // "TypeScript" | "Python" | "Go" | …
  frameworks:  string[];
  description: string;   // README first 500 chars
}

export interface CodebaseProfile {
  repos:          RepoSignals[];
  // Aggregated booleans across all repos
  hasFrontend:    boolean;
  hasBackend:     boolean;
  hasAiMl:        boolean;
  hasInfra:       boolean;
  hasCiCd:        boolean;
  hasCloud:       boolean;
  hasMobile:      boolean;
  allFrameworks:  string[];
  allLangs:       string[];
  projectSummary: string;  // 2-3 sentence summary injected into LLM prompts
}

// ── Proposed skill (Step 5 org tree node) ────────────────────────────────
export interface ProposedSkill {
  /** Stable client-side ID used in the tree before DB commit. */
  tempId:                 string;

  slug:                   string;
  realName:               string;   // persona name  e.g. "Alex Chen"
  roleTitle:              string;   // e.g. "Chief Executive Officer"
  department:             string;   // e.g. "C-Suite" | "Engineering" | "Security & Cloud"
  hierarchyLevel:         number;   // 1=CEO … 5=IC

  /** tempId of this agent's direct manager.  null → root node (CEO). */
  reportingManagerTempId: string | null;

  /** Full AI-written system prompt tailored to this project's codebase. */
  instructions:           string;
  /** 1-2 sentence summary shown inside the tree node card. */
  description:            string;

  ownedDomains:           string[];
  ownedRepoPaths:         string[];
  triggerKeywords:        string[];
  riskClass:              'A' | 'B' | 'C' | 'D';

  /** C-suite + Tech Lead + PM + Scrum Master — cannot be deleted in review. */
  isAlwaysPresent:        boolean;
  /** false when the user manually adds an agent in Step 5. */
  isAiGenerated:          boolean;
}

// ── API payloads for Step 5 edits ────────────────────────────────────────
export interface ProposalSkillPatch {
  skill: Partial<Omit<ProposedSkill, 'tempId' | 'isAlwaysPresent' | 'isAiGenerated'>>;
}

export type ProposalStatus = 'pending' | 'ready' | 'committed' | 'failed';

/** Row returned by GET /api/onboarding/proposal (Step 5 polling). */
export interface OnboardingProposal {
  id:             string;
  workspaceId:    string;
  projectId:      string | null;
  status:         ProposalStatus;
  proposedSkills: ProposedSkill[];
  errorMessage:   string | null;
  createdAt:      string;
  updatedAt:      string;
}

// ── Wizard routing gate ───────────────────────────────────────────────────
/** Returned by GET /api/onboarding/status. */
export interface OnboardingStatus {
  completed:              boolean;
  onboardingCompletedAt:  string | null;
  companyDescription:     string | null;
  githubConnected:        boolean;
  proposalStatus:         ProposalStatus | null;
}

// ── Step 6 commit response ────────────────────────────────────────────────
export interface CommitProposalResponse {
  projectId:  string;
  skillCount: number;
  teamCount:  number;
}
