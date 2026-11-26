import { NextResponse } from 'next/server'
import { requireOwnerAssistantApi, type OwnerAssistantApiContext } from '@/lib/personal-assistant/api-context'
import type { AccessDeps } from '@/lib/personal-assistant/api-context'
import { mirrorToWhatsApp } from './deps'
import {
  executeOwnerDirective,
  generateSectorReport,
  readAgentDirectives,
  sendCentralOwnerCommunication,
  sendOperationalSummaryToOwner,
  trainAgentFromBotConversation,
  type DirectiveMode,
  type ReportPeriod,
} from './operations'
import type { ValidatedFact } from '@/lib/knowledge/layer'
import { loadReadiness, loadVerticalId } from '@/lib/trainer/router'
import type { GenerateFn } from '@/lib/trainer/extract'
import { runLiveWebSearch, type LiveSearchDeps } from '@/lib/personal-assistant/live-search'
import { loadPersonalPersona, savePersonalPersona } from '@/lib/personal-assistant/persona'
import {
  createBackgroundExportTask,
  getExportTaskResult,
  isExportFormat,
  isExportSource,
  listExportTasks,
  runBackgroundExportTask,
  type ExportFormat,
  type ExportSource,
} from '@/lib/personal-assistant/exports'
import { requirePersonalAssistantApi } from '@/lib/personal-assistant/api-context'
import { trainAgentFromWebsiteUrl, type WebsiteFetchDeps } from '@/lib/trainer/url-ingest'

const NO_STORE = { 'Cache-Control': 'no-store' }
const VALID_PERIODS = new Set<ReportPeriod>(['today', '24h', '7d', '30d'])
const VALID_CATEGORIES = new Set<ValidatedFact['category']>([
  'business_info',
  'service_info',
  'pricing',
  'policy',
  'faq',
  'general',
])

const BAD_REQUEST_CODES = new Set([
  'invalid_directive',
  'empty_notification_body',
  'empty_training_input',
  'training_content_too_short',
  'unsafe_training_input',
  'invalid_website_url',
  'unsupported_url_protocol',
  'url_credentials_forbidden',
  'ssrf_blocked_hostname',
  'ssrf_blocked_host',
  'ssrf_blocked_port',
  'ssrf_blocked_ip',
  'ssrf_blocked_dns',
  'ssrf_blocked_redirect',
  'website_dns_failed',
  'website_too_many_redirects',
  'website_unsupported_content_type',
  'unsupported_website_content_type',
  'website_response_too_large',
  'website_content_too_large',
  'website_content_empty',
  'invalid_export_source',
  'invalid_export_format',
  'empty_custom_export_text',
  'invalid_persona_tone',
  'invalid_persona_dialect',
  'invalid_owner',
])

export type AssistantOperationalDeps = {
  accessOverrides?: Partial<AccessDeps>
  sendText?: (to: string, text: string) => Promise<void>
  mirror?: (db: OwnerAssistantApiContext['admin'], owner: OwnerAssistantApiContext['owner'], text: string) => Promise<boolean>
  generate?: GenerateFn
  now?: () => Date
  searchDeps?: LiveSearchDeps
  fetchDeps?: WebsiteFetchDeps
  scheduleBackground?: (work: () => Promise<void>) => void
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function resolveErrorStatus(code: string): number {
  if (code === 'owner_permission_required' || code === 'export_access_forbidden') return 403
  if (code === 'export_task_not_found') return 404
  if (code === 'website_fetch_timeout') return 504
  if (code === 'website_http_error' || code === 'website_fetch_failed') return 502
  if (BAD_REQUEST_CODES.has(code)) return 400
  return 500
}

function errorJson(error: unknown, fallbackCode: string) {
  const code = error instanceof Error ? error.message : fallbackCode
  const status = resolveErrorStatus(code)
  return NextResponse.json({ error: status === 500 ? fallbackCode : code }, { status, headers: NO_STORE })
}

export async function handleAssistantDirectivesGet(deps: AssistantOperationalDeps = {}) {
  const access = await requireOwnerAssistantApi(deps.accessOverrides)
  if (access instanceof NextResponse) return access
  try {
    const data = await readAgentDirectives(access.admin, access.owner)
    return NextResponse.json(data, { headers: NO_STORE })
  } catch (error) {
    return errorJson(error, 'directives_read_failed')
  }
}

export async function handleAssistantDirectivesPost(request: Request, deps: AssistantOperationalDeps = {}) {
  const access = await requireOwnerAssistantApi(deps.accessOverrides)
  if (access instanceof NextResponse) return access
  const body = parseJsonObject(await request.json().catch(() => null))
  if (!body) return NextResponse.json({ error: 'invalid_request_body' }, { status: 400, headers: NO_STORE })

  const instruction = typeof body.instruction === 'string' ? body.instruction : ''
  const mode: DirectiveMode = body.mode === 'replace' ? 'replace' : 'append'

  try {
    const result = await executeOwnerDirective(access.admin, access.owner, { instruction, mode }, { now: deps.now })
    const mirrored = deps.mirror
      ? await deps.mirror(access.admin, access.owner, result.confirmationReply)
      : await mirrorToWhatsApp(access.admin, access.owner, result.confirmationReply)
    return NextResponse.json({ ...result, mirrored }, { headers: NO_STORE })
  } catch (error) {
    return errorJson(error, 'directive_update_failed')
  }
}

export async function handleAssistantReportsGet(request: Request, deps: AssistantOperationalDeps = {}) {
  const access = await requireOwnerAssistantApi(deps.accessOverrides)
  if (access instanceof NextResponse) return access
  const periodParam = new URL(request.url).searchParams.get('period') as ReportPeriod | null
  if (periodParam && !VALID_PERIODS.has(periodParam)) {
    return NextResponse.json({ error: 'invalid_period' }, { status: 400, headers: NO_STORE })
  }
  try {
    const report = await generateSectorReport(access.admin, access.owner, {
      period: periodParam ?? '24h',
      now: deps.now,
    })
    return NextResponse.json(report, { headers: NO_STORE })
  } catch (error) {
    return errorJson(error, 'report_generation_failed')
  }
}

export async function handleAssistantReportsPost(request: Request, deps: AssistantOperationalDeps = {}) {
  const access = await requireOwnerAssistantApi(deps.accessOverrides)
  if (access instanceof NextResponse) return access
  const body = parseJsonObject(await request.json().catch(() => null))
  if (!body) return NextResponse.json({ error: 'invalid_request_body' }, { status: 400, headers: NO_STORE })

  const period = typeof body.period === 'string' ? (body.period as ReportPeriod) : '24h'
  if (!VALID_PERIODS.has(period)) {
    return NextResponse.json({ error: 'invalid_period' }, { status: 400, headers: NO_STORE })
  }
  try {
    const report = await generateSectorReport(access.admin, access.owner, { period, now: deps.now })
    if (body.sendToOwner === true) {
      const { communication } = await sendOperationalSummaryToOwner(
        access.admin,
        access.owner,
        { period, now: deps.now },
        { sendText: deps.sendText }
      )
      return NextResponse.json({ report, communication }, { headers: NO_STORE })
    }
    return NextResponse.json({ report }, { headers: NO_STORE })
  } catch (error) {
    return errorJson(error, 'report_generation_failed')
  }
}

export async function handleAssistantNotifyGet(deps: AssistantOperationalDeps = {}) {
  const access = await requireOwnerAssistantApi(deps.accessOverrides)
  if (access instanceof NextResponse) return access
  const { data, error } = await access.admin
    .from('personal_assistant_messages')
    .select('id, content, source, message_type, created_at')
    .eq('org_id', access.owner.organizationId)
    .eq('user_id', access.owner.userId)
    .eq('source', 'system')
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) return NextResponse.json({ error: 'notifications_list_failed' }, { status: 500, headers: NO_STORE })
  return NextResponse.json({ messages: data ?? [] }, { headers: NO_STORE })
}

export async function handleAssistantNotifyPost(request: Request, deps: AssistantOperationalDeps = {}) {
  const access = await requireOwnerAssistantApi(deps.accessOverrides)
  if (access instanceof NextResponse) return access
  const body = parseJsonObject(await request.json().catch(() => null))
  if (!body) return NextResponse.json({ error: 'invalid_request_body' }, { status: 400, headers: NO_STORE })

  const kind = body.kind === 'operational_summary' ? 'operational_summary' : body.kind === 'alert' ? 'alert' : null
  if (!kind) return NextResponse.json({ error: 'invalid_notification_kind' }, { status: 400, headers: NO_STORE })

  try {
    if (kind === 'operational_summary') {
      const period = typeof body.period === 'string' ? (body.period as ReportPeriod) : '24h'
      if (!VALID_PERIODS.has(period)) {
        return NextResponse.json({ error: 'invalid_period' }, { status: 400, headers: NO_STORE })
      }
      const result = await sendOperationalSummaryToOwner(
        access.admin,
        access.owner,
        {
          period,
          now: deps.now,
          dedupeKey: typeof body.dedupeKey === 'string' ? body.dedupeKey : null,
          targetAllOwners: body.targetAllOwners === true,
        },
        { sendText: deps.sendText }
      )
      return NextResponse.json(result, { headers: NO_STORE })
    }

    const message = typeof body.body === 'string' ? body.body : typeof body.message === 'string' ? body.message : ''
    const title = typeof body.title === 'string' ? body.title : undefined
    const result = await sendCentralOwnerCommunication(
      access.admin,
      {
        organizationId: access.owner.organizationId,
        targetUserId: body.targetAllOwners === true ? null : access.owner.userId,
        kind: 'alert',
        title,
        body: message,
        dedupeKey: typeof body.dedupeKey === 'string' ? body.dedupeKey : null,
        createInAppNotification: body.createInAppNotification !== false,
      },
      { sendText: deps.sendText }
    )
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (error) {
    return errorJson(error, 'owner_notify_failed')
  }
}

export async function handleAssistantTrainingGet(deps: AssistantOperationalDeps = {}) {
  const access = await requireOwnerAssistantApi(deps.accessOverrides)
  if (access instanceof NextResponse) return access
  try {
    const verticalId = await loadVerticalId(access.admin, access.owner.organizationId)
    const [readiness, kbRes] = await Promise.all([
      loadReadiness(access.admin, access.owner, verticalId),
      access.admin
        .from('knowledge_base')
        .select('id, title, category, content, source_type, updated_at')
        .eq('organization_id', access.owner.organizationId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(30),
    ])
    if (kbRes.error) return NextResponse.json({ error: 'training_list_failed' }, { status: 500, headers: NO_STORE })
    return NextResponse.json(
      {
        readinessPercent: readiness.percent,
        nextQuestion: readiness.next?.question ?? null,
        items: kbRes.data ?? [],
      },
      { headers: NO_STORE }
    )
  } catch (error) {
    return errorJson(error, 'training_list_failed')
  }
}

export async function handleAssistantTrainingPost(request: Request, deps: AssistantOperationalDeps = {}) {
  const access = await requireOwnerAssistantApi(deps.accessOverrides)
  if (access instanceof NextResponse) return access
  const body = parseJsonObject(await request.json().catch(() => null))
  if (!body) return NextResponse.json({ error: 'invalid_request_body' }, { status: 400, headers: NO_STORE })

  const websiteUrl = typeof body.url === 'string' ? body.url.trim() : ''
  const text = typeof body.text === 'string' ? body.text : ''
  const title = typeof body.title === 'string' ? body.title : null
  const directive = typeof body.directive === 'string' ? body.directive : null
  const category =
    typeof body.category === 'string' && VALID_CATEGORIES.has(body.category as ValidatedFact['category'])
      ? (body.category as ValidatedFact['category'])
      : null

  try {
    if (websiteUrl) {
      const result = await trainAgentFromWebsiteUrl(
        access.admin,
        access.owner,
        { url: websiteUrl, category },
        { ...deps.fetchDeps, generate: deps.generate, now: deps.now }
      )
      const mirrored = deps.mirror
        ? await deps.mirror(access.admin, access.owner, result.reply)
        : await mirrorToWhatsApp(access.admin, access.owner, result.reply)
      return NextResponse.json({ ...result, mirrored }, { status: 201, headers: NO_STORE })
    }

    const result = await trainAgentFromBotConversation(
      access.admin,
      access.owner,
      { text, title, category, directive, channel: 'web' },
      { generate: deps.generate, now: deps.now }
    )
    const mirrored = deps.mirror
      ? await deps.mirror(access.admin, access.owner, result.reply)
      : await mirrorToWhatsApp(access.admin, access.owner, result.reply)
    return NextResponse.json({ ...result, mirrored }, { status: 201, headers: NO_STORE })
  } catch (error) {
    return errorJson(error, 'training_save_failed')
  }
}

export async function handleAssistantPersonaGet(deps: AssistantOperationalDeps = {}) {
  const access = await requirePersonalAssistantApi(deps.accessOverrides)
  if (access instanceof NextResponse) return access
  try {
    const persona = await loadPersonalPersona(access.admin, access.owner)
    return NextResponse.json({ persona }, { headers: NO_STORE })
  } catch (error) {
    return errorJson(error, 'persona_load_failed')
  }
}

export async function handleAssistantPersonaPost(request: Request, deps: AssistantOperationalDeps = {}) {
  const access = await requirePersonalAssistantApi(deps.accessOverrides)
  if (access instanceof NextResponse) return access
  const body = parseJsonObject(await request.json().catch(() => null))
  if (!body) return NextResponse.json({ error: 'invalid_request_body' }, { status: 400, headers: NO_STORE })

  try {
    const persona = await savePersonalPersona(
      access.admin,
      access.owner,
      {
        tone: body.tone,
        dialect: body.dialect,
        preferredTitle: body.preferredTitle,
        customStyle: body.customStyle,
      },
      { now: deps.now }
    )
    return NextResponse.json({ ok: true, persona }, { headers: NO_STORE })
  } catch (error) {
    return errorJson(error, 'persona_save_failed')
  }
}

export async function handleAssistantSearchPost(request: Request, deps: AssistantOperationalDeps = {}) {
  const access = await requirePersonalAssistantApi(deps.accessOverrides)
  if (access instanceof NextResponse) return access
  const body = parseJsonObject(await request.json().catch(() => null))
  if (!body) return NextResponse.json({ error: 'invalid_request_body' }, { status: 400, headers: NO_STORE })

  const query = typeof body.query === 'string' ? body.query : ''
  const result = await runLiveWebSearch(query, deps.searchDeps)
  if (!result.ok) {
    const status = result.code === 'invalid_query' ? 400 : result.code === 'search_timeout' ? 504 : 502
    return NextResponse.json({ error: result.code, messageAr: result.messageAr }, { status, headers: NO_STORE })
  }
  return NextResponse.json(
    {
      ok: true,
      query: result.query,
      summary: result.summary,
      results: result.results,
      flagged: result.flagged,
      source: result.source,
    },
    { headers: NO_STORE }
  )
}

export async function handleAssistantExportsGet(request: Request, deps: AssistantOperationalDeps = {}) {
  const access = await requirePersonalAssistantApi(deps.accessOverrides)
  if (access instanceof NextResponse) return access
  const owner = access.owner
  const url = new URL(request.url)
  const taskId = url.searchParams.get('taskId')
  const download = url.searchParams.get('download') === '1'

  try {
    if (taskId) {
      const task = await getExportTaskResult(access.admin, owner, taskId)
      if (!task) return NextResponse.json({ error: 'export_task_not_found' }, { status: 404, headers: NO_STORE })
      if (download) {
        if (task.state !== 'done' || !task.file) {
          return NextResponse.json({ error: 'export_not_ready', state: task.state }, { status: 409, headers: NO_STORE })
        }
        return new NextResponse(task.file.content, {
          status: 200,
          headers: {
            ...NO_STORE,
            'Content-Type': task.file.mimeType,
            'Content-Disposition': `attachment; filename="${task.file.fileName}"`,
            'X-Content-Type-Options': 'nosniff',
          },
        })
      }
      return NextResponse.json({ task }, { headers: NO_STORE })
    }

    const tasks = await listExportTasks(access.admin, owner)
    return NextResponse.json({ tasks }, { headers: NO_STORE })
  } catch (error) {
    return errorJson(error, 'export_read_failed')
  }
}

export async function handleAssistantExportsPost(request: Request, deps: AssistantOperationalDeps = {}) {
  const access = await requirePersonalAssistantApi(deps.accessOverrides)
  if (access instanceof NextResponse) return access
  const body = parseJsonObject(await request.json().catch(() => null))
  if (!body) return NextResponse.json({ error: 'invalid_request_body' }, { status: 400, headers: NO_STORE })

  const owner = access.owner
  if (body.source !== undefined && !isExportSource(body.source)) {
    return NextResponse.json({ error: 'invalid_export_source' }, { status: 400, headers: NO_STORE })
  }
  if (body.format !== undefined && !isExportFormat(body.format)) {
    return NextResponse.json({ error: 'invalid_export_format' }, { status: 400, headers: NO_STORE })
  }
  const source: ExportSource = body.source !== undefined ? (body.source as ExportSource) : 'sector_report'
  const format: ExportFormat = body.format !== undefined ? (body.format as ExportFormat) : 'md'
  const period = typeof body.period === 'string' && VALID_PERIODS.has(body.period as ReportPeriod)
    ? (body.period as ReportPeriod)
    : '24h'
  const title = typeof body.title === 'string' ? body.title : undefined
  const customText = typeof body.customText === 'string' ? body.customText : undefined
  const background = body.background === true

  try {
    const created = await createBackgroundExportTask(
      access.admin,
      owner,
      { source, format, period, title, customText },
      { now: deps.now }
    )

    if (background) {
      const work = async () => {
        try {
          await runBackgroundExportTask(access.admin, owner, created.taskId, { now: deps.now })
        } catch (error) {
          console.error('background_export_run_failed', {
            taskId: created.taskId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      if (deps.scheduleBackground) {
        deps.scheduleBackground(work)
      } else {
        void work()
      }
      return NextResponse.json(
        { ok: true, taskId: created.taskId, state: created.state },
        { status: 202, headers: NO_STORE }
      )
    }

    const task = await runBackgroundExportTask(access.admin, owner, created.taskId, { now: deps.now })
    return NextResponse.json({ ok: task.state === 'done', task }, { status: 201, headers: NO_STORE })
  } catch (error) {
    return errorJson(error, 'export_create_failed')
  }
}
