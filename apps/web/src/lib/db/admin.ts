import { createDbClient, type DbClient } from './client'

/**
 * Server-only client with the `service_role` database role (bypasses RLS).
 * Used by webhooks, cron jobs and trusted server code. Never import from client components.
 */
export function createAdminClient(): DbClient {
  return createDbClient({ role: 'service_role', userId: null, email: null })
}
