import { describe, expect, test } from 'bun:test'
import { simulateWriteToolResult } from '@/lib/runtime/agent-runtime'

describe('agent preview write isolation', () => {
  test('simulation never returns a real appointment identifier', () => {
    const result = simulateWriteToolResult('create_appointment', {
      service_id: 'svc-1',
      starts_at: '2026-10-05T10:00:00.000Z',
    }) as { simulated?: boolean; appointmentId?: string }

    expect(result.simulated).toBe(true)
    expect(result.appointmentId).toBe('simulation-appointment')
  })

  test('all governed write tools are represented as simulation results', () => {
    const tools = [
      'create_appointment',
      'create_lead',
      'create_quote',
      'create_order',
      'convert_quote_to_order',
      'request_human_handoff',
    ]

    for (const name of tools) {
      const result = simulateWriteToolResult(name, {}) as { simulated?: boolean }
      expect(result.simulated).toBe(true)
    }
  })
})
