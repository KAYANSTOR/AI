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

const EMBEDDED_SIGNUP_CALLBACK = '/api/whatsapp/embedded-signup-callback'

type Props = {
  disabled?: boolean
  onSuccess?: (message: string) => void
  onError?: (message: string) => void
  onRefresh?: () => void
  className?: string
}

const GRAPH_SDK_VERSION = 'v26.0'

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

    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (error) reject(error)
      else if (window.FB) resolve()
      else reject(new Error('Facebook SDK did not initialize'))
    }
    const timeout = window.setTimeout(
      () => finish(new Error('انتهت مهلة تحميل Facebook SDK')),
      12_000
    )

    window.fbAsyncInit = () => {
      try {
        window.FB?.init({
          appId,
          autoLogAppEvents: true,
          xfbml: false,
          version: GRAPH_SDK_VERSION,
        })
        finish()
      } catch {
        finish(new Error('تعذّر تهيئة Facebook SDK'))
      }
    }

    const existing = document.getElementById('facebook-jssdk') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.FB) finish()
      }, { once: true })
      existing.addEventListener('error', () => finish(new Error('فشل تحميل Facebook SDK')), { once: true })
      // A previous page/component may have inserted the script before fbAsyncInit
      // was registered. Reinsert it so the SDK invokes the current initializer.
      if (!window.FB && existing.dataset.initialized !== 'true') {
        existing.remove()
      } else {
        return
      }
    }

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.onload = () => {
      if (window.FB) finish()
    }
    script.onerror = () => finish(new Error('فشل تحميل Facebook SDK'))
    document.body.appendChild(script)
  })
}

/**
 * One-click WhatsApp connect via Meta Embedded Signup v4.
 * The Facebook Login for Business configuration (config_id) defines products
 * and permissions. v4 does not use the legacy sessionInfoVersion option.
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
  const completionStartedRef = useRef(false)

  const tryComplete = useCallback(async () => {
    const code = codeRef.current
    const session = sessionRef.current
    if (!code || !session || (!session.phone_number_id && !session.waba_id) || completionStartedRef.current) return

    completionStartedRef.current = true
    setBusy(true)
    try {
      const result = await completeWhatsAppEmbeddedSignupAction({
        code,
        phoneNumberId: session.phone_number_id ?? null,
        wabaId: session.waba_id ?? null,
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
      completionStartedRef.current = false
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
      let origin: URL
      try {
        origin = new URL(event.origin)
      } catch {
        return
      }
      if (origin.protocol !== 'https:' || !(origin.hostname === 'facebook.com' || origin.hostname.endsWith('.facebook.com'))) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return
        if (data.event === 'CANCEL' || data.event === 'ERROR') {
          completionStartedRef.current = false
          codeRef.current = null
          sessionRef.current = null
          setBusy(false)
          onError?.(data.event === 'CANCEL' ? 'ألغيت عملية الربط من Meta.' : 'أبلغت Meta عن خطأ أثناء إعداد واتساب. أعد المحاولة.')
          return
        }
        if (
          (data.event === 'FINISH' || data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') &&
          data.data && (data.data.phone_number_id || data.data.waba_id)
        ) {
          sessionRef.current = {
            phone_number_id: data.data.phone_number_id ? String(data.data.phone_number_id) : undefined,
            waba_id: data.data.waba_id ? String(data.data.waba_id) : undefined,
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
    completionStartedRef.current = false

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
        redirect_uri: `${window.location.origin}${EMBEDDED_SIGNUP_CALLBACK}`,
        // Embedded Signup v4 reads products/permissions from config_id.
        // Do not pass the legacy session_info_version/sessionInfoVersion flag.
        extras: { setup: {} },
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
