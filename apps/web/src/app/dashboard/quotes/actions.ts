'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability, audit, type AuthorizedContext } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'
import { assertMarketingAllowed, ConsentBlockedError } from '@/lib/channels/consent'
import { enqueueOutbound } from '@/lib/channels/outbox'
import { calculateQuoteTotals } from '@/lib/sales'

export type QuoteResult = { ok: boolean; error?: string; quoteId?: string }

export interface QuoteItemInput {
  name: string
  description?: string
  quantity: number
  unit_price: number
  discount: number
}

export interface CreateQuoteInput {
  contact_id: string
  location_id?: string | null
  conversation_id?: string | null
  notes?: string
  valid_until?: string
  items: QuoteItemInput[]
}

export async function createQuoteAction(input: CreateQuoteInput): Promise<QuoteResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('quotes')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  if (!input.items || input.items.length === 0) {
    return { ok: false, error: 'يجب إضافة عنصر واحد على الأقل.' }
  }

  const totals = calculateQuoteTotals(
    input.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      discount: i.discount,
    })),
    input.items.reduce((s, i) => s + i.discount, 0),
    0
  )

  const items = input.items.map((item) => {
    if (item.quantity <= 0) throw new Error('الكمية غير صحيحة')
    if (item.unit_price < 0) throw new Error('السعر غير صحيح')
    if (item.discount < 0) throw new Error('الخصم غير صحيح')
    const lineTotal = item.quantity * item.unit_price - item.discount
    if (lineTotal < 0) throw new Error('لا يمكن أن يكون الإجمالي أقل من الصفر')
    return {
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount: item.discount,
      line_total: lineTotal,
    }
  })

  try {
    const { data: quote, error: quoteError } = await ctx.supabase
      .from('quotes')
      .insert({
        organization_id: ctx.organizationId,
        business_id: ctx.businessId,
        contact_id: input.contact_id,
        location_id: input.location_id || null,
        conversation_id: input.conversation_id || null,
        status: 'draft',
        currency: 'SAR',
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        notes: input.notes,
        valid_until: input.valid_until || null,
        created_by: (await ctx.supabase.auth.getUser()).data.user?.id,
      })
      .select('id')
      .single()

    if (quoteError || !quote) {
      return { ok: false, error: supabaseActionError(quoteError) }
    }

    const { error: itemsError } = await ctx.supabase.from('quote_items').insert(
      items.map((item) => ({
        ...item,
        quote_id: quote.id,
      }))
    )

    if (itemsError) {
      return { ok: false, error: supabaseActionError(itemsError) }
    }

    await audit(ctx, 'quote.created', 'quote', quote.id, { total: totals.total })
    revalidatePath('/dashboard/quotes')
    return { ok: true, quoteId: quote.id }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع' }
  }
}

export async function changeQuoteStatusAction(
  quoteId: string,
  newStatus: 'sent' | 'accepted' | 'rejected' | 'expired' | 'cancelled'
): Promise<QuoteResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('quotes')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  try {
    const { data: currentQuote, error: fetchError } = await ctx.supabase
      .from('quotes')
      .select('status, valid_until')
      .eq('id', quoteId)
      .eq('organization_id', ctx.organizationId)
      .eq('business_id', ctx.businessId)
      .single()

    if (fetchError || !currentQuote) {
      return { ok: false, error: 'عرض السعر غير موجود.' }
    }

    if (
      currentQuote.valid_until &&
      new Date(currentQuote.valid_until).getTime() < Date.now() &&
      currentQuote.status === 'sent' &&
      newStatus !== 'expired'
    ) {
      return { ok: false, error: 'عرض السعر منتهٍ؛ حدّث الحالة إلى expired.' }
    }

    const validTransitions: Record<string, string[]> = {
      draft: ['sent', 'cancelled'],
      sent: ['accepted', 'rejected', 'expired', 'cancelled'],
      accepted: [],
      rejected: [],
      expired: [],
      cancelled: [],
    }

    if (!validTransitions[currentQuote.status]?.includes(newStatus)) {
      return { ok: false, error: 'لا يمكن تغيير الحالة المطلوبة من الحالة الحالية.' }
    }

    const { error: updateError } = await ctx.supabase
      .from('quotes')
      .update({ status: newStatus })
      .eq('id', quoteId)
      .eq('organization_id', ctx.organizationId)

    if (updateError) {
      return { ok: false, error: supabaseActionError(updateError) }
    }

    await audit(ctx, 'quote.status_changed', 'quote', quoteId, {
      new_status: newStatus,
      old_status: currentQuote.status,
    })

    revalidatePath('/dashboard/quotes')
    revalidatePath(`/dashboard/quotes/${quoteId}`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'حدث خطأ.') }
  }
}

/**
 * Transition draft → sent and enqueue a customer message when a channel recipient exists.
 * Consent is enforced; missing channel still marks the quote sent for staff tracking.
 */
export async function sendQuoteAction(quoteId: string): Promise<QuoteResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('quotes')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  try {
    const { data: quote, error } = await ctx.supabase
      .from('quotes')
      .select('id, status, contact_id, total, currency, valid_until, business_id')
      .eq('id', quoteId)
      .eq('organization_id', ctx.organizationId)
      .single()

    if (error || !quote) return { ok: false, error: 'عرض السعر غير موجود.' }
    if (quote.status !== 'draft') return { ok: false, error: 'يمكن إرسال المسودات فقط.' }

    if (quote.valid_until && new Date(quote.valid_until).getTime() < Date.now()) {
      return { ok: false, error: 'تاريخ الصلاحية منتهٍ قبل الإرسال.' }
    }

    try {
      await assertMarketingAllowed(ctx.supabase, {
        contactId: quote.contact_id,
        channel: 'whatsapp',
      })
    } catch (err) {
      if (err instanceof ConsentBlockedError) {
        return { ok: false, error: 'جهة الاتصال ألغت الاشتراك؛ لا يمكن الإرسال.' }
      }
      throw err
    }

    const { data: contact } = await ctx.supabase
      .from('contacts')
      .select('phone, full_name')
      .eq('id', quote.contact_id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()

    const { data: identity } = await ctx.supabase
      .from('contact_identities')
      .select('external_user_id, external_phone, channel')
      .eq('contact_id', quote.contact_id)
      .in('channel', ['whatsapp', 'sms'])
      .limit(1)
      .maybeSingle()

    const channelType = identity?.channel === 'sms' ? 'sms' : 'whatsapp'
    const recipient =
      identity?.external_user_id || identity?.external_phone || contact?.phone || ''

    const { data: channel } = await ctx.supabase
      .from('channels')
      .select('id, business_id')
      .eq('organization_id', ctx.organizationId)
      .eq('channel_type', channelType)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    const { error: statusError } = await ctx.supabase
      .from('quotes')
      .update({ status: 'sent' })
      .eq('id', quoteId)
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'draft')

    if (statusError) return { ok: false, error: supabaseActionError(statusError) }

    if (channel && recipient) {
      const body = `عرض سعر بمبلغ ${quote.total} ${quote.currency || 'SAR'}. صالح حتى ${quote.valid_until || 'إشعار آخر'}. للتأكيد أو الاستفسار رد على هذه الرسالة.`
      await enqueueOutbound({
        supabase: ctx.supabase,
        organizationId: ctx.organizationId,
        businessId: channel.business_id ?? quote.business_id,
        channelId: channel.id,
        eventType: 'quote.send',
        idempotencyKey: `quote-send:${quoteId}`,
        recipient,
        payload: { body, quote_id: quoteId },
      })
    }

    await audit(ctx, 'quote.sent', 'quote', quoteId, {
      channel: channel ? channelType : null,
      delivered: Boolean(channel && recipient),
    })

    revalidatePath('/dashboard/quotes')
    revalidatePath(`/dashboard/quotes/${quoteId}`)
    return { ok: true, quoteId }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إرسال عرض السعر.') }
  }
}
