/**
 * In-memory PostgREST-shaped test double.
 *
 * The runtime modules are tested against this instead of a live database because the
 * test environment has no project credentials. It is deliberately a real filter
 * engine over in-memory rows — not a stub returning canned answers — so a test that
 * asserts "an unknown channel is rejected" only passes if the `.eq()` filters the
 * production code issues genuinely exclude the row.
 *
 * Supported surface: from().select/insert/update/upsert/delete, the comparison
 * operators the runtime uses, dotted relation paths, order/limit, single/maybeSingle
 * and UNIQUE constraint violations reported with Postgres code 23505.
 */
export type Row = Record<string, unknown>

/**
 * A UNIQUE constraint. A bare string[] is a full constraint; passing `where` models a
 * partial unique index such as `... WHERE status <> 'closed'`.
 */
export type UniqueDef = string[] | { columns: string[]; where?: (row: Row) => boolean }

export type TableDef = {
  rows?: Row[]
  unique?: UniqueDef[]
}

export type FakeDb = Record<string, TableDef>

type Operator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'ilike'
type Filter = { op: Operator; column: string; value: unknown }

export type PostgrestResult = { data: Row[] | Row | null; error: Failure | null }
export type Failure = { code?: string; message: string; details?: string }

let idCounter = 0
function nextId() {
  idCounter += 1
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`
}

function valueAt(row: Row, path: string): unknown {
  let current: unknown = row
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Row)[key]
  }
  return current
}

function compare(actual: unknown, expected: unknown): number | null {
  if (actual === null || actual === undefined) return null
  if (typeof actual === 'number' && typeof expected === 'number') {
    return actual === expected ? 0 : actual < expected ? -1 : 1
  }
  const a = new Date(actual as string).getTime()
  const b = new Date(expected as string).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return a === b ? 0 : a < b ? -1 : 1
}

function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

function matchesAll(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const actual = valueAt(row, filter.column)
    switch (filter.op) {
      case 'eq':
        return actual === filter.value
      case 'neq':
        return actual !== filter.value
      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(actual)
      case 'ilike':
        return typeof actual === 'string' && likeToRegExp(String(filter.value)).test(actual)
      default: {
        const order = compare(actual, filter.value)
        if (order === null) return false
        if (filter.op === 'gt') return order > 0
        if (filter.op === 'gte') return order >= 0
        if (filter.op === 'lt') return order < 0
        return order <= 0
      }
    }
  })
}

function uniqueViolation(columns: string[]): Failure {
  return {
    code: '23505',
    message: `duplicate key value violates unique constraint "ux_${columns.join('_')}"`,
    details: `Key (${columns.join(', ')})=() already exists.`,
  }
}

function violatedConstraint(table: TableDef, candidate: Row): Failure | null {
  for (const def of table.unique ?? []) {
    const columns = Array.isArray(def) ? def : def.columns
    const where = Array.isArray(def) ? undefined : def.where
    // A partial unique index only counts rows that satisfy its predicate — including
    // the row being inserted.
    if (where && !where(candidate)) continue
    const duplicate = (table.rows ?? []).some(
      (row) =>
        (!where || where(row)) && columns.every((column) => valueAt(row, column) === valueAt(candidate, column))
    )
    if (duplicate) return uniqueViolation(columns)
  }
  return null
}

class Builder implements PromiseLike<PostgrestResult> {
  private readonly table: TableDef
  private filters: Filter[] = []
  private orderBy: { column: string; ascending: boolean } | null = null
  private limitN: number | null = null
  private kind: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private current: Row | null = null
  private patch: Row | null = null
  private wantsRows = false
  private failure: Failure | null = null

  constructor(table: TableDef) {
    this.table = table
    if (!this.table.rows) this.table.rows = []
  }

  select(_columns?: string) {
    this.wantsRows = true
    return this
  }

  insert(payload: Row | Row[]) {
    this.kind = 'insert'
    const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ ...row }))
    for (const row of rows) {
      if (row.id === undefined) row.id = nextId()
      const violation = violatedConstraint(this.table, row)
      if (violation) {
        this.failure = violation
        return this
      }
      this.table.rows!.push(row)
    }
    this.current = rows[0] ?? null
    this.inserted = rows
    return this
  }

  private inserted: Row[] = []

  update(patch: Row) {
    this.kind = 'update'
    this.patch = { ...patch }
    return this
  }

  upsert(payload: Row | Row[], options?: { onConflict?: string }) {
    this.kind = 'upsert'
    const key = (options?.onConflict ?? 'id').split(',').map((part) => part.trim())
    const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ ...row }))
    for (const row of rows) {
      const existing = this.table.rows!.find((candidate) =>
        key.every((column) => valueAt(candidate, column) === valueAt(row, column))
      )
      if (existing) {
        Object.assign(existing, row)
      } else {
        if (row.id === undefined) row.id = nextId()
        this.table.rows!.push(row)
      }
    }
    this.inserted = rows
    this.current = rows[0] ?? null
    return this
  }

  delete() {
    this.kind = 'delete'
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: 'eq', column, value })
    return this
  }

  neq(column: string, value: unknown) {
    this.filters.push({ op: 'neq', column, value })
    return this
  }

  gt(column: string, value: unknown) {
    this.filters.push({ op: 'gt', column, value })
    return this
  }

  gte(column: string, value: unknown) {
    this.filters.push({ op: 'gte', column, value })
    return this
  }

  lt(column: string, value: unknown) {
    this.filters.push({ op: 'lt', column, value })
    return this
  }

  lte(column: string, value: unknown) {
    this.filters.push({ op: 'lte', column, value })
    return this
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ op: 'in', column, value })
    return this
  }

  ilike(column: string, value: unknown) {
    this.filters.push({ op: 'ilike', column, value })
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false }
    return this
  }

  limit(count: number) {
    this.limitN = count
    return this
  }

  maybeSingle() {
    return this.run('maybeSingle')
  }

  single() {
    return this.run('single')
  }

  then<TResult1 = PostgrestResult, TResult2 = never>(
    onfulfilled?: ((value: PostgrestResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.run('many').then(onfulfilled, onrejected)
  }

  private matched(): Row[] {
    let rows = this.table.rows!.filter((row) => matchesAll(row, this.filters))
    if (this.orderBy) {
      const { column, ascending } = this.orderBy
      rows = [...rows].sort((a, b) => {
        const order = compare(valueAt(a, column), valueAt(b, column)) ?? 0
        return ascending ? order : -order
      })
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN)
    return rows
  }

  private async run(mode: 'many' | 'single' | 'maybeSingle'): Promise<PostgrestResult> {
    if (this.failure) return { data: null, error: this.failure }

    if (this.kind === 'insert' || this.kind === 'upsert') {
      if (mode === 'many') return { data: this.wantsRows ? this.inserted : null, error: null }
      const row = mode === 'single' ? this.inserted[0] : (this.inserted[0] ?? null)
      if (mode === 'single' && !row) return { data: null, error: { message: 'No rows returned' } }
      return { data: row ?? null, error: null }
    }

    if (this.kind === 'update') {
      const rows = this.matched()
      for (const row of rows) Object.assign(row, this.patch)
      if (mode === 'many') return { data: this.wantsRows ? rows : null, error: null }
      return { data: rows[0] ?? null, error: mode === 'single' && !rows[0] ? { message: 'No rows' } : null }
    }

    if (this.kind === 'delete') {
      const rows = this.matched()
      this.table.rows = this.table.rows!.filter((row) => !rows.includes(row))
      return { data: null, error: null }
    }

    const rows = this.matched()
    if (mode === 'many') return { data: this.wantsRows ? rows : null, error: null }
    if (mode === 'single') {
      return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'No rows returned' } }
    }
    return { data: rows[0] ?? null, error: null }
  }
}

export type RpcHandler = (args: Record<string, unknown>) => unknown

export function createFakeSupabase(tables: FakeDb, rpcs: Record<string, RpcHandler> = {}) {
  const db: FakeDb = {}
  for (const [name, def] of Object.entries(tables)) {
    db[name] = { rows: (def.rows ?? []).map((row) => ({ ...row })), unique: def.unique }
  }

  const client = {
    from(name: string) {
      if (!db[name]) db[name] = { rows: [] }
      return new Builder(db[name])
    },
    /**
     * Postgres functions are stubbed by the test, not by this fake: each registered
     * handler stands in for one SECURITY DEFINER function's authorisation + effect.
     */
    async rpc(name: string, args?: Record<string, unknown>) {
      const handler = rpcs[name]
      if (!handler) return { data: null, error: { message: `rpc ${name} is not registered in this test` } }
      try {
        return { data: handler(args ?? {}), error: null }
      } catch (error) {
        return { data: null, error: { message: error instanceof Error ? error.message : String(error) } }
      }
    },
  }

  return { client, db }
}

/**
 * Stands in for public.holiday_aware_hours by applying the same precedence the SQL
 * function enforces against the in-memory rows: a date-scoped exception beats the weekly
 * schedule, a location-specific exception beats an organisation-wide one, and a day with
 * no configuration is closed. Availability tests therefore exercise the real rules instead
 * of a canned answer.
 */
export function holidayAwareHoursRpc(db: FakeDb): RpcHandler {
  return (args) => {
    const organizationId = String(args.p_organization_id ?? '')
    const locationId = args.p_location_id == null ? null : String(args.p_location_id)
    const day = String(args.p_day ?? '')
    const dayOfWeek = new Date(`${day}T00:00:00Z`).getUTCDay()

    const exceptions = (db.business_hour_exceptions?.rows ?? []).filter(
      (row) =>
        row.organization_id === organizationId &&
        String(row.exception_date) === day &&
        (row.location_id == null || String(row.location_id) === locationId)
    )
    exceptions.sort((a, b) => Number(b.location_id != null) - Number(a.location_id != null))
    const exception = exceptions[0]
    if (exception) {
      return [
        {
          is_closed: Boolean(exception.is_closed),
          open_time: exception.open_time ?? null,
          close_time: exception.close_time ?? null,
        },
      ]
    }

    const weekly = (db.business_hours?.rows ?? []).find(
      (row) => row.organization_id === organizationId && Number(row.day_of_week) === dayOfWeek
    )
    if (weekly) {
      return [
        {
          is_closed: Boolean(weekly.is_closed),
          open_time: weekly.open_time ?? null,
          close_time: weekly.close_time ?? null,
        },
      ]
    }

    return [{ is_closed: true, open_time: null, close_time: null }]
  }
}
