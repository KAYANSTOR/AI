import { describe, expect, test } from 'bun:test'
import { translateAuthError } from '@/lib/auth/messages'

describe('auth error messages', () => {
  test('translates Supabase invalid-email messages', () => {
    expect(translateAuthError('Email address "person@example.com" is invalid')).toBe('صيغة البريد الإلكتروني غير صحيحة.')
  })
})
