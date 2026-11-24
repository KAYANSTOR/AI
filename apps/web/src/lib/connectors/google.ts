/**
 * Gmail + Google Calendar REST clients.
 *
 * The access token is always passed in by the caller (resolved from the encrypted
 * connection row). Gmail message content is returned as data only; callers must wrap it
 * with `wrapUntrusted` before it can reach a model prompt.
 */
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

export type EmailSummary = {
  id: string
  from: string
  subject: string
  receivedAt: string
  snippet: string
}

export type CalendarEventInput = {
  summary: string
  description?: string
  startsAt: string
  endsAt: string
  timeZone?: string
  location?: string
}

const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,190}$/
const CONTROL_RE = /[\r\n\u0000]/

export function isValidEmailAddress(value: string): boolean {
  return EMAIL_RE.test(value.trim()) && !CONTROL_RE.test(value)
}

/** Rejects header-injection attempts before an address reaches the MIME payload. */
export function validateEmailFields(input: { to: string; subject: string; body: string }): {
  to: string
  subject: string
  body: string
} {
  const to = String(input.to ?? '').trim()
  const subject = String(input.subject ?? '').trim()
  const body = String(input.body ?? '')
  if (!isValidEmailAddress(to)) throw new Error('invalid_email_recipient')
  if (!subject || subject.length > 200 || CONTROL_RE.test(subject)) throw new Error('invalid_email_subject')
  if (!body.trim() || body.length > 10000) throw new Error('invalid_email_body')
  return { to, subject, body }
}

/** RFC 2822 message encoded for Gmail's `raw` field. */
export function buildGmailRawMessage(input: { to: string; subject: string; body: string; from?: string | null }): string {
  const { to, subject, body } = validateEmailFields(input)
  const lines = [
    ...(input.from && isValidEmailAddress(input.from) ? [`From: ${input.from}`] : []),
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body, 'utf8').toString('base64'),
  ]
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
}

async function googleJson<T>(url: string, accessToken: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
  })
  const payload = (await response.json().catch(() => null)) as T | null
  if (!response.ok || !payload) throw new Error('google_api_error_' + response.status)
  return payload
}

function header(payload: { headers?: Array<{ name?: string; value?: string }> } | null, name: string): string {
  return payload?.headers?.find((entry) => (entry.name ?? '').toLowerCase() === name.toLowerCase())?.value ?? ''
}

export async function readRecentEmails(
  accessToken: string,
  input: { maxResults?: number; query?: string } = {},
  fetchImpl: typeof fetch = fetch
): Promise<EmailSummary[]> {
  const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10)
  const query = encodeURIComponent(input.query?.trim() || 'newer_than:7d')
  const list = await googleJson<{ messages?: Array<{ id?: string }> }>(
    `${GMAIL_BASE}/messages?q=${query}&maxResults=${maxResults}`,
    accessToken,
    { method: 'GET' },
    fetchImpl
  )
  const summaries: EmailSummary[] = []
  for (const message of list.messages ?? []) {
    if (!message.id) continue
    const detail = await googleJson<{
      id?: string
      snippet?: string
      internalDate?: string
      payload?: { headers?: Array<{ name?: string; value?: string }> }
    }>(
      `${GMAIL_BASE}/messages/${encodeURIComponent(message.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      accessToken,
      { method: 'GET' },
      fetchImpl
    )
    summaries.push({
      id: String(detail.id ?? message.id),
      from: header(detail.payload ?? null, 'From').slice(0, 200),
      subject: header(detail.payload ?? null, 'Subject').slice(0, 200),
      receivedAt: detail.internalDate
        ? new Date(Number(detail.internalDate)).toISOString()
        : header(detail.payload ?? null, 'Date').slice(0, 80),
      snippet: String(detail.snippet ?? '').replace(/\s+/g, ' ').slice(0, 300),
    })
  }
  return summaries
}

/** Deterministic digest of recent mail; no values are invented or sent anywhere. */
export function summarizeEmails(email: EmailSummary, index: number): string {
  return `${index + 1}. من: ${email.from || 'غير معروف'} — الموضوع: ${email.subject || '(بدون موضوع)'} — ${email.snippet}`
}

export async function createGmailDraft(
  accessToken: string,
  input: { to: string; subject: string; body: string; from?: string | null },
  fetchImpl: typeof fetch = fetch
): Promise<{ draftId: string; messageId: string | null }> {
  const raw = buildGmailRawMessage(input)
  const payload = await googleJson<{ id?: string; message?: { id?: string } }>(
    `${GMAIL_BASE}/drafts`,
    accessToken,
    { method: 'POST', body: JSON.stringify({ message: { raw } }) },
    fetchImpl
  )
  if (!payload.id) throw new Error('gmail_draft_failed')
  return { draftId: String(payload.id), messageId: payload.message?.id ? String(payload.message.id) : null }
}

export async function sendGmailMessage(
  accessToken: string,
  input: { to: string; subject: string; body: string; from?: string | null },
  fetchImpl: typeof fetch = fetch
): Promise<{ messageId: string | null }> {
  const raw = buildGmailRawMessage(input)
  const payload = await googleJson<{ id?: string }>(
    `${GMAIL_BASE}/messages/send`,
    accessToken,
    { method: 'POST', body: JSON.stringify({ raw }) },
    fetchImpl
  )
  return { messageId: payload.id ? String(payload.id) : null }
}

export type CalendarEventSummary = {
  id: string
  summary: string
  startsAt: string
  endsAt: string
  location: string
  htmlLink: string
}

type GoogleEvent = {
  id?: string
  summary?: string
  location?: string
  htmlLink?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

function mapEvent(event: GoogleEvent): CalendarEventSummary {
  return {
    id: String(event.id ?? ''),
    summary: String(event.summary ?? '(بدون عنوان)').slice(0, 300),
    startsAt: event.start?.dateTime ?? event.start?.date ?? '',
    endsAt: event.end?.dateTime ?? event.end?.date ?? '',
    location: String(event.location ?? '').slice(0, 300),
    htmlLink: String(event.htmlLink ?? ''),
  }
}

export async function listCalendarEvents(
  accessToken: string,
  input: { timeMin?: string; timeMax?: string; maxResults?: number } = {},
  fetchImpl: typeof fetch = fetch
): Promise<CalendarEventSummary[]> {
  const timeMin = input.timeMin ?? new Date().toISOString()
  const timeMax = input.timeMax ?? new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString()
  const maxResults = Math.min(Math.max(input.maxResults ?? 10, 1), 25)
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
  })
  const payload = await googleJson<{ items?: GoogleEvent[] }>(
    `${CALENDAR_BASE}/calendars/primary/events?${params.toString()}`,
    accessToken,
    { method: 'GET' },
    fetchImpl
  )
  return (payload.items ?? []).map(mapEvent).filter((event) => event.id)
}

export function validateCalendarEvent(input: CalendarEventInput): CalendarEventInput {
  const summary = String(input.summary ?? '').trim()
  if (!summary || summary.length > 300) throw new Error('invalid_event_summary')
  const start = new Date(input.startsAt)
  const end = new Date(input.endsAt)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error('invalid_event_time')
  if (end.getTime() <= start.getTime()) throw new Error('event_end_before_start')
  if (end.getTime() - start.getTime() > 7 * 24 * 60 * 60_000) throw new Error('event_too_long')
  return {
    summary,
    description: input.description ? String(input.description).slice(0, 4000) : undefined,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    timeZone: input.timeZone ? String(input.timeZone).slice(0, 60) : undefined,
    location: input.location ? String(input.location).slice(0, 300) : undefined,
  }
}

function eventBody(input: CalendarEventInput) {
  const valid = validateCalendarEvent(input)
  return {
    summary: valid.summary,
    ...(valid.description ? { description: valid.description } : {}),
    ...(valid.location ? { location: valid.location } : {}),
    start: { dateTime: valid.startsAt, ...(valid.timeZone ? { timeZone: valid.timeZone } : {}) },
    end: { dateTime: valid.endsAt, ...(valid.timeZone ? { timeZone: valid.timeZone } : {}) },
  }
}

export async function createCalendarEvent(
  accessToken: string,
  input: CalendarEventInput,
  fetchImpl: typeof fetch = fetch
): Promise<CalendarEventSummary> {
  const payload = await googleJson<GoogleEvent>(
    `${CALENDAR_BASE}/calendars/primary/events`,
    accessToken,
    { method: 'POST', body: JSON.stringify(eventBody(input)) },
    fetchImpl
  )
  return mapEvent(payload)
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  input: CalendarEventInput,
  fetchImpl: typeof fetch = fetch
): Promise<CalendarEventSummary> {
  if (!/^[A-Za-z0-9_-]{5,200}$/.test(eventId)) throw new Error('invalid_event_id')
  const payload = await googleJson<GoogleEvent>(
    `${CALENDAR_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`,
    accessToken,
    { method: 'PATCH', body: JSON.stringify(eventBody(input)) },
    fetchImpl
  )
  return mapEvent(payload)
}
