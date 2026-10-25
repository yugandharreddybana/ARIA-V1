-- Flow ownership has one source of truth. The old columns are backfilled, then dropped.

CREATE TABLE IF NOT EXISTS flow_owners (
  flow_id    UUID NOT NULL REFERENCES business_flows(id) ON DELETE CASCADE,
  agent_id   UUID NOT NULL REFERENCES skills(id)         ON DELETE CASCADE,
  layer      TEXT NOT NULL CHECK (layer IN ('frontend','backend','fullstack')),
  role       TEXT NOT NULL CHECK (role IN ('owner','backup')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (flow_id, layer, role)
);
CREATE INDEX IF NOT EXISTS idx_flow_owners_agent ON flow_owners(agent_id);

INSERT INTO flow_owners (flow_id, agent_id, layer, role)
SELECT f.id, f.owner_agent_id,
       CASE s.role_key WHEN 'frontend' THEN 'frontend' WHEN 'backend' THEN 'backend' ELSE 'fullstack' END,
       'owner'
  FROM business_flows f JOIN skills s ON s.id = f.owner_agent_id
ON CONFLICT DO NOTHING;
INSERT INTO flow_owners (flow_id, agent_id, layer, role)
SELECT f.id, f.backup_agent_id, o.layer, 'backup'
  FROM business_flows f JOIN flow_owners o ON o.flow_id = f.id AND o.role = 'owner'
 WHERE f.backup_agent_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE business_flows DROP COLUMN IF EXISTS owner_agent_id, DROP COLUMN IF EXISTS backup_agent_id;
ALTER TABLE skills DROP COLUMN IF EXISTS owned_flow_ids;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES business_flows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS layer TEXT CHECK (layer IN ('frontend','backend','fullstack'));
