'use client'

import { useState } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'
import { createWhatsAppEmbeddedSignupOAuthStateAction } from '@/app/onboarding/embedded-signup-actions'

type Props = {
  disabled?: boolean
  onSuccess?: (message: string) => void
  onError?: (message: string) => void
  onRefresh?: () => void
  className?: string
}

const META_LOGIN_VERSION = 'v26.0'

/**
 * Meta Embedded Signup v4 using the explicit OAuth redirect flow.
 *
 * Unlike FB.login's popup callback, this flow returns the authorization code
 * to our same-origin Railway callback on mobile and desktop browsers alike.
 */
export function WhatsAppEmbeddedSignupButton({
  disabled,
  onError,
  className,
}: Props) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim() ?? ''
  const configId = process.env.NEXT_PUBLIC_META_EMBEDDED_CONFIG_ID?.trim() ?? ''
  const [busy, setBusy] = useState(false)

  async function launch() {
    if (busy || disabled) return
    if (!appId || !configId) {
      onError?.('ربط واتساب عبر Meta غير مُفعّل بعد. تواصل مع الدعم.')
      return
    }

    setBusy(true)
    try {
      const stateResult = await createWhatsAppEmbeddedSignupOAuthStateAction()
      if (!stateResult.ok) {
        setBusy(false)
        onError?.(stateResult.error)
        return
      }

      const oauthUrl = new URL('https://www.facebook.com/' + META_LOGIN_VERSION + '/dialog/oauth')
      oauthUrl.searchParams.set('client_id', appId)
      oauthUrl.searchParams.set('config_id', configId)
      oauthUrl.searchParams.set('redirect_uri', stateResult.redirectUri)
      oauthUrl.searchParams.set('response_type', 'code')
      oauthUrl.searchParams.set('override_default_response_type', 'true')
      oauthUrl.searchParams.set('auth_type', 'rerequest')
      oauthUrl.searchParams.set('state', stateResult.state)
      oauthUrl.searchParams.set('extras', JSON.stringify({ setup: {} }))

      // Full-page navigation is intentional: Meta returns the authorization code
      // to our server callback, so success does not depend on popup closure or postMessage.
      window.location.assign(oauthUrl.toString())
    } catch (error) {
      setBusy(false)
      console.error('Meta Embedded Signup launch failed', error)
      onError?.('تعذّر بدء الربط مع Meta. تحقّق من اتصال الإنترنت ثم حاول مرة أخرى.')
    }
  }

  if (!appId || !configId) return null

  return (
    <button
      type="button"
      onClick={launch}
      disabled={disabled || busy}
      className={
        className ??
        'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-6 text-base font-semibold text-white transition-colors hover:bg-[#166FE5] disabled:opacity-60'
      }
    >
      {busy ? (
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
      ) : (
        <MessageCircle size={18} aria-hidden="true" />
      )}
      {busy ? 'جارٍ الانتقال إلى Meta…' : 'ربط واتساب عبر Meta'}
    </button>
  )
}

export function isClientEmbeddedSignupConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_META_APP_ID?.trim() &&
      process.env.NEXT_PUBLIC_META_EMBEDDED_CONFIG_ID?.trim()
  )
}
