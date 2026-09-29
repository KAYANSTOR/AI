export type GovernanceDecision =
  | { action: 'allow'; confidence: number; reasons: string[] }
  | { action: 'escalate'; confidence: number; reasons: string[] }
  | { action: 'block'; confidence: number; reasons: string[] }

const SENSITIVE_PATTERNS: RegExp[] = [
  /انتحار|أقتل نفسي|قتل نفسي/i,
  /انتحار|suicide|kill myself/i,
  /عنف|تهديد بالقتل|bomb/i,
  /رقم بطاقة|cvv|iban|تحويل بنكي كامل/i,
  /قاصر|طفل\s*\d{1,2}\s*سنة/i,
]

const PROHIBITED_CLAIM_PATTERNS: RegExp[] = [
  /ضمان\s*100\s*%|نضمن الشفاء|علاج مضمون/i,
  /نضمن الربح|استثمار مضمون بدون خسارة/i,
  /نحن معتمدون من وزارة(?!\s)/i,
]

const UNCERTAIN_MARKERS: RegExp[] = [
  /لست متأكد|لا أعرف|غير متأكد|ربما|قد يكون|I('m| am) not sure|I don't know/i,
  /\?{2,}/,
]

/**
 * Heuristic governance before a model reply is delivered to the customer.
 * Not a substitute for model-side safety; fails closed on sensitive topics.
 */
export function evaluateReplyGovernance(input: {
  userText: string
  reply: string
  minConfidence?: number
}): GovernanceDecision {
  const reasons: string[] = []
  let confidence = 0.82

  for (const re of SENSITIVE_PATTERNS) {
    if (re.test(input.userText) || re.test(input.reply)) {
      reasons.push('sensitive_topic')
      return { action: 'escalate', confidence: 0.2, reasons }
    }
  }

  for (const re of PROHIBITED_CLAIM_PATTERNS) {
    if (re.test(input.reply)) {
      reasons.push('prohibited_claim')
      return { action: 'block', confidence: 0.15, reasons }
    }
  }

  for (const re of UNCERTAIN_MARKERS) {
    if (re.test(input.reply)) {
      confidence -= 0.25
      reasons.push('uncertainty_marker')
    }
  }

  if (input.reply.trim().length < 8) {
    confidence -= 0.2
    reasons.push('very_short_reply')
  }

  if (input.reply.length > 2500) {
    confidence -= 0.1
    reasons.push('overlong_reply')
  }

  confidence = Math.max(0, Math.min(1, confidence))
  const min = input.minConfidence ?? 0.45

  if (confidence < min) {
    reasons.push('low_confidence')
    return { action: 'escalate', confidence, reasons }
  }

  return { action: 'allow', confidence, reasons }
}

export function staffHandoffNotice(locale: 'ar' | 'en' = 'ar'): string {
  return locale === 'ar'
    ? 'تم تحويل محادثتك إلى أحد أعضاء الفريق للمتابعة. شكرًا لصبرك.'
    : 'Your conversation was transferred to a team member. Thank you for your patience.'
}
