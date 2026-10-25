-- Re-apply the portable ticket-event purge and widen checks on databases that
-- already applied an earlier V17. Fresh installs get the same definitions from V17
-- plus this replacement, which is idempotent.

CREATE OR REPLACE FUNCTION aria_purge_ticket_events(target uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('aria.purge_ticket_events', '1', true);
  DELETE FROM ticket_events WHERE ticket_id = target;
  PERFORM set_config('aria.purge_ticket_events', '0', true);
END;
$$;

REVOKE ALL ON FUNCTION aria_purge_ticket_events(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ticket_events_allow_parent_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM aria_purge_ticket_events(OLD.id);
  RETURN OLD;
END;
$$;

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
