export type PlanLimits = {
  channels: number
  voice_minutes: number
  ai_messages: number
  automation_runs: number
  campaign_sends: number
  /** Hard daily cap on AI replies (null/absent = no daily cap). */
  ai_messages_daily?: number | null
  /** Media items (images/voice/files) analyzed per month across all channels. */
  media_monthly?: number | null
  /** Max image/file size in MB. */
  media_max_mb?: number
  /** Max voice-note length in seconds. */
  audio_max_seconds?: number
  /** 1 = PDF/TXT/CSV analysis allowed, 0 = blocked with a fixed reply. */
  document_analysis?: number
  /** Customer input characters passed to the model. */
  max_input_chars?: number
  /** Output token cap (null/absent = channel default). */
  max_output_tokens?: number | null
  /** AI calls per minute per contact (anti-flood). */
  flood_per_minute?: number
}

export type BillingCycle = 'monthly' | 'yearly'

export type PlanCode = 'trial' | 'starter' | 'growth' | 'pro'

export const PLAN_CATALOG = [
  {
    code: 'trial',
    name: 'المجانية',
    nameEn: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    featured: false,
    description: 'جرّب KAYAN AI وابدأ بتنظيم استقبال عملائك.',
    limits: {
      channels: 1,
      voice_minutes: 30,
      ai_messages: 40,
      automation_runs: 50,
      campaign_sends: 50,
      ai_messages_daily: 10,
      media_monthly: 5,
      media_max_mb: 2,
      audio_max_seconds: 30,
      document_analysis: 0,
      max_input_chars: 500,
      max_output_tokens: 350,
      flood_per_minute: 4,
    },
  },
  {
    code: 'starter',
    name: 'البداية',
    nameEn: 'Starter',
    monthlyPrice: 9,
    annualPrice: 90,
    featured: false,
    description: 'للأنشطة الصغيرة التي تريد استقبالاً ذكياً بتكلفة منخفضة.',
    limits: {
      channels: 2,
      voice_minutes: 100,
      ai_messages: 1000,
      ai_messages_daily: null,
      media_monthly: null,
      media_max_mb: 5,
      audio_max_seconds: 60,
      document_analysis: 1,
      max_input_chars: 2000,
      max_output_tokens: null,
      flood_per_minute: 4,
      automation_runs: 200,
      campaign_sends: 200,
    },
  },
  {
    code: 'growth',
    name: 'الاحترافية',
    nameEn: 'Pro',
    monthlyPrice: 29,
    annualPrice: 290,
    featured: true,
    description: 'للشركات التي تدير محادثات وعملاء وحملات بشكل مستمر.',
    limits: {
      channels: 5,
      voice_minutes: 500,
      ai_messages: 5000,
      ai_messages_daily: null,
      media_monthly: null,
      media_max_mb: 5,
      audio_max_seconds: 60,
      document_analysis: 1,
      max_input_chars: 2000,
      max_output_tokens: null,
      flood_per_minute: 4,
      automation_runs: 1000,
      campaign_sends: 2000,
    },
  },
  {
    code: 'pro',
    name: 'الأعمال',
    nameEn: 'Business',
    monthlyPrice: 59,
    annualPrice: 590,
    featured: false,
    description: 'للأعمال ذات حجم التشغيل المرتفع والفِرق الأكبر.',
    limits: {
      channels: 10,
      voice_minutes: 2000,
      ai_messages: 20000,
      ai_messages_daily: null,
      media_monthly: null,
      media_max_mb: 5,
      audio_max_seconds: 60,
      document_analysis: 1,
      max_input_chars: 2000,
      max_output_tokens: null,
      flood_per_minute: 4,
      automation_runs: 5000,
      campaign_sends: 10000,
    },
  },
] as const satisfies readonly {
  code: PlanCode
  name: string
  nameEn: string
  monthlyPrice: number
  annualPrice: number
  featured: boolean
  description: string
  limits: PlanLimits
}[]

export const PLAN_LIMITS_BY_CODE: Record<PlanCode, PlanLimits> = {
  trial: PLAN_CATALOG[0].limits,
  starter: PLAN_CATALOG[1].limits,
  growth: PLAN_CATALOG[2].limits,
  pro: PLAN_CATALOG[3].limits,
}

export function getPlanPrice(
  planCode: PlanCode,
  cycle: BillingCycle
): number {
  const plan = PLAN_CATALOG.find((item) => item.code === planCode)
  if (!plan) throw new Error('unknown_plan')
  return cycle === 'yearly' ? plan.annualPrice : plan.monthlyPrice
}

/** Arabic feature lines for media/fair-use limits shown on /pricing and billing. */
export function mediaLimitLines(limits: PlanLimits): string[] {
  const lines: string[] = []
  if (limits.ai_messages_daily) lines.push(`حد يومي ${limits.ai_messages_daily} ردود ذكية`)
  lines.push(limits.media_monthly ? `${limits.media_monthly} وسائط شهرياً (صور أو صوت)` : 'تحليل الصور والرسائل الصوتية')
  lines.push(`صوت حتى ${limits.audio_max_seconds ?? 60} ثانية · ملفات حتى ${limits.media_max_mb ?? 5} ميجابايت`)
  lines.push(limits.document_analysis === 0 ? 'تحليل الملفات (PDF) غير متاح' : 'تحليل ملفات PDF وTXT وCSV')
  return lines
}
