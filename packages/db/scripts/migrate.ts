/**
 * FrontDesk AI runtime database migration runner.
 *
 * Migrations are hand-written, sequential SQL files in packages/db/migrations
 * (0000_...sql → NNNN_...sql). They are applied in numeric order, one transaction
 * per file, and tracked in schema_migrations.
 *
 * Usage:
 *   DATABASE_URL="postgres://user:pass@host:5432/db" bun scripts/db/migrate.ts up
 *   DATABASE_URL="..." bun scripts/db/migrate.ts up 5      # apply up to version 5
 *   DATABASE_URL="..." bun scripts/db/migrate.ts status
 *   DATABASE_URL="..." bun scripts/db/migrate.ts down 5    # untrack versions > 5
 *
 * Notes:
 *  - `pg` is deliberately NOT used: the workspace already depends on `postgres`,
 *    and adding a second driver would duplicate the database stack.
 *  - The runner never rewrites applied migration files. If an already-applied file
 *    changes, its checksum no longer matches and the runner refuses to continue,
 *    because the database would silently diverge from the repository.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '..', 'migrations');
const LOG_PATH = join(HERE, '..', '..', '..', 'migrations.log');

const MIGRATION_FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/i;

export type Migration = {
  version: number;
  name: string;
  path: string;
  checksum: string;
};

export function listMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  if (!existsSync(dir)) {
    throw new Error(`Migrations directory does not exist: ${dir}`);
  }

  const migrations: Migration[] = [];
  for (const entry of readdirSync(dir)) {
    const match = MIGRATION_FILE.exec(entry);
    if (!match) continue;
    const path = join(dir, entry);
    const sql = readFileSync(path, 'utf-8');
    migrations.push({
      version: Number(match[1]),
      name: entry,
      path,
      checksum: createHash('sha256').update(sql, 'utf8').digest('hex'),
    });
  }

  migrations.sort((a, b) => a.version - b.version);

  for (let i = 1; i < migrations.length; i += 1) {
    if (migrations[i].version === migrations[i - 1].version) {
      throw new Error(
        `Duplicate migration version ${migrations[i].version}: ${migrations[i - 1].name} and ${migrations[i].name}`
      );
    }
  }

  return migrations;
}

function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    appendFileSync(LOG_PATH, line + '\n');
  } catch {
    // Logging to the file is best-effort; never fail a migration over it.
  }
}

type AppliedRow = {
  version: number;
  name: string;
  checksum: string | null;
  failed_at: string | null;
  error: string | null;
};

/** schema_migrations is tooling state, so it is created/tolerated within the runner. */
async function ensureLedger(sql: { unsafe: (q: string) => Promise<unknown> }) {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text,
      checksum text,
      applied_at timestamptz NOT NULL DEFAULT now(),
      failed_at timestamptz,
      error text
    );
  `);
  // Tolerate the older ledger shape so an existing database is never wedged.
  for (const column of ['name text', 'checksum text', 'failed_at timestamptz', 'error text']) {
    await sql.unsafe(`ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS ${column};`);
  }
}

function connectionString(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL is required (the Supabase Postgres connection string). It is never read from a file in this runner.'
    );
  }
  return url;
}

async function open() {
  const { default: postgres } = await import('postgres');
  const url = connectionString();
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  return sql;
}

type Sql = Awaited<ReturnType<typeof open>>;

async function readApplied(sql: Sql): Promise<Map<number, AppliedRow>> {
  const rows = (await sql.unsafe(
    'SELECT version, name, checksum, failed_at::text AS failed_at, error FROM schema_migrations ORDER BY version'
  )) as unknown as AppliedRow[];
  const applied = new Map<number, AppliedRow>();
  for (const row of rows) {
    if (row.name) applied.set(Number(row.version), row);
  }
  return applied;
}

/**
 * A migration is "pending" until it has a ledger row without a failure. A failed
 * attempt keeps the row (with failed_at/error) so the failure stays visible and the
 * migration is retried on the next run.
 */
function partition(migrations: Migration[], applied: Map<number, AppliedRow>) {
  const pending: Migration[] = [];
  const drifted: string[] = [];

  for (const migration of migrations) {
    const row = applied.get(migration.version);
    if (!row) {
      pending.push(migration);
      continue;
    }
    // A failed migration never took effect, so it stays retryable and its file may
    // legitimately be fixed before the next attempt. Drift only matters once a
    // migration has actually been applied.
    if (row.failed_at) {
      pending.push(migration);
      continue;
    }
    if (row.checksum && row.checksum !== migration.checksum) {
      drifted.push(`${row.name} (applied) ≠ ${migration.name} (working tree)`);
    }
  }

  return { pending, drifted };
}

export async function runMigrations(argv: string[] = []) {
  const command = argv[0] ?? 'up';
  if (!['up', 'down', 'status'].includes(command)) {
    throw new Error(`Unknown command: ${command}. Expected up | down | status.`);
  }

  const targetArg = argv[1];
  const target = targetArg !== undefined ? Number(targetArg) : null;
  if (targetArg !== undefined && !Number.isInteger(target)) {
    throw new Error(`Target version must be an integer, received: ${targetArg}`);
  }

  const migrations = listMigrations();
  const sql = await open();

  try {
    await ensureLedger(sql as unknown as { unsafe: (q: string) => Promise<unknown> });
    const applied = await readApplied(sql);
    const { pending, drifted } = partition(migrations, applied);

    const driftMessage =
      'Already-applied migrations were modified; refusing to continue.\n' +
      drifted.map((d) => '  - ' + d).join('\n') +
      '\nAdd a new migration instead of editing an applied one.';

    if (command === 'status') {
      log(`Migrations on disk: ${migrations.length}`);
      for (const migration of migrations) {
        const row = applied.get(migration.version);
        const state = !row ? 'pending' : row.failed_at ? 'FAILED' : 'applied';
        log(`  ${migration.name} → ${state}${row?.error ? ' (' + row.error + ')' : ''}`);
      }
      if (drifted.length) log('WARNING: ' + driftMessage);
      return;
    }

    if (command === 'down') {
      // `down` is deliberately exempt from the drift check: it is the supported remedy
      // for untracking a migration that was never actually released.
      if (target === null) throw new Error('down requires a target version, e.g. `down 4`.');
      if (drifted.length) log('WARNING: untracking drifted migrations: ' + drifted.join('; '));
      const above = [...applied.values()].filter((row) => Number(row.version) > target);
      if (!above.length) {
        log(`Nothing tracked above version ${target}; no ledger rows removed.`);
        return;
      }
      // Versions come from our own ledger and are integers, so they are inlined safely.
      const versions = above.map((row) => Number(row.version)).join(',');
      await sql.unsafe(`DELETE FROM schema_migrations WHERE version IN (${versions})`);
      log(
        `Untracked ${above.length} migration(s) above version ${target}. ` +
          'No schema was reverted: this runner does not invent down-migrations, so revert structurally with a new forward migration.'
      );
      return;
    }

    if (drifted.length) throw new Error(driftMessage);

    if (!pending.length) {
      log(`No pending migrations (database is at version ${maxVersion(applied)}).`);
      return;
    }

    const queue = target === null ? pending : pending.filter((m) => m.version <= target);
    if (!queue.length) {
      log(`No pending migrations at or below version ${target}.`);
      return;
    }

    for (const migration of queue) {
      log(`Applying ${migration.name}`);
      const contents = readFileSync(migration.path, 'utf-8');
      try {
        await sql.begin(async (tx) => {
          await tx.unsafe(contents);
        });
        await sql.unsafe(
          `INSERT INTO schema_migrations (version, name, checksum, applied_at, failed_at, error)
           VALUES (${migration.version}, '${migration.name}', '${migration.checksum}', now(), NULL, NULL)
           ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, checksum = EXCLUDED.checksum,
             applied_at = now(), failed_at = NULL, error = NULL`
        );
        log(`Applied ${migration.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await sql.unsafe(
          `INSERT INTO schema_migrations (version, name, checksum, applied_at, failed_at, error)
           VALUES (${migration.version}, '${migration.name}', '${migration.checksum}', now(), now(), '${message.replace(/'/g, "''")}')
           ON CONFLICT (version) DO UPDATE SET failed_at = now(), error = EXCLUDED.error`
        );
        log(`ERROR applying ${migration.name}: ${message}`);
        throw new Error(`Migration ${migration.name} failed: ${message}`);
      }
    }

    const refreshed = await readApplied(sql);
    log(`Database is at version ${maxVersion(refreshed)}.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function maxVersion(applied: Map<number, AppliedRow>) {
  let max = 0;
  for (const row of applied.values()) {
    const version = Number(row.version);
    if (!row.failed_at && version > max) max = version;
  }
  return max;
}

if ((import.meta as { main?: boolean }).main) {
  runMigrations(process.argv.slice(2)).catch((error: unknown) => {
    log(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
