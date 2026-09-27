import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { resolveContactByPhone } from '@/lib/channels/contacts'
import { checkEligibility } from '@/lib/channels/eligibility'
import { executeTool } from '@/lib/ai/tools'
import { buildBusinessSystemPrompt } from '@/lib/ai/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const expected = process.env.WHATSAPP_VERIFY_TOKEN

  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  let eventRowId: string | null = null

  try {
    const body = (await req.json()) as Record<string, unknown>
    const entry = ((body.entry as unknown[]) ?? [])[0] as Record<string, unknown> | undefined
    const changes = ((entry?.changes as unknown[]) ?? [])[0] as Record<string, unknown> | undefined
    const value = (changes?.value ?? {}) as Record<string, unknown>
    const messages = (value.messages as Array<Record<string, unknown>> | undefined) ?? []

    if (!messages.length) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const msg = messages[0]
    const externalEventId = String(msg.id ?? crypto.randomUUID())
    const acquired = await acquireWebhookEvent(supabase, 'whatsapp', externalEventId, body)
    if (acquired.status === 'duplicate') {
      return NextResponse.json({ status: 'duplicate' })
    }
    if (acquired.status === 'error') {
      return NextResponse.json({ error: acquired.message }, { status: 500 })
    }
    eventRowId = acquired.eventRowId

    const from = String(msg.from ?? '')
    const textBody =
      ((msg.text as Record<string, unknown> | undefined)?.body as string | undefined) ?? ''

    const organizationId = await resolveOrgFromPhoneNumberId(
      supabase,
      String((value.metadata as Record<string, unknown> | undefined)?.phone_number_id ?? '')
    )

    if (!organizationId) {
      await markWebhookProcessed(
        supabase,
        eventRowId,
        'failed',
        'organization not mapped for this WhatsApp number'
      )
      return NextResponse.json({ error: 'org_not_mapped' }, { status: 400 })
    }

    const contact = await resolveContactByPhone(supabase, organizationId, from)
    const channelId = await ensureWhatsAppChannel(supabase, organizationId)
    const conversationId = await ensureConversation(
      supabase,
      organizationId,
      contact.contactId,
      channelId
    )

    await supabase.from('messages').insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: 'inbound',
      message_type: 'text',
      content: textBody,
      external_message_id: externalEventId,
    })

    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId)

    const eligibility = checkEligibility({
      channel: 'whatsapp',
      lastInboundAt: new Date().toISOString(),
    })

    const reply = await craftReply({
      supabase,
      organizationId,
      contactPhone: contact.phone ?? from,
      text: textBody,
      eligibilityMode: eligibility.allowed ? eligibility.mode : 'blocked',
    })

    if (reply && eligibility.allowed && eligibility.mode === 'freeform') {
      await sendWhatsAppText(from, reply)
      await supabase.from('messages').insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        direction: 'outbound',
        message_type: 'text',
        content: reply,
      })
    }

    await markWebhookProcessed(supabase, eventRowId, 'processed')
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'whatsapp webhook error'
    if (eventRowId) {
      await markWebhookProcessed(supabase, eventRowId, 'failed', msg)
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function resolveOrgFromPhoneNumberId(
  supabase: ReturnType<typeof createAdminClient>,
  phoneNumberId: string
): Promise<string | null> {
  if (!phoneNumberId) {
    const { data } = await supabase.from('organizations').select('id').limit(1).maybeSingle()
    return data?.id ?? null
  }

  const { data } = await supabase
    .from('channels')
    .select('organization_id')
    .eq('channel_type', 'whatsapp')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (data?.organization_id) return data.organization_id

  const { data: org } = await supabase.from('organizations').select('id').limit(1).maybeSingle()
  return org?.id ?? null
}

async function ensureWhatsAppChannel(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string
): Promise<string> {
  const { data: existing } = await supabase
    .from('channels')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('channel_type', 'whatsapp')
    .maybeSingle()

  if (existing) return existing.id

  const { data, error } = await supabase
    .from('channels')
    .insert({ organization_id: organizationId, channel_type: 'whatsapp', is_active: true })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return data.id
}

async function ensureConversation(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
  contactId: string,
  channelId: string
): Promise<string> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId)
    .eq('channel_id', channelId)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) return existing.id

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      organization_id: organizationId,
      contact_id: contactId,
      channel_id: channelId,
      status: 'active',
      ai_enabled: true,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return data.id
}

async function craftReply(args: {
  supabase: ReturnType<typeof createAdminClient>
  organizationId: string
  contactPhone: string
  text: string
  eligibilityMode: string
}): Promise<string | null> {
  if (args.eligibilityMode === 'blocked') return null

  const lower = args.text.toLowerCase()
  if (lower.includes('موعد') || lower.includes('appointment') || lower.includes('book')) {
    await executeTool(
      'get_customer',
      { phone: args.contactPhone },
      { organizationId: args.organizationId, supabase: args.supabase }
    )
    void buildBusinessSystemPrompt
    return 'مرحباً! يمكنني مساعدتك في حجز موعد. ما الخدمة والتاريخ المفضل لديك؟ (مثال: تنظيف غداً)'
  }

  if (lower.includes('سعر') || lower.includes('price') || lower.includes('cost')) {
    return 'أسعار الخدمات تظهر في نظامنا الرسمي فقط. أخبرني باسم الخدمة لأعرض التفاصيل المتاحة.'
  }

  return 'مرحباً بك في FrontDesk AI. كيف يمكنني مساعدتك اليوم؟ يمكنني حجز موعد أو الإجابة عن أسئلة الخدمات.'
}

async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) {
    return
  }

  await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  })
}
