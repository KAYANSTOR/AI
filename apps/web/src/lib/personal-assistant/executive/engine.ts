import type { DbClient } from '@/lib/db/client'
import { assertWithinLimit } from '@/lib/billing/entitlements'
import { createPersonalTask, updatePersonalTask, upsertPersonalSettings, type PersonalTaskStatus } from '../tasks'
import { hashesEqual, payloadHash } from './hash'
import { connectorExecutors } from '@/lib/connectors/tools'
import { searchKnowledge } from '@/lib/knowledge/retrieval'
import { heavyTaskCreditCost, isSpecializedAgentKind, SPECIALIZED_AGENTS, type SpecializedAgentKind } from './specialized-agents'
import { AGENT_TOOLS, effectiveRisk, evaluatePolicy, maxRisk, requiresApproval, type Provenance, type RiskLevel } from './policy'
import {
  executeOwnerDirective,
  generateSectorReport,
  sendCentralOwnerCommunication,
  sendOperationalSummaryToOwner,
  trainAgentFromBotConversation,
  type ReportPeriod,
} from '@/lib/central-bot/operations'
import { runLiveWebSearch } from '../live-search'
import { savePersonalPersona } from '../persona'
import { createBackgroundExportTask, isExportFormat, isExportSource, runBackgroundExportTask } from '../exports'

/**
 * Executive task engine ("محضر أعمال").
 *
 * goal → plan (steps with dry-run) → [hash-locked owner approval for high/financial]
 * → run (kill switch re-checked before every step) → verify → immutable receipt.
 *
 * All writes go through the trusted server client, and every query is scoped by the
 * verified owner (org_id + user_id); ids coming from the model or a button are only
 * ever looked up inside that scope.
 */
export type Owner = { organizationId: string; userId: string }
export type TaskState = 'pending' | 'planning' | 'awaiting_approval' | 'running' | 'verifying' | 'done' | 'failed' | 'cancelled'
export type StepInput = { tool: string; input: Record<string, unknown>; summary?: string }
export type ToolExecutor = (db: DbClient, owner: Owner, input: Record<string, unknown>) => Promise<unknown>

export type EngineNotice = {
  text: string
  kind: 'approval' | 'receipt' | 'status'
  taskId: string
  approval?: { id: string; hash: string }
}

export type EngineDeps = {
  now?: () => Date
  /** Plan limit check against usage_ledger (defaults to automation_runs). */
  assertLimit?: (db: DbClient, organizationId: string) => Promise<void>
  /** Owner notification (web thread + WhatsApp). */
  notify?: (owner: Owner, notice: EngineNotice) => Promise<void>
  executors?: Partial<Record<string, ToolExecutor>>
  approvalTtlMinutes?: number
}

const ACTIVE_STATES: TaskState[] = ['pending', 'planning', 'awaiting_approval', 'running', 'verifying']
const TERMINAL_STATES: TaskState[] = ['done', 'failed', 'cancelled']
const MAX_STEPS = 8
const DEFAULT_APPROVAL_TTL_MINUTES = 30

function nowOf(deps: EngineDeps) { return deps.now ? deps.now() : new Date() }

function shortRef(id: string) { return id.slice(0, 8) }

function str(value: unknown, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** The exact payload an approval is bound to. Any change in tool or input changes the hash. */
export function approvalPayload(taskId: string, stepId: string, toolName: string, input: unknown) {
  return { task_id: taskId, step_id: stepId, tool: toolName, input: input ?? {} }
}

export function dryRun(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'create_reminder': return `سيُنشأ تذكير: «${str(input.title, 120)}»${input.due_at ? ` بتاريخ ${str(input.due_at, 40)}` : ''}`
    case 'query_org_stats': return 'ستُقرأ أرقام المحادثات والحجوزات لآخر 24 ساعة.'
    case 'draft_message': return `ستُكتب مسودة: «${str(input.body, 160)}»`
    case 'send_customer_message': return `ستُرسل رسالة واتساب إلى ${str(input.phone, 20)}: «${str(input.body, 300)}»`
    case 'delete_memory': return `ستُحذف معلومة الذاكرة رقم ${shortRef(str(input.memory_id, 40))}`
    case 'update_task_status': return `ستتغير حالة المهمة ${shortRef(str(input.task_id, 40))} إلى ${str(input.status, 20)}`
    case 'gmail_summarize_recent': return 'ستُقرأ عناوين ومقتطفات أحدث رسائل Gmail (قراءة فقط، كمحتوى غير موثوق).'
    case 'gmail_create_draft': return `ستُكتب مسودة بريد إلى ${str(input.to, 254)} بعنوان «${str(input.subject, 160)}» (لن تُرسل).`
    case 'gmail_send_email': return `سيُرسل بريد إلى ${str(input.to, 254)} بعنوان «${str(input.subject, 160)}»: «${str(input.body, 300)}»`
    case 'calendar_list_events': return 'ستُقرأ أحداث Google Calendar القادمة (قراءة فقط).'
    case 'calendar_create_event': return `سيُضاف حدث «${str(input.summary, 160)}» من ${str(input.starts_at, 40)} إلى ${str(input.ends_at, 40)}.`
    case 'calendar_update_event': return `سيُعدّل الحدث ${shortRef(str(input.event_id, 40))} بعنوان «${str(input.summary, 160)}».`
    case 'draft_quote': return `ستُعدّ مسودة عرض لـ «${str(input.description, 160)}».`
    case 'find_business_records': return 'سيُبحث في بيانات النشاط عن الحجوزات أو الطلبات أو المعرفة ذات الصلة.'
    case 'escalate_customer': return `ستُصعّد المحادثة ${shortRef(str(input.conversation_id, 40))} إلى الفريق.`
    case 'assign_team_task': return `ستُسند مهمة «${str(input.title, 120)}» إلى عضو الفريق ${shortRef(str(input.user_id, 40))}.`
    case 'configure_ops_daily_report': return 'سيُضبط إرسال ملخص العمليات اليومي عبر واتساب إلى الرقم المسجل في حسابك.'
    case 'update_agent_directives': return `ستُحدّث توجيهات الوكيل: «${str(input.instruction, 160)}».`
    case 'get_sector_report': return 'سيُستخرج ملخص العمليات الفوري للمحادثات والقطاع خلال الفترة المحددة.'
    case 'send_owner_alert': return `سيُرسل تنبيه أو ملخص تشغيلي للمالك عبر البوت المركزي: «${str(input.title || input.body, 140)}».`
    case 'train_agent_knowledge': return `ستُضاف معرفة جديدة لقاعدة معرفة الوكيل: «${str(input.text, 160)}».`
    case 'live_web_search': return `سيُجرى بحث حي في الويب عن: «${str(input.query, 120)}».`
    case 'set_personal_tone': return 'ستُحفظ تفضيلات نبرة ولهجة المساعد الشخصي لحسابك.'
    case 'analyze_and_export': return `سيُحلّل ويُصدّر ملف بصيغة ${str(input.format, 10) || 'md'}.`
    default: return 'إجراء غير معروف'
  }
}

const builtinExecutors: Record<string, ToolExecutor> = {
  create_reminder: async (db, owner, input) => {
    const task = await createPersonalTask(db, owner, {
      title: str(input.title, 300),
      notes: str(input.notes, 1000) || null,
      dueAt: str(input.due_at, 40) || null,
    })
    return { personal_task_id: task.id, title: task.title, due_at: task.due_at }
  },
  query_org_stats: async (db, owner) => {
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
    const [conversations, bookings] = await Promise.all([
      db.from('conversations').select('id').eq('organization_id', owner.organizationId).gte('created_at', since).limit(1000),
      db.from('appointments').select('id').eq('organization_id', owner.organizationId).gte('created_at', since).limit(1000),
    ])
    if (conversations.error || bookings.error) throw new Error('organization_stats_unavailable')
    return { conversations_24h: conversations.data?.length ?? 0, bookings_24h: bookings.data?.length ?? 0 }
  },
  draft_message: async (_db, _owner, input) => ({ draft: str(input.body, 1000) }),
  draft_quote: async (_db, _owner, input) => {
    const description = str(input.description, 500)
    const amount = Number(input.amount)
    const currency = str(input.currency, 3).toUpperCase()
    if (!description || !Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) throw new Error('invalid_quote_draft')
    return { description, amount, currency, status: 'draft' }
  },
  find_business_records: async (db, owner, input) => {
    if (input.kind === 'knowledge') {
      const query = str(input.query, 200)
      if (!query) throw new Error('invalid_knowledge_query')
      return searchKnowledge(db, owner.organizationId, query, { limit: 5 })
    }
    if (input.kind !== 'orders' && input.kind !== 'appointments') throw new Error('invalid_business_record_kind')
    const columns = input.kind === 'orders' ? 'id, order_number, status, total, currency' : 'id, status, starts_at'
    const result = await db.from(input.kind).select(columns).eq('organization_id', owner.organizationId)
      .order('created_at', { ascending: false }).limit(10)
    if (result.error) throw new Error('business_records_unavailable')
    return result.data
  },
  escalate_customer: async (db, owner, input) => {
    const { data, error } = await db.from('conversations').update({ status: 'handed_off', state: 'human_handoff',
      ai_enabled: false, ai_paused_at: new Date().toISOString(), handoff_reason: str(input.reason, 300) || 'تم التصعيد من وكيل الأعمال' })
      .eq('organization_id', owner.organizationId).eq('id', str(input.conversation_id, 40)).neq('status', 'closed').select('id').maybeSingle()
    if (error || !data) throw new Error('open_conversation_not_found')
    return { conversation_id: data.id, status: 'handed_off' }
  },
  assign_team_task: async (db, owner, input) => {
    const userId = str(input.user_id, 40)
    const { data, error } = await db.from('organization_members').select('id').eq('organization_id', owner.organizationId)
      .eq('user_id', userId).in('role', ['owner', 'admin', 'manager', 'member']).maybeSingle()
    if (error || !data) throw new Error('team_member_not_found')
    const task = await createPersonalTask(db, { organizationId: owner.organizationId, userId }, {
      title: str(input.title, 300), notes: str(input.notes, 1000) || null, dueAt: str(input.due_at, 40) || null,
    })
    return { personal_task_id: task.id, user_id: userId }
  },
  configure_ops_daily_report: async (db, owner, input) => {
    if (typeof input.enabled !== 'boolean') throw new Error('invalid_ops_report_setting')
    const channelId = str(input.channel_id, 40)
    if (input.enabled && !channelId) throw new Error('ops_report_channel_required')
    await upsertPersonalSettings(db, owner, {
      opsDailyReportEnabled: input.enabled,
      ...(input.enabled ? { whatsappChannelId: channelId, whatsappRemindersEnabled: true,
        morningBriefLocalTime: str(input.local_time, 8) || '08:00', timezone: str(input.timezone, 80) || 'Asia/Aden' } : {}),
    })
    return { daily_report_enabled: input.enabled }
  },
  delete_memory: async (db, owner, input) => {
    const memoryId = str(input.memory_id, 40)
    const { data } = await db.from('user_memories').select('id').eq('id', memoryId)
      .eq('organization_id', owner.organizationId).eq('user_id', owner.userId).maybeSingle()
    if (!data) throw new Error('memory_not_found')
    const { error } = await db.from('user_memories').delete().eq('id', memoryId)
      .eq('organization_id', owner.organizationId).eq('user_id', owner.userId)
    if (error) throw new Error('memory_delete_failed')
    return { deleted_memory_id: memoryId }
  },
  update_task_status: async (db, owner, input) => {
    const status = str(input.status, 20) as PersonalTaskStatus
    if (!['pending', 'done', 'snoozed'].includes(status)) throw new Error('invalid_task_status')
    const task = await updatePersonalTask(db, owner, str(input.task_id, 40), { status })
    if (!task) throw new Error('task_not_found')
    return { personal_task_id: task.id, status: task.status }
  },
  send_customer_message: async () => {
    throw new Error('customer_channel_not_configured')
  },
  update_agent_directives: async (db, owner, input) => {
    const mode = input.mode === 'replace' ? 'replace' : 'append'
    return executeOwnerDirective(db, owner, { instruction: str(input.instruction, 2000), mode })
  },
  get_sector_report: async (db, owner, input) => {
    const period = (['today', '24h', '7d', '30d'].includes(String(input.period ?? '')) ? String(input.period) : '24h') as ReportPeriod
    return generateSectorReport(db, owner, { period })
  },
  send_owner_alert: async (db, owner, input) => {
    if (input.kind === 'operational_summary') {
      const period = (['today', '24h', '7d', '30d'].includes(String(input.period ?? '')) ? String(input.period) : '24h') as ReportPeriod
      return sendOperationalSummaryToOwner(db, owner, { period })
    }
    return sendCentralOwnerCommunication(db, {
      organizationId: owner.organizationId,
      targetUserId: owner.userId,
      kind: 'alert',
      title: str(input.title, 120) || 'تنبيه تشغيلي',
      body: str(input.body, 2000),
      createInAppNotification: true,
    })
  },
  train_agent_knowledge: async (db, owner, input) => {
    return trainAgentFromBotConversation(db, owner, {
      text: str(input.text, 6000),
      title: str(input.title, 200) || null,
      directive: str(input.directive, 2000) || null,
      channel: 'whatsapp_central',
    })
  },
  live_web_search: async (_db, _owner, input) => {
    const res = await runLiveWebSearch(str(input.query, 300))
    if (!res.ok) throw new Error(res.code)
    return { query: res.query, summary: res.summary, results: res.results, context: res.untrustedContext }
  },
  set_personal_tone: async (db, owner, input) => {
    return savePersonalPersona(db, owner, {
      tone: input.tone,
      dialect: input.dialect,
      preferredTitle: input.preferred_title,
      customStyle: input.custom_style,
    })
  },
  analyze_and_export: async (db, owner, input) => {
    const source = isExportSource(input.source) ? input.source : 'sector_report'
    const format = isExportFormat(input.format) ? input.format : 'md'
    const created = await createBackgroundExportTask(db, owner, {
      source,
      format,
      title: str(input.title, 200) || undefined,
      period: (['today', '24h', '7d', '30d'].includes(String(input.period ?? '')) ? String(input.period) : '24h') as ReportPeriod,
      customText: str(input.custom_text, 8000) || undefined,
    })
    const completed = await runBackgroundExportTask(db, owner, created.taskId)
    return { taskId: completed.taskId, state: completed.state, fileName: completed.file?.fileName ?? null, sha256: completed.file?.sha256 ?? null }
  },
  ...connectorExecutors,
}

export async function isKillSwitchActive(db: DbClient, owner: Owner): Promise<boolean> {
  const { data } = await db.from('personal_assistant_links').select('kill_switch_active')
    .eq('org_id', owner.organizationId).eq('user_id', owner.userId).maybeSingle()
  return data?.kill_switch_active === true
}

async function loadTask(db: DbClient, owner: Owner, taskId: string) {
  const { data } = await db.from('agent_tasks').select('*').eq('id', taskId)
    .eq('org_id', owner.organizationId).eq('user_id', owner.userId).maybeSingle()
  return data as Record<string, unknown> | null
}

async function loadSteps(db: DbClient, taskId: string) {
  const { data } = await db.from('agent_task_steps').select('*').eq('task_id', taskId).order('step_index', { ascending: true })
  return (data ?? []) as Record<string, unknown>[]
}

async function setTaskState(db: DbClient, taskId: string, state: TaskState, extra: Record<string, unknown> = {}) {
  await db.from('agent_tasks').update({ state, ...extra }).eq('id', taskId)
}

async function notifySafe(deps: EngineDeps, owner: Owner, notice: EngineNotice) {
  if (!deps.notify) return
  try { await deps.notify(owner, notice) } catch (error) {
    console.error('agent_notify_failed', { taskId: notice.taskId, reason: error instanceof Error ? error.message : 'unknown' })
  }
}

/** Write the immutable receipt once per task (unique task_id) and send the summary. */
async function writeReceipt(db: DbClient, owner: Owner, taskId: string, deps: EngineDeps) {
  const task = await loadTask(db, owner, taskId)
  if (!task) return
  const { data: existing } = await db.from('agent_receipts').select('id').eq('task_id', taskId).maybeSingle()
  if (existing) return
  const steps = await loadSteps(db, taskId)
  const executed = steps.filter((step) => step.status === 'done')
  const readSources = executed.filter((step) => AGENT_TOOLS[String(step.tool_name)]?.readOnly)
    .map((step) => ({ tool: step.tool_name, summary: step.action_summary }))
  const actions = executed.filter((step) => !AGENT_TOOLS[String(step.tool_name)]?.readOnly)
    .map((step) => ({ tool: step.tool_name, summary: step.action_summary, result: step.result_json ?? null }))
  const untouched = Array.from(new Set(steps.map((step) => AGENT_TOOLS[String(step.tool_name)]?.untouchedAr).filter(Boolean))).join(' ')
  const state = String(task.state)
  const headline = state === 'done' ? 'تم تنفيذ المهمة' : state === 'cancelled' ? 'أُوقفت المهمة' : 'تعذّر إكمال المهمة'
  const summary = `${headline}: ${String(task.goal).slice(0, 200)} — نُفّذ ${executed.length} من ${steps.length} خطوة.`
  const { error } = await db.from('agent_receipts').insert({
    task_id: taskId,
    org_id: owner.organizationId,
    user_id: owner.userId,
    summary_ar: summary,
    read_sources_json: readSources,
    executed_actions_json: actions,
    evidence_json: steps.map((step) => ({ step: step.step_index, status: step.status, error: step.error_message ?? null })),
    untouched_scope_note: untouched || 'لم يُمسّ أي شيء خارج خطوات المهمة.',
    cost_usd: Number(task.cost_usd ?? 0),
  })
  if (error && error.code !== '23505') throw new Error('receipt_write_failed')
  if (error) return
  const lines = [
    summary,
    ...actions.map((action) => `• ${String(action.summary)}`),
    `المرجع: ${shortRef(taskId)}`,
    `لم يُمس: ${untouched || 'لا شيء خارج المهمة'}`,
  ]
  await notifySafe(deps, owner, { kind: 'receipt', taskId, text: lines.join('\n') })
}

export async function createAgentTask(
  db: DbClient,
  owner: Owner,
  input: { goal: string; steps: StepInput[]; provenance?: Provenance; conversationId?: string | null; constraints?: Record<string, unknown>; agentKind?: SpecializedAgentKind | null },
  deps: EngineDeps = {}
): Promise<{ taskId: string; state: TaskState; approvals: { id: string; hash: string; summary: string }[] }> {
  const goal = str(input.goal, 1000)
  if (!goal) throw new Error('invalid_goal')
  if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > MAX_STEPS) throw new Error('invalid_plan')
  const agentKind = input.agentKind ?? null
  const provenance: Provenance = input.provenance === 'external' ? 'external' : 'owner'
  for (const step of input.steps) {
    if (!Object.hasOwn(AGENT_TOOLS, step.tool)) throw new Error('unknown_tool')
    if (agentKind && !SPECIALIZED_AGENTS[agentKind].tools.includes(step.tool)) throw new Error('tool_not_allowed_for_agent')
  }
  if (await isKillSwitchActive(db, owner)) throw new Error('kill_switch_active')
  await (deps.assertLimit ?? ((client, orgId) => assertWithinLimit(client, orgId, 'automation_runs')))(db, owner.organizationId)

  const risks = input.steps.map((step) => effectiveRisk(AGENT_TOOLS[step.tool], provenance))
  const plan = input.steps.map((step, index) => ({ index, tool: step.tool, label: AGENT_TOOLS[step.tool].labelAr, risk: risks[index] }))
  const { data: task, error } = await db.from('agent_tasks').insert({
    org_id: owner.organizationId,
    user_id: owner.userId,
    conversation_id: input.conversationId ?? null,
    goal,
    constraints_json: { ...(input.constraints ?? {}), provenance },
    plan_json: plan,
    state: 'planning',
    risk_level: maxRisk(risks),
    ...(agentKind ? { specialized_agent_kind: agentKind } : {}),
    rollback_plan: risks.some(requiresApproval) ? 'لا يُنفذ أي إجراء حساس قبل موافقتك؛ الرفض يلغي المهمة دون أثر.' : 'خطوات منخفضة المخاطر قابلة للتراجع من لوحة المهام.',
  }).select('id').single()
  if (error || !task) throw new Error('task_create_failed')
  const taskId = String(task.id)

  const approvals: { id: string; hash: string; summary: string }[] = []
  const creditCost = heavyTaskCreditCost(agentKind, input.steps.length)
  const requiresPlanConfirmation = creditCost > 0 && !risks.some(requiresApproval)
  const expiresAt = new Date(nowOf(deps).getTime() + (deps.approvalTtlMinutes ?? DEFAULT_APPROVAL_TTL_MINUTES) * 60_000).toISOString()
  for (const [index, step] of input.steps.entries()) {
    const risk = risks[index]
    const needsApproval = requiresApproval(risk) || (requiresPlanConfirmation && index === 0)
    const summary = (str(step.summary, 300) || dryRun(step.tool, step.input ?? {})) +
      (needsApproval && creditCost > 0 ? `\nتكلفة الخطة كاملة: ${creditCost} من رصيد المهام.` : '')
    const { data: stepRow, error: stepError } = await db.from('agent_task_steps').insert({
      task_id: taskId,
      step_index: index,
      tool_name: step.tool,
      action_summary: summary,
      input_json: step.input ?? {},
      risk_level: risk,
      dry_run_output: dryRun(step.tool, step.input ?? {}),
      status: needsApproval ? 'awaiting_approval' : 'pending',
    }).select('id').single()
    if (stepError || !stepRow) throw new Error('task_step_create_failed')
    if (!needsApproval) continue
    const payload = approvalPayload(taskId, String(stepRow.id), step.tool, step.input ?? {})
    const hash = payloadHash(payload)
    const { data: approval, error: approvalError } = await db.from('agent_approvals').insert({
      task_id: taskId,
      step_id: stepRow.id,
      org_id: owner.organizationId,
      user_id: owner.userId,
      summary_ar: summary,
      payload_json: payload,
      payload_hash: hash,
      status: 'pending',
      expires_at: expiresAt,
    }).select('id').single()
    if (approvalError || !approval) throw new Error('approval_create_failed')
    approvals.push({ id: String(approval.id), hash, summary })
  }

  if (approvals.length) {
    await setTaskState(db, taskId, 'awaiting_approval')
    for (const approval of approvals) {
      await notifySafe(deps, owner, {
        kind: 'approval',
        taskId,
        approval: { id: approval.id, hash: approval.hash },
        text: `طلب موافقة (المرجع ${shortRef(taskId)}):\n${approval.summary}\nتنتهي صلاحية الطلب خلال ${deps.approvalTtlMinutes ?? DEFAULT_APPROVAL_TTL_MINUTES} دقيقة.`,
      })
    }
    return { taskId, state: 'awaiting_approval', approvals }
  }
  const state = await runAgentTask(db, owner, taskId, deps)
  return { taskId, state, approvals }
}

/** Verifies that a step has an approved, hash-matching, owner-scoped approval. */
async function stepApprovalVerified(db: DbClient, owner: Owner, taskId: string, step: Record<string, unknown>) {
  const { data } = await db.from('agent_approvals').select('*').eq('step_id', String(step.id))
    .eq('task_id', taskId).eq('org_id', owner.organizationId).eq('user_id', owner.userId).eq('status', 'approved')
  const expected = payloadHash(approvalPayload(taskId, String(step.id), String(step.tool_name), step.input_json))
  return ((data ?? []) as Record<string, unknown>[]).some((row) =>
    hashesEqual(String(row.payload_hash), expected) && hashesEqual(payloadHash(row.payload_json), expected))
}

export async function runAgentTask(db: DbClient, owner: Owner, taskId: string, deps: EngineDeps = {}): Promise<TaskState> {
  const task = await loadTask(db, owner, taskId)
  if (!task) throw new Error('task_not_found')
  if (TERMINAL_STATES.includes(task.state as TaskState)) return task.state as TaskState
  if (task.state === 'running' || task.state === 'verifying') return task.state
  const provenance: Provenance = (task.constraints_json as Record<string, unknown> | null)?.provenance === 'external' ? 'external' : 'owner'
  const steps = await loadSteps(db, taskId)
  if (steps.some(step => step.status === 'awaiting_approval')) return 'awaiting_approval'
  const agentKind = isSpecializedAgentKind(task.specialized_agent_kind) ? task.specialized_agent_kind : null
  if (agentKind && agentKind !== 'personal') {
    const { data: membership } = await db.from('organization_members').select('role').eq('organization_id', owner.organizationId)
      .eq('user_id', owner.userId).maybeSingle()
    if (membership?.role !== 'owner' && membership?.role !== 'admin') {
      await cancelRemaining(db, taskId)
      await setTaskState(db, taskId, 'cancelled', { last_error: 'specialized_agent_member_forbidden' })
      await writeReceipt(db, owner, taskId, deps)
      return 'cancelled'
    }
  }
  const { data: claimed, error: claimError } = await db.from('agent_tasks').update({ state: 'running', attempts: Number(task.attempts ?? 0) + 1 })
    .eq('id', taskId).eq('state', String(task.state)).select('id').maybeSingle()
  if (claimError) throw new Error('agent_task_claim_failed')
  if (!claimed) return (await loadTask(db, owner, taskId))?.state as TaskState ?? 'cancelled'
  if (await isKillSwitchActive(db, owner)) {
    await cancelRemaining(db, taskId)
    await setTaskState(db, taskId, 'cancelled', { last_error: 'kill_switch_active' })
    await writeReceipt(db, owner, taskId, deps)
    return 'cancelled'
  }
  const creditCost = heavyTaskCreditCost(agentKind, steps.length)
  if (creditCost > 0) {
    const debit = await db.rpc('consume_usage_credits', { p_org_id: owner.organizationId, p_task_id: taskId, p_amount: creditCost })
    const decision: unknown = debit.data
    if (debit.error || (decision !== 'charged' && decision !== 'already_charged')) {
      await cancelRemaining(db, taskId)
      await setTaskState(db, taskId, 'failed', { last_error: decision === 'insufficient' ? 'insufficient_usage_credits' : 'usage_credit_charge_failed' })
      await writeReceipt(db, owner, taskId, deps)
      return 'failed'
    }
  }
  const executors = { ...builtinExecutors, ...(deps.executors ?? {}) }

  for (const step of steps) {
    if (step.status === 'done' || step.status === 'skipped') continue
    // Kill switch and external cancellation are re-read before every step.
    const fresh = await loadTask(db, owner, taskId)
    const killed = await isKillSwitchActive(db, owner)
    if (killed || !fresh || fresh.state === 'cancelled') {
      await cancelRemaining(db, taskId)
      await setTaskState(db, taskId, 'cancelled', { last_error: killed ? 'kill_switch_active' : 'cancelled' })
      await writeReceipt(db, owner, taskId, deps)
      return 'cancelled'
    }
    const approvalVerified = requiresApproval(String(step.risk_level) as RiskLevel)
      ? await stepApprovalVerified(db, owner, taskId, step)
      : false
    const decision = evaluatePolicy({ toolName: String(step.tool_name), provenance, approvalVerified, killSwitchActive: false, agentKind })
    if (!decision.allow) {
      await db.from('agent_task_steps').update({ status: 'failed', error_message: decision.reason }).eq('id', String(step.id))
      await cancelRemaining(db, taskId)
      await setTaskState(db, taskId, 'failed', { last_error: decision.reason })
      await writeReceipt(db, owner, taskId, deps)
      return 'failed'
    }
    await db.from('agent_task_steps').update({ status: 'running' }).eq('id', String(step.id))
    try {
      const executor = executors[String(step.tool_name)]
      if (!executor) throw new Error('unsupported_tool')
      const result = await executor(db, owner, (step.input_json ?? {}) as Record<string, unknown>)
      await db.from('agent_task_steps').update({ status: 'done', result_json: (result ?? null) as Record<string, unknown> | null }).eq('id', String(step.id))
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 200) : 'step_failed'
      await db.from('agent_task_steps').update({ status: 'failed', error_message: message }).eq('id', String(step.id))
      await cancelRemaining(db, taskId)
      await setTaskState(db, taskId, 'failed', { last_error: message })
      await writeReceipt(db, owner, taskId, deps)
      return 'failed'
    }
  }

  // The kill switch may have flipped during the last step.
  const after = await loadTask(db, owner, taskId)
  if (!after || after.state === 'cancelled' || await isKillSwitchActive(db, owner)) {
    await setTaskState(db, taskId, 'cancelled', { last_error: 'kill_switch_active' })
    await writeReceipt(db, owner, taskId, deps)
    return 'cancelled'
  }
  await setTaskState(db, taskId, 'verifying')
  const finalSteps = await loadSteps(db, taskId)
  const verified = finalSteps.every((step) => step.status === 'done' || step.status === 'skipped')
  const state: TaskState = verified ? 'done' : 'failed'
  await setTaskState(db, taskId, state, verified ? {} : { last_error: 'verification_failed' })
  await writeReceipt(db, owner, taskId, deps)
  return state
}

async function cancelRemaining(db: DbClient, taskId: string) {
  const steps = await loadSteps(db, taskId)
  for (const step of steps) {
    if (['pending', 'awaiting_approval', 'running'].includes(String(step.status))) {
      await db.from('agent_task_steps').update({ status: 'cancelled' }).eq('id', String(step.id))
    }
  }
}

export type ApprovalDecision = {
  status: 'approved' | 'rejected' | 'expired' | 'not_found' | 'already_decided'
  reason?: 'hash_mismatch' | 'expired' | 'kill_switch_active' | 'owner_rejected'
  taskState?: TaskState
}

/**
 * Owner decision from the web card or the WhatsApp button. The stored payload is
 * re-hashed and compared with the stored hash, the hash carried by the button and the
 * hash of the step as it exists now; any difference or an expired approval rejects.
 */
export async function decideApproval(
  db: DbClient,
  owner: Owner,
  input: { approvalId: string; decision: 'approve' | 'reject'; providedHash?: string | null; via: 'web' | 'whatsapp' },
  deps: EngineDeps = {}
): Promise<ApprovalDecision> {
  const { data: approval } = await db.from('agent_approvals').select('*').eq('id', input.approvalId)
    .eq('org_id', owner.organizationId).eq('user_id', owner.userId).maybeSingle()
  if (!approval) return { status: 'not_found' }
  if (approval.status !== 'pending') return { status: 'already_decided' }
  const taskId = String(approval.task_id)
  const now = nowOf(deps)

  const finalize = async (status: 'approved' | 'rejected' | 'expired') => {
    const { data } = await db.from('agent_approvals')
      .update({ status, decided_at: now.toISOString(), decided_via: input.via })
      .eq('id', input.approvalId).eq('status', 'pending').select('id')
    return Array.isArray(data) && data.length > 0
  }
  const failTask = async (reason: string, state: TaskState = 'failed') => {
    await cancelRemaining(db, taskId)
    await expireOtherApprovals(db, taskId, now)
    await setTaskState(db, taskId, state, { last_error: reason })
    await writeReceipt(db, owner, taskId, deps)
  }

  if (now.getTime() > new Date(String(approval.expires_at)).getTime()) {
    await finalize('expired')
    await failTask('approval_expired')
    return { status: 'expired', reason: 'expired', taskState: 'failed' }
  }

  const { data: step } = await db.from('agent_task_steps').select('*').eq('id', String(approval.step_id)).eq('task_id', taskId).maybeSingle()
  const storedHash = String(approval.payload_hash)
  const recomputed = payloadHash(approval.payload_json)
  const current = step ? payloadHash(approvalPayload(taskId, String(step.id), String(step.tool_name), step.input_json)) : ''
  const hashOk = hashesEqual(storedHash, recomputed)
    && hashesEqual(storedHash, current)
    && (input.providedHash == null || hashesEqual(storedHash, input.providedHash))
  if (input.decision === 'approve' && !hashOk) {
    await finalize('rejected')
    await failTask('approval_hash_mismatch')
    return { status: 'rejected', reason: 'hash_mismatch', taskState: 'failed' }
  }

  if (input.decision === 'reject') {
    await finalize('rejected')
    await failTask('owner_rejected', 'cancelled')
    return { status: 'rejected', reason: 'owner_rejected', taskState: 'cancelled' }
  }

  if (await isKillSwitchActive(db, owner)) {
    await finalize('rejected')
    await failTask('kill_switch_active', 'cancelled')
    return { status: 'rejected', reason: 'kill_switch_active', taskState: 'cancelled' }
  }

  if (!(await finalize('approved'))) return { status: 'already_decided' }
  await db.from('agent_task_steps').update({ status: 'pending' }).eq('id', String(approval.step_id))
  const { data: pending } = await db.from('agent_approvals').select('id').eq('task_id', taskId).eq('status', 'pending')
  if ((pending ?? []).length > 0) return { status: 'approved', taskState: 'awaiting_approval' }
  const taskState = await runAgentTask(db, owner, taskId, deps)
  return { status: 'approved', taskState }
}

async function expireOtherApprovals(db: DbClient, taskId: string, now: Date) {
  await db.from('agent_approvals').update({ status: 'expired', decided_at: now.toISOString() })
    .eq('task_id', taskId).eq('status', 'pending')
}

/**
 * Kill switch: stops every active task of this owner immediately, expires pending
 * approvals and blocks new tasks until the owner turns it off.
 */
export async function setKillSwitch(db: DbClient, owner: Owner, active: boolean, deps: EngineDeps = {}) {
  const now = nowOf(deps).toISOString()
  const { data: link } = await db.from('personal_assistant_links').select('id')
    .eq('org_id', owner.organizationId).eq('user_id', owner.userId).maybeSingle()
  if (link) {
    await db.from('personal_assistant_links').update({ kill_switch_active: active, kill_switch_changed_at: now }).eq('id', String(link.id))
  } else {
    await db.from('personal_assistant_links').insert({ org_id: owner.organizationId, user_id: owner.userId, kill_switch_active: active, kill_switch_changed_at: now })
  }
  if (!active) return { active, cancelled: 0 }

  const { data: tasks } = await db.from('agent_tasks').select('id, state')
    .eq('org_id', owner.organizationId).eq('user_id', owner.userId).in('state', ACTIVE_STATES)
  const ids = ((tasks ?? []) as Record<string, unknown>[]).map((task) => String(task.id))
  for (const taskId of ids) {
    await setTaskState(db, taskId, 'cancelled', { last_error: 'kill_switch_active' })
    await cancelRemaining(db, taskId)
    await expireOtherApprovals(db, taskId, new Date(now))
    await writeReceipt(db, owner, taskId, deps)
  }
  return { active, cancelled: ids.length }
}
