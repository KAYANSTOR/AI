'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Loader2 } from 'lucide-react'
import { beginMessengerConnectionAction, createMessengerOAuthStateAction } from '@/app/dashboard/channels/actions'
import { META_LINK_NOTICES } from '@/lib/channels/meta-connection'
import { useMetaAuthorization } from './use-meta-authorization'

type Page = { id: string; name: string }

export function MessengerConnectButton({ disabled, linked, onPages, onError }: {
  disabled?: boolean
  linked?: boolean
  onPages: (pages: Page[]) => void
  onError: (message: string) => void
}) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim() ?? ''
  const [ready, setReady] = useState(false)
  const [sdkError, setSdkError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef<{ completing: boolean } | null>(null)
  const { authorization, takeState } = useMetaAuthorization(createMessengerOAuthStateAction, ready && !disabled, busy)

  useEffect(() => {
    if (!appId) return
    let mounted = true
    const initialize = () => {
      if (!mounted || !window.FB) return
      if (window.__kayanMetaSdkAppId !== appId) {
        window.FB.init({ appId, cookie: true, xfbml: false, version: 'v27.0' })
        window.__kayanMetaSdkAppId = appId
      }
      setReady(true)
      setSdkError(null)
    }

    window.fbAsyncInit = initialize
    let script = document.getElementById('facebook-jssdk') as HTMLScriptElement | null
    if (window.FB) {
      queueMicrotask(initialize)
    } else if (script) {
      script.addEventListener('load', initialize, { once: true })
    } else {
      script = document.createElement('script')
      script.id = 'facebook-jssdk'
      script.src = 'https://connect.facebook.net/en_US/sdk.js'
      script.async = true
      script.defer = true
      script.onload = initialize
      script.onerror = () => {
        script?.remove()
        if (mounted) setSdkError('تعذّر تحميل خدمة ميتا. تحقّق من الاتصال ثم أعد فتح البطاقة.')
      }
      document.head.appendChild(script)
    }
    return () => {
      mounted = false
      pending.current = null
      script?.removeEventListener('load', initialize)
      if (window.fbAsyncInit === initialize) delete window.fbAsyncInit
    }
  }, [appId])

  function launch() {
    const sdk = window.FB
    if (!sdk || !ready || disabled || busy || !authorization) return
    const state = takeState()
    if (!state) return

    const attempt = { completing: false }
    pending.current = attempt
    setBusy(true)
    window.setTimeout(() => {
      if (pending.current !== attempt || attempt.completing) return
      pending.current = null
      setBusy(false)
      onError('لم يكتمل التفويض في نافذة ميتا. أعد المحاولة.')
    }, 240_000)

    try {
      sdk.login(async (response) => {
        if (pending.current !== attempt) return
        const accessToken = response.authResponse?.accessToken?.trim()
        if (!accessToken) {
          pending.current = null
          setBusy(false)
          onError(response.error || response.status === 'not_authorized'
            ? META_LINK_NOTICES.meta_permission
            : META_LINK_NOTICES.meta_cancelled)
          return
        }

        attempt.completing = true
        try {
          const result = await beginMessengerConnectionAction({ accessToken, state })
          if (pending.current !== attempt) return
          if (result.ok) onPages(result.pages)
          else onError(result.error ?? META_LINK_NOTICES.meta_error)
        } catch (error) {
          if (pending.current !== attempt) return
          console.error('Messenger authorization failed', { errorType: error instanceof Error ? error.name : 'unknown' })
          onError(META_LINK_NOTICES.meta_error)
        } finally {
          if (pending.current === attempt) {
            pending.current = null
            setBusy(false)
          }
        }
      }, { scope: 'pages_show_list,pages_messaging,pages_manage_metadata', auth_type: 'rerequest' })
    } catch (error) {
      pending.current = null
      setBusy(false)
      console.error('Messenger authorization could not start', { errorType: error instanceof Error ? error.name : 'unknown' })
      onError(META_LINK_NOTICES.meta_error)
    }
  }

  if (!appId) return <p role="status" className="text-xs text-error">ربط ماسنجر غير مهيأ حاليًا.</p>

  const preparing = !authorization && !sdkError && !disabled
  return (
    <div className="space-y-2">
      <button type="button" onClick={launch} disabled={disabled || busy || !ready || !authorization}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {busy || preparing ? <Loader2 size={18} aria-hidden="true" className="animate-spin" /> : <MessageCircle size={18} aria-hidden="true" />}
        {busy ? 'جارٍ التفويض…' : preparing ? 'جارٍ تجهيز الربط…' : authorization?.ok === false ? 'إعادة المحاولة' : linked ? 'إعادة الربط عبر ميتا' : 'متابعة الربط عبر ميتا'}
      </button>
      {sdkError && <p role="status" className="text-xs text-error">{sdkError}</p>}
      {authorization?.ok === false && <p role="status" className="text-xs text-error">{authorization.error}</p>}
    </div>
  )
}
