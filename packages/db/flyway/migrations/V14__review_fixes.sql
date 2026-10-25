-- Review fixes: validated tier models, workspace scope, ledger buckets that are not sessions.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS llm_tier_models JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS llm_model_catalog JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Setup calls budget against the workspace id. That id is not a sessions row.
ALTER TABLE token_ledger DROP CONSTRAINT IF EXISTS token_ledger_session_id_fkey;
ALTER TABLE replay_frames DROP CONSTRAINT IF EXISTS replay_frames_session_id_fkey;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE migration_playbooks ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE fleet_outcomes ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE agent_heartbeats ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE contract_debts ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE fleet_circuit_breakers ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE agent_registry ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE shadow_branches ADD COLUMN IF NOT EXISTS workspace_id UUID;

CREATE INDEX IF NOT EXISTS idx_incidents_workspace ON incidents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_migration_playbooks_workspace ON migration_playbooks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_fleet_outcomes_workspace ON fleet_outcomes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_workspace ON agent_heartbeats(workspace_id);
