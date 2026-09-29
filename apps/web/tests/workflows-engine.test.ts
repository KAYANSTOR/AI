import { describe, expect, test } from 'bun:test'

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
