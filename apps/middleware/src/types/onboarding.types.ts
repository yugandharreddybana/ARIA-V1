/**
 * onboarding.types.ts
 * -------------------
 * Shared TypeScript types for the 6-step onboarding flow.
 * Used by: onboarding.service, repoAnalysis.service, skillFactory.service,
 *          onboarding.routes, and the frontend wizard.
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

// ── Step 4 ────────────────────────────────────────────────────────────────
export interface OnboardingScoutPayload {
  scoutName:        string;
  scoutDescription: string;
}

// ── Codebase profile (internal, produced by repoAnalysis.service) ─────────
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

// ── Step 6 commit response ────────────────────────────────────────────────
export interface CommitProposalResponse {
  projectId:  string;
  skillCount: number;
  teamCount:  number;
}
