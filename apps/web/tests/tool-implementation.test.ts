import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase, holidayAwareHoursRpc, type FakeDb } from './support/fake-supabase'
import { TOOL_POLICIES } from '@/lib/ai/registry'
import { executeTool, getToolDefinitionsForAgent } from '@/lib/ai/tools'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const BIZ = 'aaaaaaaa-0000-4000-8000-0000000000b1'
const CONTACT = 'cccccccc-0000-4000-8000-000000000001'
const CONVERSATION = 'eeeeeeee-0000-4000-8000-000000000001'

/** Every capability the registry can gate on, switched on. */
const ALL_CAPABILITIES = [
  'lead_capture',
  'appointments',
  'quotes',
  'orders',
  'follow_up',
  'inbox',
  'knowledge_base',
]

function tables(): FakeDb {
  return {
    organization_capabilities: {
      rows: ALL_CAPABILITIES.map((capability_id) => ({
        organization_id: ORG,
        capability_id,
        is_enabled: true,
      })),
    },
    agent_tool_policies: { rows: [] },
    conversations: {
      rows: [{ id: CONVERSATION, organization_id: ORG, state: 'discovery', status: 'active' }],
    },
    contacts: { rows: [{ id: CONTACT, organization_id: ORG, phone: '+15550001', full_name: 'Customer' }] },
    contact_identities: { rows: [] },
    services: { rows: [] },
    appointments: { rows: [] },
    leads: { rows: [] },
    quotes: { rows: [] },
    quote_items: { rows: [] },
    orders: { rows: [] },
    order_items: { rows: [] },
    pending_actions: { rows: [] },
    tool_executions: { rows: [] },
    audit_events: { rows: [] },
    business_hours: { rows: [] },
    knowledge_base: { rows: [] },
  }
}

function setup() {
  const fake = createFakeSupabase(tables(), { holiday_aware_hours: (args) => holidayAwareHoursRpc(fake.db)(args) })
  return { db: fake.db, supabase: fake.client as unknown as SupabaseClient }
}

/**
 * A tool the registry advertises to the model must have a dispatcher entry. If it does not,
 * executeTool answers "has no implementation" for a tool the model was just told it could use,
 * which is an outage the customer sees as the agent being unable to do its job.
 */
describe('every advertised tool has an implementation', () => {
  test('no policy falls through the executor dispatch', async () => {
    for (const name of Object.keys(TOOL_POLICIES)) {
      const { supabase } = setup()

      // confirmed:true so a confirmation-gated write reaches the dispatcher instead of
      // stopping at the pending-action stage.
      const result = await executeTool(
        name,
        {},
        {
          supabase,
          organizationId: ORG,
          businessId: BIZ,
          conversationId: CONVERSATION,
          contactId: CONTACT,
          agentId: null,
          actor: 'agent',
        },
        { confirmed: true }
      )

      if (!result.ok) {
        expect(result.error).not.toContain('has no implementation')
        expect(result.error).not.toContain('Unknown tool')
      }
    }
  })

  test('quote and order tools are dispatched, not merely declared', async () => {
    for (const name of ['create_quote', 'create_order', 'convert_quote_to_order']) {
      expect(TOOL_POLICIES[name]).toBeDefined()

      const { supabase } = setup()
      const result = await executeTool(
        name,
        {},
        {
          supabase,
          organizationId: ORG,
          businessId: BIZ,
          conversationId: CONVERSATION,
          contactId: CONTACT,
          agentId: null,
          actor: 'agent',
        },
        { confirmed: true }
      )

      // Reaching the handler's own validation proves the entry exists.
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('required')
    }
  })

  test('the advertised tool list matches the policy registry exactly', async () => {
    const { supabase } = setup()
    const exposed = (await getToolDefinitionsForAgent(supabase, ORG, null)).map((tool) => tool.name)

    expect([...exposed].sort()).toEqual(Object.keys(TOOL_POLICIES).sort())
  })
})
