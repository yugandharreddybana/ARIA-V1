-- ARIA V7 — Sprint 7: Experience & Memory
-- DB mirror of the file-based skill experience profiles + an audit log for the
-- Knowledge Veracity scoring (ADR-0008). The canonical source of truth remains
-- `.entiresystem/skills/<slug>/experience.yml` so reviewers see lessons via git.

CREATE TABLE IF NOT EXISTS skill_experience_profiles (
  skill            VARCHAR(100) PRIMARY KEY,
  tickets_touched  INTEGER NOT NULL DEFAULT 0,
  yaml_hash        CHAR(64) NOT NULL,
  yaml_size_bytes  INTEGER NOT NULL,
  best_practices   INTEGER NOT NULL DEFAULT 0,
  anti_patterns    INTEGER NOT NULL DEFAULT 0,
  failure_stories  INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_veracity_audits (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill                    VARCHAR(100) NOT NULL,
  ran_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_entries            INTEGER NOT NULL,
  human_authored_count     INTEGER NOT NULL DEFAULT 0,
  human_approved_count     INTEGER NOT NULL DEFAULT 0,
  ai_only_count            INTEGER NOT NULL DEFAULT 0,
  stale_ai_only_count      INTEGER NOT NULL DEFAULT 0,
  stale_human_approved_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT fk_audit_skill FOREIGN KEY (skill) REFERENCES skill_experience_profiles(skill) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_veracity_audits_ran_at ON knowledge_veracity_audits(ran_at);

CREATE TABLE IF NOT EXISTS shadow_learning_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pr_number       INTEGER,
  commit_sha      CHAR(40),
  diff_summary    TEXT,
  proposed_patch  TEXT,
  status          TEXT NOT NULL DEFAULT 'drafted'
                  CHECK (status IN ('drafted','pr_opened','merged','rejected')),
  pr_ref          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_shadow_learning_status ON shadow_learning_runs(status);

CREATE TABLE IF NOT EXISTS backend_workspaces (
  workspace          VARCHAR(100) PRIMARY KEY,
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  files_indexed      INTEGER NOT NULL DEFAULT 0,
  skills_indexed     INTEGER NOT NULL DEFAULT 0,
  experience_entries INTEGER NOT NULL DEFAULT 0,
  output_dir         TEXT NOT NULL
);
