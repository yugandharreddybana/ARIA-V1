-- Re-apply the ticket-event purge. Deletes are allowed only while a parent
-- BEFORE DELETE trigger is on the stack. A session GUC cannot bypass that.

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

ALTER TABLE ticket_events DROP CONSTRAINT IF EXISTS ticket_events_actor_kind_check;
ALTER TABLE ticket_events
  ADD CONSTRAINT ticket_events_actor_kind_check
  CHECK (actor_kind IN ('agent', 'owner', 'system', 'human'));

ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_activity_check;
ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_activity_check
  CHECK (activity IN (
    'knowledge_map', 'company_generation', 'develop', 'review', 'fix', 'qa', 'story_points'
  ));
