'use client'

import { useState, useTransition } from 'react'
import { createEscalationPolicyAction } from './actions'

export function EscalationForm() {
  const [name, setName] = useState('تصعيد تجاوز SLA')
  const [trigger, setTrigger] = useState('sla_breach')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault()
        setMessage(null)
        start(async () => {
          const res = await createEscalationPolicyAction({
            name,
            triggerType: trigger,
            notifyRoles: ['admin', 'manager'],
          })
          setMessage(res.ok ? 'تم الحفظ.' : res.error)
        })
      }}
    >
      <h2 className="text-sm font-semibold">إضافة سياسة</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
        required
      />
      <select
        value={trigger}
        onChange={(e) => setTrigger(e.target.value)}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      >
        <option value="sla_breach">تجاوز SLA</option>
        <option value="sla_warning">تحذير SLA</option>
        <option value="handoff">تسليم بشري</option>
        <option value="high_priority">أولوية عالية</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        حفظ
      </button>
      {message && <p className="text-sm text-text-muted">{message}</p>}
    </form>
  )
}
