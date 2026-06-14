/**
 * onboarding.types.ts
 * -------------------
 * Shared TypeScript types for the 6-step onboarding flow.
 * Used by: onboarding.service, skillFactory.service,
 *          repoAnalysis.service, onboarding.routes, and the frontend.
 */

// ── Step 1 ────────────────────────────────────────────────────────────────────
export interface OnboardingCompanyPayload {
  companyName:        string;
  companyDescription: string;
}

// ── Step 2 ────────────────────────────────────────────────────────────────────
// LLM config reuses the existing workspace LLM fields.
// Payload is identical to PATCH /api/workspace/llm-config (LlmConfigInput).

// ── Step 3 ────────────────────────────────────────────────────────────────────
export interface OnboardingRepoSelection {
  repos: SelectedRepo[];
}

export interface SelectedRepo {
  repoUrl:  string;   // full clone URL
  repoName: string;   // display name
  fullName: string;   // GitHub owner/repo e.g. "acme/api-service"
  branch:   string;   // defaults to 'main'
}

// ── Step 4 ────────────────────────────────────────────────────────────────────
export interface OnboardingScoutPayload {
  scoutName:        string; // e.g. "Aria Scout"
  scoutDescription: string; // what the scout should focus on
}

// ── Codebase analysis (internal — produced by repoAnalysis.service) ───────────
export interface RepoSignals {
  repoName:    string;
  hasFrontend: boolean; // React / Vue / Next.js / Angular / Svelte
  hasBackend:  boolean; // Express / Fastify / NestJS / Django / Rails
  hasAiMl:    boolean;  // torch / transformers / langchain / openai SDK
  hasInfra:   boolean;  // Dockerfile / docker-compose / terraform / pulumi
  hasCiCd:    boolean;  // .github/workflows / .gitlab-ci / Jenkinsfile
  hasCloud:   boolean;  // AWS CDK / serverless.yml / GCP / Azure config
  hasMobile:  boolean;  // React Native / Flutter / Expo
  primaryLang: string;  // e.g. "TypeScript", "Python"
  frameworks:  string[]; // e.g. ["Next.js", "Express", "Drizzle ORM"]
  description: string;  // README excerpt (first 500 chars) or repo description
}

export interface CodebaseProfile {
  repos:          RepoSignals[];
  // Aggregated flags across all repos
  hasFrontend:    boolean;
  hasBackend:     boolean;
  hasAiMl:        boolean;
  hasInfra:       boolean;
  hasCiCd:        boolean;
  hasCloud:       boolean;
  hasMobile:      boolean;
  allFrameworks:  string[];
  allLangs:       string[];
  // 2-3 sentence human-readable project summary injected into LLM prompts
  projectSummary: string;
}

// ── ProposedSkill (the unit stored in onboarding_proposals.proposed_skills) ───
export interface ProposedSkill {
  /** Stable client-side ID used in the tree before DB commit */
  tempId: string;

  slug:      string;
  realName:  string;   // persona name e.g. "Alex Chen"
  roleTitle: string;   // e.g. "Chief Executive Officer"

  department:     string; // e.g. "C-Suite", "Engineering", "Security & Cloud"
  hierarchyLevel: number; // 1 = CEO … 5 = IC

  /** tempId of the direct reporting manager. null = CEO (top of tree) */
  reportingManagerTempId: string | null;

  /** Full AI-written system prompt tailored to this project's codebase */
  instructions: string;
  /** 1–2 sentence summary shown inside the org tree node */
  description:  string;

  ownedDomains:    string[];
  ownedRepoPaths:  string[];
  triggerKeywords: string[];
  riskClass:       'A' | 'B' | 'C' | 'D';

  // UI flags
  isAlwaysPresent: boolean; // CEO/CTO/CPO — user cannot delete
  isAiGenerated:   boolean; // false if the user manually added this agent
}

// ── Patch payload for Step 5 edits ────────────────────────────────────────────
export type ProposalPatchPayload = {
  skill: Partial<Omit<ProposedSkill, 'tempId'>>;
};

// ── Commit response ───────────────────────────────────────────────────────────
export interface CommitProposalResponse {
  projectId:  string;
  skillCount: number;
  teamCount:  number;
}
