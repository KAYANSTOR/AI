'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'
import { createWhatsAppEmbeddedSignupOAuthStateAction, completeWhatsAppEmbeddedSignupAction } from '@/app/onboarding/embedded-signup-actions'
import {
  isTrustedMetaEmbeddedSignupOrigin,
  parseMetaEmbeddedSignupEvent,
  type MetaEmbeddedSignupSession,
} from '@/lib/channels/embedded-signup-session'

const META_GRAPH_VERSION = 'v26.0'

export type FacebookLoginResponse = {
  authResponse?: { code?: string; accessToken?: string } | null
  status?: string
  error?: { message?: string }
}
type WhatsAppFacebookLoginOptions = {
  config_id: string
  auth_type: 'rerequest'
  response_type: 'code'
  override_default_response_type: true
  extras: {
    featureType: 'whatsapp_business_app_onboarding'
    sessionInfoVersion: '3'
    version: 'v4'
  }
}
type MessengerFacebookLoginOptions = {
  scope: string
  auth_type: 'rerequest'
  response_type?: 'code'
  override_default_response_type?: true
}
export type FacebookSdk = {
  init(options: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void
  login(
    callback: (response: FacebookLoginResponse) => void,
    options: WhatsAppFacebookLoginOptions | MessengerFacebookLoginOptions
  ): void
}

declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
    __kayanMetaSdkAppId?: string
  }
}

type Props = {
  disabled?: boolean
  onSuccess?: (message: string) => void
  onError?: (message: string) => void
  onRefresh?: () => void
  className?: string
}

type PendingSignup = {
  state: string
  code: string | null
  session: MetaEmbeddedSignupSession | null
  completing: boolean
}

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
  const [sdkError, setSdkError] = useState<string | null>(null)
  const pendingSignup = useRef<PendingSignup | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    if (!appId) {
      return () => { mounted.current = false }
    }

    let script: HTMLScriptElement | null = null
    let onScriptLoad: (() => void) | null = null

    const initialize = () => {
      if (!window.FB || !mounted.current) return
      if (window.__kayanMetaSdkAppId !== appId) {
        window.FB.init({
          appId,
          cookie: true,
          xfbml: false,
          version: META_GRAPH_VERSION,
        })
        window.__kayanMetaSdkAppId = appId
      }
      setSdkReady(true)
      setSdkError(null)
    }

    window.fbAsyncInit = initialize
    if (window.FB) {
      // Defer the React state notification when the SDK was already loaded
      // before this component mounted; never set state synchronously in an effect.
      queueMicrotask(initialize)
    } else {
      const existing = document.getElementById('facebook-jssdk') as HTMLScriptElement | null
      script = existing
      if (existing) {
        onScriptLoad = initialize
        existing.addEventListener('load', onScriptLoad, { once: true })
      } else {
        script = document.createElement('script')
        script.id = 'facebook-jssdk'
        script.src = 'https://connect.facebook.net/en_US/sdk.js'
        script.async = true
        script.defer = true
        script.onload = initialize
        script.onerror = () => {
          if (mounted.current) setSdkError('تعذّر تحميل خدمة تسجيل الدخول من Meta. تحقق من الاتصال ثم أعد المحاولة.')
        }
        document.head.appendChild(script)
      }
    }

    return () => {
      mounted.current = false
      if (script && onScriptLoad) script.removeEventListener('load', onScriptLoad)
      if (window.fbAsyncInit === initialize) delete window.fbAsyncInit
    }
  }, [appId])

  const finishIfReady = useCallback(async () => {
    const pending = pendingSignup.current
    if (!pending || !pending.code || !pending.session || pending.completing) return
    pending.completing = true

    try {
      const result = await completeWhatsAppEmbeddedSignupAction({
        code: pending.code,
        state: pending.state,
        useFacebookSdk: true,
        phoneNumberId: pending.session.phoneNumberId,
        wabaId: pending.session.wabaId,
        businessPortfolioId: pending.session.businessPortfolioId,
        isOnBusinessApp: pending.session.isOnBusinessApp,
        primaryWaacIds: pending.session.primaryWaacIds,
      })

      if (!mounted.current) return
      pendingSignup.current = null
      setBusy(false)

      if (!result.ok) {
        onError?.(result.error ?? 'تعذّر إكمال الربط مع Meta.')
        return
      }

      const message = result.message ?? 'تم ربط حساب WhatsApp Business بنجاح.'
      onSuccess?.(message)
      if (onRefresh) onRefresh()
    } catch (error) {
      if (!mounted.current) return
      pendingSignup.current = null
      setBusy(false)
      console.error('Meta Embedded Signup completion failed', error)
      onError?.('انقطع الاتصال أثناء إكمال ربط واتساب. أعد بدء الربط من فضلك.')
    }
  }, [onError, onRefresh, onSuccess])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedMetaEmbeddedSignupOrigin(event.origin)) return
      const parsed = parseMetaEmbeddedSignupEvent(event.origin, event.data)
      const pending = pendingSignup.current
      if (!pending || parsed.kind === 'ignore') return

      if (parsed.kind === 'cancel') {
        pendingSignup.current = null
        setBusy(false)
        onError?.(
          parsed.currentStep
            ? 'تم إلغاء ربط واتساب عند خطوة: ' + parsed.currentStep
            : 'تم إلغاء ربط واتساب قبل اكتمال العملية.'
        )
        return
      }

      if (parsed.kind === 'error') {
        pendingSignup.current = null
        setBusy(false)
        console.error('Meta Embedded Signup reported an error', { code: parsed.code })
        onError?.(parsed.message)
        return
      }

      pending.session = parsed.session
      void finishIfReady()
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [finishIfReady, onError])

  async function launch() {
    if (busy || disabled) return
    if (!appId || !configId) {
      onError?.('ربط واتساب عبر Meta غير مُفعّل بعد. أكمل App ID وConfiguration ID في إعدادات المنصة.')
      return
    }
    if (!sdkReady || !window.FB) {
      onError?.(sdkError ?? 'خدمة Meta لم تجهز بعد. انتظر حتى يكتمل تحميلها ثم حاول مرة أخرى.')
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

      pendingSignup.current = {
        state: stateResult.state,
        code: null,
        session: null,
        completing: false,
      }

      window.FB.login((response) => {
        const code = response.authResponse?.code?.trim()
        if (!code) {
          // The session event may already have reported a cancellation or error.
          if (!pendingSignup.current) return
          pendingSignup.current = null
          setBusy(false)
          onError?.(
            response.error?.message
              ? 'رفضت Meta تسجيل الدخول: ' + response.error.message
              : 'لم تُرجع Meta رمز التفويض. أعد المحاولة وأكمل جميع خطوات الموافقة.'
          )
          return
        }

        const pending = pendingSignup.current
        if (!pending) return
        pending.code = code
        void finishIfReady()
      }, {
        config_id: configId,
        auth_type: 'rerequest',
        response_type: 'code',
        override_default_response_type: true,
        // Match the Meta-hosted Tech Provider configuration for WhatsApp Business App onboarding (Coexistence).
        extras: {
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
          version: 'v4',
        },
      })
    } catch (error) {
      pendingSignup.current = null
      setBusy(false)
      console.error('Meta Embedded Signup launch failed', error)
      onError?.('تعذّر بدء الربط مع Meta. تحقّق من اتصال الإنترنت ثم حاول مرة أخرى.')
    }
  }

  if (!appId || !configId) return null

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={launch}
        disabled={disabled || busy || !sdkReady}
        className={
          className ??
          'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-6 text-base font-semibold text-white transition-colors hover:bg-[#166FE5] disabled:opacity-60'
        }
      >
        {busy || (!sdkReady && !sdkError) ? (
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        ) : (
          <MessageCircle size={18} aria-hidden="true" />
        )}
        {busy ? 'جارٍ إكمال الربط مع Meta…' : !sdkReady ? 'جارٍ تجهيز Meta…' : 'ربط واتساب عبر Meta'}
      </button>
      {sdkError ? <p role="status" className="text-xs text-error">{sdkError}</p> : null}
    </div>
  )
}

export function isClientEmbeddedSignupConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_META_APP_ID?.trim() &&
      process.env.NEXT_PUBLIC_META_EMBEDDED_CONFIG_ID?.trim()
  )
}
