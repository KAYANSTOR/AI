/**
 * Executive-agent executors for the Gmail and Google Calendar connectors.
 *
 * Every executor observes the same rules as the rest of the executive engine:
 *  - the owner is verified before the call and every lookup is owner-scoped;
 *  - connector content (mail, event titles) is wrapped as UNTRUSTED_DATA so text
 *    inside it can never authorize an action;
 *  - writes are governed by the policy engine and, where required, a hash-locked
 *    owner approval created before execution.
 */
import type { DbClient } from '@/lib/db/client'
import type { Owner, ToolExecutor } from '@/lib/personal-assistant/executive/engine'
import { wrapUntrusted } from '@/lib/personal-assistant/executive/policy'
import { getValidAccessToken } from './service'
import {
  createCalendarEvent,
  createGmailDraft,
  listCalendarEvents,
  readRecentEmails,
  sendGmailMessage,
  summarizeEmails,
  updateCalendarEvent,
} from './google'

function str(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

async function gmailToken(db: DbClient, owner: Owner): Promise<string> {
  return getValidAccessToken(db, owner, 'gmail')
}

async function calendarToken(db: DbClient, owner: Owner): Promise<string> {
  return getValidAccessToken(db, owner, 'google_calendar')
}

export const connectorExecutors: Record<string, ToolExecutor> = {
  gmail_summarize_recent: async (db, owner, input) => {
    const token = await gmailToken(db, owner)
    const emails = await readRecentEmails(token, {
      maxResults: num(input.max_results, 5, 1, 10),
      query: str(input.query, 200) || undefined,
    })
    const digest = emails.length
      ? emails.map(summarizeEmails).join('\n')
      : 'لا توجد رسائل حديثة مطابقة.'
    return {
      count: emails.length,
      read_only: true,
      // Gmail content is external data: never instructions.
      untrusted_data: wrapUntrusted('gmail', digest),
    }
  },

  gmail_create_draft: async (db, owner, input) => {
    const token = await gmailToken(db, owner)
    const result = await createGmailDraft(token, {
      to: str(input.to, 254),
      subject: str(input.subject, 200),
      body: str(input.body, 10000),
    })
    return { draft_id: result.draftId, message_id: result.messageId, sent: false }
  },

  gmail_send_email: async (db, owner, input) => {
    const token = await gmailToken(db, owner)
    const result = await sendGmailMessage(token, {
      to: str(input.to, 254),
      subject: str(input.subject, 200),
      body: str(input.body, 10000),
    })
    return { message_id: result.messageId, sent: true }
  },

  calendar_list_events: async (db, owner, input) => {
    const token = await calendarToken(db, owner)
    const events = await listCalendarEvents(token, {
      timeMin: str(input.time_min, 40) || undefined,
      timeMax: str(input.time_max, 40) || undefined,
      maxResults: num(input.max_results, 10, 1, 25),
    })
    const digest = events.length
      ? events
          .map((event, index) => `${index + 1}. ${event.summary} — ${event.startsAt} → ${event.endsAt}${event.location ? ' — ' + event.location : ''}`)
          .join('\n')
      : 'لا توجد أحداث في هذه الفترة.'
    return { count: events.length, read_only: true, untrusted_data: wrapUntrusted('google_calendar', digest) }
  },

  calendar_create_event: async (db, owner, input) => {
    const token = await calendarToken(db, owner)
    const event = await createCalendarEvent(token, {
      summary: str(input.summary, 300),
      description: str(input.description, 4000) || undefined,
      startsAt: str(input.starts_at, 40),
      endsAt: str(input.ends_at, 40),
      timeZone: str(input.time_zone, 60) || undefined,
      location: str(input.location, 300) || undefined,
    })
    return { event_id: event.id, starts_at: event.startsAt, ends_at: event.endsAt }
  },

  calendar_update_event: async (db, owner, input) => {
    const token = await calendarToken(db, owner)
    const event = await updateCalendarEvent(token, str(input.event_id, 200), {
      summary: str(input.summary, 300),
      description: str(input.description, 4000) || undefined,
      startsAt: str(input.starts_at, 40),
      endsAt: str(input.ends_at, 40),
      timeZone: str(input.time_zone, 60) || undefined,
      location: str(input.location, 300) || undefined,
    })
    return { event_id: event.id, starts_at: event.startsAt, ends_at: event.endsAt }
  },
}
