import { createHash } from 'node:crypto'
import type { DbClient } from '@/lib/db/client'
import { toCsv } from '@/lib/export/csv'
import { assertCentralBotOwner, generateSectorReport, type CentralOwner, type ReportPeriod } from '@/lib/central-bot/operations'
import { listPersonalTasks } from './tasks'

export type ExportFormat = 'md' | 'csv' | 'json'
export type ExportSource = 'sector_report' | 'conversations' | 'knowledge' | 'tasks' | 'custom_text'
export type ExportTaskState = 'pending' | 'planning' | 'running' | 'verifying' | 'done' | 'failed' | 'cancelled'

export type ExportArtifact = {
  fileName: string
  mimeType: string
  format: ExportFormat
  byteSize: number
  sha256: string
  content: string
  summaryText: string
}

export type ExportTaskRecord = {
  taskId: string
  state: ExportTaskState
  goal: string
  source: ExportSource
  format: ExportFormat
  createdAt: string
  updatedAt: string
  lastError: string | null
  file: ExportArtifact | null
}

const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
}

export function isExportFormat(value: unknown): value is ExportFormat {
  return value === 'md' || value === 'csv' || value === 'json'
}

export function isExportSource(value: unknown): value is ExportSource {
  return (
    value === 'sector_report' ||
    value === 'conversations' ||
    value === 'knowledge' ||
    value === 'tasks' ||
    value === 'custom_text'
  )
}

function safeSlug(raw: string): string {
  const ascii = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return ascii || 'kayan-export'
}

function buildStructuredFile(input: {
  format: ExportFormat
  title: string
  slug: string
  summaryText: string
  columns: string[]
  rows: Record<string, unknown>[]
  metadata: Record<string, unknown>
  generatedAt: string
}): ExportArtifact {
  const datePart = input.generatedAt.slice(0, 10)
  const fileName = `${safeSlug(input.slug)}-${datePart}.${input.format}`
  let content: string

  if (input.format === 'csv') {
    const csv = toCsv(input.rows, input.columns)
    content = `\uFEFF${csv}`
  } else if (input.format === 'json') {
    content = JSON.stringify(
      {
        title: input.title,
        generatedAt: input.generatedAt,
        summary: input.summaryText,
        metadata: input.metadata,
        rows: input.rows,
      },
      null,
      2
    )
  } else {
    const lines = [
      `# ${input.title}`,
      '',
      `تاريخ التوليد: ${input.generatedAt}`,
      '',
      '## الملخص التنفيذي',
      input.summaryText,
      '',
    ]
    if (input.rows.length > 0) {
      lines.push('## التفاصيل')
      lines.push(`| ${input.columns.join(' | ')} |`)
      lines.push(`| ${input.columns.map(() => '---').join(' | ')} |`)
      for (const row of input.rows) {
        const cells = input.columns.map((col) =>
          String(row[col] ?? '')
            .replace(/\|/g, '\\|')
            .replace(/\r?\n/g, ' ')
        )
        lines.push(`| ${cells.join(' | ')} |`)
      }
      lines.push('')
    }
    content = lines.join('\n')
  }

  const bytes = Buffer.from(content, 'utf8')
  const sha256 = createHash('sha256').update(bytes).digest('hex')

  return {
    fileName,
    mimeType: MIME_BY_FORMAT[input.format],
    format: input.format,
    byteSize: bytes.length,
    sha256,
    content,
    summaryText: input.summaryText,
  }
}

async function verifyExportAccess(db: DbClient, owner: CentralOwner, source: ExportSource) {
  if (source === 'sector_report' || source === 'conversations' || source === 'knowledge') {
    await assertCentralBotOwner(db, owner)
  }
}

export async function createBackgroundExportTask(
  db: DbClient,
  owner: CentralOwner,
  input: {
    source: ExportSource
    format: ExportFormat
    title?: string
    period?: ReportPeriod
    customText?: string
  },
  options: { now?: () => Date } = {}
): Promise<{ taskId: string; stepId: string; state: ExportTaskState }> {
  if (!isExportSource(input.source)) throw new Error('invalid_export_source')
  if (!isExportFormat(input.format)) throw new Error('invalid_export_format')
  await verifyExportAccess(db, owner, input.source)

  const title = (input.title ?? '').trim().slice(0, 200) || `تصدير ${input.source}`
  const goal = `تحليل وتصدير: ${title} (${input.format.toUpperCase()})`.slice(0, 1000)
  const nowIso = (options.now ? options.now() : new Date()).toISOString()

  const { data: task, error: taskError } = await db
    .from('agent_tasks')
    .insert({
      org_id: owner.organizationId,
      user_id: owner.userId,
      goal,
      constraints_json: {
        kind: 'analysis_export',
        source: input.source,
        format: input.format,
        period: input.period ?? '24h',
      },
      plan_json: [{ index: 0, tool: 'analyze_and_export', label: 'تحليل وتصدير ملف', risk: 'low' }],
      state: 'pending',
      risk_level: 'low',
      rollback_plan: 'مهمة قراءة وتصدير فقط لا تعدّل أي سجل تشغيلي.',
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id')
    .single()

  if (taskError || !task) throw new Error('export_task_create_failed')
  const taskId = String(task.id)

  const { data: step, error: stepError } = await db
    .from('agent_task_steps')
    .insert({
      task_id: taskId,
      step_index: 0,
      tool_name: 'analyze_and_export',
      action_summary: goal,
      input_json: {
        source: input.source,
        format: input.format,
        title,
        period: input.period ?? '24h',
        customText: typeof input.customText === 'string' ? input.customText.slice(0, 8000) : undefined,
      },
      risk_level: 'low',
      dry_run_output: `سيُحلّل المصدر (${input.source}) ويُصدّر بصيغة ${input.format.toUpperCase()}.`,
      status: 'pending',
    })
    .select('id')
    .single()

  if (stepError || !step) throw new Error('export_step_create_failed')
  return { taskId, stepId: String(step.id), state: 'pending' }
}

/** Runs an analysis/summarization export task within (organization_id, user_id) and persists the output file. */
export async function runBackgroundExportTask(
  db: DbClient,
  owner: CentralOwner,
  taskId: string,
  deps: {
    now?: () => Date
    summarize?: (text: string) => Promise<string>
  } = {}
): Promise<ExportTaskRecord> {
  const { data: task, error: loadError } = await db
    .from('agent_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('org_id', owner.organizationId)
    .eq('user_id', owner.userId)
    .maybeSingle()

  if (loadError) throw new Error('export_task_load_failed')
  if (!task) throw new Error('export_task_not_found')

  const { data: steps } = await db
    .from('agent_task_steps')
    .select('*')
    .eq('task_id', taskId)
    .order('step_index', { ascending: true })
  const step = ((steps ?? []) as Array<Record<string, unknown>>)[0]
  if (!step) throw new Error('export_step_not_found')

  const input = (step.input_json ?? {}) as Record<string, unknown>
  const source = isExportSource(input.source) ? input.source : 'sector_report'
  const format = isExportFormat(input.format) ? input.format : 'md'
  const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : `تصدير ${source}`
  const period = (['today', '24h', '7d', '30d'].includes(String(input.period ?? ''))
    ? String(input.period)
    : '24h') as ReportPeriod

  if (task.state === 'done' && step.result_json) {
    const file = step.result_json as ExportArtifact
    return {
      taskId,
      state: 'done',
      goal: String(task.goal),
      source,
      format,
      createdAt: String(task.created_at),
      updatedAt: String(task.updated_at),
      lastError: null,
      file,
    }
  }

  const now = deps.now ? deps.now() : new Date()
  const nowIso = now.toISOString()

  const { data: claimed } = await db
    .from('agent_tasks')
    .update({ state: 'running', attempts: Number(task.attempts ?? 0) + 1, updated_at: nowIso })
    .eq('id', taskId)
    .eq('org_id', owner.organizationId)
    .eq('user_id', owner.userId)
    .in('state', ['pending', 'planning'])
    .select('id')
    .maybeSingle()

  if (!claimed) {
    const existing = await getExportTaskResult(db, owner, taskId)
    if (existing) return existing
    throw new Error('export_task_not_found')
  }

  await db.from('agent_task_steps').update({ status: 'running' }).eq('id', String(step.id))

  try {
    await verifyExportAccess(db, owner, source)

    let summaryText = ''
    let columns: string[] = []
    let rows: Record<string, unknown>[] = []
    let metadata: Record<string, unknown> = { organizationId: owner.organizationId, source, period }

    if (source === 'sector_report') {
      const report = await generateSectorReport(db, owner, { period, now: () => now })
      summaryText = report.summaryText
      columns = ['metric', 'value']
      rows = [
        { metric: 'القطاع', value: report.verticalNameAr },
        { metric: 'إجمالي المحادثات', value: report.conversations.total },
        { metric: 'المحادثات النشطة', value: report.conversations.active },
        { metric: 'المحادثات المحولة', value: report.conversations.handedOff },
        { metric: 'المحادثات المغلقة', value: report.conversations.closed },
        ...Object.entries(report.sector).map(([metric, value]) => ({ metric, value })),
      ]
      metadata = { ...metadata, verticalId: report.verticalId, baseEngine: report.baseEngine }
    } else if (source === 'conversations') {
      const { data, error } = await db
        .from('conversations')
        .select('id, status, ai_enabled, handoff_reason, created_at, last_message_at')
        .eq('organization_id', owner.organizationId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw new Error('conversations_export_failed')
      const list = (data ?? []) as Array<Record<string, unknown>>
      const active = list.filter((r) => r.status === 'active').length
      const handedOff = list.filter((r) => r.status === 'handed_off').length
      const closed = list.filter((r) => r.status === 'closed').length
      summaryText = `ملخص المحادثات (${list.length} محادثة): نشطة ${active}، محوّلة لموظف ${handedOff}، مغلقة ${closed}.`
      columns = ['id', 'status', 'ai_enabled', 'handoff_reason', 'created_at']
      rows = list.map((r) => ({
        id: r.id,
        status: r.status ?? '',
        ai_enabled: r.ai_enabled ?? true,
        handoff_reason: r.handoff_reason ?? '',
        created_at: r.created_at ?? '',
      }))
    } else if (source === 'knowledge') {
      const { data, error } = await db
        .from('knowledge_base')
        .select('id, title, category, content, source_type, updated_at')
        .eq('organization_id', owner.organizationId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(300)
      if (error) throw new Error('knowledge_export_failed')
      const list = (data ?? []) as Array<Record<string, unknown>>
      summaryText = `تصدير قاعدة المعرفة: ${list.length} بنداً مفعّلاً للمؤسسة.`
      columns = ['id', 'title', 'category', 'content', 'source_type', 'updated_at']
      rows = list
    } else if (source === 'tasks') {
      const list = await listPersonalTasks(db, owner, 'all')
      const openCount = list.filter((t) => t.status !== 'done').length
      const doneCount = list.filter((t) => t.status === 'done').length
      summaryText = `ملخص المهام الشخصية (${list.length} مهمة): مفتوحة/مؤجلة ${openCount}، مكتملة ${doneCount}.`
      columns = ['id', 'title', 'status', 'due_at', 'created_at']
      rows = list.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        due_at: t.due_at ?? '',
        created_at: t.created_at,
      }))
    } else {
      const rawText = typeof input.customText === 'string' ? input.customText.trim() : ''
      if (!rawText) throw new Error('empty_custom_export_text')
      summaryText = deps.summarize ? (await deps.summarize(rawText)).trim() : rawText.slice(0, 600)
      const paragraphs = rawText
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
      columns = ['index', 'section']
      rows = paragraphs.map((section, idx) => ({ index: idx + 1, section }))
    }

    const artifact = buildStructuredFile({
      format,
      title,
      slug: `kayan-${source}`,
      summaryText,
      columns,
      rows,
      metadata,
      generatedAt: nowIso,
    })

    const finishedIso = (deps.now ? deps.now() : new Date()).toISOString()
    await db
      .from('agent_task_steps')
      .update({ status: 'done', result_json: artifact as unknown as Record<string, unknown> })
      .eq('id', String(step.id))

    await db
      .from('agent_tasks')
      .update({ state: 'done', updated_at: finishedIso })
      .eq('id', taskId)
      .eq('org_id', owner.organizationId)

    await db
      .from('agent_receipts')
      .insert({
        task_id: taskId,
        org_id: owner.organizationId,
        user_id: owner.userId,
        summary_ar: `تم تجهيز ملف ${artifact.fileName} (${artifact.byteSize} بايت).`,
        read_sources_json: [{ source }],
        executed_actions_json: [{ tool: 'analyze_and_export', fileName: artifact.fileName, format, sha256: artifact.sha256 }],
        evidence_json: [{ step: 0, status: 'done' }],
        untouched_scope_note: 'قراءة وتوليد ملف فقط؛ لم تتعدل أي بيانات تشغيلية.',
        cost_usd: 0,
      })

    return {
      taskId,
      state: 'done',
      goal: String(task.goal),
      source,
      format,
      createdAt: String(task.created_at),
      updatedAt: finishedIso,
      lastError: null,
      file: artifact,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : 'export_failed'
    const failedIso = (deps.now ? deps.now() : new Date()).toISOString()
    await db.from('agent_task_steps').update({ status: 'failed', error_message: message }).eq('id', String(step.id))
    await db
      .from('agent_tasks')
      .update({ state: 'failed', last_error: message, updated_at: failedIso })
      .eq('id', taskId)
      .eq('org_id', owner.organizationId)

    return {
      taskId,
      state: 'failed',
      goal: String(task.goal),
      source,
      format,
      createdAt: String(task.created_at),
      updatedAt: failedIso,
      lastError: message,
      file: null,
    }
  }
}

export async function getExportTaskResult(
  db: DbClient,
  owner: CentralOwner,
  taskId: string
): Promise<ExportTaskRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return null
  const { data: task, error } = await db
    .from('agent_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('org_id', owner.organizationId)
    .eq('user_id', owner.userId)
    .maybeSingle()

  if (error) throw new Error('export_task_load_failed')
  if (!task) return null

  const constraints = (task.constraints_json ?? {}) as Record<string, unknown>
  if (constraints.kind !== 'analysis_export') return null

  const { data: steps } = await db
    .from('agent_task_steps')
    .select('result_json')
    .eq('task_id', taskId)
    .order('step_index', { ascending: true })
    .limit(1)
  const step = ((steps ?? []) as Array<{ result_json?: unknown }>)[0]

  return {
    taskId: String(task.id),
    state: task.state as ExportTaskState,
    goal: String(task.goal),
    source: isExportSource(constraints.source) ? constraints.source : 'sector_report',
    format: isExportFormat(constraints.format) ? constraints.format : 'md',
    createdAt: String(task.created_at),
    updatedAt: String(task.updated_at),
    lastError: typeof task.last_error === 'string' ? task.last_error : null,
    file: task.state === 'done' && step?.result_json ? (step.result_json as ExportArtifact) : null,
  }
}

export async function listExportTasks(db: DbClient, owner: CentralOwner, limit = 25): Promise<ExportTaskRecord[]> {
  const { data, error } = await db
    .from('agent_tasks')
    .select('*')
    .eq('org_id', owner.organizationId)
    .eq('user_id', owner.userId)
    .order('created_at', { ascending: false })
    .limit(limit * 2)

  if (error) throw new Error('export_list_failed')
  const exportRows = ((data ?? []) as Array<Record<string, unknown>>).filter(
    (row) => (row.constraints_json as Record<string, unknown> | undefined)?.kind === 'analysis_export'
  )

  const results: ExportTaskRecord[] = []
  for (const row of exportRows.slice(0, limit)) {
    const constraints = (row.constraints_json ?? {}) as Record<string, unknown>
    let file: ExportArtifact | null = null
    if (row.state === 'done') {
      const { data: step } = await db
        .from('agent_task_steps')
        .select('result_json')
        .eq('task_id', String(row.id))
        .order('step_index', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (step?.result_json) {
        const rawFile = step.result_json as ExportArtifact
        file = { ...rawFile, content: '' }
      }
    }
    results.push({
      taskId: String(row.id),
      state: row.state as ExportTaskState,
      goal: String(row.goal),
      source: isExportSource(constraints.source) ? constraints.source : 'sector_report',
      format: isExportFormat(constraints.format) ? constraints.format : 'md',
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      lastError: typeof row.last_error === 'string' ? row.last_error : null,
      file,
    })
  }
  return results
}
