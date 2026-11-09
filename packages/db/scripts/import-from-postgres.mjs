#!/usr/bin/env node
/**
 * Copies all application data from an existing Postgres database (for example the
 * previous Supabase project) into the FrontDesk database.
 *
 *   SOURCE_DATABASE_URL=postgres://...  DATABASE_URL=postgres://...  \
 *     node packages/db/scripts/import-from-postgres.mjs [--dry-run] [--allow-non-empty]
 *
 * Behaviour
 *  - The target must already be migrated (`npm run db:migrate`).
 *  - Account rows are copied from auth.users (id, email, bcrypt password hash, metadata),
 *    so existing users keep signing in with their current password.
 *  - Every table that exists in both public schemas is copied, using only the columns
 *    present on both sides. Generated columns are skipped, identity values are kept.
 *  - Triggers and FK checks are disabled for the session (session_replication_role =
 *    replica) so table order does not matter; everything runs in one transaction.
 *  - Rows already present in the target (same primary key) are kept untouched, so
 *    reference data seeded by migrations is never duplicated.
 *  - Sequences are moved past the imported values and row counts are verified.
 *  - The source is only read, never written.
 */
import postgres from 'postgres'

const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const ALLOW_NON_EMPTY = args.has('--allow-non-empty')

const SOURCE_URL = process.env.SOURCE_DATABASE_URL
const TARGET_URL = process.env.DATABASE_URL
if (!SOURCE_URL || !TARGET_URL) {
  console.error('SOURCE_DATABASE_URL and DATABASE_URL are required.')
  process.exit(1)
}
if (SOURCE_URL === TARGET_URL) {
  console.error('Source and target must be different databases.')
  process.exit(1)
}

const SKIP_TABLES = new Set(['schema_migrations'])
const AUTH_COLUMNS = [
  'id',
  'email',
  'encrypted_password',
  'email_confirmed_at',
  'raw_user_meta_data',
  'raw_app_meta_data',
  'created_at',
  'updated_at',
  'last_sign_in_at',
  'banned_until',
  'deleted_at',
]

function sslFor(url) {
  try {
    const host = new URL(url).hostname
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.railway.internal')) return false
  } catch {
    /* fall through */
  }
  return 'require'
}

const source = postgres(SOURCE_URL, { ssl: sslFor(SOURCE_URL), max: 1, prepare: false, onnotice: () => {} })
const target = postgres(TARGET_URL, { ssl: sslFor(TARGET_URL), max: 1, onnotice: () => {} })

const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`)
const ident = (name) => `"${String(name).replaceAll('"', '""')}"`

async function tables(sql) {
  const rows = await sql`
    select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
    order by c.relname`
  return rows.map((r) => r.name)
}

async function columns(sql, schema, table) {
  const rows = await sql`
    select a.attname as name, a.attgenerated <> '' as generated, a.attidentity <> '' as identity
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = ${schema} and c.relname = ${table} and a.attnum > 0 and not a.attisdropped
    order by a.attnum`
  return rows
}

async function primaryKey(sql, schema, table) {
  const rows = await sql`
    select a.attname as name
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
    where i.indisprimary and n.nspname = ${schema} and c.relname = ${table}`
  return rows.map((r) => r.name)
}

const VOLATILE_COLUMNS = new Set(['created_at', 'updated_at'])

async function count(sql, schema, table) {
  const [{ n }] = await sql.unsafe(`select count(*)::bigint as n from ${ident(schema)}.${ident(table)}`)
  return Number(n)
}

async function copyTable(tx, schema, table, cols, hasIdentity, pk) {
  const list = cols.map(ident).join(', ')
  const qualified = `${ident(schema)}.${ident(table)}`
  const staging = ident(`_import_${table}`.slice(0, 60))

  await tx.unsafe(`create temp table ${staging} (like ${qualified} including defaults) on commit drop`)
  // The staging table must accept every source column, including generated ones we skip.
  const readable = await source.unsafe(`copy (select ${list} from ${qualified}) to stdout`).readable()
  const writable = await tx.unsafe(`copy ${staging} (${list}) from stdin`).writable()
  await new Promise((resolve, reject) => {
    readable.on('error', reject)
    writable.on('error', reject)
    writable.on('finish', resolve)
    readable.pipe(writable)
  })

  // Reference rows seeded by migrations carry their own random ids. When the source holds
  // the same content, the source row wins so foreign keys in the imported data stay valid.
  const content = cols.filter((c) => !pk.includes(c) && !VOLATILE_COLUMNS.has(c))
  if (pk.length && content.length) {
    const row = (alias) => `row(${content.map((c) => `${alias}.${ident(c)}`).join(', ')})`
    await tx.unsafe(
      `delete from ${qualified} t using ${staging} s where ${row('t')} is not distinct from ${row('s')}`
    )
  }

  const overriding = hasIdentity ? 'overriding system value' : ''
  const result = await tx.unsafe(
    `insert into ${qualified} (${list}) ${overriding} select ${list} from ${staging} on conflict do nothing`
  )
  await tx.unsafe(`drop table ${staging}`)
  return result.count
}

async function resetSequences(tx) {
  const seqs = await tx`
    select s.relname as seq, t.relname as tbl, a.attname as col, n.nspname as schema
    from pg_class s
    join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
    join pg_class t on t.oid = d.refobjid
    join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
    join pg_namespace n on n.oid = s.relnamespace
    where s.relkind = 'S' and n.nspname = 'public'`
  for (const { seq, tbl, col, schema } of seqs) {
    await tx.unsafe(
      `select setval('${ident(schema)}.${ident(seq)}', greatest(coalesce((select max(${ident(col)}) from ${ident(schema)}.${ident(tbl)}), 0), 1))`
    )
  }
  return seqs.length
}

async function main() {
  const [srcVersion] = await source`select current_setting('server_version') as v`
  log(`Source Postgres ${srcVersion.v}`)

  const targetUsers = await count(target, 'auth', 'users')
  if (targetUsers > 0 && !ALLOW_NON_EMPTY) {
    throw new Error(
      `Target already has ${targetUsers} account(s). Use --allow-non-empty to merge into a non-empty database.`
    )
  }

  const sourceTables = new Set(await tables(source))
  const targetTables = await tables(target)
  const shared = targetTables.filter((t) => sourceTables.has(t) && !SKIP_TABLES.has(t))
  const onlySource = [...sourceTables].filter((t) => !targetTables.includes(t) && !SKIP_TABLES.has(t))
  if (onlySource.length) log(`Tables only in source (not copied): ${onlySource.join(', ')}`)

  const plan = []
  const srcAuth = new Set((await columns(source, 'auth', 'users')).map((c) => c.name))
  plan.push({ schema: 'auth', table: 'users', cols: AUTH_COLUMNS.filter((c) => srcAuth.has(c)), identity: false, pk: [] })

  for (const table of shared) {
    const [src, dst] = await Promise.all([columns(source, 'public', table), columns(target, 'public', table)])
    const srcNames = new Set(src.map((c) => c.name))
    const usable = dst.filter((c) => !c.generated && srcNames.has(c.name))
    const missing = src.filter((c) => !dst.some((d) => d.name === c.name)).map((c) => c.name)
    if (missing.length) log(`  ${table}: source-only columns skipped: ${missing.join(', ')}`)
    plan.push({
      schema: 'public',
      table,
      cols: usable.map((c) => c.name),
      identity: usable.some((c) => c.identity),
      pk: await primaryKey(target, 'public', table),
    })
  }

  const sourceCounts = {}
  for (const item of plan) sourceCounts[`${item.schema}.${item.table}`] = await count(source, item.schema, item.table)
  const totalRows = Object.values(sourceCounts).reduce((a, b) => a + b, 0)
  log(`${plan.length} tables, ${totalRows} rows in source.`)

  if (DRY_RUN) {
    for (const [name, n] of Object.entries(sourceCounts)) if (n) console.log(`  ${name}: ${n}`)
    log('Dry run: nothing written.')
    return
  }

  await target.begin(async (tx) => {
    await tx`set local session_replication_role = replica`
    for (const item of plan) {
      const key = `${item.schema}.${item.table}`
      if (!sourceCounts[key] || !item.cols.length) continue
      const inserted = await copyTable(tx, item.schema, item.table, item.cols, item.identity, item.pk)
      log(`  ${key}: ${inserted}/${sourceCounts[key]} rows inserted`)
    }
    const n = await resetSequences(tx)
    log(`Sequences adjusted: ${n}`)
  })

  let mismatches = 0
  for (const item of plan) {
    const key = `${item.schema}.${item.table}`
    const after = await count(target, item.schema, item.table)
    if (after < sourceCounts[key]) {
      mismatches++
      console.error(`  MISMATCH ${key}: source ${sourceCounts[key]}, target ${after}`)
    }
  }
  if (mismatches) throw new Error(`${mismatches} table(s) have fewer rows than the source.`)
  log('Import complete; every table has at least the source row count.')
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await Promise.allSettled([source.end({ timeout: 5 }), target.end({ timeout: 5 })])
  })
