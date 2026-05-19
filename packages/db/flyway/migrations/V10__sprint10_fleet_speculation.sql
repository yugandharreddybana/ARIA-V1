-- ARIA V10 — Sprint 10: Fleet & Speculation (V27.9 §17.4 + §18I).
-- agent_registry (Ed25519 pubkeys), fleet_outcomes (signed event log), agent_heartbeats,
-- contract_debts (Deadlock Breaker forced-V1 audit trail), shadow_branches (Pre-Cog).

CREATE TABLE IF NOT EXISTS agent_registry (
  agent_id        VARCHAR(200) PRIMARY KEY,
  agent_family    VARCHAR(100) NOT NULL,
  ed25519_pubkey  TEXT NOT NULL,           -- base64 SPKI DER
  fingerprint     CHAR(64) NOT NULL,       -- sha256(SPKI DER), human audit handle
  trust_score     NUMERIC(4,3) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','paused','quarantined','retired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_registry_family ON agent_registry(agent_family);

CREATE TABLE IF NOT EXISTS fleet_outcomes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  epic_id       TEXT NOT NULL,
  topic         TEXT NOT NULL,
  payload       JSONB NOT NULL,
  agent_id      VARCHAR(200) NOT NULL REFERENCES agent_registry(agent_id) ON DELETE RESTRICT,
  signature     TEXT NOT NULL,             -- base64 Ed25519 sig over `epic_id|topic|payload_canonical`
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fleet_outcomes_epic    ON fleet_outcomes(epic_id);
CREATE INDEX IF NOT EXISTS idx_fleet_outcomes_topic   ON fleet_outcomes(topic);
CREATE INDEX IF NOT EXISTS idx_fleet_outcomes_agent   ON fleet_outcomes(agent_id);

CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id        VARCHAR(200) NOT NULL REFERENCES agent_registry(agent_id) ON DELETE CASCADE,
  session_id      UUID REFERENCES sessions(id) ON DELETE SET NULL,
  skill_slug      VARCHAR(100),
  state           TEXT NOT NULL CHECK (state IN ('active','waiting','blocked','complete','error')),
  waiting_on      VARCHAR(200),           -- agent_id this one is waiting on
  waiting_since   TIMESTAMPTZ,
  last_output_at  TIMESTAMPTZ,
  tokens_consumed_idle INTEGER NOT NULL DEFAULT 0,
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_heartbeats_agent      ON agent_heartbeats(agent_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_observed   ON agent_heartbeats(observed_at);
CREATE INDEX IF NOT EXISTS idx_heartbeats_state      ON agent_heartbeats(state);

CREATE TABLE IF NOT EXISTS contract_debts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id          UUID REFERENCES sessions(id) ON DELETE SET NULL,
  producer_agent      VARCHAR(200) NOT NULL,
  consumer_agents     JSONB NOT NULL DEFAULT '[]'::jsonb,
  draft_contract_ref  TEXT,
  reconciliation_required BOOLEAN NOT NULL DEFAULT true,
  reconciled_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contract_debts_session ON contract_debts(session_id);
CREATE INDEX IF NOT EXISTS idx_contract_debts_pending ON contract_debts(reconciled_at) WHERE reconciled_at IS NULL;

CREATE TABLE IF NOT EXISTS shadow_branches (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_ref        TEXT NOT NULL,                          -- e.g. JIRA-123 / shadow-<sha>
  branch_name       TEXT NOT NULL UNIQUE,                   -- aria-shadow/<ticket>
  speculative_diff  TEXT,
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','reverted','promoted','expired')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_shadow_branches_ticket ON shadow_branches(ticket_ref);

CREATE TABLE IF NOT EXISTS fleet_circuit_breakers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle         JSONB NOT NULL,        -- ["agent-a","agent-b","agent-c"]
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at    TIMESTAMPTZ
);
