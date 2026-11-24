import type { TakeoverScope } from '@/lib/runtime/owner-presence'

export type OwnerPresenceInput = {
  channelId: string
  enabled: boolean
  pauseMinutes: number
  scope: TakeoverScope
}

export function parseOwnerPresenceInput(value: unknown):
  { ok: true; value: OwnerPresenceInput } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') return { ok: false, error: 'بيانات غير صالحة.' }
  const input = value as Record<string, unknown>
  const channelId = String(input.channelId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(channelId)) return { ok: false, error: 'القناة غير صالحة.' }
  const minutes = Number(input.pauseMinutes)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    return { ok: false, error: 'مدة الإيقاف يجب أن تكون بين 1 و 1440 دقيقة.' }
  }
  const scope = input.scope === 'conversation' ? 'conversation' : input.scope === 'channel' ? 'channel' : null
  if (!scope) return { ok: false, error: 'نطاق الإيقاف غير صالح.' }
  return { ok: true, value: { channelId, enabled: input.enabled === true, pauseMinutes: minutes, scope } }
}
