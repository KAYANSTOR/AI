'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminCapability, audit } from '@/lib/capabilities/guard'
import { actionErrorMessage, dbActionError } from '@/lib/i18n/action-error'
import { createOrganizationApiKey, revokeOrganizationApiKey } from '@/lib/api-keys'

export type ApiKeyResult =
  | { ok: true; rawKey?: string; id?: string }
  | { ok: false; error: string }

export async function createApiKeyAction(name: string): Promise<ApiKeyResult> {
  try {
    const ctx = await requireAdminCapability(null)
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'الاسم مطلوب.' }

    const created = await createOrganizationApiKey(ctx.db, {
      organizationId: ctx.organizationId,
      name: trimmed,
      scopes: ['read'],
      createdBy: ctx.userId,
    })

    await audit(ctx, 'api_key.created', 'api_key', created.id, { prefix: created.prefix })
    revalidatePath('/dashboard/settings/api-keys')
    return { ok: true, rawKey: created.rawKey, id: created.id }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إنشاء المفتاح.') }
  }
}

export async function revokeApiKeyAction(keyId: string): Promise<ApiKeyResult> {
  try {
    const ctx = await requireAdminCapability(null)
    await revokeOrganizationApiKey(ctx.db, ctx.organizationId, keyId)
    await audit(ctx, 'api_key.revoked', 'api_key', keyId)
    revalidatePath('/dashboard/settings/api-keys')
    return { ok: true, id: keyId }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, dbActionError(error as never)) }
  }
}
