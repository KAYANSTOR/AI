import { describe, expect, test } from 'bun:test'
import { evaluateReplyGovernance } from '@/lib/ai/governance'

describe('reply governance', () => {
  test('allows normal reply', () => {
    const d = evaluateReplyGovernance({
      userText: 'أبي موعد غداً',
      reply: 'تمام، عندنا مواعيد متاحة غداً من 10 إلى 12.',
    })
    expect(d.action).toBe('allow')
    expect(d.confidence).toBeGreaterThan(0.5)
  })

  test('escalates sensitive topics', () => {
    const d = evaluateReplyGovernance({
      userText: 'أفكر بالانتحار',
      reply: 'أنا آسف لسماع ذلك.',
    })
    expect(d.action).toBe('escalate')
  })

  test('blocks prohibited medical guarantee claims', () => {
    const d = evaluateReplyGovernance({
      userText: 'هل العلاج مضمون؟',
      reply: 'نضمن الشفاء بالكامل خلال أسبوع.',
    })
    expect(d.action).toBe('block')
  })
})
