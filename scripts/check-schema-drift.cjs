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

const required = ['agent_runs', 'flow_owners', 'ticket_events', 'ticket_reports', 'story_points', 'provider_credentials', 'runtime_kinds'];
for (const name of required) {
  if (!flyway.includes(name)) fail(`Flyway is missing ${name}`);
}
if (!/agent_runs_runtime_fk/.test(flyway)) fail('Flyway is missing agent_runs_runtime_fk');
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

function normalizeSqlType(text) {
  const raw = String(text).replace(/\(.*?\)/g, ' ').trim().toLowerCase();
  if (raw.startsWith('timestamp with time zone') || raw.startsWith('timestamptz')) return 'timestamptz';
  if (raw.startsWith('timestamp')) return 'timestamp';
  const token = raw.split(/\s+/)[0];
  if (token === 'uuid') return 'uuid';
  if (token === 'text' || token === 'varchar' || token === 'character' || token === 'char') return 'text';
  if (token === 'boolean' || token === 'bool') return 'bool';
  if (token === 'integer' || token === 'int' || token === 'int4' || token === 'serial' || token === 'smallint' || token === 'int2') return 'int';
  if (token === 'bigint' || token === 'int8' || token === 'bigserial') return 'bigint';
  if (token === 'jsonb' || token === 'json') return 'jsonb';
  if (token === 'numeric' || token === 'decimal') return 'numeric';
  if (token === 'double' || token === 'float8' || token === 'real' || token === 'float4') return 'float';
  return null;
}

function columnSpec(text) {
  return {
    notNull: /\bNOT NULL\b/i.test(text),
    references: /\bREFERENCES\b/i.test(text),
    type: normalizeSqlType(text),
    unique: /\bUNIQUE\b/i.test(text),
  };
}

function drizzleType(block) {
  if (/customType\(/.test(block)) return null;
  if (/\buuid\(/.test(block)) return 'uuid';
  if (/\btext\(/.test(block) || /\bvarchar\(/.test(block)) return 'text';
  if (/\bboolean\(/.test(block)) return 'bool';
  if (/\bbigint\(/.test(block)) return 'bigint';
  if (/\binteger\(/.test(block) || /\bsmallint\(/.test(block)) return 'int';
  if (/\bjsonb\(/.test(block) || /\bjson\(/.test(block)) return 'jsonb';
  if (/\btimestamp\(/.test(block)) return /withTimezone:\s*true/.test(block) ? 'timestamptz' : 'timestamp';
  if (/\bnumeric\(/.test(block) || /\bdecimal\(/.test(block)) return 'numeric';
  if (/\bdoublePrecision\(/.test(block) || /\breal\(/.test(block)) return 'float';
  return null;
}

function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')' && depth > 0) depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function drizzleTables(source) {
  const tables = new Map();
  const starts = [...source.matchAll(/pgTable\('([a-z0-9_]+)',\s*\{/g)];
  for (const start of starts) {
    const name = start[1];
    const from = start.index + start[0].length;
    let depth = 1;
    let to = from;
    while (to < source.length && depth > 0) {
      const ch = source[to];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      to += 1;
    }
    const body = source.slice(from, to - 1);
    const columns = new Map();
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(/^\s*\w+:\s*[A-Za-z0-9_$.]+\('([a-z0-9_]+)'/);
      if (!match) continue;
      let block = lines[i];
      while (!/,\s*$/.test(block.trim()) && i + 1 < lines.length && !/^\s*\w+:/.test(lines[i + 1])) {
        i += 1;
        block += lines[i];
      }
      columns.set(match[1], {
        notNull: block.includes('.notNull('),
        references: block.includes('.references('),
        type: drizzleType(block),
        unique: /\.unique\(/.test(block),
      });
    }
    tables.set(name, columns);
  }
  return tables;
}

function flywayTables(sql) {
  const stripped = sql.replace(/--[^\n]*/g, '');
  const tables = new Map();
  const ensure = (name) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  };
  const createRe = /CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z0-9_]+)\s*\(/gi;
  let create = createRe.exec(stripped);
  while (create) {
    const columns = ensure(create[1]);
    let i = create.index + create[0].length;
    let depth = 1;
    let body = '';
    while (i < stripped.length && depth > 0) {
      const ch = stripped[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      if (depth > 0) body += ch;
      i += 1;
    }
    for (const part of splitTopLevel(body)) {
      const line = part.trim();
      if (!line || /^(PRIMARY|UNIQUE|CONSTRAINT|CHECK|FOREIGN)\b/i.test(line)) continue;
      const match = line.match(/^([a-z0-9_]+)\s+/i);
      if (!match) continue;
      columns.set(match[1].toLowerCase(), columnSpec(line.slice(match[0].length)));
    }
    create = createRe.exec(stripped);
  }
  const alterRe = /ALTER TABLE(?: IF EXISTS)?\s+([a-z0-9_]+)\s+([\s\S]*?);/gi;
  let alter = alterRe.exec(stripped);
  while (alter) {
    const table = alter[1].toLowerCase();
    const body = alter[2];
    const columns = ensure(table);
    for (const added of body.matchAll(/ADD COLUMN(?: IF NOT EXISTS)?\s+([a-z0-9_]+)\s+([^,]+)/gi)) {
      columns.set(added[1].toLowerCase(), columnSpec(added[2]));
    }
    for (const dropped of body.matchAll(/DROP COLUMN(?: IF EXISTS)?\s+([a-z0-9_]+)/gi)) {
      columns.delete(dropped[1].toLowerCase());
    }
    for (const setNull of body.matchAll(/ALTER COLUMN\s+([a-z0-9_]+)\s+SET NOT NULL/gi)) {
      const current = columns.get(setNull[1].toLowerCase()) || { notNull: false, references: false };
      columns.set(setNull[1].toLowerCase(), { ...current, notNull: true });
    }
    for (const dropNull of body.matchAll(/ALTER COLUMN\s+([a-z0-9_]+)\s+DROP NOT NULL/gi)) {
      const current = columns.get(dropNull[1].toLowerCase()) || { notNull: false, references: false };
      columns.set(dropNull[1].toLowerCase(), { ...current, notNull: false });
    }
    for (const fk of body.matchAll(/FOREIGN KEY\s*\(([a-z0-9_]+)\)\s*REFERENCES/gi)) {
      const current = columns.get(fk[1].toLowerCase()) || { notNull: false, references: false };
      columns.set(fk[1].toLowerCase(), { ...current, references: true });
    }
    alter = alterRe.exec(stripped);
  }
  return tables;
}

const drizzle = new Map();
for (const file of fs.readdirSync(path.join(root, 'packages/db/src/schema')).filter((name) => name.endsWith('.ts'))) {
  for (const [name, columns] of drizzleTables(fs.readFileSync(path.join(root, 'packages/db/src/schema', file), 'utf8'))) {
    drizzle.set(name, columns);
  }
}
const flywayColumns = flywayTables(flyway);
for (const [table, columns] of flywayColumns) {
  if (!drizzle.has(table) || columns.size === 0) continue;
  const mirror = drizzle.get(table);
  for (const [column, spec] of columns) {
    const other = mirror.get(column);
    if (!other) {
      fail(`${table}.${column} is in Flyway and missing from Drizzle`);
      continue;
    }
    if (spec.notNull && !other.notNull) {
      fail(`${table}.${column} is NOT NULL in Flyway and nullable in Drizzle`);
    }
    if (spec.references !== other.references) fail(`${table}.${column} foreign key differs`);
    if (spec.type && other.type && spec.type !== other.type) {
      fail(`${table}.${column} type is ${spec.type} in Flyway and ${other.type} in Drizzle`);
    }
  }
}

function uniqueSets(sql) {
  const sets = new Map();
  const add = (table, cols) => {
    const key = table.toLowerCase();
    const list = sets.get(key) || [];
    list.push(cols.map((col) => col.toLowerCase()).sort().join(','));
    sets.set(key, list);
  };
  const stripped = sql.replace(/--[^\n]*/g, '');
  for (const match of stripped.matchAll(/CREATE UNIQUE INDEX(?: IF NOT EXISTS)?\s+\S+\s+ON\s+([a-z0-9_]+)\s*\(([^)]+)\)/gi)) {
    add(match[1], match[2].split(',').map((col) => col.trim().split(/\s+/)[0]));
  }
  for (const match of stripped.matchAll(/ALTER TABLE(?: IF EXISTS)?\s+([a-z0-9_]+)[\s\S]*?UNIQUE\s*\(([^)]+)\)/gi)) {
    add(match[1], match[2].split(',').map((col) => col.trim()));
  }
  const createRe = /CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z0-9_]+)\s*\(/gi;
  let create = createRe.exec(stripped);
  while (create) {
    let i = create.index + create[0].length;
    let depth = 1;
    let body = '';
    while (i < stripped.length && depth > 0) {
      const ch = stripped[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      if (depth > 0) body += ch;
      i += 1;
    }
    for (const part of splitTopLevel(body)) {
      const unique = part.match(/\bUNIQUE\s*\(([^)]+)\)/i);
      if (unique) add(create[1], unique[1].split(',').map((col) => col.trim().split(/\s+/)[0]));
      else if (/\bUNIQUE\b/i.test(part)) {
        const name = part.trim().match(/^([a-z0-9_]+)\s+/i);
        if (name) add(create[1], [name[1]]);
      }
    }
    create = createRe.exec(stripped);
  }
  return sets;
}

const flywayUnique = uniqueSets(flyway);
for (const file of fs.readdirSync(path.join(root, 'packages/db/src/schema')).filter((name) => name.endsWith('.ts'))) {
  const source = fs.readFileSync(path.join(root, 'packages/db/src/schema', file), 'utf8');
  const props = new Map();
  for (const match of source.matchAll(/(\w+):\s*[A-Za-z0-9_$.]+\('([a-z0-9_]+)'/g)) props.set(match[1], match[2]);
  // Limit the scan to each table's own index callback so later uniqueIndex
  // declarations are not attributed to an earlier pgTable in the same file.
  for (const match of source.matchAll(/pgTable\('([a-z0-9_]+)',\s*\{[\s\S]*?\},\s*\(t\)\s*=>\s*\(\{([\s\S]*?)\}\)\s*\)/g)) {
    for (const uidx of match[2].matchAll(/uniqueIndex\([^)]*\)\.on\(([^)]+)\)/g)) {
      const cols = [...uidx[1].matchAll(/t\.(\w+)/g)].map((hit) => props.get(hit[1]) || hit[1].toLowerCase()).sort().join(',');
      const have = new Set(flywayUnique.get(match[1]) || []);
      if (!have.has(cols)) fail(`${match[1]} is missing unique index (${cols}) in Flyway`);
    }
  }
}

if (failures.length) {
  console.error(failures.map((line) => `- ${line}`).join('\n'));
  process.exit(1);
}
console.log('schema drift check passed');
