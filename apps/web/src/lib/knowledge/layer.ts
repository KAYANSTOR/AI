import { createHash } from 'node:crypto'
import type { DbClient } from '@/lib/db/client'
import { searchKnowledge, type KnowledgeMatch } from './retrieval'

export type ValidatedFact = {
  title: string
  category: 'business_info' | 'service_info' | 'pricing' | 'policy' | 'faq' | 'general'
  content: string
  confidence?: 'confirmed' | 'needs_confirmation'
}
export type ValidatedServiceDraft = { name: string; price?: number | null; currency?: string | null; durationMinutes?: number | null; description?: string | null }
export type ContextualKnowledgeResult = { matchedKnowledge: KnowledgeMatch[]; relevantServices: Array<{ name: string; price: string; duration: number }>; relevantHours?: string; compactContext: string }

/** Stable Arabic-aware normalization for content identity and lexical matching. */
export function normalizeKnowledgeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ar')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
    .replace(/[\u200B-\u200F\uFEFF]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}
export function knowledgeContentHash(content: string): string {
  return createHash('sha256').update(normalizeKnowledgeText(content), 'utf8').digest('hex')
}

export async function retrieveContextualKnowledge(db: DbClient, organizationId: string, userQuery: string, options: { maxMatches?: number } = {}): Promise<ContextualKnowledgeResult> {
  const queryLower = normalizeKnowledgeText(userQuery)
  const matches = await searchKnowledge(db, organizationId, userQuery, { limit: options.maxMatches ?? 8 })
  const asksServices = ['خدم','سعر','اسعار','باقة','منتج','تكلف','service','price'].some((term) => queryLower.includes(normalizeKnowledgeText(term)))
  let relevantServices: Array<{ name: string; price: string; duration: number }> = []
  if (asksServices || matches.some((m) => m.category === 'service_info' || m.category === 'pricing')) {
    const { data } = await db.from('services').select('name, description, price_amount, price_currency, duration_minutes').eq('organization_id', organizationId).eq('is_active', true).limit(6)
    relevantServices = (data ?? []).map((s) => ({ name: s.name, price: s.price_amount != null ? `${Number(s.price_amount)} ${s.price_currency || 'SAR'}` : 'حسب الطلب', duration: s.duration_minutes ?? 30 }))
  }
  const asksHours = ['وقت','ساع','متي','يوم','ايام','اجاز','مفتوح','دوام','hour','open'].some((term) => queryLower.includes(normalizeKnowledgeText(term)))
  let relevantHours: string | undefined
  if (asksHours) {
    const { data } = await db.from('business_hours').select('day_of_week, open_time, close_time, is_closed').eq('organization_id', organizationId).order('day_of_week')
    if (data?.length) {
      const days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']
      relevantHours = data.map((h) => h.is_closed ? `${days[h.day_of_week]}: مغلق` : `${days[h.day_of_week]}: ${h.open_time?.slice(0,5)}–${h.close_time?.slice(0,5)}`).join('، ')
    }
  }
  const lines: string[] = []
  if (matches.length) { lines.push('معلومات مؤكدة ذات صلة بسؤال العميل:'); for (const m of matches) lines.push(`• [${m.title}]: ${m.content}`) }
  if (relevantServices.length) { lines.push('الخدمات والأسعار المعتمدة:'); for (const s of relevantServices) lines.push(`• ${s.name}: ${s.price} (${s.duration} دقيقة)`) }
  if (relevantHours) lines.push(`أوقات وساعات العمل المعتمدة: ${relevantHours}`)
  return { matchedKnowledge: matches, relevantServices, relevantHours, compactContext: lines.join('\n') }
}

/** Append-only training: similar titles never overwrite older facts. */
export async function saveValidatedKnowledge(db: DbClient, organizationId: string, candidateFacts: ValidatedFact[]): Promise<Array<{ title: string; category: string; action: 'inserted' | 'duplicate' }>> {
  const results: Array<{ title: string; category: string; action: 'inserted' | 'duplicate' }> = []
  for (const fact of candidateFacts) {
    if (!fact.title || !fact.content || fact.confidence === 'needs_confirmation') continue
    const title = fact.title.trim().slice(0, 200), content = fact.content.trim()
    if (content.length < 5) continue
    const category = ['business_info','service_info','pricing','policy','faq','general'].includes(fact.category) ? fact.category : 'general'
    const contentHash = knowledgeContentHash(content)
    const { data: existing, error: lookupError } = await db.from('knowledge_base').select('id').eq('organization_id', organizationId).eq('content_hash', contentHash).maybeSingle()
    if (lookupError) throw new Error(lookupError.message)
    if (existing?.id) { results.push({ title, category, action: 'duplicate' }); continue }
    const { error } = await db.from('knowledge_base').insert({ organization_id: organizationId, title, content, content_hash: contentHash, category, is_active: true, updated_at: new Date().toISOString() })
    if (error) {
      if (error.code === '23505') { results.push({ title, category, action: 'duplicate' }); continue }
      throw new Error(error.message)
    }
    results.push({ title, category, action: 'inserted' })
  }
  return results
}

export async function saveValidatedServices(db: DbClient, organizationId: string, services: ValidatedServiceDraft[]): Promise<Array<{ name: string; action: 'inserted' | 'updated' }>> {
  const results: Array<{ name: string; action: 'inserted' | 'updated' }> = []
  for (const s of services) {
    if (!s.name?.trim()) continue
    const name = s.name.trim()
    const { data: existing } = await db.from('services').select('id').eq('organization_id', organizationId).ilike('name', name).maybeSingle()
    const price = s.price != null && !Number.isNaN(Number(s.price)) ? Number(s.price) : null
    const duration = s.durationMinutes != null && !Number.isNaN(Number(s.durationMinutes)) ? Number(s.durationMinutes) : 30
    if (existing?.id) {
      await db.from('services').update({ description: s.description || null, price_amount: price, price_currency: s.currency || 'SAR', duration_minutes: duration, is_active: true }).eq('id', existing.id)
      results.push({ name, action: 'updated' })
    } else {
      await db.from('services').insert({ organization_id: organizationId, name, description: s.description || null, price_amount: price, price_currency: s.currency || 'SAR', duration_minutes: duration, is_active: true })
      results.push({ name, action: 'inserted' })
    }
  }
  return results
}
