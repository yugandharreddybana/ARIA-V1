-- Remember which budget bucket a run reserved. Releasing a run reads this
-- flag instead of the project's current token_budget_monthly, so clearing
-- or setting that budget mid-run cannot release a different ledger row.
-- NULL keeps the old behaviour for rows written before this column existed.

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS budget_project_scoped BOOLEAN;
