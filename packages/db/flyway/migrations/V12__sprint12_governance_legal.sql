-- ARIA V12 — Sprint 12: Governance & Legal (V27.9 §12 + §13.7 + §20).
-- compliance_findings, contracts, gdpr_redactions, audit_chain, audit_exports.

CREATE TABLE IF NOT EXISTS compliance_findings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  triggered_by    TEXT NOT NULL,                                 -- 'concept-graph-diff' | 'pr-review' | 'manual'
  trigger_ref     TEXT,                                          -- e.g. file path / diff hash / PR id
  category        TEXT NOT NULL CHECK (category IN ('pii','logging','retention','encryption','data_export','data_residency')),
  severity        TEXT NOT NULL CHECK (severity IN ('blocking','warning','info')),
  description     TEXT NOT NULL,
  evidence        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ticket_ref      TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','accepted','rejected','mitigated')),
  decided_by      TEXT,
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_status   ON compliance_findings(status);
CREATE INDEX IF NOT EXISTS idx_compliance_severity ON compliance_findings(severity);

CREATE TABLE IF NOT EXISTS contracts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor       TEXT NOT NULL,
  title        TEXT NOT NULL,
  raw_text     TEXT NOT NULL,
  raw_hash     CHAR(64) NOT NULL,
  embedding    vector(768),
  signed_at    TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  license_class TEXT CHECK (license_class IS NULL OR license_class IN ('permissive','copyleft','proprietary','unknown')),
  flagged      BOOLEAN NOT NULL DEFAULT false,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contracts_vendor    ON contracts(vendor);
CREATE INDEX IF NOT EXISTS idx_contracts_flagged   ON contracts(flagged) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS idx_contracts_embedding ON contracts USING hnsw (embedding vector_cosine_ops);

-- GDPR redaction (ADR-0020): PII is replaced with a "REDACTED" stub; the original hash chain
-- is preserved so SOC2 / ISO auditors can prove no record was created after the fact.
CREATE TABLE IF NOT EXISTS gdpr_redactions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_table           TEXT NOT NULL,
  source_id              TEXT NOT NULL,
  source_column          TEXT NOT NULL,
  original_value_hash    CHAR(64) NOT NULL,
  redacted_token         TEXT NOT NULL,           -- e.g. [REDACTED:<sha8>]
  reason                 TEXT NOT NULL,           -- 'gdpr-erasure' | 'ccpa-erasure' | 'data-minimisation'
  redacted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redacted_by            TEXT NOT NULL,           -- requesting user / agent
  prev_chain_hash        CHAR(64),
  chain_hash             CHAR(64) NOT NULL        -- sha256(prev_chain_hash || redacted_token || redacted_at)
);
CREATE INDEX IF NOT EXISTS idx_gdpr_redactions_source ON gdpr_redactions(source_table, source_id);

-- Append-only governance audit chain (ADR-0019). Every Class C+ decision lands here.
CREATE TABLE IF NOT EXISTS audit_chain (
  seq             BIGSERIAL PRIMARY KEY,
  event_type      TEXT NOT NULL,                  -- 'compliance.decision' | 'gdpr.redaction' | 'audit.export' | 'explain.emit'
  actor           TEXT NOT NULL,                  -- agent id / user id
  payload         JSONB NOT NULL,
  prev_hash       CHAR(64),
  chain_hash      CHAR(64) NOT NULL,              -- sha256(prev_hash || canonical(payload))
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_chain_type    ON audit_chain(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_chain_actor   ON audit_chain(actor);
CREATE INDEX IF NOT EXISTS idx_audit_chain_created ON audit_chain(created_at);

CREATE TABLE IF NOT EXISTS audit_exports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requested_by    TEXT NOT NULL,
  scope           TEXT NOT NULL,                  -- 'soc2' | 'iso' | 'gdpr' | 'all'
  from_seq        BIGINT NOT NULL,
  to_seq          BIGINT NOT NULL,
  bundle_path     TEXT NOT NULL,
  bundle_sha256   CHAR(64) NOT NULL,
  signed_by       TEXT NOT NULL,                  -- daemon Ed25519 fingerprint
  signature       TEXT NOT NULL,                  -- base64 Ed25519 over bundle_sha256
  exported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_exports_scope    ON audit_exports(scope);
CREATE INDEX IF NOT EXISTS idx_audit_exports_exported ON audit_exports(exported_at);

CREATE TABLE IF NOT EXISTS decision_explanations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID REFERENCES sessions(id) ON DELETE CASCADE,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  why_markdown    TEXT NOT NULL,
  sources_jsonb   JSONB NOT NULL DEFAULT '{}'::jsonb,
  chain_hash      CHAR(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decision_explanations_session ON decision_explanations(session_id);
