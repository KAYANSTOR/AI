'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'
import { createWhatsAppEmbeddedSignupOAuthStateAction, completeWhatsAppEmbeddedSignupAction } from '@/app/onboarding/embedded-signup-actions'
import {
  isTrustedMetaEmbeddedSignupOrigin,
  parseMetaEmbeddedSignupEvent,
  type MetaEmbeddedSignupSession,
} from '@/lib/channels/embedded-signup-session'
import { META_LINK_NOTICES, metaLinkStatusFromGraph } from '@/lib/channels/meta-connection'
import { useMetaAuthorization } from './use-meta-authorization'

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
    featureType?: 'whatsapp_business_app_onboarding'
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
  mode?: 'coexistence' | 'cloud_api'
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
  mode = 'coexistence',
  onSuccess,
  onError,
  onRefresh,
  className,
}: Props) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim() ?? ''
  const configId = mode === 'coexistence'
    ? process.env.NEXT_PUBLIC_META_EMBEDDED_CONFIG_ID?.trim() ?? ''
    : process.env.NEXT_PUBLIC_META_CLOUD_API_CONFIG_ID?.trim() ?? ''
  const [busy, setBusy] = useState(false)
  const [sdkReady, setSdkReady] = useState(false)
  const [sdkError, setSdkError] = useState<string | null>(null)
  const pendingSignup = useRef<PendingSignup | null>(null)
  const mounted = useRef(true)
  const { authorization, takeState } = useMetaAuthorization(
    createWhatsAppEmbeddedSignupOAuthStateAction,
    Boolean(appId && configId && sdkReady && !disabled),
    busy,
  )

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
        requestedMode: mode,
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
  }, [mode, onError, onRefresh, onSuccess])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedMetaEmbeddedSignupOrigin(event.origin)) return
      const parsed = parseMetaEmbeddedSignupEvent(event.origin, event.data)
      const pending = pendingSignup.current
      if (!pending || pending.completing || parsed.kind === 'ignore') return

      if (parsed.kind === 'cancel') {
        pendingSignup.current = null
        setBusy(false)
        onError?.(META_LINK_NOTICES.meta_cancelled)
        return
      }

      if (parsed.kind === 'error') {
        pendingSignup.current = null
        setBusy(false)
        console.error('Meta Embedded Signup reported an error', { code: parsed.code })
        onError?.(META_LINK_NOTICES[metaLinkStatusFromGraph(Number(parsed.code))])
        return
      }

      pending.session = parsed.session
      void finishIfReady()
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [finishIfReady, onError])

  function launch() {
    if (busy || disabled) return
    const sdk = window.FB
    if (!sdk || !authorization || !sdkReady) return
    const state = takeState()
    if (!state) return

    setBusy(true)
    try {
      const attempt: PendingSignup = {
        state,
        code: null,
        session: null,
        completing: false,
      }
      pendingSignup.current = attempt
      window.setTimeout(() => {
        if (!mounted.current || pendingSignup.current !== attempt || attempt.completing) return
        pendingSignup.current = null
        setBusy(false)
        onError?.('لم يكتمل التفويض في نافذة ميتا. أعد المحاولة.')
      }, 240_000)

      sdk.login((response) => {
        if (!mounted.current || pendingSignup.current !== attempt) return
        const code = response.authResponse?.code?.trim()
        if (!code) {
          // The session event may already have reported a cancellation or error.
          pendingSignup.current = null
          setBusy(false)
          onError?.(
            response.error || response.status === 'not_authorized'
              ? META_LINK_NOTICES.meta_permission
              : META_LINK_NOTICES.meta_cancelled
          )
          return
        }

        attempt.code = code
        void finishIfReady()
        window.setTimeout(() => {
          if (!mounted.current || pendingSignup.current !== attempt || attempt.completing) return
          pendingSignup.current = null
          setBusy(false)
          onError?.('لم يصل تأكيد الربط من ميتا. أعد المحاولة.')
        }, 10_000)
      }, {
        config_id: configId,
        auth_type: 'rerequest',
        response_type: 'code',
        override_default_response_type: true,
        // Match the Meta-hosted Tech Provider configuration for WhatsApp Business App onboarding (Coexistence).
        extras: {
          ...(mode === 'coexistence' ? { featureType: 'whatsapp_business_app_onboarding' as const } : {}),
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

  if (!appId || !configId) {
    return <p className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-xs leading-6 text-text">
      {mode === 'cloud_api'
        ? 'الربط السحابي غير مهيأ حاليًا.'
        : 'ربط واتساب بوضع التعايش غير مهيأ حاليًا.'}
    </p>
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={launch}
        disabled={disabled || busy || !sdkReady || !authorization}
        className={
          className ??
          'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-6 text-base font-semibold text-white transition-colors hover:bg-[#166FE5] disabled:opacity-60'
        }
      >
        {busy || (!authorization && !sdkError && !disabled) ? (
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        ) : (
          <MessageCircle size={18} aria-hidden="true" />
        )}
        {busy ? 'جارٍ إكمال الربط مع ميتا…' : authorization?.ok === false ? 'إعادة المحاولة' : !authorization && !disabled ? 'جارٍ تجهيز الربط…' : 'ربط واتساب عبر ميتا'}
      </button>
      {sdkError ? <p role="status" className="text-xs text-error">{sdkError}</p> : null}
      {authorization?.ok === false && <p role="status" className="text-xs text-error">{authorization.error}</p>}
    </div>
  )
}

export function isClientEmbeddedSignupConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_META_APP_ID?.trim() &&
      process.env.NEXT_PUBLIC_META_EMBEDDED_CONFIG_ID?.trim()
  )
}
