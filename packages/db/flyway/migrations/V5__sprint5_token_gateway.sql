-- ARIA V5 — Sprint 5: Token Gateway + Orchestrator foundation
-- pgvector extension, Orchestrator columns on sessions, replay_frames, token_ledger.
-- Uses TEXT + CHECK constraints (not Postgres ENUM types) for clean Hibernate interop.

CREATE EXTENSION IF NOT EXISTS vector;

-- Relax baseline session columns that the V27.9 Orchestrator does not own.
ALTER TABLE sessions ALTER COLUMN team_id DROP NOT NULL;

-- Extend the baseline `sessions` table for the V27.9 Orchestrator without breaking existing rows.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS workspace_id           UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS mode                   TEXT          NOT NULL DEFAULT 'precision',
  ADD COLUMN IF NOT EXISTS environment            TEXT          NOT NULL DEFAULT 'dev',
  ADD COLUMN IF NOT EXISTS mission_type           TEXT          NOT NULL DEFAULT 'feature',
  ADD COLUMN IF NOT EXISTS mission_risk_appetite  VARCHAR(20)   NOT NULL DEFAULT 'moderate',
  ADD COLUMN IF NOT EXISTS mission_scope          JSONB         NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS token_budget           INTEGER,
  ADD COLUMN IF NOT EXISTS time_budget_minutes    INTEGER,
  ADD COLUMN IF NOT EXISTS is_first_start         BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS brief_summary          TEXT,
  ADD COLUMN IF NOT EXISTS user_id                UUID REFERENCES users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE sessions ADD CONSTRAINT sessions_mode_chk
    CHECK (mode IN ('precision','throughput','planning','shadow'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE sessions ADD CONSTRAINT sessions_env_chk
    CHECK (environment IN ('dev','staging','prod_readonly','production'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE sessions ADD CONSTRAINT sessions_mission_type_chk
    CHECK (mission_type IN ('stability','feature','tech_debt','security','planning'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE sessions ADD CONSTRAINT sessions_state_chk
    CHECK (state IN ('new','bootstrapping','scrumming','working','paused','completed','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_state         ON sessions(state);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id  ON sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id       ON sessions(user_id);

-- Concept Graph: reserve embedding column for Sprint 8 + graph_level for distillation levels.
ALTER TABLE concept_nodes
  ADD COLUMN IF NOT EXISTS embedding   vector(768),
  ADD COLUMN IF NOT EXISTS graph_level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE concept_edges
  ADD COLUMN IF NOT EXISTS graph_level INTEGER NOT NULL DEFAULT 1;

-- Append-only ReplayFrames: every Token Gateway dispatch writes one of these.
CREATE TABLE IF NOT EXISTS replay_frames (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id              UUID REFERENCES sessions(id) ON DELETE SET NULL,
  agent_id                TEXT,
  skill_slug              TEXT,
  request_id              UUID NOT NULL,
  priority                TEXT NOT NULL,
  model_backend           TEXT NOT NULL,
  model_id                TEXT NOT NULL,
  model_parameters        JSONB NOT NULL,
  prompt_hash             TEXT NOT NULL,
  prompt_full             TEXT NOT NULL,
  context_window_tokens   INTEGER NOT NULL DEFAULT 0,
  system_message          TEXT,
  injected_context_refs   JSONB,
  prompt_tokens_estimated INTEGER NOT NULL DEFAULT 0,
  prompt_tokens_actual    INTEGER,
  response_hash           TEXT,
  response_full           TEXT,
  response_tokens         INTEGER,
  total_tokens            INTEGER,
  outcome_object_ref      TEXT,
  status                  TEXT NOT NULL,
  error                   TEXT,
  retained_indefinitely   BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at           TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_replay_frames_session    ON replay_frames(session_id);
CREATE INDEX IF NOT EXISTS idx_replay_frames_agent      ON replay_frames(agent_id);
CREATE INDEX IF NOT EXISTS idx_replay_frames_status     ON replay_frames(status);
CREATE INDEX IF NOT EXISTS idx_replay_frames_request    ON replay_frames(request_id);
CREATE INDEX IF NOT EXISTS idx_replay_frames_error      ON replay_frames(error) WHERE error IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_replay_frames_created_at ON replay_frames(created_at);

-- Per-session, per-backend token accounting for budget enforcement (warn 80% / hard-stop 95%).
CREATE TABLE IF NOT EXISTS token_ledger (
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  backend_id      TEXT NOT NULL,
  tokens_used     BIGINT NOT NULL DEFAULT 0,
  tokens_reserved BIGINT NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, backend_id)
);
