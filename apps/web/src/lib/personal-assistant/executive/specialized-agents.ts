import type { DbClient } from '@/lib/db/client'

export const SPECIALIZED_AGENTS = {
  personal: {
    name: 'Kayan Personal',
    description: 'المواعيد والتذكيرات والبريد والمهام والذاكرة الشخصية',
    tools: ['create_reminder', 'draft_message', 'delete_memory', 'update_task_status', 'gmail_summarize_recent',
      'gmail_create_draft', 'gmail_send_email', 'calendar_list_events', 'calendar_create_event', 'calendar_update_event'],
  },
  business: {
    name: 'Kayan Business',
    description: 'مبيعات واتساب وقاعدة المعرفة والحجوزات والطلبات وتصعيد المحادثات',
    tools: ['query_org_stats', 'draft_message', 'send_customer_message', 'find_business_records', 'escalate_customer'],
  },
  freelancer: {
    name: 'Kayan Freelancer',
    description: 'مسودات عروض الأسعار ومتابعة الدفعات واجتماعات العملاء',
    tools: ['draft_quote', 'create_reminder', 'draft_message', 'send_customer_message', 'calendar_list_events',
      'calendar_create_event', 'calendar_update_event', 'update_task_status'],
  },
  ops: {
    name: 'Kayan Ops',
    description: 'تنفيذ متعدد الخطوات وتقارير تشغيلية وتوزيع مهام الفريق',
    tools: ['query_org_stats', 'assign_team_task', 'configure_ops_daily_report', 'create_reminder', 'update_task_status', 'draft_message'],
  },
} satisfies Record<string, { name: string; description: string; tools: string[] }>

export type SpecializedAgentKind = keyof typeof SPECIALIZED_AGENTS

export function isSpecializedAgentKind(value: unknown): value is SpecializedAgentKind {
  return typeof value === 'string' && Object.hasOwn(SPECIALIZED_AGENTS, value)
}

export function canUseBusinessExecutiveAgent(kind: SpecializedAgentKind | null, role: string) {
  return kind !== null && kind !== 'personal' && (role === 'owner' || role === 'admin')
}

export async function organizationAgentKind(db: DbClient, organizationId: string) {
  const { data, error } = await db.from('organizations').select('specialized_agent_kind').eq('id', organizationId).maybeSingle()
  if (error) throw new Error('specialized_agent_lookup_failed')
  return isSpecializedAgentKind(data?.specialized_agent_kind) ? data.specialized_agent_kind : null
}

/** One credit for each step after the two standard steps included in a plan. */
export function heavyTaskCreditCost(agentKind: SpecializedAgentKind | null, stepCount: number) {
  return agentKind === null ? 0 : Math.max(0, stepCount - 2)
}
