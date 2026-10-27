-- M3A: multi-provider credentials + runtime_kinds FK (all M3 runtimes seeded once).
-- Later slices: INSERT into runtime_kinds only. Never re-ADD a runtime CHECK.

-- Hibernate may have narrowed llm_provider to a PG enum; M3A needs free-form provider ids.
-- No product-default provider (Decision 1): drop any column DEFAULT so a fresh
-- workspace does not silently become "cursor" — setup/activate sets the value.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'llm_provider') THEN
    ALTER TABLE workspaces ALTER COLUMN llm_provider DROP DEFAULT;
    ALTER TABLE workspaces
      ALTER COLUMN llm_provider TYPE TEXT USING llm_provider::text;
    DROP TYPE IF EXISTS llm_provider;
  END IF;
END $$;
ALTER TABLE workspaces ALTER COLUMN llm_provider DROP DEFAULT;

CREATE TABLE IF NOT EXISTS provider_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'default',
  api_key_encrypted TEXT,
  base_url TEXT,
  extra_encrypted TEXT,
  connection_status TEXT NOT NULL DEFAULT 'untested'
    CHECK (connection_status IN ('untested','ok','failed')),
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  binary_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (binary_status IN ('unknown','ok','missing','not_required')),
  retired_at TIMESTAMPTZ,
  catalog_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  catalog_refreshed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, provider, label)
);

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS active_planning_credential_id UUID REFERENCES provider_credentials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_coding_credential_id UUID REFERENCES provider_credentials(id) ON DELETE SET NULL;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS planning_credential_id UUID REFERENCES provider_credentials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coding_credential_id UUID REFERENCES provider_credentials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS standup_time TEXT NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS sprint_workdays INTEGER NOT NULL DEFAULT 10;

CREATE TABLE IF NOT EXISTS runtime_kinds (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  introduced_in TEXT NOT NULL DEFAULT 'm3'
);

INSERT INTO runtime_kinds (id, description, introduced_in) VALUES
  ('cursor_local', 'Cursor SDK local', 'm2'),
  ('cursor_cloud', 'Cursor Cloud Agents', 'm2'),
  ('local_worktree', 'Local worktree worker', 'm2'),
  ('chat', 'Chat completions provider', 'm2'),
  ('claude_cli', 'Claude Code CLI', 'm3'),
  ('codex_cli', 'OpenAI Codex CLI', 'm3'),
  ('antigravity_cli', 'Google Antigravity CLI', 'm3')
ON CONFLICT DO NOTHING;

ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_runtime_check;
ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_runtime_fk
  FOREIGN KEY (runtime) REFERENCES runtime_kinds(id);
