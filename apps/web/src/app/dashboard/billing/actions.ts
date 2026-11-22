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
    if (monthlyPrice !== plan.monthlyPrice) {
      return { ok: false, error: 'سعر الخطة في قاعدة البيانات لا يطابق كتالوج الأسعار المنشور.' }
    }

    const wallets = await listEsaalatReceivingWallets()
    const wallet = wallets.find((item) => item.id === input.walletId)
    if (!wallet) {
      return { ok: false, error: 'المحفظة المختارة غير متاحة للتحصيل أو توقفت مراقبتها.' }
    }

    const totalUsd = plan.monthlyPrice * (input.billingCycle === 'yearly' ? 10 : 1)
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
