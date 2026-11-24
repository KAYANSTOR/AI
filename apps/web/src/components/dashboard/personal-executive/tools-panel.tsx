'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, KeyRound, Link2, Loader2, Mail, ShieldCheck, Trash2, Unplug, Vault } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/overlay'
import { KayanSelect } from '@/components/ui/kayan-select'
import { cx } from '@/components/ui/cx'

type Connection = {
  provider: 'gmail' | 'google_calendar'
  labelAr: string
  connected: boolean
  status: 'active' | 'revoked' | 'error' | 'disconnected'
  accountEmail: string | null
  tokenExpiresAt: string | null
  lastError: string | null
  connectedAt: string | null
}

type SecretMetadata = {
  secret_ref: string
  label: string
  secret_kind: 'api_key' | 'token' | 'password' | 'other'
  fingerprint: string
  status: 'active' | 'revoked'
  last_used_at: string | null
  created_at: string
}

const KIND_LABEL: Record<SecretMetadata['secret_kind'], string> = {
  api_key: 'مفتاح API',
  token: 'رمز وصول',
  password: 'كلمة مرور',
  other: 'أخرى',
}

const CONNECTOR_ICON = { gmail: Mail, google_calendar: CalendarDays } as const

async function requestJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const response = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
    const data = (await response.json().catch(() => null)) as T | null
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

export function ToolsPanel() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [googleConfigured, setGoogleConfigured] = useState(false)
  const [secrets, setSecrets] = useState<SecretMetadata[]>([])
  const [storageConfigured, setStorageConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [form, setForm] = useState({ label: '', kind: 'api_key' as SecretMetadata['secret_kind'], value: '' })
  const [disconnectTarget, setDisconnectTarget] = useState<Connection | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<SecretMetadata | null>(null)

  const load = useCallback(async () => {
    const [connectionResult, vaultResult] = await Promise.all([
      requestJson<{ connections: Connection[]; googleConfigured: boolean }>('/api/assistant/connections'),
      requestJson<{ secrets: SecretMetadata[]; storageConfigured: boolean }>('/api/assistant/vault'),
    ])
    if (connectionResult.data) {
      setConnections(connectionResult.data.connections)
      setGoogleConfigured(connectionResult.data.googleConfigured)
    }
    if (vaultResult.data) {
      setSecrets(vaultResult.data.secrets)
      setStorageConfigured(vaultResult.data.storageConfigured)
    }
    if (!connectionResult.ok && !vaultResult.ok) setError('تعذّر تحميل الموصلات والخزنة.')
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function connect(connection: Connection) {
    setBusy(connection.provider)
    setError(null)
    const result = await requestJson<{ authorizeUrl?: string; error?: string }>('/api/assistant/connections', {
      method: 'POST',
      body: JSON.stringify({ provider: connection.provider }),
    })
    setBusy(null)
    if (!result.ok || !result.data?.authorizeUrl) {
      setError(result.status === 503 ? 'ربط Google غير مهيأ على الخادم بعد (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).' : 'تعذّر بدء ربط Google.')
      return
    }
    window.location.assign(result.data.authorizeUrl)
  }

  async function disconnect() {
    if (!disconnectTarget) return
    setBusy(disconnectTarget.provider)
    const result = await requestJson(`/api/assistant/connections?provider=${disconnectTarget.provider}`, { method: 'DELETE' })
    setBusy(null)
    setDisconnectTarget(null)
    if (!result.ok) { setError('تعذّر فصل الاتصال.'); return }
    setNotice('تم فصل الاتصال وحذف رموز الوصول المشفّرة.')
    await load()
  }

  async function saveSecret(event: React.FormEvent) {
    event.preventDefault()
    if (!form.label.trim() || !form.value.trim()) { setError('أدخل اسماً وقيمة للسر.'); return }
    setBusy('vault')
    setError(null)
    const result = await requestJson<{ ok?: boolean; error?: string }>('/api/assistant/vault', {
      method: 'POST',
      body: JSON.stringify({ label: form.label, kind: form.kind, value: form.value }),
    })
    setBusy(null)
    // Clear the value immediately: it is never shown again.
    setForm({ label: '', kind: 'api_key', value: '' })
    if (!result.ok) {
      setError(result.data?.error === 'invalid_secret_value' ? 'القيمة فارغة أو غير صالحة.' : 'تعذّر حفظ السر.')
      return
    }
    setNotice('تم حفظ السر مشفّراً. لن تظهر قيمته مرة أخرى — استخدم مرجع secret_ref في الأتمتة.')
    await load()
  }

  async function revokeSecret() {
    if (!revokeTarget) return
    setBusy(revokeTarget.secret_ref)
    const result = await requestJson(`/api/assistant/vault?secretRef=${encodeURIComponent(revokeTarget.secret_ref)}`, { method: 'DELETE' })
    setBusy(null)
    setRevokeTarget(null)
    if (!result.ok) { setError('تعذّر إلغاء السر.'); return }
    setNotice('أُلغي السر ولن يُستخدم في أي تنفيذ لاحق.')
    await load()
  }

  if (loading) return <p className="py-10 text-center text-sm text-text-muted">جارٍ التحميل…</p>

  return (
    <div className="space-y-4">
      {error ? <p role="alert" className="rounded-xl bg-error-soft p-3 text-sm text-error">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl border border-border bg-surface-muted p-3 text-sm text-text">{notice}</p> : null}

      <section aria-labelledby="pa-connectors" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="pa-connectors" className="text-sm font-extrabold text-text">الموصلات</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-dark">
            <ShieldCheck size={12} aria-hidden /> قراءة موثوقة
          </span>
        </div>
        {!googleConfigured ? (
          <p className="rounded-2xl border border-dashed border-border p-3 text-xs leading-5 text-text-muted">
            ربط Gmail وGoogle Calendar يظهر بعد تهيئة عميل Google OAuth على الخادم.
          </p>
        ) : null}
        {connections.map((connection) => {
          const Icon = CONNECTOR_ICON[connection.provider]
          return (
            <article key={connection.provider} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-dark"><Icon size={20} aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-text">{connection.labelAr}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {connection.connected
                      ? <>مرتبط {connection.accountEmail ? <span dir="ltr">({connection.accountEmail})</span> : null}</>
                      : connection.status === 'error'
                        ? 'يحتاج إعادة ربط: ' + (connection.lastError ?? 'انتهت صلاحية الوصول')
                        : 'غير مرتبط'}
                  </p>
                </div>
                {connection.connected ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy === connection.provider}
                    onClick={() => setDisconnectTarget(connection)}
                    leadingIcon={<Unplug size={14} aria-hidden />}
                  >
                    فصل
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    loading={busy === connection.provider}
                    disabled={!googleConfigured}
                    onClick={() => void connect(connection)}
                    leadingIcon={<Link2 size={14} aria-hidden />}
                  >
                    ربط
                  </Button>
                )}
              </div>
            </article>
          )
        })}
      </section>

      <section aria-labelledby="pa-vault" className="space-y-2">
        <h2 id="pa-vault" className="flex items-center gap-1.5 text-sm font-extrabold text-text">
          <Vault size={15} aria-hidden /> خزنة الأسرار
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold text-primary-dark">Fill-Only</span>
        </h2>
        <p className="rounded-2xl border border-accent bg-accent-light p-3 text-xs leading-5 text-text">
          القيمة تُشفّر على الخادم ولا تُعرض مرة أخرى — لا في الواجهة ولا للنموذج. يُسلَّم للنموذج مرجع فقط، ويُستخدم السر داخل الوسيط الآمن عند التنفيذ.
        </p>

        {!storageConfigured ? (
          <p className="rounded-2xl border border-dashed border-error p-3 text-xs text-error">
            التخزين المشفّر غير مهيأ (CREDENTIAL_ENCRYPTION_KEY). لا يمكن حفظ أسرار حتى يُضبط.
          </p>
        ) : (
          <form onSubmit={saveSecret} className="space-y-2 rounded-2xl border border-border bg-surface p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs font-bold text-text">
                اسم السر
                <input
                  value={form.label}
                  onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                  maxLength={120}
                  placeholder="مثال: مفتاح بوابة الدفع"
                  className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text outline-none focus:border-primary-dark focus:ring-2 focus:ring-focus"
                />
              </label>
              <label className="block text-xs font-bold text-text">
                النوع
                <KayanSelect
                  aria-label="نوع السر"
                  value={form.kind}
                  onValueChange={(value) => setForm((current) => ({ ...current, kind: value as SecretMetadata['secret_kind'] }))}
                  options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))}
                  className="mt-1"
                />
              </label>
            </div>
            <label className="block text-xs font-bold text-text">
              القيمة (تُحفظ مرة واحدة ولا تُعرض لاحقاً)
              <input
                type="password"
                autoComplete="new-password"
                dir="ltr"
                value={form.value}
                onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
                maxLength={4096}
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 font-mono text-sm text-text outline-none focus:border-primary-dark focus:ring-2 focus:ring-focus"
              />
            </label>
            <Button type="submit" fullWidth loading={busy === 'vault'} leadingIcon={<KeyRound size={16} aria-hidden />}>
              حفظ مشفّراً
            </Button>
          </form>
        )}

        <div className="space-y-2">
          {secrets.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-text-muted">لا توجد أسرار محفوظة بعد.</p>
          ) : null}
          {secrets.map((secret) => (
            <article key={secret.secret_ref} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-muted text-text-muted"><KeyRound size={16} aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-text">{secret.label}</p>
                <p className="text-[11px] text-text-muted">
                  {KIND_LABEL[secret.secret_kind]} · بصمة <span className="font-mono" dir="ltr">{secret.fingerprint}</span>
                  {secret.status === 'revoked' ? ' · ملغى' : ''}
                </p>
              </div>
              {secret.status === 'active' ? (
                <Button size="sm" variant="ghost" onClick={() => setRevokeTarget(secret)} leadingIcon={<Trash2 size={14} aria-hidden />}>إلغاء</Button>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <Dialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => { if (!open) setDisconnectTarget(null) }}
        className="z-50"
        title="فصل الاتصال؟"
        description="سيُحذف رمز الوصول المشفّر، ولن يستطيع المساعد قراءة البريد أو التقويم حتى تعيد الربط."
        footer={<>
          <Button variant="outline" onClick={() => setDisconnectTarget(null)} disabled={busy !== null}>تراجع</Button>
          <Button variant="danger" loading={busy !== null} onClick={() => void disconnect()}>فصل</Button>
        </>}
      >
        <p className="text-sm leading-6 text-text">{disconnectTarget?.labelAr}</p>
      </Dialog>

      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null) }}
        className="z-50"
        title="إلغاء السر؟"
        description="سيبقى السجل للتدقيق، لكن القيمة لن تُستخدم في أي تنفيذ لاحق."
        footer={<>
          <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={busy !== null}>تراجع</Button>
          <Button variant="danger" loading={busy !== null} onClick={() => void revokeSecret()}>إلغاء السر</Button>
        </>}
      >
        <p className={cx('text-sm leading-6 text-text')}>{revokeTarget?.label}</p>
      </Dialog>
    </div>
  )
}

export function ToolsPanelFallback() {
  return (
    <div className="grid place-items-center py-10 text-text-muted">
      <Loader2 className="animate-spin" size={20} aria-hidden />
    </div>
  )
}
