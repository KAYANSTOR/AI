'use server'

import { requireAdminCapability, audit } from '@/lib/capabilities/guard'
import { actionErrorMessage } from '@/lib/i18n/action-error'
import { createCheckoutSessionUrl, isStripeConfigured } from '@/lib/billing/stripe'

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://frontdesk-ai-eosin.vercel.app'
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
