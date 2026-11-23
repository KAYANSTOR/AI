'use server'

import { randomUUID } from 'node:crypto'
import { requireAdminCapability, audit } from '@/lib/capabilities/guard'
import { createAdminClient } from '@/lib/db/admin'
import { actionErrorMessage } from '@/lib/i18n/action-error'
import { createCheckoutSessionUrl, isStripeConfigured } from '@/lib/billing/stripe'
import {
  createEsaalatPaymentIntent,
  isEsaalatPaymentConfigured,
  listEsaalatReceivingWallets,
  convertUsdToYer,
} from '@/lib/billing/esaalat'
import { PLAN_CATALOG, type BillingCycle, type PlanCode } from '@/lib/billing/plan-catalog'

export type BillingActionResult =
  | { ok: true; url?: string | null; message?: string }
  | { ok: false; error: string }

export async function startCheckoutAction(): Promise<BillingActionResult> {
  try {
    const ctx = await requireAdminCapability(null)

    if (!isStripeConfigured()) {
      return {
        ok: true,
        url: null,
        message:
          'Stripe غير مُهيأ بعد. أضف STRIPE_SECRET_KEY وSTRIPE_WEBHOOK_SECRET وSTRIPE_PRICE_ID في البيئة.',
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const url = await createCheckoutSessionUrl({
      organizationId: ctx.organizationId,
      successUrl: `${appUrl}/dashboard/billing?checkout=success`,
      cancelUrl: `${appUrl}/dashboard/billing?checkout=cancel`,
    })

    await audit(ctx, 'billing.checkout_started', 'subscription', null, {
      hasUrl: Boolean(url),
    })

    if (!url) {
      return {
        ok: false,
        error: 'تعذّر إنشاء جلسة الدفع. تحقق من STRIPE_PRICE_ID.',
      }
    }

    return { ok: true, url }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر بدء الدفع.') }
  }
}

export type EsaalatCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export async function startEsaalatCheckoutAction(input: {
  planCode: PlanCode
  billingCycle: BillingCycle
  walletId: string
}): Promise<EsaalatCheckoutResult> {
  const adminDb = createAdminClient()
  let externalOrderId: string | null = null
  let organizationId: string | null = null

  try {
    const ctx = await requireAdminCapability(null)
    organizationId = ctx.organizationId

    if (!isEsaalatPaymentConfigured()) {
      return { ok: false, error: 'الدفع بالمحافظ غير مهيأ حالياً. راجع إعدادات حساب التاجر.' }
    }

    if (!['monthly', 'yearly'].includes(input.billingCycle)) {
      return { ok: false, error: 'دورة الفوترة غير صالحة.' }
    }

    const plan = PLAN_CATALOG.find((item) => item.code === input.planCode)
    if (!plan || plan.code === 'trial' || !input.walletId) {
      return { ok: false, error: 'الخطة أو محفظة الدفع غير صالحة.' }
    }

    const { data: storedPlan, error: planError } = await adminDb
      .from('plans')
      .select('id, monthly_price, currency, is_active')
      .eq('code', plan.code)
      .maybeSingle()

    if (planError) throw planError
    if (!storedPlan || storedPlan.is_active !== true || storedPlan.currency !== 'USD') {
      return { ok: false, error: 'كتالوج الخطط غير محدث في قاعدة البيانات. طبّق ترحيل قاعدة البيانات أولاً.' }
    }

    const monthlyPrice = Number(storedPlan.monthly_price)
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) return { ok: false, error: 'سعر الخطة غير صالح.' }

    const wallets = await listEsaalatReceivingWallets()
    const wallet = wallets.find((item) => item.id === input.walletId)
    if (!wallet) {
      return { ok: false, error: 'المحفظة المختارة غير متاحة للتحصيل أو توقفت مراقبتها.' }
    }

    const totalUsd = monthlyPrice * (input.billingCycle === 'yearly' ? 10 : 1)
    const exchangeRate = Number(process.env.YER_PER_USD)
    const amountYer = convertUsdToYer(totalUsd, exchangeRate)
    externalOrderId = randomUUID()

    const { error: insertError } = await adminDb.from('billing_payment_intents').insert({
      organization_id: ctx.organizationId,
      plan_id: storedPlan.id,
      plan_code: plan.code,
      billing_cycle: input.billingCycle,
      amount_usd: totalUsd,
      amount_yer: amountYer,
      exchange_rate: exchangeRate,
      wallet_id: wallet.id,
      external_order_id: externalOrderId,
      status: 'pending',
    })

    if (insertError) throw insertError

    const providerIntent = await createEsaalatPaymentIntent({
      walletId: wallet.id,
      amountYer,
      externalOrderId,
      idempotencyKey: randomUUID(),
    })

    const { error: updateError } = await adminDb
      .from('billing_payment_intents')
      .update({
        provider_intent_id: providerIntent.id,
        expires_at: providerIntent.expires_at ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', ctx.organizationId)
      .eq('external_order_id', externalOrderId)

    if (updateError) throw updateError

    await audit(ctx, 'subscription.wallet_checkout_started', 'billing_payment_intent', null, {
      plan_code: plan.code,
      billing_cycle: input.billingCycle,
      amount_yer: amountYer,
      external_order_id: externalOrderId,
      provider: 'esaalat',
    })

    return { ok: true, url: providerIntent.pay_url }
  } catch (error) {
    if (externalOrderId && organizationId) {
      try {
        await adminDb
          .from('billing_payment_intents')
          .update({
            status: 'failed',
            failure_code: 'checkout_creation_failed',
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
          .eq('external_order_id', externalOrderId)
          .eq('status', 'pending')
      } catch {
        // Preserve the original error; reconciliation can inspect pending intents.
      }
    }
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إنشاء طلب الدفع بالمحفظة.') }
  }
}

export type ManualWalletSubmissionResult =
  | { ok: true; amountYer: number; message: string }
  | { ok: false; error: string }

export async function submitManualWalletPaymentAction(input: {
  planCode: PlanCode
  billingCycle: BillingCycle
  walletId: string
  senderName: string
  transferReference: string
  receiptMimeType: string
  receiptBase64: string
}): Promise<ManualWalletSubmissionResult> {
  const adminDb = createAdminClient()
  try {
    const ctx = await requireAdminCapability(null)
    if (!['monthly', 'yearly'].includes(input.billingCycle)) return { ok: false, error: 'دورة الفوترة غير صالحة.' }
    const senderName = input.senderName.trim()
    const transferReference = input.transferReference.trim()
    if (senderName.length < 2 || senderName.length > 160) return { ok: false, error: 'اكتب اسم المرسل كما يظهر في إيصال التحويل.' }
    if (transferReference.length < 2 || transferReference.length > 128) return { ok: false, error: 'اكتب مرجع التحويل الصحيح.' }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(input.receiptMimeType)) return { ok: false, error: 'ارفع صورة بصيغة JPG أو PNG أو WEBP.' }
    if (typeof input.receiptBase64 !== 'string' || input.receiptBase64.length > 2_850_000) return { ok: false, error: 'حجم صورة الإيصال يتجاوز 2 ميغابايت.' }
    const image = Buffer.from(input.receiptBase64, 'base64')
    if (image.length < 16 || image.length > 2 * 1024 * 1024) return { ok: false, error: 'حجم صورة الإيصال غير صالح.' }
    const isPng = image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const isJpeg = image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
    const isWebp = image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP'
    if ((input.receiptMimeType === 'image/png' && !isPng) || (input.receiptMimeType === 'image/jpeg' && !isJpeg) || (input.receiptMimeType === 'image/webp' && !isWebp)) {
      return { ok: false, error: 'امتداد الصورة لا يطابق محتواها.' }
    }
    if (!['starter', 'growth', 'pro'].includes(input.planCode)) return { ok: false, error: 'الخطة غير صالحة.' }

    const [{ data: plan, error: planError }, { data: wallet, error: walletError }] = await Promise.all([
      adminDb.from('plans').select('id,monthly_price,currency,is_active,limits').eq('code', input.planCode).maybeSingle(),
      adminDb.from('manual_yemen_wallets').select('id').eq('id', input.walletId).eq('is_active', true).maybeSingle(),
    ])
    if (planError || !plan || plan.is_active !== true || plan.currency !== 'USD') return { ok: false, error: 'الخطة غير متاحة حالياً.' }
    if (walletError || !wallet) return { ok: false, error: 'المحفظة المختارة غير متاحة.' }
    const exchangeRate = Number(process.env.YER_PER_USD)
    const monthlyPrice = Number(plan.monthly_price)
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0 || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      return { ok: false, error: 'تعذر احتساب المبلغ. راجع إعدادات سعر الصرف.' }
    }
    const amountUsd = monthlyPrice * (input.billingCycle === 'yearly' ? 10 : 1)
    const amountYer = convertUsdToYer(amountUsd, exchangeRate)
    const { data: payment, error: insertError } = await adminDb.from('manual_wallet_payment_requests').insert({
      organization_id: ctx.organizationId,
      plan_id: plan.id,
      plan_code: input.planCode,
      billing_cycle: input.billingCycle,
      wallet_id: wallet.id,
      amount_usd: amountUsd,
      amount_yer: amountYer,
      exchange_rate: exchangeRate,
      sender_name: senderName,
      transfer_reference: transferReference,
      receipt_mime_type: input.receiptMimeType,
      receipt_image_base64: image.toString('base64'),
      idempotency_key: randomUUID(),
      status: 'pending',
    }).select('id').single()
    if (insertError || !payment) throw insertError ?? new Error('تعذر تسجيل طلب الدفع.')

    await audit(ctx, 'billing.manual_wallet_payment_submitted', 'manual_wallet_payment_request', payment.id, {
      plan_code: input.planCode, billing_cycle: input.billingCycle, amount_yer: amountYer,
      transfer_reference: transferReference, wallet_id: wallet.id,
    })
    try {
      await adminDb.from('notifications').insert({
        organization_id: ctx.organizationId, entity_type: 'manual_wallet_payment', entity_id: payment.id,
        notification_type: 'high_priority', title: 'إيصال تحويل قيد المراجعة',
        body: `تم استلام طلب دفع ${input.planCode} بالمرجع ${transferReference}.`,
        idempotency_key: `manual-wallet-submitted:${payment.id}`,
      })
    } catch { /* The durable payment request remains authoritative. */ }
    return { ok: true, amountYer, message: 'تم استلام إيصال التحويل، وسيظل الاشتراك دون تغيير حتى مراجعته.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذر إرسال إيصال التحويل.') }
  }
}
