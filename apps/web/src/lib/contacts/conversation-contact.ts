import type { DbClient } from '@/lib/db/client'
import { ARAB_COUNTRIES, DEFAULT_COUNTRY, toE164 } from '@/lib/phone/arab-countries'

export type SyncedContact = { contactId: string; fullName: string | null; phone: string | null; merged: boolean; alternatePhone?: string | null }

/** Tables whose rows follow the contact when two records of the same person are merged. */
const CONTACT_CHILD_TABLES = ['conversations', 'contact_identities', 'appointments', 'leads'] as const

function dialFor(phone: string | null | undefined): string {
  const digits = String(phone ?? '').replace(/^\+/, '')
  const match = [...ARAB_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((country) => digits.startsWith(country.dial))
  return match?.dial ?? DEFAULT_COUNTRY.dial
}

export function normalizeCustomerPhone(phone: string | null | undefined, referencePhone?: string | null): string | null {
  const raw = String(phone ?? '').trim()
  if (!raw) return null
  return toE164(dialFor(referencePhone), raw)
}

/**
 * Keeps one contact record per person inside an organization.
 * - Name/phone captured during a chat update the conversation's own contact.
 * - If that phone already belongs to another contact of the same organization,
 *   the conversation contact is merged into it (conversations, identities,
 *   appointments and leads are re-pointed) instead of creating a duplicate.
 * - A phone already known from the channel is never overwritten.
 */
export async function syncConversationContact(db: DbClient, input: {
  organizationId: string
  conversationId?: string | null
  contactId: string
  name?: string | null
  phone?: string | null
}): Promise<SyncedContact> {
  const { data: current, error } = await db.from('contacts')
    .select('id,full_name,phone').eq('id', input.contactId).eq('organization_id', input.organizationId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!current) throw new Error('contact_not_found')

  const name = input.name?.trim() ? input.name.trim().slice(0, 200) : null
  const currentPhone = current.phone ? String(current.phone) : null
  const phone = normalizeCustomerPhone(input.phone, currentPhone)

  if (phone && phone !== currentPhone) {
    const { data: owner, error: ownerError } = await db.from('contacts')
      .select('id,full_name,phone').eq('organization_id', input.organizationId).eq('phone', phone).neq('id', input.contactId).maybeSingle()
    if (ownerError) throw new Error(ownerError.message)
    if (owner) {
      for (const table of CONTACT_CHILD_TABLES) {
        let query = db.from(table).update({ contact_id: owner.id }).eq('contact_id', input.contactId)
        if (table !== 'contact_identities') query = query.eq('organization_id', input.organizationId)
        const { error: moveError } = await query
        if (moveError && moveError.code !== '23505') throw new Error(moveError.message)
      }
      const mergedName = name ?? (owner.full_name ? String(owner.full_name) : current.full_name ? String(current.full_name) : null)
      if (mergedName !== owner.full_name) {
        await db.from('contacts').update({ full_name: mergedName, updated_at: new Date().toISOString() })
          .eq('id', owner.id).eq('organization_id', input.organizationId)
      }
      return { contactId: String(owner.id), fullName: mergedName, phone, merged: true }
    }
  }

  const patch: Record<string, unknown> = {}
  if (name && name !== current.full_name) patch.full_name = name
  if (phone && !currentPhone) patch.phone = phone
  if (Object.keys(patch).length) {
    const { error: updateError } = await db.from('contacts').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', input.contactId).eq('organization_id', input.organizationId)
    if (updateError) throw new Error(updateError.message)
  }
  if (input.conversationId) {
    await db.from('conversations').update({ contact_id: input.contactId })
      .eq('id', input.conversationId).eq('organization_id', input.organizationId).neq('contact_id', input.contactId)
  }
  return {
    contactId: input.contactId,
    fullName: (patch.full_name as string | undefined) ?? (current.full_name ? String(current.full_name) : null),
    phone: (patch.phone as string | undefined) ?? currentPhone,
    merged: false,
    // The customer asked to use another number: keep the channel number, remember the other one.
    alternatePhone: phone && currentPhone && phone !== currentPhone ? phone : null,
  }
}
