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

export function supabaseActionError(error: unknown, fallback: string = ar.errors.generic) {
  console.error('Supabase server action failed', error)
  return fallback
}
