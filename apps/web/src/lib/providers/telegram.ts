import { createHash } from 'node:crypto'

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

/** Stable event id for Telegram updates (including edited messages). */
export function telegramUpdateId(updateId: number): string {
  return createHash('sha256').update(`telegram:${updateId}`).digest('hex')
}
