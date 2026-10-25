-- Milestone 2: durable queue for every AI activity.

CREATE TABLE IF NOT EXISTS agent_runs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id         UUID NOT NULL REFERENCES projects(id)   ON DELETE CASCADE,
  agent_id           UUID REFERENCES skills(id)  ON DELETE SET NULL,
  ticket_id          UUID REFERENCES tickets(id) ON DELETE SET NULL,
  parent_run_id      UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  activity           TEXT NOT NULL CHECK (activity IN
                       ('knowledge_map','company_generation','develop','review','fix','qa')),
  task_type          TEXT NOT NULL,
  runtime            TEXT NOT NULL CHECK (runtime IN
                       ('cursor_local','cursor_cloud','local_worktree','chat')),
  status             TEXT NOT NULL DEFAULT 'queued' CHECK (status IN
                       ('queued','running','blocked','succeeded','failed','cancelled')),
  blocked_reason     TEXT,
  priority           INTEGER NOT NULL DEFAULT 0,
  idempotency_key    TEXT NOT NULL UNIQUE,
  attempt            INTEGER NOT NULL DEFAULT 0,
  max_attempts       INTEGER NOT NULL DEFAULT 3,
  not_before         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_owner        TEXT,
  lease_expires_at   TIMESTAMPTZ,
  heartbeat_at       TIMESTAMPTZ,
  model_id           TEXT,
  model_params       JSONB NOT NULL DEFAULT '[]'::jsonb,
  external_agent_id  TEXT,
  external_run_id    TEXT,
  external_url       TEXT,
  stream_cursor      TEXT,
  repo_id            UUID REFERENCES project_repos(id) ON DELETE SET NULL,
  base_ref           TEXT,
  head_sha           TEXT,
  branch             TEXT,
  pr_url             TEXT,
  pr_number          INTEGER,
  input              JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_text        TEXT,
  result_text        TEXT,
  result_json        JSONB,
  output_source      TEXT CHECK (output_source IN ('ai','template')),
  error_code         TEXT,
  error_message      TEXT,
  tokens_reserved    BIGINT NOT NULL DEFAULT 0,
  tokens_input       BIGINT, tokens_output BIGINT,
  tokens_cache_read  BIGINT, tokens_cache_write BIGINT,
  tokens_total       BIGINT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at         TIMESTAMPTZ,
  finished_at        TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_claim   ON agent_runs(status, not_before, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_ticket  ON agent_runs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_lease   ON agent_runs(lease_expires_at) WHERE status = 'running';
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_runs_one_running
  ON agent_runs(agent_id) WHERE status = 'running' AND agent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_run_logs (
  id          BIGSERIAL PRIMARY KEY,
  run_id      UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('status','assistant','tool','system','error')),
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, seq)
);

ALTER TABLE knowledge_maps
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'template',
  ADD COLUMN IF NOT EXISTS agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL;
ALTER TABLE business_flows
  ADD COLUMN IF NOT EXISTS layer TEXT NOT NULL DEFAULT 'fullstack';
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS llm_catalog_refreshed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS github_push_token_encrypted TEXT;
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS company_source TEXT NOT NULL DEFAULT 'template',
  ADD COLUMN IF NOT EXISTS company_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS code_runtime TEXT NOT NULL DEFAULT 'cursor_cloud',
  ADD COLUMN IF NOT EXISTS token_budget_monthly BIGINT,
  ADD COLUMN IF NOT EXISTS merge_guard_ack_at TIMESTAMPTZ;
ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS token_budget_monthly BIGINT;
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS status_reason TEXT;
