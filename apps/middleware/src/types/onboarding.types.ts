/**
 * Shared TypeScript types for the 6-step onboarding flow.
 * Used by onboarding.service, skillFactory.service,
 * repoAnalysis.service, onboarding.routes, and the frontend.
 */

// ── Step 1 ────────────────────────────────────────────────────────────────────
export interface OnboardingCompanyPayload {
  companyName:        string;
  companyDescription: string;
}

// ── Step 3 ────────────────────────────────────────────────────────────────────
export interface OnboardingRepoSelection {
  repos: SelectedRepo[];
}
export interface SelectedRepo {
  repoUrl:  string;
  repoName: string;
  branch:   string;
  fullName: string; // e.g. "yugandharreddybana/ARIA-V1"
}

// ── Step 4 ────────────────────────────────────────────────────────────────────
export interface OnboardingScoutPayload {
  scoutName:        string;
  scoutDescription: string;
}

// ── Codebase profile (produced by repoAnalysis.service) ──────────────────────
export interface RepoSignals {
  repoName:    string;
  hasFrontend: boolean; // React/Vue/Next/Angular/Svelte
  hasBackend:  boolean; // Express/Fastify/NestJS/Django/Rails
  hasAiMl:     boolean; // torch/transformers/langchain/openai
  hasInfra:    boolean; // Dockerfile/docker-compose/terraform
  hasCiCd:     boolean; // .github/workflows/.gitlab-ci/Jenkinsfile
  hasCloud:    boolean; // AWS CDK/serverless.yml/gcp/azure
  hasMobile:   boolean; // React Native/Flutter/Expo
  primaryLang: string;
  frameworks:  string[];
  description: string;
}
export interface CodebaseProfile {
  repos:          RepoSignals[];
  hasFrontend:    boolean;
  hasBackend:     boolean;
  hasAiMl:        boolean;
  hasInfra:       boolean;
  hasCiCd:        boolean;
  hasCloud:       boolean;
  hasMobile:      boolean;
  allFrameworks:  string[];
  allLangs:       string[];
  projectSummary: string;
}

// ── Proposed skill (Step 5 tree node) ────────────────────────────────────────
export interface ProposedSkill {
  tempId:                 string;        // client-side stable ID before DB commit
  slug:                   string;
  realName:               string;        // persona name e.g. "Alex Chen"
  roleTitle:              string;        // e.g. "Chief Executive Officer"
  department:             string;        // e.g. "C-Suite", "Engineering"
  hierarchyLevel:         number;        // 1–5
  reportingManagerTempId: string | null; // null = CEO (top of tree)
  instructions:           string;        // full AI-written instructions
  description:            string;        // 1-2 sentence summary for tree node
  ownedDomains:           string[];
  ownedRepoPaths:         string[];
  triggerKeywords:        string[];
  riskClass:              'A' | 'B' | 'C' | 'D';
  isAlwaysPresent:        boolean;       // CEO/CTO/CPO — cannot be deleted
  isAiGenerated:          boolean;
}

// ── API payloads ──────────────────────────────────────────────────────────────
export interface ProposalPatchPayload {
  skill: Partial<Omit<ProposedSkill, 'tempId'>>;
}
export interface CommitProposalResponse {
  projectId:  string;
  skillCount: number;
  teamCount:  number;
}
