/**
 * Flyway is the database. Drizzle must describe the same columns.
 * This does not run drizzle-kit migrate.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skills = fs.readFileSync(path.join(root, 'packages/db/src/schema/skills.ts'), 'utf8');
const workspaces = fs.readFileSync(path.join(root, 'packages/db/src/schema/workspaces.ts'), 'utf8');
const knowledge = fs.readFileSync(path.join(root, 'packages/db/src/schema/knowledge.ts'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'packages/db/package.json'), 'utf8'));
const flyway = fs.readdirSync(path.join(root, 'packages/db/flyway/migrations')).filter((name) => name.endsWith('.sql')).sort().map((name) => fs.readFileSync(path.join(root, 'packages/db/flyway/migrations', name), 'utf8')).join('\n');

const failures = [];
function fail(message) { failures.push(message); }

if (/pgEnum\(/.test(skills) || /pgEnum\(/.test(workspaces)) {
  fail('Drizzle still declares pgEnum for skills or workspaces; Flyway stores those as TEXT');
}
const skillProject = skills.split('export const skills')[1]?.split('export const teamMembers')[0] ?? '';
if (/projectId:[^\n]*notNull\(/.test(skillProject)) {
  fail('skills.project_id is nullable in Flyway and notNull in Drizzle');
}
if (!/uniqueIndex\([^\)]*\)\.on\(t\.projectId,\s*t\.flowKey\)/.test(knowledge)) {
  fail('business_flows is missing UNIQUE(project_id, flow_key) in Drizzle');
}
if (!/llm_tier_models/.test(workspaces) || !/llm_tier_models/.test(flyway)) {
  fail('llm_tier_models must exist in both Drizzle and Flyway');
}
if (pkg.scripts?.migrate || pkg.scripts?.generate) {
  fail('packages/db must not expose drizzle-kit migrate or generate');
}
if (!/CREATE TABLE IF NOT EXISTS business_flows[\s\S]*UNIQUE \(project_id, flow_key\)/.test(flyway) && !/UNIQUE \(project_id, flow_key\)/.test(flyway)) {
  fail('Flyway is missing UNIQUE (project_id, flow_key)');
}

const required = ['agent_runs', 'flow_owners', 'ticket_events', 'ticket_reports', 'story_points'];
for (const name of required) {
  if (!flyway.includes(name)) fail(`Flyway is missing ${name}`);
}
const agentRuns = fs.readFileSync(path.join(root, 'packages/db/src/schema/agent-runs.ts'), 'utf8');
const flowOwners = fs.readFileSync(path.join(root, 'packages/db/src/schema/flow-owners.ts'), 'utf8');
if (!agentRuns.includes("pgTable('agent_runs'") || !agentRuns.includes("pgTable('ticket_events'") || !agentRuns.includes("pgTable('ticket_reports'")) {
  fail('Drizzle is missing agent run, ticket event, or ticket report tables');
}
if (!flowOwners.includes("pgTable('flow_owners'")) fail('Drizzle is missing flow_owners');
if (/owner_agent_id/.test(knowledge) || /owned_flow_ids/.test(skills) || /ownedFlowIds/.test(skills)) {
  fail('Drizzle still maps owner_agent_id or owned_flow_ids');
}
if (!/DROP COLUMN IF EXISTS owner_agent_id/.test(flyway) || !/DROP COLUMN IF EXISTS owned_flow_ids/.test(flyway)) {
  fail('Flyway does not drop owner_agent_id and owned_flow_ids');
}

if (failures.length) {
  console.error(failures.map((line) => `- ${line}`).join('\n'));
  process.exit(1);
}
console.log('schema drift check passed');
