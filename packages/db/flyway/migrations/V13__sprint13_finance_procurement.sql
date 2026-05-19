-- ARIA V13 — Sprint 13: Finance & Procurement (V27.9 §11 + §17.6).
-- budgets, vendors, procurement_proposals, virtual_cards, arbitrage_proposals.

CREATE TABLE IF NOT EXISTS budgets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope             TEXT NOT NULL CHECK (scope IN ('session','project','workspace','global')),
  scope_ref         UUID,                                 -- session id / project id / workspace id (null for global)
  tokens_allocated  BIGINT NOT NULL,
  tokens_used       BIGINT NOT NULL DEFAULT 0,
  tokens_reserved   BIGINT NOT NULL DEFAULT 0,
  compute_usd       NUMERIC(12,4) NOT NULL DEFAULT 0,
  storage_usd       NUMERIC(12,4) NOT NULL DEFAULT 0,
  third_party_usd   NUMERIC(12,4) NOT NULL DEFAULT 0,
  warn_at_ratio     NUMERIC(3,2) NOT NULL DEFAULT 0.80,
  hard_stop_ratio   NUMERIC(3,2) NOT NULL DEFAULT 0.95,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budgets_scope ON budgets(scope, scope_ref);

CREATE TABLE IF NOT EXISTS vendors (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL UNIQUE,
  category          TEXT NOT NULL,                        -- 'llm-provider' | 'observability' | 'iaas' | 'saas' | 'other'
  homepage          TEXT,
  pricing_jsonb     JSONB NOT NULL DEFAULT '{}'::jsonb,
  sla_jsonb         JSONB NOT NULL DEFAULT '{}'::jsonb,
  features_jsonb    JSONB NOT NULL DEFAULT '{}'::jsonb,
  trust_score       NUMERIC(4,3) NOT NULL DEFAULT 0,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vendors_category ON vendors(category);

CREATE TABLE IF NOT EXISTS procurement_proposals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposed_by       TEXT NOT NULL,                        -- agent id / human id
  problem_statement TEXT NOT NULL,
  category          TEXT NOT NULL,
  shortlist         JSONB NOT NULL,                       -- [{ vendor_id, name, monthly_cost_usd, pros, cons }]
  recommendation_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','submitted','approved','rejected')),
  approved_by       TEXT,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_procurement_status ON procurement_proposals(status);

CREATE TABLE IF NOT EXISTS virtual_cards (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id         UUID REFERENCES vendors(id) ON DELETE SET NULL,
  stripe_card_id    TEXT NOT NULL UNIQUE,                 -- stub id from JiraMcpStub-like generator
  last4             CHAR(4) NOT NULL,                     -- redacted (stub only)
  spend_limit_usd   NUMERIC(12,4) NOT NULL,
  spent_usd         NUMERIC(12,4) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arbitrage_proposals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service           TEXT NOT NULL,                        -- 'postgres' | 'redis' | 'object-store' | ...
  current_provider  TEXT NOT NULL,
  candidate_provider TEXT NOT NULL,
  monthly_savings_usd NUMERIC(12,2) NOT NULL,
  migration_risk    TEXT NOT NULL CHECK (migration_risk IN ('low','medium','high')),
  rationale_md      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed','approved','rejected','superseded')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
