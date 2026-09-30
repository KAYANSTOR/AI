import { describe, expect, test } from 'bun:test'
import {
  DATABASE_UPDATE_REQUIRED,
  databaseErrorCode,
  databaseErrorMessage,
  isDatabaseUpdateRequired,
} from '@/lib/db/errors'

describe('database error messages', () => {
  test('a check-constraint failure reads as an invalid field, not as 23514', () => {
    // The value that produced channels_verification_status_check in production.
    const message = databaseErrorMessage({
      code: '23514',
      message: 'new row for relation "channels" violates check constraint "channels_verification_status_check"',
    })

    expect(message).not.toContain('23514')
    expect(message).not.toContain('channels_verification_status_check')
    expect(message).toContain('غير مقبول')
  })

  test('a missing function or table is reported as a stale deployment', () => {
    const missingFunction = {
      code: 'PGRST202',
      message: 'Could not find the function public.list_channel_credential_metadata(p_organization_id) in the schema cache',
    }
    const missingFromCache = {
      message: 'Could not find the function public.log_audit_event in the schema cache',
    }

    expect(databaseErrorMessage(missingFunction)).toBe(DATABASE_UPDATE_REQUIRED)
    expect(databaseErrorMessage(missingFromCache)).toBe(DATABASE_UPDATE_REQUIRED)
    expect(isDatabaseUpdateRequired(missingFunction)).toBe(true)
  })

  test('never echoes a raw code or constraint name for the mapped failures', () => {
    const errors = [
      { code: '23505', message: 'duplicate key value violates unique constraint "ux_x"' },
      { code: '23503', message: 'insert or update violates foreign key constraint' },
      { code: '23502', message: 'null value in column "name" violates not-null constraint' },
      { code: '42501', message: 'permission denied for table channels' },
      { code: '42P01', message: 'relation "channels" does not exist' },
      { code: 'PGRST301', message: 'JWT expired' },
    ]

    for (const error of errors) {
      const message = databaseErrorMessage(error)
      expect(message).not.toContain(error.code)
      expect(message).not.toContain('constraint')
      expect(message).not.toContain('relation')
    }
  })

  test('an Arabic message produced for a reader is passed through', () => {
    expect(databaseErrorMessage({ code: '23514', message: 'المعرّف مطلوب.' })).toBe('المعرّف مطلوب.')
    expect(databaseErrorMessage(new Error('لم يكتمل الربط بعد.'))).toBe('لم يكتمل الربط بعد.')
  })

  test('an unmapped failure falls back instead of leaking internals', () => {
    const internal = { code: 'XX000', message: 'internal error: tuple concurrently updated' }

    expect(databaseErrorMessage(internal, 'تعذّر إتمام العملية.')).toBe('تعذّر إتمام العملية.')
    expect(databaseErrorMessage(internal)).not.toContain('tuple concurrently updated')
    expect(isDatabaseUpdateRequired(internal)).toBe(false)
  })

  test('the code is still available for the log', () => {
    expect(databaseErrorCode({ code: '23514' })).toBe('23514')
    expect(databaseErrorCode(new Error('no code'))).toBe('')
    expect(databaseErrorCode(null)).toBe('')
  })
})
