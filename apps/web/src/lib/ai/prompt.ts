import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Build layered system prompt for a business (cached per request).
 * AI must not invent prices, slots, or policies.
 */
export async function buildBusinessSystemPrompt(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string> {
  const [{ data: org }, { data: profile }, { data: services }, { data: hours }, { data: orgCaps }] =
    await Promise.all([
      supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
      supabase
        .from('business_profiles')
        .select('industry, timezone, system_prompt_addition, business_type_id, business_types(name)')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      supabase
        .from('services')
        .select('name, description, duration_minutes, price_amount, price_currency')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('business_hours')
        .select('day_of_week, open_time, close_time, is_closed')
        .eq('organization_id', organizationId)
        .order('day_of_week'),
      supabase
        .from('organization_capabilities')
        .select('capability_id')
        .eq('organization_id', organizationId)
        .eq('is_enabled', true),
    ])

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const hoursText = (hours ?? [])
    .map((h) =>
      h.is_closed
        ? `${dayNames[h.day_of_week]}: closed`
        : `${dayNames[h.day_of_week]}: ${h.open_time?.slice(0, 5)}–${h.close_time?.slice(0, 5)}`
    )
    .join('\n')

  const servicesText = (services ?? [])
    .map((s) => {
      const price =
        s.price_amount != null
          ? `${s.price_currency ?? 'USD'} ${Number(s.price_amount).toFixed(2)}`
          : 'price on request'
      return `- ${s.name}: ${s.duration_minutes} min, ${price}${s.description ? ` — ${s.description}` : ''}`
    })
    .join('\n')

  return [
    'SYSTEM POLICY',
    'You are the AI receptionist for this business.',
    'Never invent prices, availability, policies, or medical advice.',
    'Only use tools to look up customers, slots, and to book.',
    'If unsure, say you will check or offer human handoff.',
    'Be concise, professional, and warm.',
    '',
    'BUSINESS CONTEXT',
    `Business name: ${org?.name ?? 'Business'}`,
    `Industry: ${profile?.industry ?? 'beauty_wellness'}`,
    `Business type: ${(profile?.business_types as { name?: string } | null)?.name ?? profile?.business_type_id ?? 'appointments'}`,
    `Enabled capabilities: ${(orgCaps ?? []).map((c) => c.capability_id).join(', ') || 'none'}`,
    `Timezone: ${profile?.timezone ?? 'UTC'}`,
    profile?.system_prompt_addition
      ? `Extra instructions: ${profile.system_prompt_addition}`
      : '',
    '',
    'SERVICES',
    servicesText || '(no services configured yet)',
    '',
    'HOURS',
    hoursText || '(hours not configured)',
    '',
    'TOOLS',
    'get_customer(phone), find_available_slots(date, service_name|service_id), create_appointment(phone, service_id, starts_at), request_human_handoff(reason)',
  ]
    .filter((l) => l !== '')
    .join('\n')
}
