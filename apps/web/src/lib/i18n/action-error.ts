import { databaseErrorCode, databaseErrorMessage, logDatabaseError } from '@/lib/db/errors'
import { ar } from './ar'

function messageFrom(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return ''
}

export function actionErrorMessage(error: unknown, fallback: string = ar.errors.generic) {
  const message = messageFrom(error)
  if (/[\u0600-\u06ff]/i.test(message)) return message
  console.error('Server action failed', error)
  return fallback
}

/**
 * Maps a database failure onto customer-facing Arabic.
 *
 * The codes, constraint names and schema-cache wording behind the failure stay in the log:
 * they give a business owner no way to act and they expose internals (docs/PLAN.md §8.3.10).
 */
export function supabaseActionError(error: unknown, fallback: string = ar.errors.generic) {
  logDatabaseError('server action', error)
  const code = databaseErrorCode(error)
  const message = messageFrom(error)

  const mapped = databaseErrorMessage(error, '')
  if (mapped) return mapped

  if (code) return fallback
  if (/[\u0600-\u06ff]/i.test(message)) return message
  return fallback
}
