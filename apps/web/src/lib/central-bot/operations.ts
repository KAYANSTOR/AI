import type { DbClient } from '@/lib/db/client'
import { saveValidatedKnowledge, type ValidatedFact } from '@/lib/knowledge/layer'
import { createNotification } from '@/lib/notifications'
import { savePersonalMemory } from '@/lib/personal-assistant/memory-retrieval'
import { appendThreadMessage, threadHasExternalMessage } from '@/lib/personal-assistant/thread'
import { extractTrainingDraft, itemToText, stripInjection, type GenerateFn } from '@/lib/trainer/extract'
import { loadReadiness } from '@/lib/trainer/router'
import { getVertical, type BaseEngine, type VerticalDefinition } from '@/lib/verticals/registry'
import { getCentralBotConfig } from './config'
import { sendCentralText } from './meta-client'

export type CentralOwner = { organizationId: string; userId: string }
export type OwnerRole = 'owner' | 'admin'
export type ReportPeriod = 'today' | '24h' | '7d' | '30d'
export type DirectiveMode = 'append' | 'replace'

export type DirectiveUpdateResult = {
  ok: true
  organizationId: string
  agentId: string | null
  version: number | null
  mode: DirectiveMode
  directive: string
  systemPromptAddition: string
  confirmationReply: string
}

export type SectorReportMetrics =
  | {
      engine: 'booking_engine'
      appointmentsTotal: number
      appointmentsConfirmed: number
      appointmentsPending: number
      appointmentsCompleted: number
      appointmentsCancelled: number
    }
  | {
      engine: 'commerce_engine'
      ordersTotal: number
      ordersActive: number
      ordersCompleted: number
      ordersCancelled: number
      revenueTotal: number
      currency: string
    }
  | {
      engine: 'event_engine'
      appointmentsTotal: number
      appointmentsConfirmed: number
      quotesTotal: number
      quotesAccepted: number
    }
  | {
      engine: 'lead_engine'
      leadsTotal: number
      leadsOpen: number
      leadsWon: number
      quotesTotal: number
      quotesAccepted: number
    }

export type SectorOperationalReport = {
  organizationId: string
  organizationName: string
  verticalId: VerticalDefinition['id']
  verticalNameAr: string
  baseEngine: BaseEngine
  period: ReportPeriod
  sinceIso: string
  generatedAtIso: string
  conversations: {
    total: number
    active: number
    handedOff: number
    closed: number
  }
  sector: SectorReportMetrics
  summaryText: string
}

export type OwnerCommunicationKind = 'alert' | 'operational_summary'

export type OwnerCommunicationResult = {
  ok: true
  organizationId: string
  kind: OwnerCommunicationKind
  deliveredCount: number
  threadRecordedCount: number
  skippedDuplicate: boolean
  recipients: Array<{ userId: string; whatsappSent: boolean; threadRecorded: boolean }>
  messageText: string
}

export type DirectTrainingResult = {
  ok: true
  organizationId: string
  target: 'knowledge' | 'memory'
  insertedCount: number
  duplicateCount: number
  savedTitles: string[]
  directiveUpdated: boolean
  directiveVersion: number | null
  readinessPercent: number
  flagged: boolean
  reply: string
}

export type ParsedCentralCommand =
  | { kind: 'directive'; instruction: string; mode: DirectiveMode }
  | { kind: 'report'; period: ReportPeriod }
  | { kind: 'notify_summary'; period: ReportPeriod }
  | { kind: 'notify_alert'; title: string; body: string }
  | { kind: 'train'; content: string }

const MAX_DIRECTIVE_CHARS = 2000
const MAX_ALERT_CHARS = 2000
const MAX_TRAINING_CHARS = 6000
const OWNER_ROLES = new Set<string>(['owner', 'admin'])

const REPLACE_DIRECTIVE_RE =
  /^\s*استبدال\s+(?:توجيهات|تعليمات)\s+الوكيل\s*[:：]\s*(.+)$/us
const APPEND_DIRECTIVE_RE =
  /^\s*(?:توجيه(?:\s+للوكيل|ات\s+الوكيل)?|تعليمات(?:\s+للوكيل|\s+الوكيل)?|أمر\s+للوكيل|امر\s+للوكيل|حدّ?ث\s+(?:توجيهات|تعليمات)\s+الوكيل|عدّ?ل\s+(?:توجيهات|تعليمات)\s+الوكيل)\s*[:：]\s*(.+)$/us
const REPORT_RE =
  /^\s*(?:تقرير|التقرير|ملخص|الملخص|تقرير\s+العمليات|تقرير\s+القطاع|إحصائيات|احصائيات)(?:\s+(اليوم|الأسبوع|الاسبوع|الشهر))?\s*$/u
const NOTIFY_SUMMARY_RE =
  /^\s*(?:أرسل|ارسل|إرسال|ارسال)\s+(?:لي\s+)?(?:الملخص|التقرير)(?:\s+التشغيلي)?(?:\s+(اليوم|الأسبوع|الاسبوع|الشهر))?\s*$/u
const NOTIFY_ALERT_RE =
  /^\s*(?:أرسل|ارسل|إرسال|ارسال)\s+تنبيه(?:\s+للمالك)?\s*[:：]\s*(.+)$/us
const TRAIN_RE =
  /^\s*(?:درّ?ب\s+الوكيل|تدريب\s+الوكيل|أضف\s+(?:للمعرفة|لقاعدة\s+المعرفة)|اضف\s+(?:للمعرفة|لقاعدة\s+المعرفة)|علّ?م\s+الوكيل|تحديث\s+المعرفة|معرفة\s+جديدة)\s*[:：]\s*(.+)$/us

const DIRECTIVE_LINE_RE =
  /^\s*(?:توجيه|تعليمات|قاعدة|أسلوب\s+الرد|اسلوب\s+الرد)\s*[:：]\s*(.+)$/u

function sanitizeDirectiveText(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .split('<<UNTRUSTED_DATA>>').join('')
    .split('<</UNTRUSTED_DATA>>').join('')
    .trim()
    .slice(0, MAX_DIRECTIVE_CHARS)
}

function periodFromArabicWord(word: string | undefined): ReportPeriod {
  if (!word) return '24h'
  if (word === 'اليوم') return 'today'
  if (word === 'الأسبوع' || word === 'الاسبوع') return '7d'
  if (word === 'الشهر') return '30d'
  return '24h'
}

export function parseCentralOperationalCommand(text: string): ParsedCentralCommand | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const replaceMatch = REPLACE_DIRECTIVE_RE.exec(trimmed)
  if (replaceMatch) {
    return { kind: 'directive', instruction: replaceMatch[1].trim(), mode: 'replace' }
  }

  const directiveMatch = APPEND_DIRECTIVE_RE.exec(trimmed)
  if (directiveMatch) {
    return { kind: 'directive', instruction: directiveMatch[1].trim(), mode: 'append' }
  }

  const notifyAlertMatch = NOTIFY_ALERT_RE.exec(trimmed)
  if (notifyAlertMatch) {
    const body = notifyAlertMatch[1].trim()
    return { kind: 'notify_alert', title: 'تنبيه تشغيلي', body }
  }

  const notifySummaryMatch = NOTIFY_SUMMARY_RE.exec(trimmed)
  if (notifySummaryMatch) {
    return { kind: 'notify_summary', period: periodFromArabicWord(notifySummaryMatch[1]) }
  }

  const reportMatch = REPORT_RE.exec(trimmed)
  if (reportMatch) {
    return { kind: 'report', period: periodFromArabicWord(reportMatch[1]) }
  }

  const trainMatch = TRAIN_RE.exec(trimmed)
  if (trainMatch) {
    return { kind: 'train', content: trainMatch[1].trim() }
  }

  return null
}

/** Ensures the caller belongs to `organizationId` with owner/admin privileges. */
export async function assertCentralBotOwner(db: DbClient, owner: CentralOwner): Promise<OwnerRole> {
  if (!owner.organizationId || !owner.userId) {
    throw new Error('owner_permission_required')
  }
  const { data, error } = await db
    .from('organization_members')
    .select('role')
    .eq('organization_id', owner.organizationId)
    .eq('user_id', owner.userId)
    .maybeSingle()

  if (error) throw new Error('owner_lookup_failed')
  const role = typeof data?.role === 'string' ? data.role : ''
  if (!OWNER_ROLES.has(role)) {
    throw new Error('owner_permission_required')
  }
  return role as OwnerRole
}

async function loadOrganizationVertical(
  db: DbClient,
  organizationId: string
): Promise<{ vertical: VerticalDefinition; organizationName: string }> {
  const [{ data: org, error: orgError }, { data: profile, error: profileError }] = await Promise.all([
    db.from('organizations').select('name, business_type').eq('id', organizationId).maybeSingle(),
    db.from('business_profiles').select('business_type_id').eq('organization_id', organizationId).maybeSingle(),
  ])
  if (orgError || profileError) {
    throw new Error('organization_context_unavailable')
  }
  const verticalId =
    (profile?.business_type_id as string | null | undefined) ??
    (org?.business_type as string | null | undefined) ??
    null
  return {
    vertical: getVertical(verticalId),
    organizationName: typeof org?.name === 'string' && org.name.trim() ? org.name.trim() : 'النشاط',
  }
}

async function resolvePrimaryAgent(db: DbClient, organizationId: string) {
  const { data, error } = await db
    .from('ai_agents')
    .select('id, slug, status, created_at')
    .eq('organization_id', organizationId)
    .neq('status', 'archived')
    .order('created_at', { ascending: true })
    .limit(20)
  if (error) throw new Error('agent_lookup_failed')
  const rows = (data ?? []) as Array<{ id: string; slug?: string | null; status?: string | null }>
  return (
    rows.find((row) => row.slug === 'frontdesk' && row.status === 'active') ??
    rows.find((row) => row.status === 'active') ??
    rows[0] ??
    null
  )
}

async function recordAuditSafe(
  db: DbClient,
  input: {
    organizationId: string
    userId: string
    action: string
    entityType: string
    entityId: string | null
    metadata: Record<string, unknown>
  }
) {
  try {
    await db.from('audit_events').insert({
      organization_id: input.organizationId,
      actor_type: 'user',
      actor_id: input.userId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      metadata: input.metadata,
    })
  } catch (error) {
    console.warn('central_bot_audit_failed', {
      action: input.action,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

/** Reads current agent directives for the owner's organization. */
export async function readAgentDirectives(db: DbClient, owner: CentralOwner) {
  await assertCentralBotOwner(db, owner)
  const [profileRes, agent] = await Promise.all([
    db.from('business_profiles').select('system_prompt_addition, updated_at').eq('organization_id', owner.organizationId).maybeSingle(),
    resolvePrimaryAgent(db, owner.organizationId),
  ])
  if (profileRes.error) throw new Error('directives_read_failed')

  let publishedVersion: number | null = null
  let publishedAddition: string | null = null
  if (agent) {
    const { data: versionRow, error: versionError } = await db
      .from('agent_prompt_versions')
      .select('version, system_prompt_addition, published_at')
      .eq('agent_id', agent.id)
      .eq('status', 'published')
      .maybeSingle()
    if (versionError) throw new Error('directives_read_failed')
    if (versionRow) {
      publishedVersion = Number(versionRow.version ?? 0) || null
      publishedAddition =
        typeof versionRow.system_prompt_addition === 'string' ? versionRow.system_prompt_addition : null
    }
  }

  const profileAddition =
    typeof profileRes.data?.system_prompt_addition === 'string' ? profileRes.data.system_prompt_addition : ''
  return {
    organizationId: owner.organizationId,
    agentId: agent?.id ?? null,
    version: publishedVersion,
    systemPromptAddition: publishedAddition ?? profileAddition,
  }
}

/**
 * Track 1: Execute owner commands and update business agent directives with a clear confirmation.
 */
export async function executeOwnerDirective(
  db: DbClient,
  owner: CentralOwner,
  input: { instruction: string; mode?: DirectiveMode },
  options: { now?: () => Date } = {}
): Promise<DirectiveUpdateResult> {
  await assertCentralBotOwner(db, owner)
  const directive = sanitizeDirectiveText(input.instruction)
  if (directive.length < 3) throw new Error('invalid_directive')

  const mode: DirectiveMode = input.mode === 'replace' ? 'replace' : 'append'
  const nowIso = (options.now ? options.now() : new Date()).toISOString()

  const [{ data: profile, error: profileError }, agent] = await Promise.all([
    db
      .from('business_profiles')
      .select('id, system_prompt_addition')
      .eq('organization_id', owner.organizationId)
      .maybeSingle(),
    resolvePrimaryAgent(db, owner.organizationId),
  ])
  if (profileError) throw new Error('directive_update_failed')

  let publishedAddition = ''
  if (agent) {
    const { data: currentPublished } = await db
      .from('agent_prompt_versions')
      .select('system_prompt_addition')
      .eq('agent_id', agent.id)
      .eq('status', 'published')
      .maybeSingle()
    if (typeof currentPublished?.system_prompt_addition === 'string') {
      publishedAddition = currentPublished.system_prompt_addition.trim()
    }
  }

  const currentBase =
    publishedAddition ||
    (typeof profile?.system_prompt_addition === 'string' ? profile.system_prompt_addition.trim() : '')

  let nextAddition: string
  if (mode === 'replace' || !currentBase) {
    nextAddition = directive
  } else {
    const existingLines = new Set(currentBase.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
    nextAddition = existingLines.has(directive) ? currentBase : `${currentBase}\n${directive}`
  }

  if (profile) {
    const { error: updateProfileError } = await db
      .from('business_profiles')
      .update({ system_prompt_addition: nextAddition, updated_at: nowIso })
      .eq('organization_id', owner.organizationId)
    if (updateProfileError) throw new Error('directive_update_failed')
  } else {
    const { error: insertProfileError } = await db
      .from('business_profiles')
      .insert({ organization_id: owner.organizationId, system_prompt_addition: nextAddition, updated_at: nowIso })
    if (insertProfileError) throw new Error('directive_update_failed')
  }

  let nextVersion: number | null = null
  if (agent) {
    const { data: existingVersions, error: versionsError } = await db
      .from('agent_prompt_versions')
      .select('version')
      .eq('agent_id', agent.id)
      .limit(200)
    if (versionsError) throw new Error('directive_update_failed')
    const maxVersion = ((existingVersions ?? []) as Array<{ version?: unknown }>).reduce(
      (max, row) => Math.max(max, Number(row.version ?? 0) || 0),
      0
    )
    nextVersion = maxVersion + 1

    const { error: archiveError } = await db
      .from('agent_prompt_versions')
      .update({ status: 'archived' })
      .eq('agent_id', agent.id)
      .eq('status', 'published')
    if (archiveError) throw new Error('directive_update_failed')

    const { error: publishError } = await db.from('agent_prompt_versions').insert({
      agent_id: agent.id,
      version: nextVersion,
      system_prompt_addition: nextAddition,
      status: 'published',
      created_by: owner.userId,
      published_at: nowIso,
    })
    if (publishError) throw new Error('directive_update_failed')

    await db
      .from('ai_agents')
      .update({ updated_at: nowIso })
      .eq('id', agent.id)
      .eq('organization_id', owner.organizationId)
  }

  await recordAuditSafe(db, {
    organizationId: owner.organizationId,
    userId: owner.userId,
    action: 'central_bot.directive_updated',
    entityType: agent ? 'ai_agent' : 'business_profile',
    entityId: agent?.id ?? owner.organizationId,
    metadata: { mode, version: nextVersion, length: directive.length },
  })

  const excerpt = directive.length > 160 ? `${directive.slice(0, 160)}…` : directive
  const versionLabel = nextVersion !== null ? ` (الإصدار ${nextVersion})` : ''
  const actionLabel = mode === 'replace' ? 'تم استبدال توجيهات الوكيل' : 'تم تحديث توجيهات الوكيل'
  const confirmationReply = `${actionLabel} بنجاح${versionLabel}:\n«${excerpt}»\nسيبدأ الوكيل بالالتزام بهذه التوجيهات في الردود الجديدة فوراً.`

  return {
    ok: true,
    organizationId: owner.organizationId,
    agentId: agent?.id ?? null,
    version: nextVersion,
    mode,
    directive,
    systemPromptAddition: nextAddition,
    confirmationReply,
  }
}

function periodWindowStart(now: Date, period: ReportPeriod): { since: Date; labelAr: string } {
  if (period === 'today') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
    return { since: start, labelAr: 'اليوم' }
  }
  if (period === '7d') {
    return { since: new Date(now.getTime() - 7 * 24 * 60 * 60_000), labelAr: 'آخر 7 أيام' }
  }
  if (period === '30d') {
    return { since: new Date(now.getTime() - 30 * 24 * 60 * 60_000), labelAr: 'آخر 30 يوماً' }
  }
  return { since: new Date(now.getTime() - 24 * 60 * 60_000), labelAr: 'آخر 24 ساعة' }
}

/**
 * Track 2: Generate an instant sector-aware operational report scoped strictly by `organization_id`.
 */
export async function generateSectorReport(
  db: DbClient,
  owner: CentralOwner,
  options: { period?: ReportPeriod; now?: () => Date } = {}
): Promise<SectorOperationalReport> {
  await assertCentralBotOwner(db, owner)
  const now = options.now ? options.now() : new Date()
  const period: ReportPeriod = options.period ?? '24h'
  const { since, labelAr } = periodWindowStart(now, period)
  const sinceIso = since.toISOString()

  const [{ vertical, organizationName }, convRes] = await Promise.all([
    loadOrganizationVertical(db, owner.organizationId),
    db
      .from('conversations')
      .select('id, status, created_at')
      .eq('organization_id', owner.organizationId)
      .gte('created_at', sinceIso)
      .limit(1000),
  ])
  if (convRes.error) throw new Error('report_generation_failed')

  const convRows = (convRes.data ?? []) as Array<{ id: string; status?: string | null }>
  const conversations = {
    total: convRows.length,
    active: convRows.filter((row) => row.status === 'active').length,
    handedOff: convRows.filter((row) => row.status === 'handed_off').length,
    closed: convRows.filter((row) => row.status === 'closed').length,
  }

  let sector: SectorReportMetrics
  let sectorLines: string[]

  if (vertical.baseEngine === 'booking_engine') {
    const { data, error } = await db
      .from('appointments')
      .select('id, status, created_at')
      .eq('organization_id', owner.organizationId)
      .gte('created_at', sinceIso)
      .limit(1000)
    if (error) throw new Error('report_generation_failed')
    const rows = (data ?? []) as Array<{ status?: string | null }>
    const confirmed = rows.filter((row) => row.status === 'confirmed').length
    const pending = rows.filter((row) => row.status === 'pending').length
    const completed = rows.filter((row) => row.status === 'completed').length
    const cancelled = rows.filter((row) => row.status === 'cancelled').length
    sector = {
      engine: 'booking_engine',
      appointmentsTotal: rows.length,
      appointmentsConfirmed: confirmed,
      appointmentsPending: pending,
      appointmentsCompleted: completed,
      appointmentsCancelled: cancelled,
    }
    sectorLines = [
      `• ${vertical.labels.appointments}: ${rows.length} (مؤكدة: ${confirmed}، قيد التأكيد: ${pending}، مكتملة: ${completed}، ملغاة: ${cancelled})`,
    ]
  } else if (vertical.baseEngine === 'commerce_engine') {
    const { data, error } = await db
      .from('orders')
      .select('id, status, total, currency, created_at')
      .eq('organization_id', owner.organizationId)
      .gte('created_at', sinceIso)
      .limit(1000)
    if (error) throw new Error('report_generation_failed')
    const rows = (data ?? []) as Array<{ status?: string | null; total?: unknown; currency?: string | null }>
    const active = rows.filter((row) => ['draft', 'confirmation', 'processing'].includes(String(row.status ?? ''))).length
    const completed = rows.filter((row) => row.status === 'completed').length
    const cancelled = rows.filter((row) => row.status === 'cancelled').length
    const revenueTotal = rows
      .filter((row) => row.status !== 'cancelled')
      .reduce((sum, row) => sum + (Number(row.total ?? 0) || 0), 0)
    const currency = rows.find((row) => typeof row.currency === 'string' && row.currency)?.currency ?? 'SAR'
    sector = {
      engine: 'commerce_engine',
      ordersTotal: rows.length,
      ordersActive: active,
      ordersCompleted: completed,
      ordersCancelled: cancelled,
      revenueTotal,
      currency,
    }
    sectorLines = [
      `• ${vertical.labels.orders}: ${rows.length} (قيد التنفيذ: ${active}، مكتملة: ${completed}، ملغاة: ${cancelled})`,
      `• إجمالي قيمة الطلبات: ${revenueTotal} ${currency}`,
    ]
  } else if (vertical.baseEngine === 'event_engine') {
    const [apptRes, quoteRes] = await Promise.all([
      db
        .from('appointments')
        .select('id, status, created_at')
        .eq('organization_id', owner.organizationId)
        .gte('created_at', sinceIso)
        .limit(1000),
      db
        .from('quotes')
        .select('id, status, created_at')
        .eq('organization_id', owner.organizationId)
        .gte('created_at', sinceIso)
        .limit(1000),
    ])
    if (apptRes.error || quoteRes.error) throw new Error('report_generation_failed')
    const appts = (apptRes.data ?? []) as Array<{ status?: string | null }>
    const quotes = (quoteRes.data ?? []) as Array<{ status?: string | null }>
    const confirmed = appts.filter((row) => row.status === 'confirmed').length
    const accepted = quotes.filter((row) => row.status === 'accepted').length
    sector = {
      engine: 'event_engine',
      appointmentsTotal: appts.length,
      appointmentsConfirmed: confirmed,
      quotesTotal: quotes.length,
      quotesAccepted: accepted,
    }
    sectorLines = [
      `• ${vertical.labels.appointments}: ${appts.length} (مؤكدة: ${confirmed})`,
      `• ${vertical.labels.quotes}: ${quotes.length} (مقبولة: ${accepted})`,
    ]
  } else {
    const [leadRes, quoteRes] = await Promise.all([
      db
        .from('leads')
        .select('id, status, created_at')
        .eq('organization_id', owner.organizationId)
        .gte('created_at', sinceIso)
        .limit(1000),
      db
        .from('quotes')
        .select('id, status, created_at')
        .eq('organization_id', owner.organizationId)
        .gte('created_at', sinceIso)
        .limit(1000),
    ])
    if (leadRes.error || quoteRes.error) throw new Error('report_generation_failed')
    const leads = (leadRes.data ?? []) as Array<{ status?: string | null }>
    const quotes = (quoteRes.data ?? []) as Array<{ status?: string | null }>
    const open = leads.filter((row) =>
      ['new', 'qualified', 'contacted', 'booked', 'waiting', 'recovered'].includes(String(row.status ?? ''))
    ).length
    const won = leads.filter((row) => row.status === 'won').length
    const accepted = quotes.filter((row) => row.status === 'accepted').length
    sector = {
      engine: 'lead_engine',
      leadsTotal: leads.length,
      leadsOpen: open,
      leadsWon: won,
      quotesTotal: quotes.length,
      quotesAccepted: accepted,
    }
    sectorLines = [
      `• ${vertical.labels.leads}: ${leads.length} (مفتوحة: ${open}، محوّلة: ${won})`,
      `• ${vertical.labels.quotes}: ${quotes.length} (مقبولة: ${accepted})`,
    ]
  }

  const summaryText = [
    `*ملخص العمليات الفوري — ${organizationName}*`,
    `القطاع: ${vertical.nameAr} | الفترة: ${labelAr}`,
    `• المحادثات: ${conversations.total} (نشطة: ${conversations.active}، محوّلة لموظف: ${conversations.handedOff}، مغلقة: ${conversations.closed})`,
    ...sectorLines,
  ].join('\n')

  return {
    organizationId: owner.organizationId,
    organizationName,
    verticalId: vertical.id,
    verticalNameAr: vertical.nameAr,
    baseEngine: vertical.baseEngine,
    period,
    sinceIso,
    generatedAtIso: now.toISOString(),
    conversations,
    sector,
    summaryText,
  }
}

/**
 * Track 3: Send alerts and operational summaries to the organization owner(s) via the central bot.
 */
export async function sendCentralOwnerCommunication(
  db: DbClient,
  input: {
    organizationId: string
    targetUserId?: string | null
    kind: OwnerCommunicationKind
    title?: string
    body: string
    dedupeKey?: string | null
    createInAppNotification?: boolean
    entityType?: string
    entityId?: string
  },
  deps: { sendText?: (to: string, text: string) => Promise<void> } = {}
): Promise<OwnerCommunicationResult> {
  const cleanBody = sanitizeDirectiveText(input.body).slice(0, MAX_ALERT_CHARS)
  if (!cleanBody) throw new Error('empty_notification_body')

  const cleanTitle = input.title ? sanitizeDirectiveText(input.title).slice(0, 120) : ''
  const messageText = cleanTitle ? `*${cleanTitle}*\n${cleanBody}` : cleanBody

  if (input.dedupeKey && (await threadHasExternalMessage(db, input.dedupeKey))) {
    return {
      ok: true,
      organizationId: input.organizationId,
      kind: input.kind,
      deliveredCount: 0,
      threadRecordedCount: 0,
      skippedDuplicate: true,
      recipients: [],
      messageText,
    }
  }

  let ownerUserIds: string[] = []
  if (input.targetUserId) {
    await assertCentralBotOwner(db, { organizationId: input.organizationId, userId: input.targetUserId })
    ownerUserIds = [input.targetUserId]
  } else {
    const { data: members, error: membersError } = await db
      .from('organization_members')
      .select('user_id, role, created_at')
      .eq('organization_id', input.organizationId)
      .in('role', ['owner', 'admin'])
      .order('created_at', { ascending: true })
      .limit(20)
    if (membersError) throw new Error('owner_lookup_failed')
    const sorted = ((members ?? []) as Array<{ user_id: string; role: string }>).sort(
      (a, b) => Number(b.role === 'owner') - Number(a.role === 'owner')
    )
    ownerUserIds = sorted.map((row) => String(row.user_id))
  }

  if (!ownerUserIds.length) {
    throw new Error('owner_permission_required')
  }

  const { data: links, error: linksError } = await db
    .from('personal_assistant_links')
    .select('user_id, whatsapp_phone, verified_at')
    .eq('org_id', input.organizationId)
    .in('user_id', ownerUserIds)
    .limit(20)
  if (linksError) throw new Error('owner_link_lookup_failed')

  const verifiedLinks = ((links ?? []) as Array<{ user_id: string; whatsapp_phone?: string | null; verified_at?: string | null }>)
    .filter((row) => Boolean(row.verified_at && row.whatsapp_phone))

  const config = getCentralBotConfig()
  const sender = deps.sendText ?? (config ? (to: string, text: string) => sendCentralText(config, to, text) : null)

  const targetOwners = verifiedLinks.length
    ? verifiedLinks.map((row) => ({ userId: String(row.user_id), phone: String(row.whatsapp_phone) }))
    : [{ userId: ownerUserIds[0], phone: null as string | null }]

  const recipients: OwnerCommunicationResult['recipients'] = []
  let deliveredCount = 0
  let threadRecordedCount = 0

  for (const [index, target] of targetOwners.entries()) {
    const externalId = input.dedupeKey ? (index === 0 ? input.dedupeKey : `${input.dedupeKey}:${target.userId}`) : null
    const appended = await appendThreadMessage(db, { organizationId: input.organizationId, userId: target.userId }, {
      direction: 'outbound',
      source: 'system',
      type: 'text',
      content: messageText,
      externalMessageId: externalId,
    })
    const threadRecorded = !('duplicate' in appended)
    if (threadRecorded) threadRecordedCount += 1

    let whatsappSent = false
    if (target.phone && sender && threadRecorded) {
      try {
        await sender(target.phone, messageText)
        whatsappSent = true
        deliveredCount += 1
      } catch (error) {
        console.error('central_owner_communication_send_failed', {
          organizationId: input.organizationId,
          reason: error instanceof Error ? error.message : 'unknown',
        })
      }
    }

    recipients.push({ userId: target.userId, whatsappSent, threadRecorded })
  }

  if (input.createInAppNotification) {
    await createNotification(db, {
      organizationId: input.organizationId,
      entityType: input.entityType ?? 'organization',
      entityId: input.entityId ?? input.organizationId,
      notificationType: input.kind === 'alert' ? 'high_priority' : 'workflow',
      title: cleanTitle || (input.kind === 'alert' ? 'تنبيه تشغيلي' : 'ملخص تشغيلي'),
      body: cleanBody.slice(0, 500),
      idempotencyKey: input.dedupeKey ?? null,
    }).catch((error) => {
      console.error('central_owner_in_app_notification_failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      })
    })
  }

  await recordAuditSafe(db, {
    organizationId: input.organizationId,
    userId: targetOwners[0].userId,
    action: input.kind === 'alert' ? 'central_bot.owner_alert_sent' : 'central_bot.owner_summary_sent',
    entityType: 'organization',
    entityId: input.organizationId,
    metadata: { deliveredCount, threadRecordedCount, kind: input.kind },
  })

  return {
    ok: true,
    organizationId: input.organizationId,
    kind: input.kind,
    deliveredCount,
    threadRecordedCount,
    skippedDuplicate: false,
    recipients,
    messageText,
  }
}

/** Convenience wrapper that generates the sector report and sends it to the owner via central bot. */
export async function sendOperationalSummaryToOwner(
  db: DbClient,
  owner: CentralOwner,
  options: { period?: ReportPeriod; now?: () => Date; dedupeKey?: string | null; targetAllOwners?: boolean } = {},
  deps: { sendText?: (to: string, text: string) => Promise<void> } = {}
) {
  const report = await generateSectorReport(db, owner, { period: options.period, now: options.now })
  const communication = await sendCentralOwnerCommunication(
    db,
    {
      organizationId: owner.organizationId,
      targetUserId: options.targetAllOwners ? null : owner.userId,
      kind: 'operational_summary',
      body: report.summaryText,
      dedupeKey: options.dedupeKey ?? null,
      createInAppNotification: false,
    },
    deps
  )
  return { report, communication }
}

/**
 * Track 4: Add new knowledge and optional directives directly to the agent knowledge base from bot chat.
 */
export async function trainAgentFromBotConversation(
  db: DbClient,
  owner: CentralOwner,
  input: {
    text: string
    title?: string | null
    category?: ValidatedFact['category'] | null
    directive?: string | null
    channel?: 'whatsapp_central' | 'web'
  },
  deps: { generate?: GenerateFn; now?: () => Date } = {}
): Promise<DirectTrainingResult> {
  await assertCentralBotOwner(db, owner)
  const rawText = String(input.text ?? '').replace(/\u0000/g, '').trim().slice(0, MAX_TRAINING_CHARS)
  const explicitDirective = input.directive ? sanitizeDirectiveText(input.directive) : ''
  if (!rawText && !explicitDirective) throw new Error('empty_training_input')

  const { vertical } = await loadOrganizationVertical(db, owner.organizationId)
  const target: 'knowledge' | 'memory' = vertical.id === 'personal_assistant' ? 'memory' : 'knowledge'

  // Split out inline directive lines ("توجيه: ...", "تعليمات: ...", "قاعدة: ...") so they update instructions cleanly.
  const knowledgeLines: string[] = []
  const inlineDirectives: string[] = []
  for (const line of rawText.split(/\r?\n/)) {
    const match = DIRECTIVE_LINE_RE.exec(line)
    if (match) {
      const cleanedDir = sanitizeDirectiveText(match[1])
      if (cleanedDir.length >= 3) inlineDirectives.push(cleanedDir)
    } else if (line.trim()) {
      knowledgeLines.push(line)
    }
  }

  const combinedDirective = [explicitDirective, ...inlineDirectives].filter(Boolean).join('\n').trim()
  let directiveUpdated = false
  let directiveVersion: number | null = null
  if (combinedDirective) {
    const directiveRes = await executeOwnerDirective(
      db,
      owner,
      { instruction: combinedDirective, mode: 'append' },
      { now: deps.now }
    )
    directiveUpdated = true
    directiveVersion = directiveRes.version
  }

  const knowledgeText = knowledgeLines.join('\n').trim()
  let insertedCount = 0
  let duplicateCount = 0
  const savedTitles: string[] = []
  let flagged = false

  if (knowledgeText) {
    const pre = stripInjection(knowledgeText)
    flagged = pre.flagged
    if (!pre.text && !directiveUpdated) {
      throw new Error('unsafe_training_input')
    }
    if (pre.text) {
      const draft = await extractTrainingDraft(
        { kind: 'text', text: pre.text },
        { verticalId: vertical.id, target },
        { generate: deps.generate }
      )
      flagged = flagged || draft.flagged

      if (target === 'memory') {
        for (const entry of draft.items) {
          const text = itemToText(entry).slice(0, 500)
          if (!text) continue
          await savePersonalMemory(db, owner, {
            category: ['fact', 'preference', 'contact', 'project', 'document'].includes(entry.category)
              ? entry.category
              : 'fact',
            content: text,
          })
          insertedCount += 1
          savedTitles.push(entry.title)
        }
      } else {
        const candidates: ValidatedFact[] = draft.items
          .map((entry) => {
            const content = itemToText(entry).trim()
            const title = (input.title?.trim() || entry.title || content.slice(0, 60)).slice(0, 200)
            const category =
              input.category && ['business_info', 'service_info', 'pricing', 'policy', 'faq', 'general'].includes(input.category)
                ? input.category
                : (['business_info', 'service_info', 'pricing', 'policy', 'faq', 'general'].includes(entry.category)
                    ? (entry.category as ValidatedFact['category'])
                    : 'general')
            return { title, category, content, confidence: 'confirmed' as const }
          })
          .filter((fact) => fact.content.length >= 5)

        if (!candidates.length && pre.text.length < 5 && !directiveUpdated) {
          throw new Error('training_content_too_short')
        }
        const saved = await saveValidatedKnowledge(db, owner.organizationId, candidates)
        for (const item of saved) {
          if (item.action === 'inserted') {
            insertedCount += 1
            savedTitles.push(item.title)
          } else {
            duplicateCount += 1
          }
        }
      }
    }
  }

  const readiness = await loadReadiness(db, owner, vertical.id)

  await recordAuditSafe(db, {
    organizationId: owner.organizationId,
    userId: owner.userId,
    action: 'central_bot.training_saved',
    entityType: target === 'memory' ? 'user_memories' : 'knowledge_base',
    entityId: owner.organizationId,
    metadata: {
      channel: input.channel ?? 'whatsapp_central',
      insertedCount,
      duplicateCount,
      directiveUpdated,
      directiveVersion,
    },
  })

  const parts: string[] = []
  if (insertedCount > 0) {
    parts.push(`تمت إضافة ${insertedCount} معلومة جديدة إلى ${target === 'memory' ? 'ذاكرتك الشخصية' : 'قاعدة معرفة الوكيل'}:`)
    for (const title of savedTitles.slice(0, 5)) parts.push(`• ${title}`)
  } else if (duplicateCount > 0 && !directiveUpdated) {
    parts.push('المعلومة المذكورة محفوظة مسبقاً في قاعدة المعرفة.')
  }
  if (directiveUpdated) {
    parts.push(`تم تحديث توجيهات الوكيل${directiveVersion !== null ? ` (الإصدار ${directiveVersion})` : ''}.`)
  }
  if (flagged) {
    parts.push('تنبيه: تم تجاهل أوامر مشبوهة داخل النص المدخل.')
  }
  parts.push(`جاهزية المعرفة الحالية: ${readiness.percent}٪.`)

  return {
    ok: true,
    organizationId: owner.organizationId,
    target,
    insertedCount,
    duplicateCount,
    savedTitles,
    directiveUpdated,
    directiveVersion,
    readinessPercent: readiness.percent,
    flagged,
    reply: parts.join('\n'),
  }
}

/**
 * Shared command dispatcher used by both the WhatsApp central bot and Web assistant chat.
 * Returns null if the text is a regular conversational message rather than a direct command.
 */
export async function tryHandleCentralOperationalCommand(
  db: DbClient,
  owner: CentralOwner,
  text: string,
  deps: {
    sendText?: (to: string, text: string) => Promise<void>
    generate?: GenerateFn
    now?: () => Date
    channel?: 'whatsapp_central' | 'web'
  } = {}
): Promise<{ status: string; reply: string } | null> {
  const command = parseCentralOperationalCommand(text)
  if (!command) return null

  try {
    if (command.kind === 'directive') {
      const result = await executeOwnerDirective(
        db,
        owner,
        { instruction: command.instruction, mode: command.mode },
        { now: deps.now }
      )
      return { status: 'directive_updated', reply: result.confirmationReply }
    }

    if (command.kind === 'report') {
      const report = await generateSectorReport(db, owner, { period: command.period, now: deps.now })
      return { status: 'report_sent', reply: report.summaryText }
    }

    if (command.kind === 'notify_summary') {
      const { report, communication } = await sendOperationalSummaryToOwner(
        db,
        owner,
        { period: command.period, now: deps.now },
        { sendText: deps.sendText }
      )
      const deliveredNote =
        communication.deliveredCount > 0
          ? 'تم إرسال الملخص التشغيلي إلى واتساب المالك وتسجيله في المحادثة.'
          : 'تم توليد الملخص التشغيلي وحفظه في سجل البوت المركزي.'
      return { status: 'summary_sent', reply: `${deliveredNote}\n\n${report.summaryText}` }
    }

    if (command.kind === 'notify_alert') {
      const comm = await sendCentralOwnerCommunication(
        db,
        {
          organizationId: owner.organizationId,
          targetUserId: owner.userId,
          kind: 'alert',
          title: command.title,
          body: command.body,
          createInAppNotification: true,
        },
        { sendText: deps.sendText }
      )
      return {
        status: 'alert_sent',
        reply:
          comm.deliveredCount > 0
            ? 'تم إرسال التنبيه إلى واتساب المالك وتسجيله في الإشعارات.'
            : 'تم تسجيل التنبيه في الإشعارات وسجل البوت المركزي.',
      }
    }

    const trained = await trainAgentFromBotConversation(
      db,
      owner,
      { text: command.content, channel: deps.channel ?? 'whatsapp_central' },
      { generate: deps.generate, now: deps.now }
    )
    return { status: 'knowledge_trained', reply: trained.reply }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'operation_failed'
    if (code === 'owner_permission_required') {
      return { status: 'forbidden', reply: 'هذا الأمر متاح لمالك النشاط أو المدير فقط.' }
    }
    if (code === 'invalid_directive') {
      return { status: 'invalid_directive', reply: 'أرسل نص التوجيه المطلوب للوكيل بشكل واضح (3 أحرف على الأقل).' }
    }
    if (code === 'empty_training_input' || code === 'training_content_too_short' || code === 'unsafe_training_input') {
      return { status: 'invalid_training', reply: 'أرسل معلومة واضحة لا تقل عن 5 أحرف لإضافتها لقاعدة معرفة الوكيل.' }
    }
    if (code === 'empty_notification_body') {
      return { status: 'invalid_notification', reply: 'أرسل نص التنبيه المطلوب بعد النقطتين.' }
    }
    throw error
  }
}
