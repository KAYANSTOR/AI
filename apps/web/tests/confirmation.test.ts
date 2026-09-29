import { describe, expect, test } from 'bun:test'
import { isAffirmative, isNegative } from '@/lib/runtime/pending'

describe('customer confirmation language', () => {
  test('recognises explicit Arabic and English affirmations', () => {
    for (const text of ['نعم', 'نعم احجز', 'احجز', 'موافق', 'تمام', 'أكيد', 'ايوه', 'yes', 'ok', 'confirm', 'book it']) {
      expect(isAffirmative(text)).toBe(true)
    }
  })

  test('recognises explicit rejection', () => {
    for (const text of ['لا', 'إلغاء', 'الغاء', 'ليس الآن', 'no', 'cancel', 'stop', 'not now']) {
      expect(isNegative(text)).toBe(true)
    }
  })

  test('trailing punctuation and case do not matter', () => {
    expect(isAffirmative('  نعم!؟ ')).toBe(true)
    expect(isAffirmative('YES.')).toBe(true)
  })

  test('an ambiguous reply is neither an affirmation nor a rejection', () => {
    // A sensitive write must never execute on a non-answer.
    for (const text of ['ربما', 'سأفكر', 'maybe', 'later', '', 'كم السعر؟']) {
      expect(isAffirmative(text)).toBe(false)
      expect(isNegative(text)).toBe(false)
    }
  })

  test('an affirmation is never mistaken for a rejection', () => {
    expect(isNegative('نعم')).toBe(false)
    expect(isAffirmative('لا')).toBe(false)
  })
})
