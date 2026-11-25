export const CSAT_CHOICES = [
  { value: 'excellent', title: 'ممتاز' },
  { value: 'good', title: 'جيد' },
  { value: 'needs_improvement', title: 'يحتاج تحسين' },
] as const

export function csatButtons(surveyId: string) {
  return CSAT_CHOICES.map(choice => ({ id: `kayan_csat:${surveyId}:${choice.value}`, title: choice.title }))
}

export function readCsatReply(message: Record<string, unknown>) {
  if (message.type !== 'interactive') return null
  const reply = (message.interactive as { button_reply?: { id?: unknown } } | null)?.button_reply?.id
  if (typeof reply !== 'string' || !reply.startsWith('kayan_csat:')) return null
  const [, surveyId, value, extra] = reply.split(':')
  const choice = CSAT_CHOICES.find(item => item.value === value)
  if (extra !== undefined || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(surveyId ?? '') || !choice) return null
  return { surveyId, rating: choice.value }
}
