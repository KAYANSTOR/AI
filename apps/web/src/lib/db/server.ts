import { cache } from 'react'
import { getCurrentUser } from '@/lib/auth/current-user'
import { createDbClient, type DbClient } from './client'

/**
 * Request-scoped client acting as the signed-in user (role `authenticated`), or as
 * `anon` when nobody is signed in. Row-level security decides what it can see.
 */
export const createClient = cache(async (): Promise<DbClient> => {
  const user = await getCurrentUser()
  if (!user) return createDbClient({ role: 'anon', userId: null, email: null })
  return createDbClient(
    { role: 'authenticated', userId: user.id, email: user.email },
    { id: user.id, email: user.email, user_metadata: user.userMetadata }
  )
})
