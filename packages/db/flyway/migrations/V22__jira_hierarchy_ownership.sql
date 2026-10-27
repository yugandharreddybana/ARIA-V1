-- M3B — Jira hierarchy, G/W/T AC, sprints, path ownership, event types.
-- Reserved as V22 (parallel with M3A V21). idea_card_id FK lands in V23.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS issue_type TEXT NOT NULL DEFAULT 'story'
    CHECK (issue_type IN ('epic','story','sub_task')),
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS epic_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS behaviour_notes TEXT,
  ADD COLUMN IF NOT EXISTS ui_affected BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ui_mock_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (ui_mock_status IN (
      'not_required','pending_designer','pending_po_sm','pending_owner',
      'changes_requested','approved')),
  ADD COLUMN IF NOT EXISTS api_contract JSONB,
  ADD COLUMN IF NOT EXISTS dor_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dod_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS readiness_status TEXT NOT NULL DEFAULT 'not_ready'
    CHECK (readiness_status IN ('not_ready','ready','blocked')),
  ADD COLUMN IF NOT EXISTS rollback_plan TEXT,
  ADD COLUMN IF NOT EXISTS sprint_id UUID,
  ADD COLUMN IF NOT EXISTS assignee_agent_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS predicted_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS idea_card_id UUID;

CREATE INDEX IF NOT EXISTS tickets_parent_idx ON tickets(parent_id);
CREATE INDEX IF NOT EXISTS tickets_epic_idx ON tickets(epic_id);
CREATE INDEX IF NOT EXISTS tickets_sprint_idx ON tickets(sprint_id);
CREATE INDEX IF NOT EXISTS tickets_assignee_agent_idx ON tickets(assignee_agent_id);
CREATE INDEX IF NOT EXISTS tickets_issue_type_idx ON tickets(issue_type);

CREATE TABLE IF NOT EXISTS ticket_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  to_ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN
    ('blocks','is_blocked_by','relates','contracts','duplicates')),
  contract_json JSONB,
  verified_at TIMESTAMPTZ,
  verified_by_agent_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_ticket_id, to_ticket_id, link_type)
);
CREATE INDEX IF NOT EXISTS ticket_links_to_idx ON ticket_links(to_ticket_id);

CREATE TABLE IF NOT EXISTS sprints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','active','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sprints_project_idx ON sprints(project_id, starts_on DESC);

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_sprint_fk;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_sprint_fk
  FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('owner','agent','system')),
  author_agent_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx ON ticket_comments(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'ui_mock_html','ui_mock_png','interaction_png','doc','other')),
  state_key TEXT,
  path_in_repo TEXT,
  content_type TEXT,
  bytes BYTEA,
  sha256 TEXT NOT NULL,
  created_by_agent_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ticket_attachments_mock_state_key CHECK (
    kind NOT IN ('ui_mock_html','ui_mock_png','interaction_png')
    OR (state_key IS NOT NULL AND length(trim(state_key)) > 0)
  )
);
CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_idx ON ticket_attachments(ticket_id);

CREATE TABLE IF NOT EXISTS path_owners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path_glob TEXT NOT NULL,
  layer TEXT NOT NULL CHECK (layer IN ('frontend','backend','fullstack','docs','other')),
  owner_agent_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  backup_agent_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'merged_pr'
    CHECK (source IN ('merged_pr','manual','flow_seed')),
  last_ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  last_pr_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, path_glob, layer)
);
CREATE INDEX IF NOT EXISTS path_owners_owner_idx ON path_owners(owner_agent_id);
CREATE INDEX IF NOT EXISTS path_owners_project_idx ON path_owners(project_id);

CREATE TABLE IF NOT EXISTS ownership_handoffs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path_owner_id UUID REFERENCES path_owners(id) ON DELETE SET NULL,
  flow_id UUID REFERENCES business_flows(id) ON DELETE SET NULL,
  from_agent_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  to_agent_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (reason IN ('owner_off','wip_exceeded','user_reassign','agent_deleted')),
  handover_md TEXT NOT NULL,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ownership_handoffs_project_idx ON ownership_handoffs(project_id, created_at DESC);

ALTER TABLE ticket_events DROP CONSTRAINT IF EXISTS ticket_events_event_type_check;
ALTER TABLE ticket_events ADD CONSTRAINT ticket_events_event_type_check
  CHECK (event_type IN (
    'status_change','agent_action','progress','communication','run_ref',
    'owner_decision','schedule','evidence',
    'mock_review','dep_verify','ceremony_ref','security_finding',
    'agent_message','ownership_handoff','learning_proposal','readiness'));
