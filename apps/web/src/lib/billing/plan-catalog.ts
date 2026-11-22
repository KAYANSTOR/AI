export type PlanLimits = {
  channels: number
  voice_minutes: number
  ai_messages: number
  automation_runs: number
  campaign_sends: number
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
      ai_messages: 100,
      automation_runs: 50,
      campaign_sends: 50,
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
