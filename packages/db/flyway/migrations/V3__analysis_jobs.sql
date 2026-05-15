-- V3: Analysis jobs table
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id             TEXT PRIMARY KEY,
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repo_id        UUID NOT NULL REFERENCES project_repos(id) ON DELETE CASCADE,
  repo_url       TEXT NOT NULL,
  branch         TEXT NOT NULL DEFAULT 'main',
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'queued',
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_workspace ON analysis_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_project ON analysis_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status);
