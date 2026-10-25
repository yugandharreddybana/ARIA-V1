-- Story points (Fibonacci, 1 point = 1 working day) and evidence reports.

CREATE SEQUENCE IF NOT EXISTS ticket_key_seq START 1000;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS story_points INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS work_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schedule_state TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS ticket_key TEXT,
  ADD COLUMN IF NOT EXISTS split_suggested BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_story_points_fib;
ALTER TABLE tickets ADD CONSTRAINT tickets_story_points_fib CHECK (story_points IN (1, 2, 3, 5, 8, 13));
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_schedule_state_chk;
ALTER TABLE tickets ADD CONSTRAINT tickets_schedule_state_chk
  CHECK (schedule_state IN ('not_started', 'on_track', 'at_risk', 'overdue', 'done'));

CREATE OR REPLACE FUNCTION tickets_assign_key() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_key IS NULL OR btrim(NEW.ticket_key) = '' THEN
    NEW.ticket_key := 'ARIA-' || nextval('ticket_key_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_assign_key ON tickets;
CREATE TRIGGER tickets_assign_key
  BEFORE INSERT ON tickets
  FOR EACH ROW EXECUTE FUNCTION tickets_assign_key();

UPDATE tickets
   SET ticket_key = 'ARIA-' || nextval('ticket_key_seq')::text
 WHERE ticket_key IS NULL;

ALTER TABLE tickets ALTER COLUMN ticket_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tickets_ticket_key_uidx ON tickets(ticket_key);

CREATE TABLE IF NOT EXISTS ticket_reports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('dev', 'qa')),
  ticket_key    TEXT NOT NULL,
  markdown      TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  pdf_sha256    TEXT NOT NULL,
  pdf_bytes     BYTEA NOT NULL,
  valid         BOOLEAN NOT NULL,
  errors        JSONB NOT NULL DEFAULT '[]'::jsonb,
  run_id        UUID,
  commit_sha    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_reports_ticket ON ticket_reports(ticket_id, kind, created_at DESC);
