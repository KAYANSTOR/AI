import { getSql } from './pool'

/**
 * Catalog metadata the query builder needs: column types (for parameter casts),
 * primary keys (for upserts), foreign keys (for embedded relations) and function
 * signatures (for rpc calls). Loaded once per process from pg_catalog.
 */
export type ForeignKey = {
  name: string
  table: string
  columns: string[]
  refTable: string
  refColumns: string[]
}

export type FunctionArg = { name: string; type: string; hasDefault: boolean }

export type FunctionInfo = {
  name: string
  args: FunctionArg[]
  returnsSet: boolean
  returnType: string
  returnKind: 'scalar' | 'composite' | 'void' | 'record'
}

export type SchemaCache = {
  columns: Map<string, Map<string, string>>
  primaryKeys: Map<string, string[]>
  foreignKeys: ForeignKey[]
  functions: Map<string, FunctionInfo[]>
}

const globalForCache = globalThis as unknown as { __frontdeskSchema?: Promise<SchemaCache> }

async function load(): Promise<SchemaCache> {
  const sql = getSql()

  const columnRows = await sql.unsafe<{ tbl: string; col: string; type: string }[]>(`
    select c.relname as tbl, a.attname as col, format_type(a.atttypid, a.atttypmod) as type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','v','m','p','f')
      and a.attnum > 0 and not a.attisdropped
  `)

  const pkRows = await sql.unsafe<{ tbl: string; cols: string[] }[]>(`
    select c.relname as tbl,
           array_agg(a.attname order by array_position(i.indkey::int2[], a.attnum)) as cols
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
    where n.nspname = 'public' and i.indisprimary
    group by c.relname
  `)

  const fkRows = await sql.unsafe<
    { name: string; tbl: string; cols: string[]; ref_tbl: string; ref_cols: string[] }[]
  >(`
    select con.conname as name,
           src.relname as tbl,
           array(select attname from unnest(con.conkey) with ordinality k(attnum, ord)
                 join pg_attribute on attrelid = con.conrelid and pg_attribute.attnum = k.attnum
                 order by ord) as cols,
           dst.relname as ref_tbl,
           array(select attname from unnest(con.confkey) with ordinality k(attnum, ord)
                 join pg_attribute on attrelid = con.confrelid and pg_attribute.attnum = k.attnum
                 order by ord) as ref_cols
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_namespace sn on sn.oid = src.relnamespace
    join pg_class dst on dst.oid = con.confrelid
    join pg_namespace dn on dn.oid = dst.relnamespace
    where con.contype = 'f' and sn.nspname = 'public' and dn.nspname = 'public'
  `)

  const fnRows = await sql.unsafe<
    {
      name: string
      arg_names: string[] | null
      arg_types: string[] | null
      arg_modes: string[] | null
      n_defaults: number
      retset: boolean
      ret_type: string
      ret_kind: string
    }[]
  >(`
    select p.proname as name,
           p.proargnames as arg_names,
           array(select format_type(t, null) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) t) as arg_types,
           p.proargmodes::text[] as arg_modes,
           p.pronargdefaults as n_defaults,
           p.proretset as retset,
           format_type(p.prorettype, null) as ret_type,
           t.typtype::text as ret_kind
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public' and p.prokind = 'f'
  `)

  const columns = new Map<string, Map<string, string>>()
  for (const row of columnRows) {
    if (!columns.has(row.tbl)) columns.set(row.tbl, new Map())
    columns.get(row.tbl)!.set(row.col, row.type)
  }

  const primaryKeys = new Map<string, string[]>()
  for (const row of pkRows) primaryKeys.set(row.tbl, row.cols)

  const foreignKeys: ForeignKey[] = fkRows.map((row) => ({
    name: row.name,
    table: row.tbl,
    columns: row.cols,
    refTable: row.ref_tbl,
    refColumns: row.ref_cols,
  }))

  const functions = new Map<string, FunctionInfo[]>()
  for (const row of fnRows) {
    const names = row.arg_names ?? []
    const types = row.arg_types ?? []
    const modes = row.arg_modes ?? []
    const inputs: { name: string; type: string }[] = []
    types.forEach((type, index) => {
      const mode = modes[index] ?? 'i'
      if (mode === 'i' || mode === 'b' || mode === 'v') inputs.push({ name: names[index] ?? '', type })
    })
    const firstDefault = inputs.length - (row.n_defaults ?? 0)
    const info: FunctionInfo = {
      name: row.name,
      args: inputs.map((arg, index) => ({ ...arg, hasDefault: index >= firstDefault })),
      returnsSet: row.retset,
      returnType: row.ret_type,
      returnKind:
        row.ret_type === 'void'
          ? 'void'
          : row.ret_type === 'record'
            ? 'record'
            : row.ret_kind === 'c'
              ? 'composite'
              : 'scalar',
    }
    if (!functions.has(row.name)) functions.set(row.name, [])
    functions.get(row.name)!.push(info)
  }

  return { columns, primaryKeys, foreignKeys, functions }
}

export function getSchemaCache(): Promise<SchemaCache> {
  if (!globalForCache.__frontdeskSchema) {
    globalForCache.__frontdeskSchema = load().catch((error) => {
      globalForCache.__frontdeskSchema = undefined
      throw error
    })
  }
  return globalForCache.__frontdeskSchema
}

/** Drops the cached catalog, e.g. after migrations ran in the same process. */
export function resetSchemaCache() {
  globalForCache.__frontdeskSchema = undefined
}
