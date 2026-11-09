#!/usr/bin/env node
/**
 * KAYAN AI database migration runner.
 *
 *   DATABASE_URL=postgres://... node packages/db/scripts/migrate.mjs up        # bootstrap + pending migrations
 *   DATABASE_URL=postgres://... node packages/db/scripts/migrate.mjs up 12     # up to version 12
 *   DATABASE_URL=postgres://... node packages/db/scripts/migrate.mjs status
 *   DATABASE_URL=postgres://... node packages/db/scripts/migrate.mjs down 12   # untrack versions > 12
 *
 * Migrations are sequential SQL files (0000_name.sql …) applied in order, one
 * transaction each, tracked in public.schema_migrations with a checksum. An applied
 * migration that was edited afterwards stops the run: add a new migration instead.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MIGRATIONS_DIR = join(ROOT, 'migrations')
const BOOTSTRAP = join(ROOT, 'bootstrap.sql')
const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/i
const LOCK = `hashtext('frontdesk_schema_migrations')`

const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`)

export function listMigrations(dir = MIGRATIONS_DIR) {
  if (!existsSync(dir)) throw new Error(`Migrations directory does not exist: ${dir}`)
  const migrations = readdirSync(dir)
    .map((entry) => ({ entry, match: FILE_PATTERN.exec(entry) }))
    .filter(({ match }) => match)
    .map(({ entry, match }) => {
      const path = join(dir, entry)
      return {
        version: Number(match[1]),
        name: entry,
        path,
        checksum: createHash('sha256').update(readFileSync(path, 'utf-8'), 'utf8').digest('hex'),
      }
    })
    .sort((a, b) => a.version - b.version)

  migrations.forEach((migration, index) => {
    if (migration.version !== index) {
      throw new Error(`Migration versions must be contiguous from 0000; found ${migration.name} at position ${index}.`)
    }
  })
  return migrations
}

function resolveSsl(url) {
  const override = process.env.DATABASE_SSL?.trim().toLowerCase()
  if (override === 'require') return 'require'
  if (override === 'disable' || override === 'false') return false
  const host = new URL(url).hostname
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.railway.internal') ? false : 'require'
}

async function ensureLedger(sql) {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version integer PRIMARY KEY,
      name text,
      checksum text,
      applied_at timestamptz NOT NULL DEFAULT now(),
      failed_at timestamptz,
      error text
    )`)
}

async function readApplied(sql) {
  const rows = await sql.unsafe(
    'SELECT version, name, checksum, failed_at::text AS failed_at, error FROM public.schema_migrations ORDER BY version'
  )
  return new Map(rows.map((row) => [Number(row.version), row]))
}

export async function runMigrations(argv = []) {
  const [command = 'up', targetArg] = argv
  if (!['up', 'down', 'status'].includes(command)) throw new Error(`Unknown command "${command}". Use up | down | status.`)
  const target = targetArg === undefined ? null : Number(targetArg)
  if (targetArg !== undefined && !Number.isInteger(target)) throw new Error(`Invalid target version: ${targetArg}`)

  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL is required.')

  const migrations = listMigrations()
  const sql = postgres(url, { max: 1, ssl: resolveSsl(url), onnotice: () => undefined })

  try {
    await sql.unsafe(`SELECT pg_advisory_lock(${LOCK})`)
    await ensureLedger(sql)
    const applied = await readApplied(sql)

    const pending = []
    const drifted = []
    for (const migration of migrations) {
      const row = applied.get(migration.version)
      if (!row || row.failed_at) pending.push(migration)
      else if (row.checksum && row.checksum !== migration.checksum) drifted.push(migration.name)
    }

    if (command === 'status') {
      for (const migration of migrations) {
        const row = applied.get(migration.version)
        log(`${migration.name} → ${!row ? 'pending' : row.failed_at ? `FAILED (${row.error})` : 'applied'}`)
      }
      if (drifted.length) log(`WARNING: modified after being applied: ${drifted.join(', ')}`)
      return
    }

    if (command === 'down') {
      if (target === null) throw new Error('down requires a target version, e.g. `down 12`.')
      const removed = await sql.unsafe('DELETE FROM public.schema_migrations WHERE version > $1 RETURNING version', [target])
      log(`Untracked ${removed.length} migration(s) above ${target}. No schema was reverted; write a forward migration to undo changes.`)
      return
    }

    if (drifted.length) {
      throw new Error(`Applied migrations were modified: ${drifted.join(', ')}. Add a new migration instead.`)
    }

    log('Applying bootstrap.sql')
    await sql.begin((tx) => tx.unsafe(readFileSync(BOOTSTRAP, 'utf-8')))

    const queue = target === null ? pending : pending.filter((migration) => migration.version <= target)
    if (!queue.length) log('No pending migrations.')

    for (const migration of queue) {
      log(`Applying ${migration.name}`)
      try {
        await sql.begin(async (tx) => {
          await tx.unsafe(readFileSync(migration.path, 'utf-8'))
          await tx.unsafe(
            `INSERT INTO public.schema_migrations (version, name, checksum, applied_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, checksum = EXCLUDED.checksum,
               applied_at = now(), failed_at = NULL, error = NULL`,
            [migration.version, migration.name, migration.checksum]
          )
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await sql.unsafe(
          `INSERT INTO public.schema_migrations (version, name, checksum, applied_at, failed_at, error)
           VALUES ($1, $2, $3, now(), now(), $4)
           ON CONFLICT (version) DO UPDATE SET failed_at = now(), error = EXCLUDED.error`,
          [migration.version, migration.name, migration.checksum, message]
        )
        throw new Error(`Migration ${migration.name} failed: ${message}`)
      }
    }

    // Re-run grants so objects created by migrations are reachable by the request roles.
    await sql.begin((tx) => tx.unsafe(readFileSync(BOOTSTRAP, 'utf-8')))
    const latest = Math.max(-1, ...[...(await readApplied(sql)).values()].filter((r) => !r.failed_at).map((r) => Number(r.version)))
    log(`Database is at version ${String(latest).padStart(4, '0')}.`)
  } finally {
    await sql.unsafe(`SELECT pg_advisory_unlock(${LOCK})`).catch(() => undefined)
    await sql.end({ timeout: 5 })
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations(process.argv.slice(2)).catch((error) => {
    console.error(`FATAL: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
