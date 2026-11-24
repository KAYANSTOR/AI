/**
 * WhatsApp message templates (Meta Template Messages).
 *
 * Templates are the only way a business may start a conversation (or write after the
 * 24-hour customer service window). This module owns:
 *   - pure helpers for template bodies/variables and the Meta submission payload;
 *   - syncing the WABA's template status from the Graph API;
 *   - submitting a new template for Meta review;
 *   - resolving the approved template an outbox event should use.
 *
 * Credentials are passed in by the caller (resolved per channel through
 * CredentialService); nothing here reads a token from the environment.
 */
import type { DbClient } from '@/lib/db/client'
import { MetaApiError, requireGraphBase } from '@/lib/providers/meta'

export const WHATSAPP_TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const
export type WhatsAppTemplateCategory = (typeof WHATSAPP_TEMPLATE_CATEGORIES)[number]
export type WhatsAppTemplateStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export type WhatsAppTemplateRow = {
  id: string
  org_id: string
  channel_id: string
  meta_template_id: string | null
  template_name: string
  language_code: string
  category: WhatsAppTemplateCategory
  body_text: string
  variables_schema: string[] | Record<string, unknown>
  status: WhatsAppTemplateStatus
  rejection_reason: string | null
  last_synced_at: string | null
  updated_at: string
}

export type MetaTemplateComponent = { type?: string; text?: string; example?: { body_text?: string[][] } }
export type MetaTemplateRecord = {
  id?: string
  name?: string
  language?: string
  status?: string
  category?: string
  components?: MetaTemplateComponent[]
}

const LANGUAGE_RE = /^[a-z]{2,3}(_[A-Z]{2})?$/
const TEMPLATE_NAME_RE = /^[a-z0-9][a-z0-9_]{0,511}$/
const VARIABLE_RE = /\{\{\s*(\d+)\s*\}\}/g

/** Meta requires lowercase latin names with underscores. */
export function normalizeTemplateName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 512)
}

export function isValidTemplateName(value: string): boolean {
  return TEMPLATE_NAME_RE.test(value)
}

export function normalizeLanguageCode(value: string): string {
  const trimmed = value.trim()
  if (LANGUAGE_RE.test(trimmed)) return trimmed
  // "ar" / "AR" / "ar-ye" -> best effort conversion to Meta's language_COUNTRY form.
  const match = /^([a-zA-Z]{2,3})(?:[-_]([a-zA-Z]{2}))?$/.exec(trimmed)
  if (!match) return 'ar'
  return match[2] ? `${match[1].toLowerCase()}_${match[2].toUpperCase()}` : match[1].toLowerCase()
}

export function normalizeCategory(value: string): WhatsAppTemplateCategory {
  const upper = value.trim().toUpperCase()
  return (WHATSAPP_TEMPLATE_CATEGORIES as readonly string[]).includes(upper)
    ? (upper as WhatsAppTemplateCategory)
    : 'UTILITY'
}

/** Highest {{n}} placeholder index used by a body (0 when it has none). */
export function templateVariableCount(bodyText: string): number {
  let highest = 0
  for (const match of bodyText.matchAll(VARIABLE_RE)) {
    const index = Number(match[1])
    if (Number.isFinite(index) && index > highest) highest = index
  }
  return highest
}

export function extractTemplateVariables(bodyText: string): string[] {
  const count = templateVariableCount(bodyText)
  return Array.from({ length: count }, (_, index) => `{{${index + 1}}}`)
}

/** Renders a template body with positional values; missing values stay as the placeholder. */
export function renderTemplateBody(bodyText: string, values: string[]): string {
  return bodyText.replace(VARIABLE_RE, (placeholder, rawIndex: string) => {
    const index = Number(rawIndex) - 1
    const value = values[index]
    return typeof value === 'string' ? value : placeholder
  })
}

/**
 * A template needs at least one example per variable at submission time, otherwise
 * Meta rejects it. Examples are stored in variables_schema.
 */
export function buildTemplateSubmission(input: {
  name: string
  languageCode: string
  category: string
  bodyText: string
  examples?: string[]
}) {
  const name = normalizeTemplateName(input.name)
  if (!isValidTemplateName(name)) throw new Error('invalid_template_name')
  const languageCode = normalizeLanguageCode(input.languageCode)
  const bodyText = input.bodyText.trim()
  if (!bodyText || bodyText.length > 1024) throw new Error('invalid_template_body')
  const variableCount = templateVariableCount(bodyText)
  const examples = (input.examples ?? []).map((value) => String(value).slice(0, 200)).filter(Boolean)
  if (variableCount > 0 && examples.length < variableCount) throw new Error('template_examples_required')

  const bodyComponent: Record<string, unknown> = { type: 'BODY', text: bodyText }
  if (variableCount > 0) {
    bodyComponent.example = { body_text: [examples.slice(0, variableCount)] }
  }

  return {
    name,
    languageCode,
    category: normalizeCategory(input.category),
    bodyText,
    variablesSchema: examples.slice(0, variableCount),
    payload: {
      name,
      language: languageCode,
      category: normalizeCategory(input.category),
      components: [bodyComponent],
    },
  }
}

export function mapMetaStatus(status: string | undefined): WhatsAppTemplateStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'APPROVED':
      return 'approved'
    case 'REJECTED':
    case 'DISABLED':
    case 'PAUSED':
      return status?.toUpperCase() === 'REJECTED' || status?.toUpperCase() === 'DISABLED' ? 'rejected' : 'pending'
    default:
      return 'pending'
  }
}

export function mapMetaTemplate(record: MetaTemplateRecord): {
  metaTemplateId: string | null
  templateName: string
  languageCode: string
  category: WhatsAppTemplateCategory
  bodyText: string
  variablesSchema: string[]
  status: WhatsAppTemplateStatus
} | null {
  const templateName = record.name ?? ''
  if (!isValidTemplateName(templateName)) return null
  const body = (record.components ?? []).find((component) => (component.type ?? '').toUpperCase() === 'BODY')
  const bodyText = (body?.text ?? '').trim()
  if (!bodyText) return null
  const examples = body?.example?.body_text?.[0] ?? []
  return {
    metaTemplateId: record.id ? String(record.id).slice(0, 128) : null,
    templateName,
    languageCode: normalizeLanguageCode(record.language ?? 'ar'),
    category: normalizeCategory(record.category ?? 'UTILITY'),
    bodyText: bodyText.slice(0, 4000),
    variablesSchema: examples.slice(0, templateVariableCount(bodyText)).map((value) => String(value).slice(0, 200)),
    status: mapMetaStatus(record.status),
  }
}

async function graphFetch<T>(
  url: string,
  init: RequestInit & { accessToken: string },
  fetchImpl: typeof fetch
): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: 'Bearer ' + init.accessToken,
      'Content-Type': 'application/json',
    },
  })
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: { message?: string; error_user_msg?: string; code?: number } })
    | null
  if (!response.ok) {
    const detail = payload?.error?.error_user_msg || payload?.error?.message
    const code = typeof payload?.error?.code === 'number' ? ' (رمز Meta ' + payload.error.code + ')' : ''
    throw new MetaApiError(
      'رفضت Meta طلب القوالب (HTTP ' + response.status + ')' + code + (detail ? '. ' + detail : '.'),
      response.status
    )
  }
  if (!payload) throw new MetaApiError('رد غير صالح من Meta لقوالب WhatsApp.', response.status)
  return payload
}

export type TemplateSyncResult = { scanned: number; saved: number; skipped: number }

/**
 * Pulls the WABA template list and upserts the local projection. Status changes
 * (approved / rejected) are what allow the outbox to use a template.
 */
export async function syncWhatsAppTemplates(
  db: DbClient,
  input: {
    organizationId: string
    channelId: string
    wabaId: string
    accessToken: string
    fetchImpl?: typeof fetch
    now?: Date
  }
): Promise<TemplateSyncResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const url =
    requireGraphBase() +
    '/' +
    encodeURIComponent(input.wabaId) +
    '/message_templates?fields=id,name,language,status,category,components&limit=100'
  const data = await graphFetch<{ data?: MetaTemplateRecord[] }>(url, { method: 'GET', accessToken: input.accessToken }, fetchImpl)
  const now = (input.now ?? new Date()).toISOString()
  let saved = 0
  let skipped = 0

  for (const record of data.data ?? []) {
    const mapped = mapMetaTemplate(record)
    if (!mapped) {
      skipped++
      continue
    }
    const { error } = await db.from('whatsapp_message_templates').upsert(
      {
        org_id: input.organizationId,
        channel_id: input.channelId,
        meta_template_id: mapped.metaTemplateId,
        template_name: mapped.templateName,
        language_code: mapped.languageCode,
        category: mapped.category,
        body_text: mapped.bodyText,
        variables_schema: mapped.variablesSchema,
        status: mapped.status,
        rejection_reason: mapped.status === 'rejected' ? 'rejected_by_meta' : null,
        last_synced_at: now,
        updated_at: now,
      },
      { onConflict: 'channel_id,template_name,language_code' }
    )
    if (error) throw new Error('template_sync_failed: ' + error.message)
    saved++
  }

  return { scanned: (data.data ?? []).length, saved, skipped }
}

/** Creates the template in Meta and parks it as pending review locally. */
export async function submitWhatsAppTemplate(
  db: DbClient,
  input: {
    organizationId: string
    channelId: string
    wabaId: string
    accessToken: string
    name: string
    languageCode: string
    category: string
    bodyText: string
    examples?: string[]
    fetchImpl?: typeof fetch
    now?: Date
  }
): Promise<{ id: string; status: 'pending'; metaTemplateId: string | null }> {
  const submission = buildTemplateSubmission(input)
  const fetchImpl = input.fetchImpl ?? fetch
  const data = await graphFetch<{ id?: string }>(
    requireGraphBase() + '/' + encodeURIComponent(input.wabaId) + '/message_templates',
    { method: 'POST', accessToken: input.accessToken, body: JSON.stringify(submission.payload) },
    fetchImpl
  )
  const now = (input.now ?? new Date()).toISOString()
  const { data: saved, error } = await db
    .from('whatsapp_message_templates')
    .upsert(
      {
        org_id: input.organizationId,
        channel_id: input.channelId,
        meta_template_id: data.id ? String(data.id).slice(0, 128) : null,
        template_name: submission.name,
        language_code: submission.languageCode,
        category: submission.category,
        body_text: submission.bodyText,
        variables_schema: submission.variablesSchema,
        status: 'pending',
        rejection_reason: null,
        last_synced_at: now,
        updated_at: now,
      },
      { onConflict: 'channel_id,template_name,language_code' }
    )
    .select('id')
    .single()
  if (error || !saved) throw new Error('template_save_failed: ' + (error?.message ?? 'unknown'))
  return { id: String(saved.id), status: 'pending', metaTemplateId: data.id ?? null }
}

/**
 * Resolves the template an automatic business message should use outside the window.
 * An explicit name/language wins; otherwise the most recently approved template for
 * the channel is chosen (deterministic tie-break by updated_at).
 */
export async function findApprovedTemplate(
  db: DbClient,
  input: { organizationId: string; channelId: string; name?: string | null; languageCode?: string | null }
): Promise<WhatsAppTemplateRow | null> {
  let query = db
    .from('whatsapp_message_templates')
    .select(
      'id, org_id, channel_id, meta_template_id, template_name, language_code, category, body_text, variables_schema, status, rejection_reason, last_synced_at, updated_at'
    )
    .eq('org_id', input.organizationId)
    .eq('channel_id', input.channelId)
    .eq('status', 'approved')
  if (input.name) query = query.eq('template_name', input.name)
  if (input.languageCode) query = query.eq('language_code', input.languageCode)
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error('template_lookup_failed: ' + error.message)
  return (data as unknown as WhatsAppTemplateRow | null) ?? null
}

/**
 * Builds the ordered body parameters for a template. Values are trimmed and capped;
 * missing values become an empty string because Meta requires the exact count.
 */
export function buildTemplateParameters(bodyText: string, values: string[]): string[] {
  const count = templateVariableCount(bodyText)
  return Array.from({ length: count }, (_, index) => String(values[index] ?? '').trim().slice(0, 200))
}

/** Normalizes a stored variables_schema (array of example strings) for rendering. */
export function schemaExamples(schema: unknown): string[] {
  if (!Array.isArray(schema)) return []
  return schema.filter((value): value is string => typeof value === 'string')
}
