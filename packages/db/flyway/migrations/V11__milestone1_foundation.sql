-- V11: Milestone 1 foundation.
-- Flyway is the schema source of truth. This migration is additive so Hibernate
-- ddl-auto=validate keeps matching the Java entities from V1–V10.
-- Drizzle reads and writes these columns; new agent fields are designed so later
-- work (PRs, ceremonies, proposals, learning) can attach without a rewrite.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS company_description TEXT,
  ADD COLUMN IF NOT EXISTS scout_agent_name VARCHAR(100) DEFAULT 'Aria Scout',
  ADD COLUMN IF NOT EXISTS scout_agent_description TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS github_installation_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS github_access_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS jira_base_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS jira_api_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS jira_user_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS llm_provider TEXT DEFAULT 'cursor',
  ADD COLUMN IF NOT EXISTS llm_base_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS llm_api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS llm_model VARCHAR(200);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS company_size INTEGER,
  ADD COLUMN IF NOT EXISTS company_mix JSONB;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS department VARCHAR(100),
  ADD COLUMN IF NOT EXISTS lead_skill_id UUID,
  ADD COLUMN IF NOT EXISTS scrum_master_skill_id UUID;

ALTER TABLE skills ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE skills ALTER COLUMN name DROP NOT NULL;
ALTER TABLE skills ALTER COLUMN role DROP NOT NULL;

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS slug VARCHAR(100),
  ADD COLUMN IF NOT EXISTS real_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS role_title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS role_key VARCHAR(64),
  ADD COLUMN IF NOT EXISTS reporting_manager_id UUID,
  ADD COLUMN IF NOT EXISTS backup_agent_id UUID,
  ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS department VARCHAR(100),
  ADD COLUMN IF NOT EXISTS risk_class TEXT NOT NULL DEFAULT 'B',
  ADD COLUMN IF NOT EXISTS idle_mode TEXT NOT NULL DEFAULT 'learning',
  ADD COLUMN IF NOT EXISTS owned_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS owned_repo_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS trigger_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS owned_flow_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS instructions TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS skill_md_path VARCHAR(500),
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;

DO $$ BEGIN
  ALTER TABLE skills
    ADD CONSTRAINT skills_reporting_manager_fk
    FOREIGN KEY (reporting_manager_id) REFERENCES skills(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE skills
    ADD CONSTRAINT skills_backup_agent_fk
    FOREIGN KEY (backup_agent_id) REFERENCES skills(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_skills_project_id ON skills(project_id);
CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(project_id, enabled);

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS prompt_block JSONB,
  ADD COLUMN IF NOT EXISTS affected_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jira_issue_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS created_by_skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS human_approved BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'backlog';

ALTER TABLE ticket_evidence
  ADD COLUMN IF NOT EXISTS evidence_type TEXT,
  ADD COLUMN IF NOT EXISTS screenshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS video_path VARCHAR(500),
  ADD COLUMN IF NOT EXISTS logs TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS repro_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS environment JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS code_diff TEXT,
  ADD COLUMN IF NOT EXISTS test_output TEXT,
  ADD COLUMN IF NOT EXISTS commit_hash VARCHAR(100),
  ADD COLUMN IF NOT EXISTS created_by_skill_id UUID;

ALTER TABLE analysis_jobs
  ADD COLUMN IF NOT EXISTS result_summary TEXT;

CREATE TABLE IF NOT EXISTS idea_cards (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id                 UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title                      VARCHAR(500) NOT NULL,
  summary                    TEXT NOT NULL,
  proposed_by_skill_id       UUID REFERENCES skills(id) ON DELETE SET NULL,
  proposed_by_human_id       UUID,
  affected_domains           JSONB NOT NULL DEFAULT '[]'::jsonb,
  potential_user_impact      TEXT NOT NULL,
  potential_business_impact  TEXT NOT NULL,
  rough_effort_estimate      VARCHAR(100),
  risk_assessment            TEXT,
  suggested_risk_class       VARCHAR(1) NOT NULL DEFAULT 'B',
  supporting_evidence        JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                     TEXT NOT NULL DEFAULT 'draft',
  human_approved             BOOLEAN NOT NULL DEFAULT FALSE,
  human_approved_by_id       UUID,
  human_approved_at          TIMESTAMPTZ,
  linked_ticket_ids          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idea_cards_project_idx ON idea_cards(project_id);

CREATE TABLE IF NOT EXISTS onboarding_proposals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id        UUID,
  status            TEXT NOT NULL DEFAULT 'pending',
  proposed_skills   JSONB NOT NULL DEFAULT '[]'::jsonb,
  codebase_profile  JSONB,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_maps (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tech_stack    JSONB NOT NULL DEFAULT '[]'::jsonb,
  modules       JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_model    JSONB NOT NULL DEFAULT '[]'::jsonb,
  apis          JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary       TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_flows (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  knowledge_map_id  UUID NOT NULL REFERENCES knowledge_maps(id) ON DELETE CASCADE,
  flow_key          TEXT NOT NULL,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'other',
  description       TEXT NOT NULL DEFAULT '',
  entry_points      JSONB NOT NULL DEFAULT '[]'::jsonb,
  owner_agent_id    UUID REFERENCES skills(id) ON DELETE SET NULL,
  backup_agent_id   UUID REFERENCES skills(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, flow_key)
);

CREATE INDEX IF NOT EXISTS idx_business_flows_project ON business_flows(project_id);
CREATE INDEX IF NOT EXISTS idx_business_flows_owner ON business_flows(owner_agent_id);
