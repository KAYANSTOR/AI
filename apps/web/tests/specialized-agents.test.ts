import { describe, expect, test } from 'bun:test'
import { evaluatePolicy } from '@/lib/personal-assistant/executive/policy'
import { heavyTaskCreditCost } from '@/lib/personal-assistant/executive/specialized-agents'
import { createAgentTask, decideApproval } from '@/lib/personal-assistant/executive/engine'
import { readCsatReply, csatButtons } from '@/lib/channels/conversation-rating'
import type { DbClient } from '@/lib/db/client'
import { createFakeDb } from './support/fake-db'

describe('specialized agent policy', () => {
  const ownerApproval = { provenance: 'owner' as const, approvalVerified: true, killSwitchActive: false }

  test('rejects out-of-scope tools even with an approval', () => {
    expect(evaluatePolicy({ ...ownerApproval, agentKind: 'business', toolName: 'gmail_summarize_recent' }))
      .toEqual({ allow: false, reason: 'tool_not_allowed_for_agent' })
    expect(evaluatePolicy({ ...ownerApproval, agentKind: 'ops', toolName: 'delete_memory' }))
      .toEqual({ allow: false, reason: 'tool_not_allowed_for_agent' })
  })

  test('allows scoped tools and retains the existing approval requirement', () => {
    expect(evaluatePolicy({ ...ownerApproval, agentKind: 'freelancer', toolName: 'draft_quote' }).allow).toBe(true)
    expect(evaluatePolicy({ ...ownerApproval, approvalVerified: false, agentKind: 'business', toolName: 'send_customer_message' }))
      .toEqual({ allow: false, reason: 'approval_required' })
  })

  test('charges only long multi-step plans', () => {
    expect(heavyTaskCreditCost(null, 8)).toBe(0)
    expect(heavyTaskCreditCost('ops', 2)).toBe(0)
    expect(heavyTaskCreditCost('ops', 3)).toBe(1)
    expect(heavyTaskCreditCost('business', 8)).toBe(6)
  })

  test('a heavy plan awaits confirmation and fails closed if the wallet has insufficient balance', async () => {
    const owner = { organizationId: 'workspace-id', userId: 'owner-id' }
    const fake = createFakeDb({
      organization_members: { rows: [{ organization_id: owner.organizationId, user_id: owner.userId, role: 'owner' }] },
      agent_tasks: {}, agent_task_steps: {}, agent_approvals: {}, agent_receipts: {}, personal_assistant_links: {},
    })
    const charged: unknown[] = []
    const db = { ...fake.client, rpc: async (name: string, input: unknown) => {
      charged.push([name, input])
      return { data: 'insufficient', error: null }
    } } as unknown as DbClient
    let executed = false
    const deps = { assertLimit: async () => undefined, executors: { draft_message: async () => { executed = true } } }
    const task = await createAgentTask(db, owner, {
      goal: 'مهمة تجريبية', agentKind: 'ops', steps: Array.from({ length: 3 }, () => ({ tool: 'draft_message', input: { body: 'مسودة' } })),
    }, deps)
    expect(task.state).toBe('awaiting_approval')
    expect(charged).toHaveLength(0)
    const [approval] = task.approvals
    const result = await decideApproval(db, owner, { approvalId: approval.id, decision: 'approve', providedHash: approval.hash, via: 'web' }, deps)
    expect(result.taskState).toBe('failed')
    expect(charged).toEqual([['consume_usage_credits', { p_org_id: owner.organizationId, p_task_id: task.taskId, p_amount: 1 }]])
    expect(executed).toBe(false)
  })

  test('only the three exact survey buttons are accepted', () => {
    const surveyId = 'aaaa0000-bbbb-4444-8888-cccccccccccc'
    const [excellent, good, needsImprovement] = csatButtons(surveyId)
    expect([excellent.title, good.title, needsImprovement.title]).toEqual(['ممتاز', 'جيد', 'يحتاج تحسين'])
    const click = (id: string) => readCsatReply({ type: 'interactive', interactive: { button_reply: { id } } })
    expect(click(good.id)).toEqual({ surveyId, rating: 'good' })
    expect(click(`${excellent.id}:trailing`)).toBeNull()
    expect(click('kayan_csat:wrong-id:excellent')).toBeNull()
    expect(readCsatReply({ type: 'text', text: { body: good.id } })).toBeNull()
  })
})
