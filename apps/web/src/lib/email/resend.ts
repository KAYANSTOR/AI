/**
 * Transactional e-mail via Resend's REST API. Without RESEND_API_KEY and a sender it
 * is a logged no-op, so builds, tests and local runs work without credentials.
 */
type Env = Record<string, string | undefined>
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type EmailMessage = { to: string; subject: string; html: string; text: string }
export type SendResult = { sent: true } | { sent: false; reason: 'not_configured' | 'provider_error' }

function sender(env: Env): string {
  return (env.RESEND_FROM_EMAIL || env.AUTH_EMAIL_FROM || '').trim()
}

export function isEmailConfigured(env: Env = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && sender(env))
}

export async function sendEmail(
  message: EmailMessage,
  options: { env?: Env; fetchImpl?: FetchLike } = {}
): Promise<SendResult> {
  const env = options.env ?? process.env
  if (!isEmailConfigured(env)) {
    console.warn('email_not_configured', { subject: message.subject })
    return { sent: false, reason: 'not_configured' }
  }
  const response = await (options.fetchImpl ?? fetch)('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: sender(env), to: [message.to], subject: message.subject, html: message.html, text: message.text }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    console.error('email_provider_error', { status: response.status })
    return { sent: false, reason: 'provider_error' }
  }
  return { sent: true }
}
