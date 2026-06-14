/**
 * onboarding.types.ts
 * -------------------
 * Shared TypeScript types for the 6-step onboarding flow.
 * Used by: onboarding.service, skillFactory.service,
 *          repoAnalysis.service, onboarding.routes
 */

// ── Step 1 ────────────────────────────────────────────────────────────────────
export interface OnboardingCompanyPayload {
  companyName:        string;
  companyDescription: string;
}

// ── Step 2 ────────────────────────────────────────────────────────────────────
// LLM config reuses existing LlmConfigInput from workspace.schema.ts
// Nothing new needed here.

// ── Step 3 ────────────────────────────────────────────────────────────────────
export interface OnboardingRepoSelection {
  repos: SelectedRepo[];
}

export interface SelectedRepo {
  repoUrl:  string;   // full clone URL
  repoName: string;   // short name e.g. "ARIA-V1"
  fullName: string;   // owner/repo e.g. "yugandharreddybana/ARIA-V1"
  branch:   string;   // default "main"
}

// ── Step 4 ────────────────────────────────────────────────────────────────────
export interface OnboardingScoutPayload {
  scoutName:        string;  // persona name e.g. "Aria Scout"
  scoutDescription: string;  // what the scout should focus on
}

// ── Codebase analysis (internal — produced by repoAnalysis.service) ───────────
export interface RepoSignals {
  repoName:    string;
  hasFrontend: boolean;  // React / Vue / Next / Angular / Svelte
  hasBackend:  boolean;  // Express / Fastify / NestJS / Django / Rails
  hasAiMl:     boolean;  // torch / transformers / langchain / openai-sdk
  hasInfra:    boolean;  // Dockerfile / docker-compose / terraform / pulumi
  hasCiCd:     boolean;  // .github/workflows / .gitlab-ci / Jenkinsfile
  hasCloud:    boolean;  // AWS CDK / serverless.yml / GCP / Azure config
  hasMobile:   boolean;  // React Native / Flutter / Expo
  primaryLang: string;   // e.g. "TypeScript"
  frameworks:  string[]; // e.g. ["Next.js", "Express", "Drizzle ORM"]
  description: string;   // README first 500 chars or repo description
}

export interface CodebaseProfile {
  repos:          RepoSignals[];
  // Aggregated across all repos
  hasFrontend:    boolean;
  hasBackend:     boolean;
  hasAiMl:        boolean;
  hasInfra:       boolean;
  hasCiCd:        boolean;
  hasCloud:       boolean;
  hasMobile:      boolean;
  allFrameworks:  string[];
  allLangs:       string[];
  // 2-3 sentence summary injected into every LLM skill-generation prompt
  projectSummary: string;
}

// ── Proposed skill — the unit returned by skillFactory & shown in Step 5 ──────
export interface ProposedSkill {
  // Stable client-side key used in the tree before DB commit.
  // Format: slugified roleTitle e.g. "chief-executive-officer"
  tempId: string;

  slug:               string;
  realName:           string;   // persona name e.g. "Alex Chen"
  roleTitle:          string;   // e.g. "Chief Executive Officer"
  department:         string;   // e.g. "C-Suite" | "Engineering" | "Security & Cloud"
  hierarchyLevel:     number;   // 1–5

  // tempId of the direct manager (null = CEO, no manager)
  reportingManagerTempId: string | null;

  // Full LLM-written system prompt tailored to this codebase
  instructions:    string;
  // 1-2 sentence summary shown inside the org-tree node
  description:     string;

  ownedDomains:    string[];
  ownedRepoPaths:  string[];
  triggerKeywords: string[];
  riskClass:       'A' | 'B' | 'C' | 'D';

  // UI flags
  isAlwaysPresent: boolean;  // CEO/CTO/CPO etc — cannot be deleted by user
  isAiGenerated:   boolean;  // false if user manually added in Step 5
}

// ── Step 5 — patch a single skill in the proposal ────────────────────────────
export interface ProposalSkillPatch {
  skill: Partial<Omit<ProposedSkill, 'tempId' | 'isAlwaysPresent' | 'isAiGenerated'>>;
}

// ── Step 6 — result after committing the proposal ────────────────────────────
export interface CommitProposalResponse {
  projectId:  string;
  skillCount: number;
  teamCount:  number;
}

// ── GitHub repo list item (returned to frontend for Step 3 picker) ────────────
export interface GitHubRepoListItem {
  id:          number;
  fullName:    string;   // "owner/repo"
  name:        string;
  description: string | null;
  private:     boolean;
  defaultBranch: string;
  language:    string | null;
  updatedAt:   string;
}
