import { describe, expect, test } from 'bun:test'
import { parseWorkflowDefinition } from '@/lib/workflows/engine'

// Pure helpers mirrored from engine resolution rules for unit coverage without DB.
type Node = {
  id: string
  type: string
  next?: string | null
  onTrue?: string | null
  onFalse?: string | null
  config?: Record<string, unknown>
}

function resolveNext(node: Node, branch?: boolean): string | null {
  if (node.type === 'condition') {
    return branch ? node.onTrue ?? null : node.onFalse ?? null
  }
  return node.next ?? null
}

function evalCondition(config: Record<string, unknown> | undefined, context: Record<string, unknown>) {
  const field = String(config?.field ?? '')
  const op = String(config?.op ?? 'eq')
  const expected = config?.value
  const actual = context[field]
  switch (op) {
    case 'eq':
      return actual === expected
    case 'exists':
      return actual != null && actual !== ''
    default:
      return false
  }
}

describe('workflow engine pure rules', () => {
  test('condition branches', () => {
    const node: Node = {
      id: 'c1',
      type: 'condition',
      onTrue: 'a',
      onFalse: 'b',
      config: { field: 'status', op: 'eq', value: 'won' },
    }
    expect(evalCondition(node.config, { status: 'won' })).toBe(true)
    expect(resolveNext(node, true)).toBe('a')
    expect(resolveNext(node, false)).toBe('b')
  })

  test('linear next', () => {
    expect(resolveNext({ id: '1', type: 'action', next: '2' })).toBe('2')
    expect(resolveNext({ id: '1', type: 'stop' })).toBe(null)
  })
})

// These call the real engine parser rather than a copy of its rules, so a jsonb column holding
// something unexpected cannot turn into a TypeError inside a workflow run again.
describe('workflow definition read from jsonb', () => {
  test('reads a well-formed definition', () => {
    const definition = parseWorkflowDefinition({
      nodes: [
        { id: 't', type: 'trigger' },
        { id: 's', type: 'stop' },
      ],
      edges: [{ from: 't', to: 's' }],
    })

    expect(definition.nodes.map((node) => node.id)).toEqual(['t', 's'])
    expect(definition.edges).toEqual([{ from: 't', to: 's' }])
  })

  test('a definition without an array of nodes is rejected, not mapped over', () => {
    const malformed: unknown[] = [
      undefined,
      null,
      {},
      { nodes: null },
      { nodes: {} },
      { nodes: 'trigger,stop' },
      { nodes: [] },
      { nodes: [null, 42, 'trigger'] },
      // A node with an unknown type would silently change what a run does.
      { nodes: [{ id: 'x', type: 'explode' }] },
    ]

    for (const value of malformed) {
      expect(() => parseWorkflowDefinition(value)).toThrow('workflow_definition_invalid')
    }
  })

  test('malformed nodes are dropped instead of poisoning the whole definition', () => {
    const definition = parseWorkflowDefinition({
      nodes: [{ id: 'ok', type: 'stop' }, { id: 'bad', type: 'not-a-node-type' }, 7],
    })

    expect(definition.nodes.map((node) => node.id)).toEqual(['ok'])
  })

  test('malformed edges are dropped without discarding the nodes', () => {
    const definition = parseWorkflowDefinition({
      nodes: [{ id: 'stop', type: 'stop' }],
      edges: [{ from: 'a', to: 'b' }, { from: 1 }, 'nope'],
    })

    expect(definition.nodes).toHaveLength(1)
    expect(definition.edges).toEqual([{ from: 'a', to: 'b' }])
  })
})
