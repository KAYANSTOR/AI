import type { SupabaseClient } from '@supabase/supabase-js'

export type ResolvedContact = {
  contactId: string
  organizationId: string
  fullName: string | null
  phone: string | null
  isNew: boolean
}

export async function resolveContactByPhone(
  supabase: SupabaseClient,
  organizationId: string,
  phone: string,
  displayName?: string | null
): Promise<ResolvedContact> {
  const normalized = normalizePhone(phone)

  const { data: existing } = await supabase
    .from('contacts')
    .select('id, full_name, phone, organization_id')
    .eq('organization_id', organizationId)
    .eq('phone', normalized)
    .maybeSingle()

  if (existing) {
    return {
      contactId: existing.id,
      organizationId,
      fullName: existing.full_name,
      phone: existing.phone,
      isNew: false,
    }
  }

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({
      organization_id: organizationId,
      phone: normalized,
      full_name: displayName?.trim() || null,
    })
    .select('id, full_name, phone')
    .single()

  if (error || !created) {
    throw new Error(error?.message ?? 'Failed to create contact')
  }

  await supabase.from('contact_identities').insert({
    contact_id: created.id,
    channel: 'phone',
    external_phone: normalized,
  })

  return {
    contactId: created.id,
    organizationId,
    fullName: created.full_name,
    phone: created.phone,
    isNew: true,
  }
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('00')) return `+${digits.slice(2)}`
  return digits
}
