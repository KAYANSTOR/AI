/**
 * A PostgREST-compatible query builder that compiles to SQL and runs on the
 * application's own Postgres pool.
 *
 * The data-access code was written against the PostgREST call shape
 * (`from(t).select(...).eq(...)`). Keeping that shape lets every query stay as it is
 * while the transport changes from HTTP to a direct connection. Row-level security is
 * still enforced by Postgres: each statement runs inside a transaction that switches
 * to the caller's database role and publishes the caller's claims, so `auth.uid()`
 * and every RLS policy behave exactly as before.
 *
 * Results are serialized by Postgres (`json_agg`), which keeps PostgREST's wire format:
 * numerics as numbers, timestamps as ISO strings, embedded relations as objects/arrays.
 */
import type { Sql, TransactionSql } from 'postgres'
import { getSchemaCache, type ForeignKey, type FunctionInfo, type SchemaCache } from './schema-cache'

// ─── Public types ───────────────────────────────────────────────────────────

export type DbError = {
  message: string
  code: string
  details: string | null
  hint: string | null
}

/**
 * Rows are untyped (no generated schema types). This shape lets callers use the value
 * both as a row list (`data.map(row => ...)`, rows typed `any`) and as a single row.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseData = any[] & Record<string, any>

export type DbResult<T = LooseData> = {
  data: T
  error: DbError | null
  count: number | null
  status: number
  statusText: string
}

export type DbRole = 'service_role' | 'authenticated' | 'anon'

export type Identity = {
  role: DbRole
  userId: string | null
  email: string | null
}

type Executor = <T>(identity: Identity, work: (tx: TransactionSql) => Promise<T>) => Promise<T>

// ─── Execution ──────────────────────────────────────────────────────────────

export function createExecutor(getSql: () => Sql): Executor {
  return async (identity, work) => {
    const sql = getSql()
    return (await sql.begin(async (tx) => {
      const claims = JSON.stringify({
        sub: identity.userId ?? undefined,
        email: identity.email ?? undefined,
        role: identity.role,
      })
      await tx.unsafe(
        `select set_config('role', $1, true),
                set_config('request.jwt.claims', $2, true),
                set_config('request.jwt.claim.sub', $3, true),
                set_config('request.jwt.claim.role', $1, true)`,
        [identity.role, claims, identity.userId ?? '']
      )
      return work(tx)
    })) as never
  }
}

function toDbError(error: unknown): DbError {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    return {
      message: typeof e.message === 'string' ? e.message : 'Database request failed',
      code: typeof e.code === 'string' ? e.code : '',
      details: typeof e.detail === 'string' ? e.detail : typeof e.details === 'string' ? e.details : null,
      hint: typeof e.hint === 'string' ? e.hint : null,
    }
  }
  return { message: String(error), code: '', details: null, hint: null }
}

function ok(data: unknown, count: number | null = null, status = 200): DbResult {
  return { data: data as LooseData, error: null, count, status, statusText: 'OK' }
}

function fail(error: DbError, status = 400): DbResult {
  return { data: null as unknown as LooseData, error, count: null, status, statusText: 'Error' }
}

// ─── SQL helpers ────────────────────────────────────────────────────────────

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`

function quoteArrayElement(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function toArrayLiteral(values: unknown[]): string {
  return `{${values.map(quoteArrayElement).join(',')}}`
}

function serialize(value: unknown, type?: string): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value) && type?.endsWith('[]')) return toArrayLiteral(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

class Params {
  values: (string | null)[] = []
  push(value: unknown, type?: string): string {
    this.values.push(serialize(value, type))
    // Parameters are always sent as text and cast server-side, so the driver never
    // re-serializes them (it would otherwise double-encode json and coerce booleans).
    const ref = `$${this.values.length}::text`
    return type && type !== 'text' ? `${ref}::${type}` : ref
  }
}

// ─── Select parsing ─────────────────────────────────────────────────────────

type SelectNode =
  | { kind: 'star' }
  | { kind: 'column'; name: string; alias: string | null; cast: string | null }
  | { kind: 'embed'; relation: string; alias: string | null; hint: string | null; inner: boolean; children: SelectNode[] }

function splitTopLevel(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quoted = false
  let current = ''
  for (const char of input) {
    if (char === '"') quoted = !quoted
    if (!quoted && char === '(') depth++
    if (!quoted && char === ')') depth--
    if (!quoted && char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

export function parseSelect(input: string): SelectNode[] {
  const cleaned = input.replace(/\s+/g, ' ').trim() || '*'
  return splitTopLevel(cleaned).map((item): SelectNode => {
    if (item === '*') return { kind: 'star' }
    const open = item.indexOf('(')
    if (open > -1 && item.endsWith(')')) {
      let head = item.slice(0, open).trim()
      const body = item.slice(open + 1, -1)
      let alias: string | null = null
      const colon = head.indexOf(':')
      if (colon > -1) {
        alias = head.slice(0, colon).trim()
        head = head.slice(colon + 1).trim()
      }
      const [relation, ...hints] = head.split('!').map((part) => part.trim())
      const inner = hints.includes('inner')
      const hint = hints.find((h) => h !== 'inner' && h !== 'left') ?? null
      return { kind: 'embed', relation, alias, hint, inner, children: parseSelect(body) }
    }
    let name = item
    let alias: string | null = null
    let cast: string | null = null
    const castAt = name.indexOf('::')
    if (castAt > -1) {
      cast = name.slice(castAt + 2).trim()
      name = name.slice(0, castAt).trim()
    }
    const colon = name.indexOf(':')
    if (colon > -1) {
      alias = name.slice(0, colon).trim()
      name = name.slice(colon + 1).trim()
    }
    return { kind: 'column', name, alias, cast }
  })
}

// ─── Filters ────────────────────────────────────────────────────────────────

type Operator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'like' | 'ilike' | 'is' | 'in' | 'cs' | 'cd' | 'ov'

type Condition =
  | { type: 'op'; column: string; op: Operator; value: unknown; negate: boolean }
  | { type: 'group'; join: 'and' | 'or'; conditions: Condition[]; negate: boolean }

const OPERATORS = new Set<Operator>(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'cs', 'cd', 'ov'])

function normalizeOperator(op: string): Operator {
  const map: Record<string, Operator> = { contains: 'cs', containedBy: 'cd', overlaps: 'ov' }
  const resolved = (map[op] ?? op) as Operator
  if (!OPERATORS.has(resolved)) throw new Error(`Unsupported filter operator: ${op}`)
  return resolved
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"')
  }
  return trimmed
}

/** Parses the textual value PostgREST accepts in `or()`, `not()` and `filter()`. */
function parseTextValue(op: Operator, raw: string): unknown {
  if (op === 'is') {
    const lowered = raw.trim().toLowerCase()
    if (lowered === 'null') return null
    if (lowered === 'true') return true
    if (lowered === 'false') return false
    return raw
  }
  if (op === 'in') {
    const inner = raw.trim().replace(/^\(/, '').replace(/\)$/, '')
    return splitTopLevel(inner).map(unquote)
  }
  return unquote(raw)
}

function parseLogicTree(input: string, join: 'and' | 'or', negate = false): Condition {
  return { type: 'group', join, negate, conditions: splitTopLevel(input).map(parseLogicItem) }
}

function parseLogicItem(item: string): Condition {
  let rest = item.trim()
  let negate = false
  if (rest.startsWith('not.')) {
    negate = true
    rest = rest.slice(4)
  }
  const group = /^(and|or)\(([\s\S]*)\)$/.exec(rest)
  if (group) return parseLogicTree(group[2], group[1] as 'and' | 'or', negate)

  const firstDot = rest.indexOf('.')
  if (firstDot < 0) throw new Error(`Invalid filter: ${item}`)
  const column = rest.slice(0, firstDot)
  rest = rest.slice(firstDot + 1)
  if (rest.startsWith('not.')) {
    negate = !negate
    rest = rest.slice(4)
  }
  const secondDot = rest.indexOf('.')
  if (secondDot < 0) throw new Error(`Invalid filter: ${item}`)
  const op = normalizeOperator(rest.slice(0, secondDot))
  const value = parseTextValue(op, rest.slice(secondDot + 1))
  return { type: 'op', column, op, value, negate }
}

// ─── Compiler ───────────────────────────────────────────────────────────────

type Order = { column: string; ascending: boolean; nullsFirst: boolean | null; foreignTable: string | null }

type Scope = {
  table: string
  alias: string
}

type Compiler = {
  cache: SchemaCache
  params: Params
  nextAlias: () => string
}

function columnType(cache: SchemaCache, table: string, column: string): string | undefined {
  return cache.columns.get(table)?.get(column)
}

function columnExpression(scope: Scope, column: string): { sql: string; type?: string; isJsonText: boolean } {
  const jsonPath = /^([a-zA-Z0-9_]+)((?:->>?[a-zA-Z0-9_]+)+)$/.exec(column)
  if (jsonPath) {
    const base = `${scope.alias}.${quoteIdent(jsonPath[1])}`
    const path = jsonPath[2].replace(/(->>?)([a-zA-Z0-9_]+)/g, (_m, arrow, key) =>
      /^\d+$/.test(key) ? `${arrow}${key}` : `${arrow}'${key}'`
    )
    return { sql: `${base}${path}`, isJsonText: jsonPath[2].includes('->>') }
  }
  return { sql: `${scope.alias}.${quoteIdent(column)}`, isJsonText: false }
}

function compileCondition(c: Compiler, scope: Scope, condition: Condition): string {
  if (condition.type === 'group') {
    const inner = condition.conditions.map((child) => compileCondition(c, scope, child))
    const joined = inner.length ? `(${inner.join(condition.join === 'and' ? ' and ' : ' or ')})` : 'true'
    return condition.negate ? `not ${joined}` : joined
  }

  const expr = columnExpression(scope, condition.column)
  const type = expr.isJsonText ? undefined : columnType(c.cache, scope.table, condition.column)
  const col = expr.sql
  const { op, value } = condition
  let sql: string

  switch (op) {
    case 'eq':
    case 'neq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const symbol = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op]
      sql = `${col} ${symbol} ${c.params.push(value, type)}`
      break
    }
    case 'like':
    case 'ilike':
      sql = `${col}::text ${op} ${c.params.push(value)}`
      break
    case 'is': {
      const keyword = value === null || value === 'null' ? 'null' : value === true || value === 'true' ? 'true' : value === false || value === 'false' ? 'false' : 'unknown'
      sql = `${col} is ${keyword}`
      break
    }
    case 'in': {
      const list = Array.isArray(value) ? value : [value]
      if (list.length === 0) {
        sql = 'false'
        break
      }
      const arrayType = type && !type.endsWith('[]') ? `${type}[]` : 'text[]'
      const left = type && !type.endsWith('[]') ? col : `${col}::text`
      c.params.values.push(toArrayLiteral(list))
      sql = `${left} = any($${c.params.values.length}::text::${arrayType})`
      break
    }
    case 'cs':
    case 'cd':
    case 'ov': {
      const symbol = { cs: '@>', cd: '<@', ov: '&&' }[op]
      const literal = Array.isArray(value) && !(type === 'jsonb' || type === 'json') ? toArrayLiteral(value) : value
      c.params.values.push(serialize(literal))
      sql = `${col} ${symbol} $${c.params.values.length}::text${type && type !== 'text' ? `::${type}` : ''}`
      break
    }
  }

  return condition.negate ? `not (${sql})` : sql
}

type Relationship = {
  fk: ForeignKey
  /** many-to-one: the parent row points at one related row. */
  toOne: boolean
}

function resolveRelationship(cache: SchemaCache, parent: string, relation: string, hint: string | null): Relationship {
  const matchesHint = (fk: ForeignKey) => !hint || fk.name === hint || fk.columns.includes(hint)

  const toOne = cache.foreignKeys.filter((fk) => fk.table === parent && fk.refTable === relation && matchesHint(fk))
  if (toOne.length) return { fk: toOne[0], toOne: true }

  const toMany = cache.foreignKeys.filter((fk) => fk.table === relation && fk.refTable === parent && matchesHint(fk))
  if (toMany.length) return { fk: toMany[0], toOne: false }

  // Embedding through a column name, e.g. `created_by(...)`.
  const byColumn = cache.foreignKeys.filter((fk) => fk.table === parent && fk.columns.includes(relation))
  if (byColumn.length) return { fk: byColumn[0], toOne: true }

  throw Object.assign(new Error(`Could not find a relationship between '${parent}' and '${relation}'`), {
    code: 'PGRST200',
  })
}

function joinCondition(rel: Relationship, parent: Scope, child: Scope): string {
  const { fk, toOne } = rel
  return fk.columns
    .map((column, index) => {
      const ref = fk.refColumns[index]
      return toOne
        ? `${child.alias}.${quoteIdent(ref)} = ${parent.alias}.${quoteIdent(column)}`
        : `${child.alias}.${quoteIdent(column)} = ${parent.alias}.${quoteIdent(ref)}`
    })
    .join(' and ')
}

type EmbedFilters = Map<string, Condition[]>

function compileSelectList(
  c: Compiler,
  scope: Scope,
  nodes: SelectNode[],
  embedFilters: EmbedFilters,
  path: string,
  innerConditions: string[]
): string {
  const items: string[] = []

  for (const node of nodes) {
    if (node.kind === 'star') {
      items.push(`${scope.alias}.*`)
      continue
    }
    if (node.kind === 'column') {
      const expr = columnExpression(scope, node.name)
      const outputName = node.alias ?? node.name.split(/->>?/).pop()!
      items.push(`${expr.sql}${node.cast ? `::${node.cast}` : ''} as ${quoteIdent(outputName)}`)
      continue
    }

    const name = node.alias ?? node.relation
    const childPath = path ? `${path}.${name}` : name
    const rel = resolveRelationship(c.cache, scope.table, node.relation, node.hint)
    const childTable = rel.toOne ? rel.fk.refTable : rel.fk.table
    const childFilters = embedFilters.get(childPath) ?? []

    const child: Scope = { table: childTable, alias: c.nextAlias() }
    const grandInner: string[] = []
    const childList = compileSelectList(c, child, node.children, embedFilters, childPath, grandInner)
    const where = [joinCondition(rel, scope, child), ...childFilters.map((f) => compileCondition(c, child, f)), ...grandInner]
    const source = `from public.${quoteIdent(childTable)} ${child.alias} where ${where.join(' and ')}`

    items.push(
      rel.toOne
        ? `(select row_to_json(_e) from (select ${childList} ${source} limit 1) _e) as ${quoteIdent(name)}`
        : `(select coalesce(json_agg(_e), '[]'::json) from (select ${childList} ${source}) _e) as ${quoteIdent(name)}`
    )

    if (node.inner) {
      const probe: Scope = { table: childTable, alias: c.nextAlias() }
      const probeWhere = [joinCondition(rel, scope, probe), ...childFilters.map((f) => compileCondition(c, probe, f))]
      innerConditions.push(`exists (select 1 from public.${quoteIdent(childTable)} ${probe.alias} where ${probeWhere.join(' and ')})`)
    }
  }

  return items.length ? items.join(', ') : `${scope.alias}.*`
}

function makeCompiler(cache: SchemaCache): Compiler {
  let counter = 0
  return {
    cache,
    params: new Params(),
    nextAlias: () => `t${++counter}`,
  }
}

// ─── Builders ───────────────────────────────────────────────────────────────

type Mode = 'select' | 'insert' | 'upsert' | 'update' | 'delete'

type SelectOptions = { count?: 'exact' | 'planned' | 'estimated' | null; head?: boolean }

type Cardinality = 'many' | 'single' | 'maybeSingle'

function applyCardinality(rows: unknown[], cardinality: Cardinality): DbResult {
  if (cardinality === 'many') return ok(rows)
  if (rows.length === 1) return ok(rows[0])
  if (rows.length === 0 && cardinality === 'maybeSingle') return ok(null)
  return fail(
    {
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
      details: `The result contains ${rows.length} rows`,
      hint: null,
    },
    406
  )
}

abstract class Thenable implements PromiseLike<DbResult> {
  protected abstract execute(): Promise<DbResult>

  then<TResult1 = DbResult, TResult2 = never>(
    onfulfilled?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
}

export class QueryBuilder extends Thenable {
  private mode: Mode = 'select'
  private selectNodes: SelectNode[] | null = null
  private returning = false
  private countMode: SelectOptions['count'] = null
  private head = false
  private conditions: Condition[] = []
  private embedFilters: EmbedFilters = new Map()
  private orders: Order[] = []
  private limitCount: number | null = null
  private offsetCount: number | null = null
  private cardinality: Cardinality = 'many'
  private payload: Record<string, unknown>[] = []
  private onConflict: string | null = null
  private ignoreDuplicates = false

  constructor(
    private readonly executor: Executor,
    private readonly identity: Identity,
    private readonly table: string
  ) {
    super()
  }

  // Query shape ----------------------------------------------------------------

  select(columns = '*', options: SelectOptions = {}): this {
    this.selectNodes = parseSelect(columns)
    if (this.mode === 'select') {
      this.countMode = options.count ?? null
      this.head = Boolean(options.head)
    } else {
      this.returning = true
    }
    return this
  }

  private setPayload(values: unknown) {
    const list = Array.isArray(values) ? values : [values]
    this.payload = JSON.parse(JSON.stringify(list)) as Record<string, unknown>[]
  }

  insert(values: unknown, _options: { count?: string; defaultToNull?: boolean } = {}): this {
    this.mode = 'insert'
    this.setPayload(values)
    return this
  }

  upsert(values: unknown, options: { onConflict?: string; ignoreDuplicates?: boolean; count?: string } = {}): this {
    this.mode = 'upsert'
    this.setPayload(values)
    this.onConflict = options.onConflict ?? null
    this.ignoreDuplicates = Boolean(options.ignoreDuplicates)
    return this
  }

  update(values: Record<string, unknown>, _options: { count?: string } = {}): this {
    this.mode = 'update'
    this.setPayload(values)
    return this
  }

  delete(_options: { count?: string } = {}): this {
    this.mode = 'delete'
    return this
  }

  // Filters --------------------------------------------------------------------

  private addCondition(column: string, op: Operator, value: unknown, negate = false): this {
    const dot = column.lastIndexOf('.')
    const isEmbedded = dot > 0 && !column.includes('->')
    const condition: Condition = { type: 'op', column: isEmbedded ? column.slice(dot + 1) : column, op, value, negate }
    if (isEmbedded) {
      const path = column.slice(0, dot)
      this.embedFilters.set(path, [...(this.embedFilters.get(path) ?? []), condition])
    } else {
      this.conditions.push(condition)
    }
    return this
  }

  eq(column: string, value: unknown) { return this.addCondition(column, 'eq', value) }
  neq(column: string, value: unknown) { return this.addCondition(column, 'neq', value) }
  gt(column: string, value: unknown) { return this.addCondition(column, 'gt', value) }
  gte(column: string, value: unknown) { return this.addCondition(column, 'gte', value) }
  lt(column: string, value: unknown) { return this.addCondition(column, 'lt', value) }
  lte(column: string, value: unknown) { return this.addCondition(column, 'lte', value) }
  like(column: string, pattern: string) { return this.addCondition(column, 'like', pattern) }
  ilike(column: string, pattern: string) { return this.addCondition(column, 'ilike', pattern) }
  is(column: string, value: boolean | null) { return this.addCondition(column, 'is', value) }
  in(column: string, values: readonly unknown[]) { return this.addCondition(column, 'in', [...values]) }
  contains(column: string, value: unknown) { return this.addCondition(column, 'cs', value) }
  containedBy(column: string, value: unknown) { return this.addCondition(column, 'cd', value) }
  overlaps(column: string, value: unknown) { return this.addCondition(column, 'ov', value) }

  match(query: Record<string, unknown>): this {
    for (const [column, value] of Object.entries(query)) this.eq(column, value)
    return this
  }

  not(column: string, operator: string, value: unknown): this {
    const op = normalizeOperator(operator)
    const parsed = typeof value === 'string' ? parseTextValue(op, value) : value
    return this.addCondition(column, op, parsed, true)
  }

  filter(column: string, operator: string, value: unknown): this {
    let op = operator
    let negate = false
    if (op.startsWith('not.')) {
      negate = true
      op = op.slice(4)
    }
    const resolved = normalizeOperator(op)
    const parsed = typeof value === 'string' ? parseTextValue(resolved, value) : value
    return this.addCondition(column, resolved, parsed, negate)
  }

  or(filters: string, options: { foreignTable?: string; referencedTable?: string } = {}): this {
    const tree = parseLogicTree(filters, 'or')
    const embedded = options.referencedTable ?? options.foreignTable
    if (embedded) {
      this.embedFilters.set(embedded, [...(this.embedFilters.get(embedded) ?? []), tree])
    } else {
      this.conditions.push(tree)
    }
    return this
  }

  // Modifiers ------------------------------------------------------------------

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string } = {}): this {
    this.orders.push({
      column,
      ascending: options.ascending ?? true,
      nullsFirst: options.nullsFirst ?? null,
      foreignTable: options.referencedTable ?? options.foreignTable ?? null,
    })
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  range(from: number, to: number): this {
    this.offsetCount = from
    this.limitCount = to - from + 1
    return this
  }

  single(): this {
    this.cardinality = 'single'
    return this
  }

  maybeSingle(): this {
    this.cardinality = 'maybeSingle'
    return this
  }

  returns(): this {
    return this
  }

  abortSignal(_signal: AbortSignal): this {
    return this
  }

  // Execution ------------------------------------------------------------------

  protected async execute(): Promise<DbResult> {
    try {
      const cache = await getSchemaCache()
      if (!cache.columns.has(this.table)) {
        return fail({ code: 'PGRST205', message: `Could not find the table 'public.${this.table}'`, details: null, hint: null }, 404)
      }
      if (this.mode === 'select') return await this.runSelect(cache)
      return await this.runMutation(cache)
    } catch (error) {
      return fail(toDbError(error))
    }
  }

  private whereClause(c: Compiler, scope: Scope, extra: string[] = []): string {
    const parts = [...this.conditions.map((condition) => compileCondition(c, scope, condition)), ...extra]
    return parts.length ? ` where ${parts.join(' and ')}` : ''
  }

  private orderClause(scope: Scope): string {
    const own = this.orders.filter((order) => !order.foreignTable)
    if (!own.length) return ''
    return ` order by ${own
      .map((order) => {
        const expr = columnExpression(scope, order.column).sql
        const direction = order.ascending ? 'asc' : 'desc'
        const nulls = order.nullsFirst === null ? '' : order.nullsFirst ? ' nulls first' : ' nulls last'
        return `${expr} ${direction}${nulls}`
      })
      .join(', ')}`
  }

  private async runSelect(cache: SchemaCache): Promise<DbResult> {
    const c = makeCompiler(cache)
    const scope: Scope = { table: this.table, alias: 't0' }
    const inner: string[] = []
    const list = compileSelectList(c, scope, this.selectNodes ?? [{ kind: 'star' }], this.embedFilters, '', inner)
    const from = `from public.${quoteIdent(this.table)} t0`
    const where = this.whereClause(c, scope, inner)

    let limit = this.limitCount
    if (this.cardinality !== 'many' && limit === null) limit = 2
    const paging = `${limit !== null ? ` limit ${Math.max(0, Math.floor(limit))}` : ''}${this.offsetCount !== null ? ` offset ${Math.max(0, Math.floor(this.offsetCount))}` : ''}`

    const dataSql = `select coalesce(json_agg(_r), '[]'::json) as data from (select ${list} ${from}${where}${this.orderClause(scope)}${paging}) _r`
    const countSql = `select count(*)::bigint as count ${from}${where}`
    const params = c.params.values

    const { rows, count } = await this.executor(this.identity, async (tx) => {
      const total = this.countMode ? Number((await tx.unsafe(countSql, params))[0]?.count ?? 0) : null
      if (this.head) return { rows: [] as unknown[], count: total }
      const result = await tx.unsafe(dataSql, params)
      return { rows: (result[0]?.data ?? []) as unknown[], count: total }
    })

    if (this.head) return ok(null, count)
    const shaped = applyCardinality(rows, this.cardinality)
    return { ...shaped, count }
  }

  private async runMutation(cache: SchemaCache): Promise<DbResult> {
    if ((this.mode === 'insert' || this.mode === 'upsert') && this.payload.length === 0) {
      return ok(this.returning ? [] : null, null, 201)
    }

    const c = makeCompiler(cache)
    const table = `public.${quoteIdent(this.table)}`
    const known = cache.columns.get(this.table)!
    const scope: Scope = { table: this.table, alias: 't0' }
    let mutation: string

    if (this.mode === 'insert' || this.mode === 'upsert') {
      const columns = [...new Set(this.payload.flatMap((row) => Object.keys(row)))].filter((column) => known.has(column))
      const ref = c.params.push(JSON.stringify(this.payload), 'json')
      if (!columns.length) {
        mutation = `insert into ${table} as t0 default values`
      } else {
        const list = columns.map(quoteIdent).join(', ')
        mutation = `insert into ${table} as t0 (${list}) select ${list} from json_populate_recordset(null::${table}, ${ref})`
      }
      if (this.mode === 'upsert') {
        const target = this.onConflict
          ? this.onConflict.split(',').map((column) => column.trim()).filter(Boolean)
          : cache.primaryKeys.get(this.table) ?? []
        const updates = columns.filter((column) => !target.includes(column))
        mutation +=
          this.ignoreDuplicates || updates.length === 0
            ? ` on conflict (${target.map(quoteIdent).join(', ')}) do nothing`
            : ` on conflict (${target.map(quoteIdent).join(', ')}) do update set ${updates
                .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
                .join(', ')}`
      }
    } else if (this.mode === 'update') {
      const values = this.payload[0] ?? {}
      const columns = Object.keys(values).filter((column) => known.has(column))
      if (!columns.length) return ok(this.returning ? [] : null)
      const ref = c.params.push(JSON.stringify(values), 'json')
      mutation = `update ${table} as t0 set ${columns
        .map((column) => `${quoteIdent(column)} = _v.${quoteIdent(column)}`)
        .join(', ')} from json_populate_record(null::${table}, ${ref}) as _v${this.whereClause(c, scope)}`
    } else {
      mutation = `delete from ${table} as t0${this.whereClause(c, scope)}`
    }

    let statement: string
    if (this.returning) {
      const returned: Scope = { table: this.table, alias: 'm0' }
      const list = compileSelectList(c, returned, this.selectNodes ?? [{ kind: 'star' }], this.embedFilters, '', [])
      statement = `with _m as (${mutation} returning t0.*) select coalesce(json_agg(_r), '[]'::json) as data from (select ${list} from _m m0) _r`
    } else {
      statement = mutation
    }

    const params = c.params.values
    const rows = await this.executor(this.identity, async (tx) => {
      const result = await tx.unsafe(statement, params)
      return this.returning ? ((result[0]?.data ?? []) as unknown[]) : null
    })

    if (!rows) return ok(null, null, this.mode === 'insert' ? 201 : 204)
    return applyCardinality(rows, this.cardinality)
  }
}

export class RpcBuilder extends Thenable {
  private cardinality: Cardinality = 'many'

  constructor(
    private readonly executor: Executor,
    private readonly identity: Identity,
    private readonly fn: string,
    private readonly args: Record<string, unknown>
  ) {
    super()
  }

  single(): this {
    this.cardinality = 'single'
    return this
  }

  maybeSingle(): this {
    this.cardinality = 'maybeSingle'
    return this
  }

  returns(): this {
    return this
  }

  abortSignal(_signal: AbortSignal): this {
    return this
  }

  private pick(candidates: FunctionInfo[]): FunctionInfo | null {
    const provided = Object.keys(this.args).filter((key) => this.args[key] !== undefined)
    return (
      candidates.find((fn) => {
        const names = fn.args.map((arg) => arg.name)
        return provided.every((key) => names.includes(key)) && fn.args.every((arg) => arg.hasDefault || provided.includes(arg.name))
      }) ?? null
    )
  }

  protected async execute(): Promise<DbResult> {
    try {
      const cache = await getSchemaCache()
      const fn = this.pick(cache.functions.get(this.fn) ?? [])
      if (!fn) {
        return fail(
          { code: 'PGRST202', message: `Could not find the function public.${this.fn} with the given arguments`, details: null, hint: null },
          404
        )
      }

      const c = makeCompiler(cache)
      const callArgs = fn.args
        .filter((arg) => this.args[arg.name] !== undefined)
        .map((arg) => `${quoteIdent(arg.name)} => ${c.params.push(this.args[arg.name], arg.type)}`)
        .join(', ')
      const call = `public.${quoteIdent(fn.name)}(${callArgs})`

      let statement: string
      if (fn.returnKind === 'void') statement = `select ${call} as data`
      else if (fn.returnsSet || fn.returnKind === 'record') statement = `select coalesce(json_agg(_r), '[]'::json) as data from ${call} _r`
      else if (fn.returnKind === 'composite') statement = `select to_json(_r) as data from ${call} _r`
      else statement = `select to_json(${call}) as data`

      const data = await this.executor(this.identity, async (tx) => {
        const result = await tx.unsafe(statement, c.params.values)
        return fn.returnKind === 'void' ? null : (result[0]?.data ?? null)
      })

      if (this.cardinality !== 'many') {
        const rows = Array.isArray(data) ? data : data === null ? [] : [data]
        return applyCardinality(rows, this.cardinality)
      }
      return ok(data)
    } catch (error) {
      return fail(toDbError(error))
    }
  }
}
