import { NextResponse } from 'next/server'
import { requirePersonalAssistantApi } from '@/lib/personal-assistant/api-context'
import { credentialsStorageConfigured } from '@/lib/credentials/service'
import { isSecretRef, listUserSecrets, revokeUserSecret, saveUserSecret } from '@/lib/vault/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Fill-only vault API: metadata in, metadata out. A saved value is never returned,
 * logged or re-displayed. Requests carry the value once (over HTTPS) and the server
 * only keeps its AES-256-GCM envelope plus a fingerprint.
 */
export async function GET() {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  try {
    const secrets = await listUserSecrets(access.db, access.owner)
    return NextResponse.json(
      { secrets, storageConfigured: credentialsStorageConfigured() },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return NextResponse.json({ error: 'vault_list_failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 })

  const label = typeof body.label === 'string' ? body.label : ''
  const value = typeof body.value === 'string' ? body.value : ''
  if (!label.trim() || !value.trim()) return NextResponse.json({ error: 'invalid_secret' }, { status: 400 })

  try {
    const secret = await saveUserSecret(access.admin, access.owner, {
      label,
      kind: typeof body.kind === 'string' ? body.kind : 'other',
      value,
    })
    await access.admin.from('audit_events').insert({
      organization_id: access.owner.organizationId,
      actor_type: 'user',
      actor_id: access.owner.userId,
      action: 'vault.secret_saved',
      entity_type: 'user_secret_vault',
      entity_id: null,
      metadata: { secret_ref: secret.secret_ref, secret_kind: secret.secret_kind },
    })
    // Only metadata is returned — deliberately no `value` field.
    return NextResponse.json({ ok: true, secret }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'invalid_secret_label' || code === 'invalid_secret_value' || code === 'secret_too_long') {
      return NextResponse.json({ error: code }, { status: 400 })
    }
    return NextResponse.json({ error: 'vault_save_failed' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  const secretRef = new URL(request.url).searchParams.get('secretRef') ?? ''
  if (!isSecretRef(secretRef)) return NextResponse.json({ error: 'invalid_secret_ref' }, { status: 400 })
  try {
    const revoked = await revokeUserSecret(access.admin, access.owner, secretRef)
    if (!revoked) return NextResponse.json({ error: 'secret_not_found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'vault_revoke_failed' }, { status: 500 })
  }
}
