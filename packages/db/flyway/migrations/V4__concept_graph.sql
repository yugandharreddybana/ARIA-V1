-- V4: Concept Graph tables
CREATE TABLE IF NOT EXISTS concept_nodes (
  id            TEXT PRIMARY KEY,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  node_type     TEXT NOT NULL,
  name          TEXT NOT NULL,
  file_path     TEXT,
  summary       TEXT,
  metadata      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concept_nodes_project ON concept_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_concept_nodes_type ON concept_nodes(node_type);

CREATE TABLE IF NOT EXISTS concept_edges (
  id             TEXT PRIMARY KEY,
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  edge_type      TEXT NOT NULL,
  label          TEXT,
  confidence     DOUBLE PRECISION,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concept_edges_project ON concept_edges(project_id);
CREATE INDEX IF NOT EXISTS idx_concept_edges_source ON concept_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_concept_edges_target ON concept_edges(target_node_id);
