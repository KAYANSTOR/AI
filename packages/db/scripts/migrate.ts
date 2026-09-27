import { readFileSync, existsSync, appendFileSync } from 'fs';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');
const DB_ROOT = join(__dirname, '..');
const LOG_PATH = join(DB_ROOT, 'migrations.log');

type RunState = {
  version: number;
  applied: string[];
  failed: string[];
};

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  appendFileSync(LOG_PATH, line);
  console.log(line.trim());
}

function getState(db: any): RunState {
  const q = db.query ? db.query : (() => ({ rows: [] }));
  const r = q({ sql: 'SELECT version, applied, failed FROM schema_migrations ORDER BY version' });
  if (r.error) {
    return { version: 0, applied: [], failed: [] };
  }
  const applied: string[] = [];
  const failed: string[] = [];
  for (const row of r.rows) {
    applied.push(row.applied || '');
    if (row.failed) failed.push(row.failed || '');
  }
  return { version: Number(r.rows.length > 0 ? r.rows[r.rows.length - 1].version : 0), applied, failed };
}

function listMigrationFiles(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory does not exist: ${MIGRATIONS_DIR}`);
  }
  const files = readFileSync(MIGRATIONS_DIR, 'utf-8').split('\n');
  const matched = files.filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(f.trim()));
  matched.sort((a, b) => a.localeCompare(b));
  return matched.map((f) => join(MIGRATIONS_DIR, f.trim()));
}

async function migrateTo(db: any, targetVersion?: number) {
  const state = getState(db);
  const files = listMigrationFiles();
  const appliedVersions = state.applied.map((a) => a.split('_')[0]);
  const pending = files.filter((f) => {
    const v = basename(f).split('_')[0];
    return !appliedVersions.includes(v);
  });
  if (pending.length === 0) {
    log(`No pending migrations (current version ${state.version}).`);
    return;
  }
  let remaining = targetVersion && targetVersion > 0 ? pending.slice(0, targetVersion) : pending;
  for (const file of remaining) {
    const name = basename(file);
    const version = name.split('_')[0];
    const fn = name.replace(extname(name), '');
    log(`Applying migration ${fn}`);
    const sql = readFileSync(file, 'utf-8');
    try {
      await db.query({ sql });
      log(`Applied ${fn}`);
      state.applied.push(name);
      state.version++;
    } catch (e: any) {
      log(`ERROR applying ${fn}: ${e.message}`);
      state.failed.push(name);
      throw new Error(`Migration ${fn} failed: ${e.message}`);
    }
  }
  const { rows } = await db.query({ sql: 'SELECT COALESCE(MAX(version), 0) AS ver FROM schema_migrations' });
  const currentMax = rows && rows.length ? Number(rows[0].ver) : 0;
  const newVersion = state.applied.length > 0 ? state.applied[state.applied.length - 1] : '';
  const insert = `INSERT INTO schema_migrations (version, applied, failed) VALUES ('${currentMax}', '${newVersion}', '${state.failed.join(',') || 'null'}') ON CONFLICT (version) DO UPDATE SET applied = EXCLUDED.applied, failed = EXCLUDED.failed;`;
  await db.query({ sql: insert });
  log(`Current schema version: ${currentMax}`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'up';
  const target = args.includes('up') ? Number(args[args.indexOf('up') + 1]) : 0;
  if (command !== 'up' && command !== 'down') {
    log(`Unknown command: ${command}`);
    console.log('Usage: bun run migrate [up|down] [targetVersion]');
    process.exit(1);
  }
  if (!existsSync(MIGRATIONS_DIR)) {
    log('Migrations directory not found.');
    process.exit(1);
  }
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query({ sql: `CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied text, failed text);` });
    if (command === 'down') {
      const state = getState(client);
      const files = listMigrationFiles();
      for (const file of files.reverse()) {
        const version = basename(file).split('_')[0];
        const applied = state.applied.includes(version);
        const failed = state.failed.includes(version);
        if (!applied && !failed) continue;
        const { rows } = await client.query({ sql: `SELECT version FROM schema_migrations WHERE applied = '${version}' ORDER BY version DESC LIMIT 1` });
        if (rows.length) {
          await client.query({ sql: `DELETE FROM schema_migrations WHERE version = ${rows[0].version};` });
          log(`Dropped schema version ${rows[0].version} (${version})`);
        }
      }
      log(`Schema rolled back to version ${getState(client).version}`);
      return;
    }
    await migrateTo(client, target > 0 ? target : undefined);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
