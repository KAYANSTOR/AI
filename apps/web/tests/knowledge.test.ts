import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase } from './support/fake-supabase'
import { searchKnowledge, tokenize } from '@/lib/knowledge/retrieval'

const ORG_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const ORG_B = 'bbbbbbbb-0000-4000-8000-00000000000b'

function supabaseWith(rows: Record<string, unknown>[]) {
  const fake = createFakeSupabase({ knowledge_base: { rows } })
  return fake.client as unknown as SupabaseClient
}

describe('knowledge retrieval', () => {
  test('never returns another tenant entry even when the wording matches', async () => {
    const supabase = supabaseWith([
      { id: 'k1', organization_id: ORG_A, title: 'سياسة الإلغاء', content: 'يمكن الإلغاء قبل 24 ساعة.', category: 'policy', is_active: true },
      { id: 'k2', organization_id: ORG_B, title: 'سياسة الإلغاء', content: 'يمكن الإلغاء قبل 24 ساعة لأي طلب.', category: 'policy', is_active: true },
    ])

    const matches = await searchKnowledge(supabase, ORG_A, 'سياسة الإلغاء')

    expect(matches.map((match) => match.id)).toEqual(['k1'])
  })

  test('ignores deactivated entries so a retired answer is never used', async () => {
    const supabase = supabaseWith([
      { id: 'k1', organization_id: ORG_A, title: 'أوقات العمل', content: 'من 9 إلى 5', category: 'general', is_active: false },
    ])

    expect(await searchKnowledge(supabase, ORG_A, 'أوقات العمل')).toEqual([])
  })

  test('returns nothing when the knowledge base does not cover the question', async () => {
    const supabase = supabaseWith([
      { id: 'k1', organization_id: ORG_A, title: 'سياسة الإلغاء', content: 'قبل 24 ساعة.', category: 'policy', is_active: true },
    ])

    // The caller must be able to tell "no source" from "source says no", so an unmatched
    // query yields an empty result rather than a weak best guess.
    expect(await searchKnowledge(supabase, ORG_A, 'هل تصنعون كعك أعراس')).toEqual([])
  })

  test('ranks a title match above a body match and honours the category filter', async () => {
    const supabase = supabaseWith([
      { id: 'title-hit', organization_id: ORG_A, title: 'الضمان', content: 'تفاصيل عامة', category: 'policy', is_active: true },
      { id: 'body-hit', organization_id: ORG_A, title: 'معلومات الخدمة', content: 'الضمان يشمل الصيانة', category: 'service_info', is_active: true },
    ])

    const ranked = await searchKnowledge(supabase, ORG_A, 'الضمان')
    expect(ranked[0].id).toBe('title-hit')

    const filtered = await searchKnowledge(supabase, ORG_A, 'الضمان', { category: 'service_info' })
    expect(filtered.map((match) => match.id)).toEqual(['body-hit'])
  })

  test('drops stop words so a question does not match on filler alone', () => {
    expect(tokenize('ما هي سياسة الإلغاء')).not.toContain('ما')
    expect(tokenize('ما هي سياسة الإلغاء')).toContain('سياسة')
    expect(tokenize('')).toEqual([])
  })
})
