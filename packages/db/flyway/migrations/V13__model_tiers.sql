-- Per-task model tiers. Planning defaults to top, development to auto.
-- Agent columns are null when the agent inherits the project.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS model_task_tiers JSONB NOT NULL DEFAULT '{"planning":"top","development":"auto"}'::jsonb,
  ADD COLUMN IF NOT EXISTS model_tier_models JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS model_task_tiers JSONB,
  ADD COLUMN IF NOT EXISTS model_override TEXT;
