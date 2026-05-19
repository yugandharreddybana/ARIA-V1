-- ARIA V8 — Sprint 8: Advanced Retrieval (Concept Graph + Context Distillation)
-- Tables for semantic chunks (Level 1 leaves), distillation runs (audit + Pre-Flight Estimator
-- inputs), and the HNSW index on concept_nodes.embedding (vectors land in this sprint).

CREATE TABLE IF NOT EXISTS semantic_chunks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_file      TEXT NOT NULL,
  source_language  TEXT NOT NULL,
  chunk_type       TEXT NOT NULL CHECK (chunk_type IN ('function','class','module','schema','doc_section','config','sql_statement','adr','markdown_block')),
  symbol_name      TEXT,
  line_start       INTEGER,
  line_end         INTEGER,
  dependencies     JSONB NOT NULL DEFAULT '[]'::jsonb,
  dependents       JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary          TEXT,
  embedding        vector(768),
  version_hash     CHAR(64) NOT NULL,
  last_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_project   ON semantic_chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_file      ON semantic_chunks(source_file);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_symbol    ON semantic_chunks(symbol_name);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_version   ON semantic_chunks(version_hash);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_embedding ON semantic_chunks USING hnsw (embedding vector_cosine_ops);

-- Now that semantic_chunks holds vectors, materialise the deferred HNSW index on concept_nodes.
CREATE INDEX IF NOT EXISTS idx_concept_nodes_embedding   ON concept_nodes USING hnsw (embedding vector_cosine_ops);

-- Distillation run log — used by the Pre-Flight Estimator to learn compression ratios per
-- (project, task class) and by `/knowledge-review` to surface coverage trends.
CREATE TABLE IF NOT EXISTS distillation_runs (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id               UUID REFERENCES projects(id) ON DELETE SET NULL,
  session_id               UUID REFERENCES sessions(id) ON DELETE SET NULL,
  agent_id                 TEXT,
  task_description_hash    CHAR(64) NOT NULL,
  raw_tokens_estimated     INTEGER NOT NULL,
  distilled_tokens         INTEGER NOT NULL,
  compression_ratio        NUMERIC(8,3) NOT NULL,
  affected_symbol_count    INTEGER NOT NULL DEFAULT 0,
  module_context_count     INTEGER NOT NULL DEFAULT 0,
  domain_concept_count     INTEGER NOT NULL DEFAULT 0,
  governing_decision_count INTEGER NOT NULL DEFAULT 0,
  experience_note_count    INTEGER NOT NULL DEFAULT 0,
  anti_pattern_count       INTEGER NOT NULL DEFAULT 0,
  duration_ms              INTEGER NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_distillation_runs_project ON distillation_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_distillation_runs_session ON distillation_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_distillation_runs_created ON distillation_runs(created_at);

-- Per-project rolling coverage so the Knowledge Graph Architect can target ≥95%.
CREATE TABLE IF NOT EXISTS concept_graph_coverage (
  project_id          UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  symbols_total       INTEGER NOT NULL DEFAULT 0,
  symbols_with_summary INTEGER NOT NULL DEFAULT 0,
  symbols_with_embedding INTEGER NOT NULL DEFAULT 0,
  modules_total       INTEGER NOT NULL DEFAULT 0,
  domains_total       INTEGER NOT NULL DEFAULT 0,
  decisions_total     INTEGER NOT NULL DEFAULT 0,
  stale_chunks        INTEGER NOT NULL DEFAULT 0,
  orphaned_nodes      INTEGER NOT NULL DEFAULT 0,
  broken_edges        INTEGER NOT NULL DEFAULT 0,
  last_rebuild_at     TIMESTAMPTZ
);
