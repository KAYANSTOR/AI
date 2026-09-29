'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability, audit, type AuthorizedContext } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'

export type OrderResult = { ok: boolean; error?: string; orderId?: string }

export interface OrderItemInput {
  name: string
  description?: string
  quantity: number
  unit_price: number
  discount: number
}

export interface CreateOrderInput {
  contact_id: string
  location_id?: string | null
  conversation_id?: string | null
  quote_id?: string | null
  notes?: string
  items: OrderItemInput[]
}

export async function createOrderAction(input: CreateOrderInput): Promise<OrderResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('orders')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  if (!input.items || input.items.length === 0) {
    return { ok: false, error: 'يجب إضافة عنصر واحد على الأقل.' }
  }

  let calculatedSubtotal = 0
  let calculatedDiscount = 0

  const items = input.items.map((item) => {
    if (item.quantity <= 0) throw new Error('الكمية غير صحيحة')
    if (item.unit_price < 0) throw new Error('السعر غير صحيح')
    if (item.discount < 0) throw new Error('الخصم غير صحيح')

    const lineTotal = item.quantity * item.unit_price - item.discount
    if (lineTotal < 0) throw new Error('لا يمكن أن يكون الإجمالي أقل من الصفر')

    calculatedSubtotal += item.quantity * item.unit_price
    calculatedDiscount += item.discount

    return {
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount: item.discount,
      line_total: lineTotal,
    }
  })

  const calculatedTotal = calculatedSubtotal - calculatedDiscount

  try {
    const user = (await ctx.supabase.auth.getUser()).data.user?.id

    const { data: order, error: orderError } = await ctx.supabase
      .from('orders')
      .insert({
        organization_id: ctx.organizationId,
        business_id: ctx.businessId,
        contact_id: input.contact_id,
        location_id: input.location_id || null,
        conversation_id: input.conversation_id || null,
        quote_id: input.quote_id || null,
        status: 'draft',
        currency: 'SAR',
        subtotal: calculatedSubtotal,
        discount: calculatedDiscount,
        tax: 0,
        total: calculatedTotal,
        notes: input.notes,
        created_by: user,
      })
      .select('id')
      .single()

    if (orderError || !order) {
      return { ok: false, error: supabaseActionError(orderError) }
    }

    const itemsToInsert = items.map((item) => ({
      ...item,
      order_id: order.id,
    }))

    const { error: itemsError } = await ctx.supabase.from('order_items').insert(itemsToInsert)

    if (itemsError) {
      return { ok: false, error: supabaseActionError(itemsError) }
    }

    await audit(ctx, 'order.created', 'order', order.id, {
      total: calculatedTotal,
      quote_id: input.quote_id,
    })

    revalidatePath('/dashboard/orders')
    return { ok: true, orderId: order.id }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع' }
  }
}

export async function convertQuoteToOrderAction(quoteId: string): Promise<OrderResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('orders')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  try {
    const { data: quote, error: quoteError } = await ctx.supabase
      .from('quotes')
      .select('*, quote_items(*)')
      .eq('id', quoteId)
      .eq('organization_id', ctx.organizationId)
      .eq('business_id', ctx.businessId)
      .single()

    if (quoteError || !quote) {
      return { ok: false, error: 'عرض السعر غير موجود.' }
    }

    if (quote.status !== 'accepted') {
      return { ok: false, error: 'يجب أن يكون عرض السعر مقبولاً ليتم تحويله إلى طلب.' }
    }

    const { data: existingOrder } = await ctx.supabase
      .from('orders')
      .select('id')
      .eq('quote_id', quoteId)
      .maybeSingle()

    if (existingOrder) {
      return { ok: false, error: 'تم تحويل عرض السعر هذا إلى طلب مسبقاً.' }
    }

    const inputItems = quote.quote_items.map(
      (i: {
        name: string
        description?: string
        quantity: number
        unit_price: number
        discount: number
      }) => ({
        name: i.name,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount: i.discount,
      })
    )

    return await createOrderAction({
      contact_id: quote.contact_id,
      location_id: quote.location_id,
      conversation_id: quote.conversation_id,
      quote_id: quote.id,
      notes: quote.notes,
      items: inputItems,
    })
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : 'حدث خطأ.' }
  }
}

export async function changeOrderStatusAction(
  orderId: string,
  newStatus: 'confirmation' | 'processing' | 'completed' | 'cancelled'
): Promise<OrderResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireCapability('orders')
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'غير مصرح.') }
  }

  try {
    const { data: currentOrder, error: fetchError } = await ctx.supabase
      .from('orders')
      .select('status, contact_id')
      .eq('id', orderId)
      .eq('organization_id', ctx.organizationId)
      .eq('business_id', ctx.businessId)
      .single()

    if (fetchError || !currentOrder) {
      return { ok: false, error: 'الطلب غير موجود.' }
    }

    const currentStatus = currentOrder.status

    const validTransitions: Record<string, string[]> = {
      draft: ['confirmation', 'processing', 'cancelled'],
      confirmation: ['processing', 'cancelled'],
      processing: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    }

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      return { ok: false, error: 'لا يمكن تغيير الحالة المطلوبة من الحالة الحالية.' }
    }

    const { error: updateError } = await ctx.supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
      .eq('organization_id', ctx.organizationId)

    if (updateError) {
      return { ok: false, error: supabaseActionError(updateError) }
    }

    await audit(ctx, 'order.status_changed', 'order', orderId, {
      new_status: newStatus,
      old_status: currentStatus,
    })

    // Status changes are audited; customer messaging goes through the channel outbox
    // only when a recipient channel is known. We record a durable audit-side event via
    // usage/audit rather than inserting incomplete outbox rows (which require recipient).
    revalidatePath('/dashboard/orders')
    revalidatePath(`/dashboard/orders/${orderId}`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'حدث خطأ.') }
  }
}
