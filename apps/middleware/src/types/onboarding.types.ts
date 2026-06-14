/**
 * onboarding.types.ts
 * -------------------
 * Shared TypeScript types for the 6-step onboarding wizard.
 * Used by: onboarding.service, repoAnalysis.service,
 *          skillFactory.service, onboarding.routes, and the frontend.
 */

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1 — Company identity
// ═══════════════════════════════════════════════════════════════════════════
export interface OnboardingCompanyPayload {
  companyName:        string; // → workspaces.name
  companyDescription: string; // → workspaces.company_description
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2 — LLM / Agent selection
// Re-uses LlmConfigInput from workspace.schema.ts — no new type needed.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3 — GitHub repo multi-select
// ═══════════════════════════════════════════════════════════════════════════
export interface SelectedRepo {
  repoUrl:  string; // https://github.com/owner/repo
  repoName: string; // short name, e.g. "ARIA-V1"
  fullName: string; // owner/repo, e.g. "yugandharreddybana/ARIA-V1"
  branch:   string; // default branch, e.g. "main"
}

export interface OnboardingRepoSelectionPayload {
  repos: SelectedRepo[];
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4 — Scout agent persona
// ═══════════════════════════════════════════════════════════════════════════
export interface OnboardingScoutPayload {
  scoutName:        string; // → workspaces.scout_agent_name
  scoutDescription: string; // → workspaces.scout_agent_description
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL — Codebase profile produced by repoAnalysis.service
// ═══════════════════════════════════════════════════════════════════════════
export interface RepoSignals {
  repoName:    string;
  fullName:    string;
  hasFrontend: boolean; // React / Vue / Next.js / Angular / Svelte
  hasBackend:  boolean; // Express / Fastify / NestJS / Django / Rails / Hono
  hasAiMl:     boolean; // torch / transformers / langchain / openai-sdk / huggingface
  hasInfra:    boolean; // Dockerfile / docker-compose.yml
  hasCiCd:     boolean; // .github/workflows / .gitlab-ci.yml / Jenkinsfile
  hasCloud:    boolean; // terraform / pulumi / AWS CDK / serverless.yml / gcp / azure
  hasMobile:   boolean; // React Native / Flutter / Expo
  primaryLang: string;  // e.g. "TypeScript", "Python"
  frameworks:  string[]; // e.g. ["Next.js", "Express", "Drizzle ORM"]
  description: string;  // README first 600 chars or GitHub repo description
}

export interface CodebaseProfile {
  repos:          RepoSignals[];
  // Aggregated boolean flags across all repos
  hasFrontend:    boolean;
  hasBackend:     boolean;
  hasAiMl:        boolean;
  hasInfra:       boolean;
  hasCiCd:        boolean;
  hasCloud:       boolean;
  hasMobile:      boolean;
  allFrameworks:  string[];
  allLangs:       string[];
  // 3-5 sentence summary fed to the LLM when writing skill instructions
  projectSummary: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5 — Proposed skill (one node in the org tree)
// ═══════════════════════════════════════════════════════════════════════════
export interface ProposedSkill {
  // Stable client-side ID used in the tree before DB commit.
  // Format: "tmp_<slug>" e.g. "tmp_ceo"
  tempId: string;

  // ── Identity ──────────────────────────────────────────────────────────────
  slug:      string; // machine-friendly, e.g. "frontend-dev"
  realName:  string; // persona name, e.g. "Alex Chen"
  roleTitle: string; // e.g. "Senior Frontend Engineer"

  // ── Hierarchy ─────────────────────────────────────────────────────────────
  department:             string;      // "C-Suite" | "Engineering" | "Security & Cloud" | ...
  hierarchyLevel:         number;      // 1–5
  reportingManagerTempId: string | null; // null = CEO (no manager)

  // ── AI-written content (tailored to this project) ─────────────────────────
  description:  string; // 1-2 sentence blurb shown in tree node
  instructions: string; // Full system prompt for this agent

  // ── Domains & routing ─────────────────────────────────────────────────────
  ownedDomains:    string[];
  ownedRepoPaths:  string[];
  triggerKeywords: string[];
  riskClass:       'A' | 'B' | 'C' | 'D';

  // ── UI-only flags ─────────────────────────────────────────────────────────
  isAlwaysPresent: boolean; // CEO/CTO/CPO etc — user cannot delete these
  isAiGenerated:   boolean; // false if user manually added a node
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5 — API payloads for editing the proposal
// ═══════════════════════════════════════════════════════════════════════════

// PATCH /api/onboarding/proposal/:tempId  — update one skill in the proposal
export interface ProposalSkillPatchPayload {
  skill: Partial<Omit<ProposedSkill, 'tempId' | 'isAlwaysPresent' | 'isAiGenerated'>>;
}

// POST /api/onboarding/proposal/skill  — add a custom skill
export type ProposalSkillAddPayload = Omit<ProposedSkill, 'tempId' | 'isAiGenerated'>;

// ═══════════════════════════════════════════════════════════════════════════
// STEP 6 — Commit response
// ═══════════════════════════════════════════════════════════════════════════
export interface CommitProposalResponse {
  projectId:  string;
  skillCount: number;
  teamCount:  number;
}
