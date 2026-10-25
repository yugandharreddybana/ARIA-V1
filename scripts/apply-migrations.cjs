/**
 * Apply Flyway SQL in order and record flyway_schema_history with Flyway's
 * line-based CRC32 so a later Spring Boot start accepts the same files.
 *
 *   DATABASE_URL=postgresql://aria:aria@localhost:5432/aria_dev node scripts/apply-migrations.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
module.paths.unshift(path.join(__dirname, '../apps/middleware/node_modules'));
const { Client } = require('pg');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) | 0;
}

function flywayChecksum(sql) {
  let text = sql.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (text.endsWith('\n')) text = text.slice(0, -1);
  const lines = text.split('\n');
  return crc32(Buffer.from(lines.join(''), 'utf8'));
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const dir = path.join(__dirname, '../packages/db/flyway/migrations');
  const files = fs.readdirSync(dir).filter((name) => /^V\d+__.+\.sql$/.test(name)).sort((a, b) => {
    const va = Number(a.slice(1).split('__')[0]);
    const vb = Number(b.slice(1).split('__')[0]);
    return va - vb;
  });
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS flyway_schema_history (
      installed_rank INT NOT NULL PRIMARY KEY,
      version VARCHAR(50),
      description VARCHAR(200) NOT NULL,
      type VARCHAR(20) NOT NULL,
      script VARCHAR(1000) NOT NULL,
      checksum INT,
      installed_by VARCHAR(100) NOT NULL,
      installed_on TIMESTAMP NOT NULL DEFAULT NOW(),
      execution_time INT NOT NULL,
      success BOOLEAN NOT NULL
    )
  `);
  const applied = await client.query('SELECT version FROM flyway_schema_history WHERE success = true');
  const have = new Set(applied.rows.map((row) => String(row.version)));
  let rankRes = await client.query('SELECT COALESCE(MAX(installed_rank), 0) AS rank FROM flyway_schema_history');
  let rank = Number(rankRes.rows[0].rank);
  for (const file of files) {
    const version = String(Number(file.slice(1).split('__')[0]));
    if (have.has(version)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const description = file.split('__')[1].replace(/\.sql$/, '').replace(/_/g, ' ');
    const started = Date.now();
    await client.query('BEGIN');
    try {
      await client.query(sql);
      rank += 1;
      await client.query(
        `INSERT INTO flyway_schema_history
          (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success)
         VALUES ($1, $2, $3, 'SQL', $4, $5, current_user, $6, true)`,
        [rank, version, description, file, flywayChecksum(sql), Date.now() - started],
      );
      await client.query('COMMIT');
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }
  await client.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
