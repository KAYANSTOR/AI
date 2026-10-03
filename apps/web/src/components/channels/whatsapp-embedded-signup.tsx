'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'
import { completeWhatsAppEmbeddedSignupAction } from '@/app/onboarding/embedded-signup-actions'

declare global {
  interface Window {
    FB?: {
      init: (params: {
        appId: string
        autoLogAppEvents?: boolean
        xfbml?: boolean
        version: string
      }) => void
      login: (
        callback: (response: {
          authResponse?: { code?: string }
          status?: string
        }) => void,
        options: Record<string, unknown>
      ) => void
    }
    fbAsyncInit?: () => void
  }
}

type SessionPayload = {
  phone_number_id?: string
  waba_id?: string
  business_id?: string
}

type Props = {
  disabled?: boolean
  onSuccess?: (message: string) => void
  onError?: (message: string) => void
  onRefresh?: () => void
  className?: string
}

const GRAPH_SDK_VERSION = 'v21.0'

function loadFacebookSdk(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('no window'))
      return
    }
    if (window.FB) {
      resolve()
      return
    }

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: GRAPH_SDK_VERSION,
      })
      resolve()
    }

    const existing = document.getElementById('facebook-jssdk')
    if (existing) return

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.onerror = () => reject(new Error('فشل تحميل Facebook SDK'))
    document.body.appendChild(script)
  })
}

/**
 * One-click WhatsApp connect via Meta Embedded Signup (v4).
 * Requires NEXT_PUBLIC_META_APP_ID + NEXT_PUBLIC_META_EMBEDDED_CONFIG_ID.
 */
export function WhatsAppEmbeddedSignupButton({
  disabled,
  onSuccess,
  onError,
  onRefresh,
  className,
}: Props) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim() ?? ''
  const configId = process.env.NEXT_PUBLIC_META_EMBEDDED_CONFIG_ID?.trim() ?? ''
  const [busy, setBusy] = useState(false)
  const [sdkReady, setSdkReady] = useState(false)
  const sessionRef = useRef<SessionPayload | null>(null)
  const codeRef = useRef<string | null>(null)

  const tryComplete = useCallback(async () => {
    const code = codeRef.current
    const session = sessionRef.current
    if (!code || !session?.phone_number_id || !session?.waba_id) return

    setBusy(true)
    try {
      const result = await completeWhatsAppEmbeddedSignupAction({
        code,
        phoneNumberId: session.phone_number_id,
        wabaId: session.waba_id,
        businessPortfolioId: session.business_id ?? null,
      })
      if (!result.ok) {
        onError?.(result.error ?? 'تعذّر إتمام الربط.')
        return
      }
      onSuccess?.(result.message ?? 'تم ربط واتساب بنجاح.')
      onRefresh?.()
    } catch {
      onError?.('تعذّر إتمام الربط. حاول مرة أخرى.')
    } finally {
      setBusy(false)
      codeRef.current = null
      sessionRef.current = null
    }
  }, [onError, onRefresh, onSuccess])

  useEffect(() => {
    if (!appId || !configId) return

    let cancelled = false
    loadFacebookSdk(appId)
      .then(() => {
        if (!cancelled) setSdkReady(true)
      })
      .catch((error) => {
        console.error('Facebook SDK load failed', error)
        if (!cancelled) onError?.('تعذّر تحميل نافذة Meta. حدّث الصفحة وحاول مرة أخرى.')
      })

    function onMessage(event: MessageEvent) {
      if (typeof event.origin !== 'string' || !event.origin.endsWith('facebook.com')) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return
        if (data.data?.phone_number_id && data.data?.waba_id) {
          sessionRef.current = {
            phone_number_id: String(data.data.phone_number_id),
            waba_id: String(data.data.waba_id),
            business_id: data.data.business_id ? String(data.data.business_id) : undefined,
          }
          void tryComplete()
        }
      } catch {
        // Ignore non-JSON messages from the iframe.
      }
    }

    window.addEventListener('message', onMessage)
    return () => {
      cancelled = true
      window.removeEventListener('message', onMessage)
    }
  }, [appId, configId, onError, tryComplete])

  async function launch() {
    if (!appId || !configId) {
      onError?.('ربط واتساب عبر Meta غير مُفعّل بعد. تواصل مع الدعم.')
      return
    }
    if (!window.FB || !sdkReady) {
      onError?.('جاري تحميل نافذة Meta… حاول بعد لحظات.')
      return
    }

    setBusy(true)
    codeRef.current = null
    sessionRef.current = null

    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          codeRef.current = response.authResponse.code
          void tryComplete()
        } else {
          setBusy(false)
          onError?.('لم يكتمل الربط. يمكنك المحاولة مرة أخرى.')
        }
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
        },
      }
    )
  }

  if (!appId || !configId) return null

  return (
    <button
      type="button"
      onClick={launch}
      disabled={disabled || busy || !sdkReady}
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
      {busy ? 'جارٍ إتمام الربط…' : 'ربط واتساب عبر Meta'}
    </button>
  )
}

export function isClientEmbeddedSignupConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_META_APP_ID?.trim() &&
      process.env.NEXT_PUBLIC_META_EMBEDDED_CONFIG_ID?.trim()
  )
}
