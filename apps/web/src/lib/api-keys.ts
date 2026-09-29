import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const PREFIX = 'fdk_'

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function generateApiKeyMaterial(): { raw: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString('base64url')
  const raw = `${PREFIX}${secret}`
  const prefix = raw.slice(0, 12)
  return { raw, prefix, hash: hashApiKey(raw) }
}

export async function createOrganizationApiKey(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    name: string
    scopes?: string[]
    createdBy?: string | null
  }
): Promise<{ id: string; rawKey: string; prefix: string }> {
  const material = generateApiKeyMaterial()
  const { data, error } = await supabase
    .from('organization_api_keys')
    .insert({
      organization_id: input.organizationId,
      name: input.name.trim(),
      key_prefix: material.prefix,
      key_hash: material.hash,
      scopes: input.scopes ?? ['read'],
      created_by: input.createdBy ?? null,
    })
    .select('id')
    .single()

  if (error || !data) throw error ?? new Error('api_key_create_failed')
  return { id: data.id, rawKey: material.raw, prefix: material.prefix }
}

export async function revokeOrganizationApiKey(
  supabase: SupabaseClient,
  organizationId: string,
  keyId: string
): Promise<void> {
  const { error } = await supabase
    .from('organization_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('organization_id', organizationId)
    .is('revoked_at', null)
  if (error) throw error
}

/** Resolve org from Bearer key. Never returns the hash. */
export async function resolveApiKeyOrganization(
  supabase: SupabaseClient,
  rawKey: string
): Promise<{ organizationId: string; keyId: string; scopes: string[] } | null> {
  if (!rawKey.startsWith(PREFIX)) return null
  const hash = hashApiKey(rawKey)
  const prefix = rawKey.slice(0, 12)

  const { data } = await supabase
    .from('organization_api_keys')
    .select('id, organization_id, scopes, key_hash')
    .eq('key_prefix', prefix)
    .is('revoked_at', null)
    .maybeSingle()

  if (!data || data.key_hash !== hash) return null

  await supabase
    .from('organization_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)

  return {
    organizationId: data.organization_id,
    keyId: data.id,
    scopes: (data.scopes as string[]) ?? ['read'],
  }
}
