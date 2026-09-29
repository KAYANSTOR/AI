'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability, audit, type AuthorizedContext } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'

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

  // Financial integrity check
  let calculatedSubtotal = 0
  let calculatedDiscount = 0

  const items = input.items.map(item => {
    if (item.quantity <= 0) throw new Error('الكمية غير صحيحة')
    if (item.unit_price < 0) throw new Error('السعر غير صحيح')
    if (item.discount < 0) throw new Error('الخصم غير صحيح')
    
    const lineTotal = (item.quantity * item.unit_price) - item.discount
    if (lineTotal < 0) throw new Error('لا يمكن أن يكون الإجمالي أقل من الصفر')

    calculatedSubtotal += (item.quantity * item.unit_price)
    calculatedDiscount += item.discount

    return {
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount: item.discount,
      line_total: lineTotal
    }
  })

  const calculatedTotal = calculatedSubtotal - calculatedDiscount // Assuming 0 tax for now

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
        subtotal: calculatedSubtotal,
        discount: calculatedDiscount,
        tax: 0,
        total: calculatedTotal,
        notes: input.notes,
        valid_until: input.valid_until || null,
        created_by: (await ctx.supabase.auth.getUser()).data.user?.id
      })
      .select('id')
      .single()

    if (quoteError || !quote) {
      return { ok: false, error: supabaseActionError(quoteError) }
    }

    const itemsToInsert = items.map(item => ({
      ...item,
      quote_id: quote.id
    }))

    const { error: itemsError } = await ctx.supabase
      .from('quote_items')
      .insert(itemsToInsert)

    if (itemsError) {
      // Rollback is implicitly needed but no transaction available in this supabase client by default
      // At least we report it
      return { ok: false, error: supabaseActionError(itemsError) }
    }

    await audit(ctx, 'quote.created', 'quote', quote.id, { total: calculatedTotal })
    
    revalidatePath('/dashboard/quotes')
    return { ok: true, quoteId: quote.id }
  } catch (error: any) {
    return { ok: false, error: error.message || 'حدث خطأ غير متوقع' }
  }
}

export async function changeQuoteStatusAction(quoteId: string, newStatus: 'sent' | 'accepted' | 'rejected' | 'expired' | 'cancelled'): Promise<QuoteResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('quotes')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  try {
    // Check current status
    const { data: currentQuote, error: fetchError } = await ctx.supabase
      .from('quotes')
      .select('status')
      .eq('id', quoteId)
      .eq('organization_id', ctx.organizationId)
      .eq('business_id', ctx.businessId)
      .single()

    if (fetchError || !currentQuote) {
      return { ok: false, error: 'عرض السعر غير موجود.' }
    }

    const currentStatus = currentQuote.status

    // Status machine logic
    const validTransitions: Record<string, string[]> = {
      'draft': ['sent', 'cancelled'],
      'sent': ['accepted', 'rejected', 'expired', 'cancelled'],
      'accepted': [],
      'rejected': [],
      'expired': [],
      'cancelled': []
    }

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
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

    await audit(ctx, `quote.status_changed`, 'quote', quoteId, { new_status: newStatus, old_status: currentStatus })
    
    revalidatePath('/dashboard/quotes')
    revalidatePath(`/dashboard/quotes/${quoteId}`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'حدث خطأ.') }
  }
}
