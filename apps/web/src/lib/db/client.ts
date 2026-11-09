import { getSql } from './pool'
import { createExecutor, QueryBuilder, RpcBuilder, type Identity } from './query-builder'

const execute = createExecutor(getSql)

export type DbUser = { id: string; email: string | null; user_metadata: Record<string, unknown> }

/**
 * Database client with the familiar `from()` / `rpc()` call shape.
 * Every statement runs with the identity's database role, so RLS applies.
 */
export type DbClient = {
  from: (table: string) => QueryBuilder
  rpc: (fn: string, args?: Record<string, unknown>) => RpcBuilder
  auth: {
    getUser: () => Promise<{ data: { user: DbUser | null }; error: null }>
  }
}

export function createDbClient(identity: Identity, user: DbUser | null = null): DbClient {
  return {
    from: (table) => new QueryBuilder(execute, identity, table),
    rpc: (fn, args = {}) => new RpcBuilder(execute, identity, fn, args),
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
  }
}
