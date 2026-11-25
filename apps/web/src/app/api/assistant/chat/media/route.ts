import { NextResponse } from 'next/server'
import { requireExecutiveAssistantApi } from '@/lib/personal-assistant/api-context'
import { appendThreadMessage } from '@/lib/personal-assistant/thread'
import { runPersonalAssistantTurn } from '@/lib/personal-assistant/runtime'
import { buildEngineDeps } from '@/lib/central-bot/deps'
import { assertWithinLimit, EntitlementExceededError } from '@/lib/billing/entitlements'
import { getAiGuardPolicy } from '@/lib/billing/free-tier'
import { fromWebUpload } from '@/lib/media/attachment'
import { runAssistantMediaTurn } from '@/lib/personal-assistant/web-media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Paid hard cap (5 MB) plus multipart overhead; checked before the body is parsed. */
const MAX_BODY_BYTES = 5 * 1024 * 1024 + 64 * 1024
const MAX_CAPTION = 500

const KIND_PREFIX: Record<string, string> = { image: '[صورة] ', document: '[ملف] ', audio: '' }

/** Uploaded image/file or recorded voice note -> same validation path as every channel. */
export async function POST(request: Request) {
  const access = await requireExecutiveAssistantApi()
  if (access instanceof NextResponse) return access

  const declared = Number(request.headers.get('content-length') ?? '')
  if (!Number.isFinite(declared) || declared <= 0) return NextResponse.json({ error: 'length_required' }, { status: 411 })
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
  if (!String(request.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!form || !(file instanceof File) || file.size <= 0) return NextResponse.json({ error: 'invalid_file' }, { status: 400 })
  if (file.size > MAX_BODY_BYTES) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
  const caption = String(form.get('caption') ?? '').trim().slice(0, MAX_CAPTION) || null
  const voiceNote = form.get('voice') === '1'

  try {
    await assertWithinLimit(access.admin, access.owner.organizationId, 'ai_messages')
  } catch (error) {
    if (error instanceof EntitlementExceededError) return NextResponse.json({ error: 'entitlement_exceeded' }, { status: 429 })
    return NextResponse.json({ error: 'billing_check_failed' }, { status: 503 })
  }

  try {
    const policy = await getAiGuardPolicy(access.admin, access.owner.organizationId)
    const attachment = fromWebUpload({ name: file.name, type: file.type, size: file.size }, Buffer.from(await file.arrayBuffer()), caption, voiceNote)
    const result = await runAssistantMediaTurn(access.admin, access.owner, attachment, {
      policy,
      runTurn: async (text) => (await runPersonalAssistantTurn(access.admin, access.owner, text, { engine: buildEngineDeps(access.admin) })).reply,
    })
    const kind = String(result.media.kind ?? attachment.kind)
    await appendThreadMessage(access.admin, access.owner, {
      direction: 'inbound', source: 'web', type: kind === 'audio' ? 'voice' : 'text',
      content: (KIND_PREFIX[kind] ?? '') + result.content,
    })
    if (result.reply) await appendThreadMessage(access.admin, access.owner, { direction: 'outbound', source: 'web', content: result.reply })
    return NextResponse.json(
      { status: result.status, reply: result.reply, content: result.content, kind },
      { status: result.httpStatus === 200 ? 200 : result.httpStatus }
    )
  } catch (error) {
    console.error('personal_media_failed', { reason: error instanceof Error ? error.message.slice(0, 120) : 'unknown' })
    return NextResponse.json({ error: 'assistant_unavailable' }, { status: 502 })
  }
}
