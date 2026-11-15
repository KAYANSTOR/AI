'use client'

import { useState, useTransition } from 'react'
import { createApiKeyAction, revokeApiKeyAction } from './actions'

type KeyRow = {
  id: string
  name: string
  key_prefix: string
  scopes: string[] | null
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export function ApiKeyManager({ initialKeys }: { initialKeys: KeyRow[] }) {
  const [name, setName] = useState('')
  const [rawKey, setRawKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          setRawKey(null)
          start(async () => {
            const res = await createApiKeyAction(name)
            if (res.ok && res.rawKey) {
              setRawKey(res.rawKey)
              setName('')
            } else if (!res.ok) {
              setError(res.error)
            }
          })
        }}
      >
        <label className="flex-1 text-sm">
          اسم المفتاح
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            required
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          إنشاء
        </button>
      </form>

      {rawKey && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-semibold">انسخ المفتاح الآن — لن يُعرض مجددًا:</p>
          <code className="mt-2 block break-all text-xs">{rawKey}</code>
        </div>
      )}
      {error && <p className="text-sm text-error">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-background">
            <tr>
              <th className="px-3 py-2 text-start">الاسم</th>
              <th className="px-3 py-2 text-start">البادئة</th>
              <th className="px-3 py-2 text-start">الحالة</th>
              <th className="px-3 py-2 text-start"></th>
            </tr>
          </thead>
          <tbody>
            {initialKeys.map((k) => (
              <tr key={k.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">{k.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{k.key_prefix}…</td>
                <td className="px-3 py-2">{k.revoked_at ? 'ملغى' : 'نشط'}</td>
                <td className="px-3 py-2">
                  {!k.revoked_at && (
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs text-error"
                      onClick={() => start(async () => { await revokeApiKeyAction(k.id) })}
                    >
                      إلغاء
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
