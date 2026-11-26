'use client'

import { useEffect, useState } from 'react'

type AuthorizationResult = { ok: true; state: string } | { ok: false; error: string }
type PreparedAuthorization =
  | { ok: true; state: string; preparedAt: number }
  | { ok: false; error: string }

export function useMetaAuthorization(
  prepare: () => Promise<AuthorizationResult>,
  enabled: boolean,
  busy: boolean,
) {
  const [authorization, setAuthorization] = useState<PreparedAuthorization | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!enabled || busy) return
    let active = true
    void prepare().then((result) => {
      if (active) setAuthorization(result.ok ? { ...result, preparedAt: Date.now() } : result)
    }).catch((error: unknown) => {
      if (!active) return
      console.error('Meta authorization preparation failed', { errorType: error instanceof Error ? error.name : 'unknown' })
      setAuthorization({ ok: false, error: 'تعذّر تجهيز التفويض. أعد المحاولة.' })
    })
    return () => { active = false }
  }, [busy, enabled, prepare, revision])

  function takeState() {
    setAuthorization(null)
    setRevision((value) => value + 1)
    if (!authorization?.ok || Date.now() - authorization.preparedAt >= 25 * 60 * 1000) return null
    return authorization.state
  }

  return { authorization, takeState }
}
