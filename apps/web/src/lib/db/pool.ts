import postgres from 'postgres'

/**
 * Process-wide Postgres connection pool.
 *
 * DATABASE_URL points at the Railway Postgres service. On Railway the private network URL
 * (postgres.railway.internal) does not use TLS; public proxy URLs do. `DATABASE_SSL`
 * overrides the automatic choice when needed ("require" | "disable").
 */
type Sql = ReturnType<typeof postgres>

const globalForDb = globalThis as unknown as { __frontdeskSql?: Sql }

function resolveSsl(url: string): 'require' | false {
  const override = process.env.DATABASE_SSL?.trim().toLowerCase()
  if (override === 'require') return 'require'
  if (override === 'disable' || override === 'false') return false
  try {
    const host = new URL(url).hostname
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.railway.internal')) return false
  } catch {
    return false
  }
  return 'require'
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

export function getSql(): Sql {
  if (globalForDb.__frontdeskSql) return globalForDb.__frontdeskSql

  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL is not configured.')

  const sql = postgres(url, {
    ssl: resolveSsl(url),
    max: Number(process.env.DATABASE_POOL_SIZE || 10),
    idle_timeout: 30,
    connect_timeout: 15,
    prepare: false,
    connection: { TimeZone: 'UTC', application_name: 'frontdesk-web' },
    onnotice: () => {},
  })

  globalForDb.__frontdeskSql = sql
  return sql
}
