import { isDatabaseConfigured } from '@/lib/db/pool'
import { isAuthSecretConfigured } from './session'

/** Accounts work only when both the database and the session secret are configured. */
export function isAuthConfigured(): boolean {
  return isDatabaseConfigured() && isAuthSecretConfigured()
}
