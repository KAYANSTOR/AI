import { NextResponse } from 'next/server'
import { requireTrainerApi } from '@/lib/trainer/api-context'
import { createTrainerLinkCode, loadReadiness } from '@/lib/trainer/router'
import { approveSubmission, cancelSubmission, deleteSubmission, listSubmissions } from '@/lib/trainer/submissions'
import { trainerEntryNumber } from '@/lib/central-bot/config'
import { embedKnowledgeText } from '@/lib/knowledge/embeddings'
import type { TrainingDraft } from '@/lib/trainer/extract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH_RE = /^[0-9a-f]{64}$/

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: NO_STORE })
}

/** Readiness + recent WhatsApp inputs + link status (phone masked). */
export async function GET() {
  const access = await requireTrainerApi()
  if (access instanceof NextResponse) return access
  const [readiness, rows, link] = await Promise.all([
    loadReadiness(access.admin, access.owner, access.verticalId),
    listSubmissions(access.admin, access.owner, 20),
    access.admin.from('whatsapp_trainer_links').select('whatsapp_phone, verified_at')
      .eq('org_id', access.owner.organizationId).eq('user_id', access.owner.userId).maybeSingle(),
  ])
  const phone = link.data?.whatsapp_phone ? String(link.data.whatsapp_phone) : null
  const entry = trainerEntryNumber()
  return NextResponse.json({
    target: access.target,
    mode: entry.mode,
    configured: entry.mode !== 'none',
    linked: Boolean(link.data?.verified_at && phone),
    phoneMasked: phone ? `${phone.slice(0, 5)}•••${phone.slice(-3)}` : null,
    readiness: {
      percent: readiness.percent,
      next: readiness.next ? { key: readiness.next.key, label: readiness.next.label, question: readiness.next.question } : null,
      items: readiness.items.map((item) => ({ key: item.key, label: item.label, done: item.done })),
    },
    submissions: rows.map((row) => {
      const draft = (row.draft ?? {}) as Partial<TrainingDraft>
      return {
        id: String(row.id),
        inputType: String(row.input_type),
        status: String(row.status),
        channel: String(row.channel),
        flagged: row.flagged === true,
        fileName: row.file_name ? String(row.file_name) : null,
        createdAt: String(row.created_at),
        hash: row.status === 'pending' ? String(row.payload_hash) : null,
        summary: String(draft.summary ?? '').slice(0, 300),
        items: (Array.isArray(draft.items) ? draft.items : []).slice(0, 8).map((item) => ({
          title: String(item?.title ?? '').slice(0, 120),
          content: String(item?.content ?? '').slice(0, 1200),
        })),
      }
    }),
  }, { headers: NO_STORE })
}

export async function POST(request: Request) {
  const access = await requireTrainerApi()
  if (access instanceof NextResponse) return access
  let body: Record<string, unknown>
  try {
    const parsed = await request.json() as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return bad('invalid_body')
    body = parsed as Record<string, unknown>
  } catch {
    return bad('invalid_body')
  }

  if (body.action === 'link_code') {
    const entry = trainerEntryNumber()
    if (entry.mode === 'none') return NextResponse.json({ error: 'trainer_not_configured', configured: false }, { status: 503, headers: NO_STORE })
    try {
      const link = await createTrainerLinkCode(access.admin, access.owner, { displayNumber: entry.number })
      return NextResponse.json({ waLink: link.waLink, expiresAt: link.expiresAt, mode: entry.mode }, { status: 201, headers: NO_STORE })
    } catch {
      return bad('link_code_failed', 500)
    }
  }

  const id = typeof body.id === 'string' ? body.id : ''
  if (!UUID_RE.test(id)) return bad('invalid_id')

  if (body.action === 'approve') {
    const hash = typeof body.hash === 'string' ? body.hash : ''
    if (!HASH_RE.test(hash)) return bad('invalid_hash')
    const result = await approveSubmission(access.admin, access.owner, { id, hash, via: 'web' }, {
      embed: (text, title) => embedKnowledgeText(text, 'document', title),
    })
    if (result.status === 'indexed') return NextResponse.json({ status: 'indexed', count: result.refs.length }, { headers: NO_STORE })
    if (result.status === 'not_found') return bad('not_found', 404)
    if (result.status === 'hash_mismatch') return bad('hash_mismatch', 409)
    if (result.status === 'already_decided') return bad('already_decided', 409)
    return bad('index_failed', 500)
  }

  if (body.action === 'cancel') {
    const result = await cancelSubmission(access.admin, access.owner, id, 'web')
    if (result === 'cancelled') return NextResponse.json({ status: 'cancelled' }, { headers: NO_STORE })
    return bad(result, result === 'not_found' ? 404 : 409)
  }

  return bad('unknown_action')
}

export async function DELETE(request: Request) {
  const access = await requireTrainerApi()
  if (access instanceof NextResponse) return access
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) return bad('invalid_id')
  const result = await deleteSubmission(access.admin, access.owner, id)
  if (result === 'deleted') return NextResponse.json({ status: 'deleted' }, { headers: NO_STORE })
  return bad(result, result === 'not_found' ? 404 : 409)
}
