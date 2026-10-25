-- Append-only ticket audit log. UPDATE and DELETE are blocked for every role.
-- A parent BEFORE DELETE trigger deletes the child rows first. The row trigger
-- allows that nested delete (pg_trigger_depth() > 1) and rejects a session
-- DELETE, a session GUC, and a direct call to the purge function.

CREATE TABLE IF NOT EXISTS ticket_events (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ticket_id      UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  seq            BIGINT NOT NULL,
  event_type     TEXT NOT NULL CHECK (event_type IN (
                   'status_change','agent_action','progress','communication',
                   'run_ref','owner_decision','schedule','evidence')),
  actor_kind     TEXT NOT NULL CHECK (actor_kind IN ('agent','owner','system','human')),
  agent_id       UUID,
  run_id         UUID,
  summary        TEXT NOT NULL,
  detail         JSONB NOT NULL DEFAULT '{}'::jsonb,
  detail_canonical TEXT NOT NULL DEFAULT '{}',
  model_id       TEXT,
  tokens_total   BIGINT,
  pr_url         TEXT,
  commit_sha     TEXT,
  prev_hash      TEXT,
  hash           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticket_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events(ticket_id, seq);
CREATE INDEX IF NOT EXISTS idx_ticket_events_workspace ON ticket_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_events_agent ON ticket_events(agent_id);

CREATE OR REPLACE FUNCTION ticket_events_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  prior text;
  last_seq bigint;
BEGIN
  SELECT seq, hash INTO last_seq, prior
    FROM ticket_events
   WHERE ticket_id = NEW.ticket_id
   ORDER BY seq DESC
   LIMIT 1;
  IF COALESCE(last_seq, 0) + 1 IS DISTINCT FROM NEW.seq THEN
    RAISE EXCEPTION 'ticket_events sequence gap' USING ERRCODE = '23514';
  END IF;
  IF prior IS DISTINCT FROM NEW.prev_hash THEN
    RAISE EXCEPTION 'ticket_events prev_hash mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.hash IS NULL OR NEW.hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'ticket_events hash invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_events_chain ON ticket_events;
CREATE TRIGGER ticket_events_chain
  BEFORE INSERT ON ticket_events
  FOR EACH ROW EXECUTE FUNCTION ticket_events_chain();

CREATE OR REPLACE FUNCTION ticket_events_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'ticket_events is append-only' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() <= 1 THEN
      RAISE EXCEPTION 'ticket_events is append-only' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS ticket_events_no_update ON ticket_events;
CREATE TRIGGER ticket_events_no_update
  BEFORE UPDATE ON ticket_events
  FOR EACH ROW EXECUTE FUNCTION ticket_events_immutable();

DROP TRIGGER IF EXISTS ticket_events_no_delete ON ticket_events;
CREATE TRIGGER ticket_events_no_delete
  BEFORE DELETE ON ticket_events
  FOR EACH ROW EXECUTE FUNCTION ticket_events_immutable();

CREATE OR REPLACE FUNCTION aria_purge_ticket_events(target uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() < 1 THEN
    RAISE EXCEPTION 'ticket_events is append-only' USING ERRCODE = '55000';
  END IF;
  DELETE FROM ticket_events WHERE ticket_id = target;
END;
$$;

CREATE OR REPLACE FUNCTION aria_purge_ticket_events_for_project(target uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() < 1 THEN
    RAISE EXCEPTION 'ticket_events is append-only' USING ERRCODE = '55000';
  END IF;
  DELETE FROM ticket_events WHERE project_id = target;
END;
$$;

CREATE OR REPLACE FUNCTION aria_purge_ticket_events_for_workspace(target uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() < 1 THEN
    RAISE EXCEPTION 'ticket_events is append-only' USING ERRCODE = '55000';
  END IF;
  DELETE FROM ticket_events WHERE workspace_id = target;
END;
$$;

REVOKE ALL ON FUNCTION aria_purge_ticket_events(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION aria_purge_ticket_events_for_project(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION aria_purge_ticket_events_for_workspace(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ticket_events_allow_parent_delete() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'workspaces' THEN
    PERFORM aria_purge_ticket_events_for_workspace(OLD.id);
  ELSIF TG_TABLE_NAME = 'projects' THEN
    PERFORM aria_purge_ticket_events_for_project(OLD.id);
  ELSE
    PERFORM aria_purge_ticket_events(OLD.id);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tickets_allow_event_purge ON tickets;
CREATE TRIGGER tickets_allow_event_purge
  BEFORE DELETE ON tickets
  FOR EACH ROW EXECUTE FUNCTION ticket_events_allow_parent_delete();

DROP TRIGGER IF EXISTS projects_allow_event_purge ON projects;
CREATE TRIGGER projects_allow_event_purge
  BEFORE DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION ticket_events_allow_parent_delete();

DROP TRIGGER IF EXISTS workspaces_allow_event_purge ON workspaces;
CREATE TRIGGER workspaces_allow_event_purge
  BEFORE DELETE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION ticket_events_allow_parent_delete();

REVOKE UPDATE, DELETE, TRUNCATE ON ticket_events FROM PUBLIC;
