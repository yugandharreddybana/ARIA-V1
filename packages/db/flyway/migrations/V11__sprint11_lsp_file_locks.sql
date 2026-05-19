-- ARIA V11 — Sprint 11: IDE/LSP Integration (V27.9 §18M).
-- file_locks mirrors the Redis-backed lock keys for audit + dashboard visibility.

CREATE TABLE IF NOT EXISTS file_locks (
  path           TEXT PRIMARY KEY,
  agent_id       VARCHAR(200) NOT NULL,
  session_id     UUID REFERENCES sessions(id) ON DELETE SET NULL,
  acquired_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_seconds    INTEGER NOT NULL DEFAULT 60,
  expires_at     TIMESTAMPTZ NOT NULL,
  reason         TEXT
);
CREATE INDEX IF NOT EXISTS idx_file_locks_agent      ON file_locks(agent_id);
CREATE INDEX IF NOT EXISTS idx_file_locks_expires_at ON file_locks(expires_at);

-- Append-only audit of every accept/reject decision on a ghost-text diff.
CREATE TABLE IF NOT EXISTS lsp_diff_decisions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id     VARCHAR(200) NOT NULL,
  session_id   UUID REFERENCES sessions(id) ON DELETE SET NULL,
  file_path    TEXT NOT NULL,
  diff_hash    CHAR(64) NOT NULL,
  decision     TEXT NOT NULL CHECK (decision IN ('accepted','rejected','expired')),
  decided_by   TEXT NOT NULL,            -- user identity or system identifier
  decided_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diff_excerpt TEXT
);
CREATE INDEX IF NOT EXISTS idx_lsp_decisions_session ON lsp_diff_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_lsp_decisions_file    ON lsp_diff_decisions(file_path);
