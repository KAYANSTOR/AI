import type { DbClient } from '@/lib/db/client'

/** Error thrown when an inbound sender appears on the organization's ignored-phone list. */
export class IgnoredPhoneError extends Error {
  constructor(public readonly organizationId: string) {
    super(`inbound sender is on the ignored_phones list for organization ${organizationId}`)
    this.name = 'IgnoredPhoneError'
  }
}

/** Digits-only comparison key so formatting differences never leak past the filter. */
function phoneDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * A phone is ignored when its digits match an entry on the list (either stored
 * with the same formatting or digits-only). Empty list entries never match.
 */
export function isIgnoredPhone(list: string[], phone: string): boolean {
  const digits = phoneDigits(phone)
  if (!digits) return false
  return list.some((entry) => {
    const entryDigits = phoneDigits(entry)
    return entryDigits.length > 0 && entryDigits === digits
  })
}

/**
 * Reads the organization's ignored_phones list.
 *
 * The list is stored as the Postgres text[] column `ignored_phones` on
 * organizations. A database error must not permit an excluded sender into
 * the commercial inbox; fail closed so the webhook or worker can retry.
 */
export async function ignoredPhones(db: DbClient, organizationId: string): Promise<string[]> {
  try {
    const { data, error } = await db
      .from('organizations')
      .select('ignored_phones')
      .eq('id', organizationId)
      .maybeSingle()
    if (error) throw new Error('ignored_phone_lookup_failed')
    if (!data) return []
    const value = (data as { ignored_phones?: unknown }).ignored_phones
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch {
    console.warn('ignored_phone_lookup_failed', { organizationId })
    throw new Error('ignored_phone_lookup_failed')
  }
}
