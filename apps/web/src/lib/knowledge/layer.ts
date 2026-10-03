import type { SupabaseClient } from '@supabase/supabase-js'
import { searchKnowledge, type KnowledgeMatch } from './retrieval'

export type ValidatedFact = {
  title: string
  category: 'business_info' | 'service_info' | 'pricing' | 'policy' | 'faq' | 'general'
  content: string
  confidence?: 'confirmed' | 'needs_confirmation'
}

export type ValidatedServiceDraft = {
  name: string
  price?: number | null
  currency?: string | null
  durationMinutes?: number | null
  description?: string | null
}

export type ContextualKnowledgeResult = {
  matchedKnowledge: KnowledgeMatch[]
  relevantServices: Array<{ name: string; price: string; duration: number }>
  relevantHours?: string
  compactContext: string
}

/**
 * Knowledge Layer:
 * Dynamically retrieves ONLY relevant knowledge, services, and operational hours
 * for a specific query/turn instead of dumping the entire database into the system prompt.
 * Strictly scoped to organizationId (multi-tenant isolation).
 */
export async function retrieveContextualKnowledge(
  supabase: SupabaseClient,
  organizationId: string,
  userQuery: string,
  options: { maxMatches?: number } = {}
): Promise<ContextualKnowledgeResult> {
  const queryLower = (userQuery || '').toLowerCase()

  // 1. Semantic/Lexical retrieval from knowledge_base
  const matches = await searchKnowledge(supabase, organizationId, userQuery, {
    limit: options.maxMatches ?? 4,
  })

  // 2. Check if the query is asking about services or pricing
  const asksServices =
    queryLower.includes('خدم') ||
    queryLower.includes('سعر') ||
    queryLower.includes('اسعار') ||
    queryLower.includes('باقة') ||
    queryLower.includes('منتج') ||
    queryLower.includes('تكلفة') ||
    queryLower.includes('service') ||
    queryLower.includes('price')

  let relevantServices: Array<{ name: string; price: string; duration: number }> = []
  if (asksServices || matches.some((m) => m.category === 'service_info' || m.category === 'pricing')) {
    const { data: svcRows } = await supabase
      .from('services')
      .select('name, description, price_amount, price_currency, duration_minutes')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(6)

    relevantServices = (svcRows ?? []).map((s) => ({
      name: s.name,
      price:
        s.price_amount != null
          ? `${Number(s.price_amount)} ${s.price_currency || 'SAR'}`
          : 'حسب الطلب',
      duration: s.duration_minutes ?? 30,
    }))
  }

  // 3. Check if the query is asking about working hours or availability
  const asksHours =
    queryLower.includes('وقت') ||
    queryLower.includes('ساعة') ||
    queryLower.includes('ساعات') ||
    queryLower.includes('متى') ||
    queryLower.includes('يوم') ||
    queryLower.includes('ايام') ||
    queryLower.includes('إجازة') ||
    queryLower.includes('مفتوح') ||
    queryLower.includes('دوام') ||
    queryLower.includes('hour') ||
    queryLower.includes('open')

  let relevantHours: string | undefined
  if (asksHours) {
    const { data: hoursRows } = await supabase
      .from('business_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('organization_id', organizationId)
      .order('day_of_week')

    if (hoursRows && hoursRows.length > 0) {
      const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
      relevantHours = hoursRows
        .map((h) =>
          h.is_closed
            ? `${dayNames[h.day_of_week]}: مغلق`
            : `${dayNames[h.day_of_week]}: ${h.open_time?.slice(0, 5)}–${h.close_time?.slice(0, 5)}`
        )
        .join('، ')
    }
  }

  // Format compact context lines
  const lines: string[] = []
  if (matches.length > 0) {
    lines.push('معلومات مؤكدة ذات صلة بسؤال العميل:')
    for (const m of matches) {
      lines.push(`• [${m.title}]: ${m.content}`)
    }
  }

  if (relevantServices.length > 0) {
    lines.push('الخدمات والأسعار المعتمدة:')
    for (const s of relevantServices) {
      lines.push(`• ${s.name}: ${s.price} (${s.duration} دقيقة)`)
    }
  }

  if (relevantHours) {
    lines.push(`أوقات وساعات العمل المعتمدة: ${relevantHours}`)
  }

  return {
    matchedKnowledge: matches,
    relevantServices,
    relevantHours,
    compactContext: lines.join('\n'),
  }
}

/**
 * Validates candidate facts, avoids blind saving, and de-duplicates against existing knowledge.
 * If an entry on the same topic exists, it updates it; otherwise it inserts a new validated entry.
 */
export async function saveValidatedKnowledge(
  supabase: SupabaseClient,
  organizationId: string,
  candidateFacts: ValidatedFact[]
): Promise<Array<{ title: string; category: string; action: 'inserted' | 'updated' }>> {
  const results: Array<{ title: string; category: string; action: 'inserted' | 'updated' }> = []

  for (const fact of candidateFacts) {
    if (!fact.title || !fact.content) continue
    const title = fact.title.trim().slice(0, 200)
    const content = fact.content.trim()
    if (content.length < 5) continue

    const category = ['business_info', 'service_info', 'pricing', 'policy', 'faq', 'general'].includes(
      fact.category
    )
      ? fact.category
      : 'general'

    // Look for duplicate / overlapping entry
    const { data: existing } = await supabase
      .from('knowledge_base')
      .select('id, title, content')
      .eq('organization_id', organizationId)
      .ilike('title', `%${title}%`)
      .maybeSingle()

    if (existing?.id) {
      await supabase
        .from('knowledge_base')
        .update({
          content,
          category,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      results.push({ title, category, action: 'updated' })
    } else {
      await supabase.from('knowledge_base').insert({
        organization_id: organizationId,
        title,
        content,
        category,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      results.push({ title, category, action: 'inserted' })
    }
  }

  return results
}

/**
 * Validates and upserts new service offerings to the services table.
 */
export async function saveValidatedServices(
  supabase: SupabaseClient,
  organizationId: string,
  services: ValidatedServiceDraft[]
): Promise<Array<{ name: string; action: 'inserted' | 'updated' }>> {
  const results: Array<{ name: string; action: 'inserted' | 'updated' }> = []

  for (const s of services) {
    if (!s.name || !s.name.trim()) continue
    const name = s.name.trim()

    const { data: existing } = await supabase
      .from('services')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('name', name)
      .maybeSingle()

    const price = s.price != null && !Number.isNaN(Number(s.price)) ? Number(s.price) : null
    const duration =
      s.durationMinutes != null && !Number.isNaN(Number(s.durationMinutes))
        ? Number(s.durationMinutes)
        : 30

    if (existing?.id) {
      await supabase
        .from('services')
        .update({
          description: s.description || null,
          price_amount: price,
          price_currency: s.currency || 'SAR',
          duration_minutes: duration,
          is_active: true,
        })
        .eq('id', existing.id)
      results.push({ name, action: 'updated' })
    } else {
      await supabase.from('services').insert({
        organization_id: organizationId,
        name,
        description: s.description || null,
        price_amount: price,
        price_currency: s.currency || 'SAR',
        duration_minutes: duration,
        is_active: true,
      })
      results.push({ name, action: 'inserted' })
    }
  }

  return results
}
