-- ============================================================
-- V11 — 6-step onboarding wizard
-- Reconciles the SQL schema with packages/db/src/schema/* for the
-- tables the onboarding flow touches. The June-14 onboarding work
-- shipped the Drizzle schema + services but never this migration.
-- ============================================================

-- ── Enums ─────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE llm_provider AS ENUM ('ollama', 'anthropic', 'openai', 'nvidia', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE proposal_status AS ENUM ('pending', 'ready', 'committed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE risk_class AS ENUM ('A', 'B', 'C', 'D');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE skill_status AS ENUM ('active', 'future', 'inactive', 'quarantined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE idle_mode AS ENUM ('learning', 'creative', 'reflection', 'off');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE team_member_role AS ENUM ('lead', 'member', 'scrum_master', 'observer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Workspaces: onboarding + integrations + LLM config ────────
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS company_description           TEXT,
  ADD COLUMN IF NOT EXISTS scout_agent_name              VARCHAR(100) DEFAULT 'Aria Scout',
  ADD COLUMN IF NOT EXISTS scout_agent_description       TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS github_installation_id        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS github_access_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS jira_base_url                 VARCHAR(500),
  ADD COLUMN IF NOT EXISTS jira_api_token_encrypted      TEXT,
  ADD COLUMN IF NOT EXISTS jira_user_email               VARCHAR(255),
  ADD COLUMN IF NOT EXISTS llm_provider                  llm_provider DEFAULT 'ollama',
  ADD COLUMN IF NOT EXISTS llm_base_url                  VARCHAR(500),
  ADD COLUMN IF NOT EXISTS llm_api_key_encrypted         TEXT,
  ADD COLUMN IF NOT EXISTS llm_model                     VARCHAR(200);

-- Workspaces created before the wizard existed must not be forced
-- through it — mark them as already onboarded.
UPDATE workspaces SET onboarding_completed_at = NOW()
WHERE onboarding_completed_at IS NULL;

-- ── Teams: department + lead pointers ─────────────────────────
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS department            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS lead_skill_id         UUID,
  ADD COLUMN IF NOT EXISTS scrum_master_skill_id UUID;

-- ── Skills: rebuild to the agent/org-chart shape ──────────────
-- V1 skills (team_id, name, role, system_prompt, model) is
-- incompatible with the agent model (slug, real_name, hierarchy…).
-- No production data exists on the old shape; drop and recreate.
ALTER TABLE tickets        DROP CONSTRAINT IF EXISTS tickets_assigned_to_fkey;
ALTER TABLE memory_entries DROP CONSTRAINT IF EXISTS memory_entries_skill_id_fkey;
UPDATE tickets        SET assigned_to = NULL;
UPDATE memory_entries SET skill_id    = NULL;

DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS skills;

CREATE TABLE skills (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id              UUID REFERENCES teams(id),

  -- Org hierarchy: 1=CEO 2=C-suite 3=Directors/Leads 4=Scrum Master 5=ICs
  reporting_manager_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  hierarchy_level      INTEGER NOT NULL DEFAULT 5,
  department           VARCHAR(100),

  slug                 VARCHAR(100) NOT NULL,
  real_name            VARCHAR(255) NOT NULL,
  role_title           VARCHAR(255) NOT NULL,

  risk_class           risk_class   NOT NULL DEFAULT 'B',
  status               skill_status NOT NULL DEFAULT 'active',
  idle_mode            idle_mode    NOT NULL DEFAULT 'learning',

  owned_domains        JSONB NOT NULL DEFAULT '[]',
  owned_repo_paths     JSONB NOT NULL DEFAULT '[]',
  trigger_keywords     JSONB NOT NULL DEFAULT '[]',

  description          TEXT NOT NULL DEFAULT '',
  instructions         TEXT NOT NULL DEFAULT '',
  skill_md_path        VARCHAR(500),

  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS skills_project_idx ON skills(project_id);

CREATE TABLE team_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id    UUID NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
  skill_id   UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  role       team_member_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_members_team_idx ON team_members(team_id);

-- Restore FKs that referenced the old skills table
ALTER TABLE tickets
  ADD CONSTRAINT tickets_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES skills(id) ON DELETE SET NULL;
ALTER TABLE memory_entries
  ADD CONSTRAINT memory_entries_skill_id_fkey
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL;

-- ── Onboarding proposals (Step 4 → 6 state machine) ───────────
CREATE TABLE IF NOT EXISTS onboarding_proposals (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id       UUID,
  status           proposal_status NOT NULL DEFAULT 'pending',
  proposed_skills  JSONB NOT NULL DEFAULT '[]',
  codebase_profile JSONB,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_proposals_workspace
  ON onboarding_proposals(workspace_id);
