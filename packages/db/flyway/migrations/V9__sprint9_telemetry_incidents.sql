-- ARIA V9 — Sprint 9: Telemetry & Incidents (V27.9 §17).
-- incidents, migration_playbooks (+ phase runs), semantic_tripwires, slo_breaches.

CREATE TABLE IF NOT EXISTS slo_definitions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service         TEXT NOT NULL,
  name            TEXT NOT NULL,
  metric          TEXT NOT NULL,                                  -- e.g. error_rate, p95_latency_ms
  threshold       NUMERIC NOT NULL,
  comparison      TEXT NOT NULL CHECK (comparison IN ('<','<=','>','>=','==')),
  window_seconds  INTEGER NOT NULL DEFAULT 300,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (service, name)
);

CREATE TABLE IF NOT EXISTS slo_breaches (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slo_id            UUID REFERENCES slo_definitions(id) ON DELETE SET NULL,
  service           TEXT NOT NULL,
  metric            TEXT NOT NULL,
  observed_value    NUMERIC NOT NULL,
  threshold         NUMERIC NOT NULL,
  severity          TEXT NOT NULL CHECK (severity IN ('P0','P1','P2','P3')),
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  raw               JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_slo_breaches_detected ON slo_breaches(detected_at);
CREATE INDEX IF NOT EXISTS idx_slo_breaches_severity ON slo_breaches(severity);

CREATE TABLE IF NOT EXISTS incidents (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source              TEXT NOT NULL,
  severity            TEXT NOT NULL CHECK (severity IN ('P0','P1','P2','P3')),
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  related_commits     JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_session_id  UUID REFERENCES sessions(id) ON DELETE SET NULL,
  jira_ref            TEXT,
  status              TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','investigating','mitigated','resolved','postmortem')),
  resolved_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_incidents_status   ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);

CREATE TABLE IF NOT EXISTS migration_playbooks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL UNIQUE,
  yaml             TEXT NOT NULL,
  signed_hash      CHAR(64) NOT NULL,
  signed_by        TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS migration_phase_runs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  playbook_id        UUID NOT NULL REFERENCES migration_playbooks(id) ON DELETE CASCADE,
  phase_index        INTEGER NOT NULL,
  phase_name         TEXT NOT NULL,
  rollback_type      TEXT NOT NULL
                     CHECK (rollback_type IN ('stateless_safe','stateful_dangerous','irreversible')),
  status             TEXT NOT NULL CHECK (status IN ('queued','running','passed','failed','rolled_back','blocked')),
  started_at         TIMESTAMPTZ,
  finished_at        TIMESTAMPTZ,
  metrics            JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollback_executed  BOOLEAN NOT NULL DEFAULT false,
  notes              TEXT
);
CREATE INDEX IF NOT EXISTS idx_migration_phase_runs_playbook ON migration_phase_runs(playbook_id);
CREATE INDEX IF NOT EXISTS idx_migration_phase_runs_status   ON migration_phase_runs(status);

CREATE TABLE IF NOT EXISTS semantic_tripwires (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name   TEXT NOT NULL,
  column_name  TEXT NOT NULL,
  honeypot     TEXT NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triggered_at TIMESTAMPTZ,
  trigger_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (table_name, honeypot)
);
