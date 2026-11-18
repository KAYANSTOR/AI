import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import { createFakeDb } from './support/fake-db'
import { searchKnowledge, tokenize } from '@/lib/knowledge/retrieval'
import { knowledgeContentHash, normalizeKnowledgeText, saveValidatedKnowledge } from '@/lib/knowledge/layer'

const ORG_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const ORG_B = 'bbbbbbbb-0000-4000-8000-00000000000b'

function dbWith(rows: Record<string, unknown>[]) {
  const fake = createFakeDb({ knowledge_base: { rows } })
  return fake.client as unknown as DbClient
}

describe('knowledge retrieval', () => {
  test('never returns another tenant entry even when the wording matches', async () => {
    const db = dbWith([
      { id: 'k1', organization_id: ORG_A, title: 'سياسة الإلغاء', content: 'يمكن الإلغاء قبل 24 ساعة.', category: 'policy', is_active: true },
      { id: 'k2', organization_id: ORG_B, title: 'سياسة الإلغاء', content: 'يمكن الإلغاء قبل 24 ساعة لأي طلب.', category: 'policy', is_active: true },
    ])

    const matches = await searchKnowledge(db, ORG_A, 'سياسة الإلغاء')

    expect(matches.map((match) => match.id)).toEqual(['k1'])
  })

  test('ignores deactivated entries so a retired answer is never used', async () => {
    const db = dbWith([
      { id: 'k1', organization_id: ORG_A, title: 'أوقات العمل', content: 'من 9 إلى 5', category: 'general', is_active: false },
    ])

    expect(await searchKnowledge(db, ORG_A, 'أوقات العمل')).toEqual([])
  })

  test('returns nothing when the knowledge base does not cover the question', async () => {
    const db = dbWith([
      { id: 'k1', organization_id: ORG_A, title: 'سياسة الإلغاء', content: 'قبل 24 ساعة.', category: 'policy', is_active: true },
    ])

    // The caller must be able to tell "no source" from "source says no", so an unmatched
    // query yields an empty result rather than a weak best guess.
    expect(await searchKnowledge(db, ORG_A, 'هل تصنعون كعك أعراس')).toEqual([])
  })

  test('ranks a title match above a body match and honours the category filter', async () => {
    const db = dbWith([
      { id: 'title-hit', organization_id: ORG_A, title: 'الضمان', content: 'تفاصيل عامة', category: 'policy', is_active: true },
      { id: 'body-hit', organization_id: ORG_A, title: 'معلومات الخدمة', content: 'الضمان يشمل الصيانة', category: 'service_info', is_active: true },
    ])

    const ranked = await searchKnowledge(db, ORG_A, 'الضمان')
    expect(ranked[0].id).toBe('title-hit')

    const filtered = await searchKnowledge(db, ORG_A, 'الضمان', { category: 'service_info' })
    expect(filtered.map((match) => match.id)).toEqual(['body-hit'])
  })

  test('drops stop words so a question does not match on filler alone', () => {
    expect(tokenize('ما هي سياسة الإلغاء')).not.toContain('ما')
    expect(tokenize('ما هي سياسة الإلغاء')).toContain('سياسة')
    expect(tokenize('')).toEqual([])
  })
})


describe('cumulative knowledge writes', () => {
  test('normalizes Arabic variants and diacritics for stable content identity', () => {
    expect(normalizeKnowledgeText('إِلغاءُ الحجز')).toBe(normalizeKnowledgeText('الغاء الحجز'))
    expect(knowledgeContentHash('السعر ١٠٠')).toBe(knowledgeContentHash('السعر ١٠٠'))
  })

  test('keeps different facts with similar titles and skips only exact normalized duplicates', async () => {
    const fake = createFakeDb({
      knowledge_base: { rows: [], unique: [{ columns: ['organization_id', 'content_hash'] }] },
    })
    const db = fake.client as unknown as DbClient
    const saved = await saveValidatedKnowledge(db, ORG_A, [
      { title: 'ساعات العمل', category: 'business_info', content: 'الدوام من الأحد إلى الخميس من التاسعة صباحاً.' },
      { title: 'ساعات العمل', category: 'business_info', content: 'الدوام يوم الجمعة من الرابعة إلى العاشرة مساءً.' },
      { title: 'مواعيد الدوام', category: 'business_info', content: 'الدوام من الأحد إلى الخميس من التاسعة صباحاً.' },
    ])
    expect(saved.map((item) => item.action)).toEqual(['inserted', 'inserted', 'duplicate'])
    expect(fake.store.knowledge_base?.rows).toHaveLength(2)
  })

  test('does not persist facts marked as needing confirmation', async () => {
    const fake = createFakeDb({ knowledge_base: { rows: [] } })
    const db = fake.client as unknown as DbClient
    const saved = await saveValidatedKnowledge(db, ORG_A, [
      { title: 'سعر غير مؤكد', category: 'pricing', content: 'قد يكون السعر 100 ريال', confidence: 'needs_confirmation' },
    ])
    expect(saved).toEqual([])
    expect(fake.store.knowledge_base?.rows).toHaveLength(0)
  })
})


describe('hybrid knowledge search integration', () => {
  test('sends tenant scope and hybrid query parameters to the database ranking function', async () => {
    const fake = createFakeDb({}, {
      search_knowledge_hybrid(args) {
        expect(args.p_organization_id).toBe(ORG_A)
        expect(args.p_query).toBe('الغاء الحجز')
        expect(args.p_query_embedding).toBeNull()
        expect(args.p_limit).toBe(8)
        return [{
          id: 'semantic-hit',
          title: 'سياسة الحجز',
          category: 'policy',
          content: 'يمكن تعديل الحجز قبل الموعد.',
          score: 0.81,
        }]
      },
    })
    const db = fake.client as unknown as DbClient
    const matches = await searchKnowledge(db, ORG_A, 'إلغاء الحجز')
    expect(matches.map((match) => match.id)).toEqual(['semantic-hit'])
  })
})
