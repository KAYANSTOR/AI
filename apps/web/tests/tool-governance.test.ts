import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase, holidayAwareHoursRpc, type FakeDb } from './support/fake-supabase'
import { TOOL_POLICIES, isActorAllowed, type ToolActor } from '@/lib/ai/registry'
import { executeTool, getToolDefinitionsForAgent } from '@/lib/ai/tools'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const BIZ = 'aaaaaaaa-0000-4000-8000-0000000000b1'
const CONTACT = 'cccccccc-0000-4000-8000-000000000001'
const CONVERSATION = 'eeeeeeee-0000-4000-8000-000000000001'
const AGENT = 'ffffffff-0000-4000-8000-000000000001'

function capability(capabilityId: string, enabled = true) {
  return { organization_id: ORG, capability_id: capabilityId, is_enabled: enabled }
}

function baseTables(overrides: FakeDb = {}): FakeDb {
  return {
    organization_capabilities: { rows: [capability('appointments')] },
    agent_tool_policies: { rows: [] },
    conversations: { rows: [{ id: CONVERSATION, organization_id: ORG, state: 'discovery', status: 'active' }] },
    contacts: { rows: [{ id: CONTACT, organization_id: ORG, phone: '+15550001', full_name: 'Customer' }] },
    contact_identities: { rows: [] },
    services: { rows: [{ id: 'svc-1', organization_id: ORG, name: 'Consultation', duration_minutes: 60, is_active: true }] },
    appointments: { rows: [] },
    leads: { rows: [] },
    pending_actions: { rows: [] },
    tool_executions: { rows: [] },
    audit_events: { rows: [] },
    business_hours: { rows: [] },
    ...overrides,
  }
}

function setup(tables: FakeDb) {
  const fake = createFakeSupabase(tables, { holiday_aware_hours: (args) => holidayAwareHoursRpc(fake.db)(args) })
  return { db: fake.db, supabase: fake.client as unknown as SupabaseClient }
}

function context(
  supabase: SupabaseClient,
  extra: { conversationId?: string | null; agentId?: string | null; actor?: ToolActor } = {}
) {
  return {
    supabase,
    organizationId: ORG,
    businessId: BIZ,
    conversationId: extra.conversationId === undefined ? CONVERSATION : extra.conversationId,
    contactId: CONTACT,
    agentId: extra.agentId === undefined ? AGENT : extra.agentId,
    actor: extra.actor ?? 'agent',
  }
}

describe('capability registry', () => {
  test('every governed tool declares a capability, risk and confirmation flag', () => {
    for (const [name, policy] of Object.entries(TOOL_POLICIES)) {
      expect(policy.name).toBe(name)
      expect(['read', 'write']).toContain(policy.risk)
      expect(typeof policy.requiresConfirmation).toBe('boolean')
      // A write tool must declare who may invoke it and inside which tenant boundary.
      expect(policy.allowedActors.length).toBeGreaterThan(0)
      expect(['organization', 'conversation', 'channel']).toContain(policy.tenantScope)
      expect(['read', 'sensitive_write']).toContain(policy.auditClass)
      // A write tool either requires explicit confirmation, or is one of the two writes that
      // are safe to run on the customer's own initiative: reaching a human, and recording the
      // enquiry the customer just made. Anything else must ask first.
      if (policy.risk === 'write' && !policy.requiresConfirmation) {
        expect(['request_human_handoff', 'create_lead']).toContain(name)
      }
      expect(policy.inputSchema).toHaveProperty('type', 'object')
    }
  })
})

describe('tool exposure', () => {
  test('tools of a disabled capability are not exposed to the model', async () => {
    const { supabase } = setup(baseTables())
    const tools = await getToolDefinitionsForAgent(supabase, ORG, AGENT)
    const names = tools.map((tool) => tool.name)

    expect(names).toContain('find_available_slots')
    expect(names).toContain('create_appointment')
    expect(names).toContain('request_human_handoff')
    expect(names).not.toContain('get_customer') // lead_capture is off
  })

  test('with nothing enabled only the capability-free escape hatch remains', async () => {
    const { supabase } = setup(baseTables({ organization_capabilities: { rows: [] } }))
    const tools = await getToolDefinitionsForAgent(supabase, ORG, AGENT)

    expect(tools.map((tool) => tool.name)).toEqual(['request_human_handoff'])
  })

  test('an agent policy can hide an otherwise enabled tool', async () => {
    const { supabase } = setup(
      baseTables({
        agent_tool_policies: {
          rows: [{ agent_id: AGENT, tool_name: 'create_appointment', is_allowed: false, requires_confirmation: true }],
        },
      })
    )
    const tools = await getToolDefinitionsForAgent(supabase, ORG, AGENT)

    expect(tools.map((tool) => tool.name)).not.toContain('create_appointment')
  })
})

describe('capability enforcement at execution time', () => {
  test('a disabled capability blocks the tool even if the model asks for it', async () => {
    const { db, supabase } = setup(baseTables({ organization_capabilities: { rows: [] } }))

    const result = await executeTool('find_available_slots', { date: '2026-03-02' }, context(supabase))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('disabled')
    expect(db.tool_executions.rows?.[0]?.status).toBe('blocked')
  })

  test('a disabled capability blocks a write even when the agent policy allows it', async () => {
    const { db, supabase } = setup(
      baseTables({
        organization_capabilities: { rows: [capability('appointments', false)] },
        agent_tool_policies: {
          rows: [{ agent_id: AGENT, tool_name: 'create_appointment', is_allowed: true, requires_confirmation: true }],
        },
      })
    )

    const result = await executeTool(
      'create_appointment',
      { phone: '+15550001', service_id: 'svc-1', starts_at: '2026-03-02T09:00:00.000Z' },
      context(supabase),
      { confirmed: true }
    )

    expect(result.ok).toBe(false)
    expect(db.appointments.rows?.length).toBe(0)
    expect(db.tool_executions.rows?.[0]?.status).toBe('blocked')
  })

  test('an agent policy denial blocks the tool', async () => {
    const { db, supabase } = setup(
      baseTables({
        organization_capabilities: { rows: [capability('appointments')] },
        agent_tool_policies: {
          rows: [{ agent_id: AGENT, tool_name: 'find_available_slots', is_allowed: false, requires_confirmation: false }],
        },
      })
    )

    const result = await executeTool('find_available_slots', { date: '2026-03-02' }, context(supabase))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('not allowed')
    expect(db.tool_executions.rows?.[0]?.status).toBe('blocked')
  })

  test('an unknown tool is rejected outright', async () => {
    const { db, supabase } = setup(baseTables())

    const result = await executeTool('delete_everything', {}, context(supabase))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Unknown tool')
    expect(db.tool_executions.rows?.length).toBe(0)
  })
})

describe('confirmation-gated writes', () => {
  const args = { phone: '+15550001', service_id: 'svc-1', starts_at: '2026-03-02T09:00:00.000Z' }

  test('a sensitive write waits for confirmation and does not execute', async () => {
    const { db, supabase } = setup(baseTables())

    const result = await executeTool('create_appointment', args, context(supabase))

    expect(result.ok).toBe(true)
    if (result.ok) expect((result.result as { confirmationRequired?: boolean }).confirmationRequired).toBe(true)
    expect(db.appointments.rows?.length).toBe(0)
    expect(db.tool_executions.rows?.[0]?.status).toBe('confirmation_required')
  })

  test('the pending action is stored server-side with the arguments to replay', async () => {
    const { db, supabase } = setup(baseTables())

    await executeTool('create_appointment', args, context(supabase))

    const pending = db.pending_actions.rows?.[0]
    expect(pending?.status).toBe('pending')
    expect(pending?.tool_name).toBe('create_appointment')
    expect(pending?.arguments).toEqual(args)
    expect(pending?.conversation_id).toBe(CONVERSATION)
    expect(db.conversations.rows?.[0]?.state).toBe('action_pending')
  })

  test('the stored action executes exactly once when the customer confirms', async () => {
    const { db, supabase } = setup(baseTables())
    const ctx = context(supabase)

    await executeTool('create_appointment', args, ctx)
    const executed = await executeTool('create_appointment', args, ctx, { confirmed: true })

    expect(executed.ok).toBe(true)
    expect(db.appointments.rows?.length).toBe(1)
    expect(db.appointments.rows?.[0]?.status).toBe('confirmed')
    expect(db.leads.rows?.[0]?.status).toBe('booked')
  })

  test('an agent policy can raise confirmation for a tool the registry lets through', async () => {
    const { db, supabase } = setup(
      baseTables({
        organization_capabilities: { rows: [capability('lead_capture')] },
        agent_tool_policies: {
          rows: [{ agent_id: AGENT, tool_name: 'get_customer', is_allowed: true, requires_confirmation: true }],
        },
      })
    )

    const result = await executeTool('get_customer', { phone: '+15550001' }, context(supabase))

    expect(result.ok).toBe(true)
    if (result.ok) expect((result.result as { confirmationRequired?: boolean }).confirmationRequired).toBe(true)
    expect(db.pending_actions.rows?.length).toBe(1)
  })

  test('a confirmation-gated write refuses without conversation context', async () => {
    const { db, supabase } = setup(baseTables())

    const result = await executeTool('create_appointment', args, context(supabase, { conversationId: null }))

    expect(result.ok).toBe(false)
    expect(db.pending_actions.rows?.length).toBe(0)
  })
})

describe('human handoff tool', () => {
  test('pausing AI is recorded on the conversation and in the audit ledger', async () => {
    const { db, supabase } = setup(baseTables({ organization_capabilities: { rows: [] } }))

    const result = await executeTool('request_human_handoff', { reason: 'pricing_question' }, context(supabase))

    expect(result.ok).toBe(true)
    const conversation = db.conversations.rows?.[0]
    expect(conversation?.ai_enabled).toBe(false)
    expect(conversation?.status).toBe('handed_off')
    expect(conversation?.state).toBe('human_handoff')
    expect(conversation?.handoff_reason).toBe('pricing_question')
    expect(db.audit_events.rows?.[0]?.action).toBe('conversation.handoff_requested')
  })

  test('handoff requires an existing conversation', async () => {
    const { supabase } = setup(baseTables())

    const result = await executeTool('request_human_handoff', {}, context(supabase, { conversationId: null }))

    expect(result.ok).toBe(false)
  })
})

describe('actor authorisation', () => {
  test('no shipped tool is reachable by an actor it does not list', async () => {
    // 'system' is deliberately absent from every policy, so a plain system actor must not be
    // able to reach any of them — including the write tools.
    for (const name of Object.keys(TOOL_POLICIES)) {
      expect(isActorAllowed(TOOL_POLICIES[name], 'system')).toBe(false)
    }

    const { supabase } = setup(baseTables())
    const result = await executeTool('create_appointment', {
      phone: '+15550001', service_id: 'svc-1', starts_at: '2026-03-02T09:00:00.000Z',
    }, context(supabase, { actor: 'system' }))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('not allowed')
  })

  test('an actor refusal is recorded before any capability or confirmation work', async () => {
    const { supabase, db } = setup(baseTables())

    await executeTool('create_appointment', {
      phone: '+15550001', service_id: 'svc-1', starts_at: '2026-03-02T09:00:00.000Z',
    }, context(supabase, { actor: 'system' }))

    const executions = db.tool_executions.rows
    expect(executions).toHaveLength(1)
    expect(executions[0].status).toBe('blocked')
    // A refused call must not have queued anything for confirmation.
    expect(db.pending_actions.rows).toHaveLength(0)
  })

  test('the agent is allowed to invoke its declared tools', () => {
    for (const policy of Object.values(TOOL_POLICIES)) {
      expect(isActorAllowed(policy, 'agent')).toBe(true)
    }
  })
})

describe('slot lookup', () => {
  test('never invents availability when the business is closed that day', async () => {
    const { supabase } = setup(
      baseTables({
        business_hours: { rows: [{ organization_id: ORG, day_of_week: 1, open_time: '09:00', close_time: '17:00', is_closed: true }] },
      })
    )

    const result = await executeTool('find_available_slots', { date: '2026-03-02', service_id: 'svc-1' }, context(supabase))

    expect(result.ok).toBe(true)
    if (result.ok) expect((result.result as { slots: unknown[] }).slots).toEqual([])
  })
})
