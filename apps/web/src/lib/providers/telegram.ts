import { createHash } from 'node:crypto'
import type { DbClient } from '@/lib/db/client'

const TELEGRAM_API = 'https://api.telegram.org'

export type TelegramBot = {
  id: number
  is_bot: boolean
  first_name: string
  username?: string
}

async function telegramRequest<T>(
  token: string,
  method: string,
  payload?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: payload ? 'POST' : 'GET',
    headers: payload ? { 'content-type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  })
  const body = await response.json().catch(() => null) as {
    ok?: boolean
    result?: T
    description?: string
    error_code?: number
  } | null
  if (!response.ok || body?.ok !== true) {
    const status = body?.error_code ?? response.status
    throw new Error(`telegram_api_error_${status}`)
  }
  return body.result as T
}

export function verifyTelegramBot(token: string): Promise<TelegramBot> {
  return telegramRequest<TelegramBot>(token, 'getMe')
}

export async function configureTelegramWebhook(input: {
  token: string
  webhookUrl: string
  secretToken: string
}): Promise<void> {
  await telegramRequest<boolean>(input.token, 'setWebhook', {
    url: input.webhookUrl,
    secret_token: input.secretToken,
    allowed_updates: ['message', 'edited_message'],
    drop_pending_updates: false,
  })
}

export async function verifyTelegramWebhook(token: string, expectedUrl: string): Promise<boolean> {
  const info = await telegramRequest<{
    url?: string
    has_custom_certificate?: boolean
    pending_update_count?: number
  }>(token, 'getWebhookInfo')
  return info.url === expectedUrl
}

export async function sendTelegramText(input: {
  token: string
  chatId: string
  text: string
}): Promise<{ message_id: number; chat: { id: number } }> {
  return telegramRequest(input.token, 'sendMessage', {
    chat_id: input.chatId,
    text: input.text,
    disable_web_page_preview: true,
  })
}

/** A Telegram update sequence belongs to a bot, not to every bot in the platform. */
export function telegramUpdateId(updateId: number, channelId: string, botId: string): string {
  return createHash('sha256').update(JSON.stringify(['telegram', channelId, botId, updateId])).digest('hex')
}

/**
 * Preserve retries of existing events that were recorded before scoped keys were introduced.
 * A legacy key is reusable ONLY when its persisted channel and organization match the
 * authenticated, resolved channel. A foreign bot's old key must never suppress this update.
 * Keep the same key through webhook claiming, inbound persistence and outbound delivery.
 */
export async function resolveTelegramEventId(
  db: DbClient,
  updateId: number,
  scope: { channelId: string; organizationId: string; botId: string },
): Promise<string> {
  const scoped = telegramUpdateId(updateId, scope.channelId, scope.botId)
  const legacy = createHash('sha256').update(`telegram:${updateId}`).digest('hex')
  const { data, error } = await db.from('webhook_events')
    .select('id')
    .eq('provider', 'telegram')
    .eq('external_event_id', legacy)
    .eq('channel_id', scope.channelId)
    .eq('organization_id', scope.organizationId)
    .maybeSingle()
  if (error) throw new Error('telegram_legacy_event_lookup_failed')
  return data ? legacy : scoped
}
