-- Re-apply the ticket-event purge for databases that already ran V17.
-- DELETE is allowed only for a parent BEFORE DELETE whose client query is a
-- top-level DELETE FROM workspaces, projects, or tickets. A temporary-table
-- trigger does not match. The table owner can still DISABLE TRIGGER. This
-- migration does not CREATE ROLE. A session GUC is not consulted.

CREATE OR REPLACE FUNCTION ticket_events_from_parent_delete() RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  src text := current_query();
  i int := 1;
  n int := char_length(src);
  out text := '';
  ch text;
  tag text;
BEGIN
  WHILE i <= n LOOP
    ch := substr(src, i, 1);
    IF substr(src, i, 2) = '--' THEN
      i := i + 2;
      WHILE i <= n AND substr(src, i, 1) <> E'\n' LOOP
        i := i + 1;
      END LOOP;
    ELSIF substr(src, i, 2) = '/*' THEN
      i := i + 2;
      WHILE i < n AND substr(src, i, 2) <> '*/' LOOP
        i := i + 1;
      END LOOP;
      i := i + 2;
    ELSIF ch = '''' THEN
      i := i + 1;
      WHILE i <= n LOOP
        IF substr(src, i, 2) = '''''' THEN
          i := i + 2;
        ELSIF substr(src, i, 1) = '''' THEN
          i := i + 1;
          EXIT;
        ELSE
          i := i + 1;
        END IF;
      END LOOP;
      out := out || ' ';
    ELSIF ch = '$' AND substring(substr(src, i, 64) FROM '^\$[A-Za-z0-9_]*\$') IS NOT NULL THEN
      tag := substring(substr(src, i, 64) FROM '^\$[A-Za-z0-9_]*\$');
      i := i + char_length(tag);
      WHILE i <= n AND substr(src, i, char_length(tag)) IS DISTINCT FROM tag LOOP
        i := i + 1;
      END LOOP;
      i := i + char_length(tag);
      out := out || ' ';
    ELSE
      out := out || ch;
      i := i + 1;
    END IF;
  END LOOP;
  RETURN btrim(out) ~* '^delete[[:space:]]+from[[:space:]]+(only[[:space:]]+)?(public[[:space:]]*\.[[:space:]]*)?(tickets|projects|workspaces)\M[^;]*$';
END;
$$;

CREATE OR REPLACE FUNCTION ticket_events_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'ticket_events is append-only' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() <= 1 OR NOT ticket_events_from_parent_delete() THEN
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
