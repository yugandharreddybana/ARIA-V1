/**
 * Shared TypeScript types for the 6-step onboarding flow.
 * Used by onboarding.service, skillFactory.service, repoAnalysis.service, routes.
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
  branch:   string;   // defaults to 'main'
  fullName: string;   // e.g. "yugandharreddybana/ARIA-V1"
}

// ── Step 4 ────────────────────────────────────────────────────────────────────
export interface OnboardingScoutPayload {
  scoutName:        string;  // persona name, e.g. "Aria Scout"
  scoutDescription: string;  // what should the scout focus on
}

// ── Codebase analysis (internal — produced by repoAnalysis.service) ───────────
export interface RepoSignals {
  repoName:    string;
  hasFrontend: boolean;  // React/Vue/Next/Angular/Svelte
  hasBackend:  boolean;  // Express/Fastify/NestJS/Django/Rails/FastAPI
  hasAiMl:     boolean;  // torch/transformers/langchain/openai-sdk
  hasInfra:    boolean;  // Dockerfile/docker-compose/terraform/pulumi
  hasCiCd:     boolean;  // .github/workflows / .gitlab-ci / Jenkinsfile
  hasCloud:    boolean;  // AWS CDK / serverless.yml / gcp/azure config
  hasMobile:   boolean;  // React Native / Flutter / Expo
  primaryLang: string;   // e.g. "TypeScript"
  frameworks:  string[]; // e.g. ["Next.js","Express","Drizzle"]
  description: string;   // README excerpt or repo description
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
  projectSummary: string;  // 2-3 sentence summary injected into LLM prompts
}

// ── Proposed skill — lives in onboarding_proposals.proposed_skills JSON ───────
export interface ProposedSkill {
  tempId:                 string;          // stable client-side ID (UUID v4)
  slug:                   string;
  realName:               string;          // persona name e.g. "Alex Chen"
  roleTitle:              string;          // e.g. "Chief Executive Officer"
  department:             string;          // e.g. "C-Suite", "Engineering"
  hierarchyLevel:         number;          // 1–5
  reportingManagerTempId: string | null;   // null = CEO
  instructions:           string;          // full AI-written instructions
  description:            string;          // 1–2 sentence summary for tree node
  ownedDomains:           string[];
  ownedRepoPaths:         string[];
  triggerKeywords:        string[];
  riskClass:              'A' | 'B' | 'C' | 'D';
  isAlwaysPresent:        boolean;         // C-suite — cannot be deleted in UI
  isAiGenerated:          boolean;         // false if user manually added
}

// ── API response types ────────────────────────────────────────────────────────
export interface ProposalPatchPayload {
  skill: Partial<Omit<ProposedSkill, 'tempId'>>;
}

export interface CommitProposalResponse {
  projectId:  string;
  skillCount: number;
  teamCount:  number;
}

export interface OnboardingStatusResponse {
  step:                 number;   // last completed step 0–6
  companyName:          string | null;
  scoutAgentName:       string | null;
  proposalStatus:       string | null;  // 'pending'|'ready'|'committed'|'failed'|null
  proposalId:           string | null;
  onboardingCompleted:  boolean;
}
