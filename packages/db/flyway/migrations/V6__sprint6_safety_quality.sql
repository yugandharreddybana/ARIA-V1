-- ARIA V6 — Sprint 6: Safety & Quality
-- Persists quarantine events from the two-stage injection detector and a mirror
-- of the file-side FIM registry for fast queries from the dashboard.

CREATE TABLE IF NOT EXISTS quarantine_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  origin            TEXT NOT NULL,                       -- e.g. 'github-webhook', 'rss', 'model-output'
  content_hash      TEXT NOT NULL,
  injection_score   NUMERIC(4,3) NOT NULL,
  trust_label       TEXT NOT NULL CHECK (trust_label IN ('cleared','quarantined','rejected')),
  reason            TEXT,
  human_decision    TEXT CHECK (human_decision IS NULL OR human_decision IN ('allow','deny')),
  decided_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quarantine_label   ON quarantine_events(trust_label);
CREATE INDEX IF NOT EXISTS idx_quarantine_created ON quarantine_events(created_at);

CREATE TABLE IF NOT EXISTS fim_registry (
  path        TEXT PRIMARY KEY,
  hash        CHAR(64) NOT NULL,
  signature   TEXT NOT NULL,
  signed_by   TEXT NOT NULL,
  signed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fim_alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  path            TEXT NOT NULL,
  expected_hash   CHAR(64) NOT NULL,
  observed_hash   CHAR(64) NOT NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fim_alerts_path ON fim_alerts(path);

CREATE TABLE IF NOT EXISTS red_team_findings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id            UUID NOT NULL,
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issue_type        TEXT NOT NULL,
  severity          TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  description       TEXT,
  exploit_path      TEXT,
  evidence          JSONB NOT NULL DEFAULT '{}'::jsonb,
  remediated_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_red_team_severity ON red_team_findings(severity);

CREATE TABLE IF NOT EXISTS ui_discovery_forms (
  ticket_id        TEXT PRIMARY KEY,
  audience         TEXT NOT NULL,
  surface          TEXT NOT NULL,
  tone             TEXT NOT NULL,
  brand_context    TEXT,
  constraints      JSONB NOT NULL DEFAULT '[]'::jsonb,
  success_metrics  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
