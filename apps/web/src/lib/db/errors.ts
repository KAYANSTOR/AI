/**
 * Turns Postgres / PostgREST failures into something a business owner can act on.
 *
 * docs/PLAN.md §8.3.10: a customer-facing error says what happened, why it matters and what
 * to do next. Codes, constraint names and "schema cache" wording are for the server log — they
 * are not actionable for a customer and they expose internals.
 */

export const DATABASE_UPDATE_REQUIRED =
  'النسخة الحالية تحتاج تحديثًا على الخادم. لم تفقد أي بيانات — أعد المحاولة بعد قليل، وإن استمرت المشكلة فأبلغ الدعم.'

const MESSAGES: Record<string, string> = {
  // Check constraint: a value the screen offered does not fit the column's rules.
  '23514': 'قيمة أحد الحقول غير مقبولة. راجع الحقل ثم أعد المحاولة.',
  // Unique violation: the identifier is already bound.
  '23505': 'هذا المعرّف مستخدم بالفعل.',
  // Foreign key: a referenced record is missing.
  '23503': 'سجل مرتبط غير موجود. أكمل إعداد النشاط ثم أعد المحاولة.',
  // Not-null: a required field was not sent.
  '23502': 'حقل مطلوب لم يُرسل. أكمل الحقول الناقصة ثم أعد المحاولة.',
  // RLS / permission denied.
  '42501': 'ليست لديك صلاحية لتنفيذ هذه العملية.',
  // Undefined table.
  '42P01': DATABASE_UPDATE_REQUIRED,
  // PostgREST: function or table absent from the schema cache. In practice the database has not
  // had the migrations applied, or PostgREST has not reloaded its schema after they were.
  PGRST202: DATABASE_UPDATE_REQUIRED,
  PGRST205: DATABASE_UPDATE_REQUIRED,
  // Expired or missing session.
  PGRST301: 'انتهت الجلسة. سجّل الدخول مرة أخرى ثم أعد المحاولة.',
}

const SERVICE_UNAVAILABLE = 'تعذّر الاتصال بالخدمة. تحقق من اتصالك ثم حاول مرة أخرى.'

function readField(error: unknown, field: 'code' | 'message' | 'details'): string {
  if (error && typeof error === 'object') {
    const value = (error as Record<string, unknown>)[field]
    if (typeof value === 'string') return value
  }
  return ''
}

export function databaseErrorCode(error: unknown): string {
  return readField(error, 'code')
}

/** True when the failure means the deployed database is behind the code. */
export function isDatabaseUpdateRequired(error: unknown): boolean {
  return databaseErrorMessage(error) === DATABASE_UPDATE_REQUIRED
}

/**
 * A human message for a database failure.
 *
 * An Arabic message wins over the code table: it was written deliberately for a reader and is
 * usually more specific than the generic wording a code maps to. The table exists for the raw
 * English text Postgres and PostgREST produce.
 */
export function databaseErrorMessage(error: unknown, fallback: string = SERVICE_UNAVAILABLE): string {
  if (error instanceof Error && /[\u0600-\u06ff]/u.test(error.message)) return error.message

  const message = readField(error, 'message')
  if (/[\u0600-\u06ff]/u.test(message)) return message

  const code = databaseErrorCode(error)
  const mapped = code ? MESSAGES[code] : undefined
  if (mapped) return mapped

  // PostgREST reports missing RPCs as a plain-text message with no code.
  if (/could not find the function|does not exist in the schema cache/i.test(message)) {
    return DATABASE_UPDATE_REQUIRED
  }

  return fallback
}

/**
 * Keeps the operator-facing detail out of the UI but in the log, so a report like
 * "channels_verification_status_check" is still diagnosable from the server.
 */
export function logDatabaseError(scope: string, error: unknown): void {
  const code = databaseErrorCode(error)
  const message = readField(error, 'message') || (error instanceof Error ? error.message : String(error))
  const details = readField(error, 'details')
  console.error(`[db] ${scope}`, { code: code || undefined, message, details: details || undefined })
}
