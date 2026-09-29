import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { CreditCard, Zap, Server, Shield } from 'lucide-react'
import { formatNumber } from '@/lib/i18n/format'
import { ar } from '@/lib/i18n/ar'

export default async function BillingPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const supabase = await createClient()

  // Fetch subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*, plans(*)')
    .eq('organization_id', context.organizationId)
    .single()

  // Fetch usage meters
  const { data: usageMeters } = await supabase
    .from('usage_meters')
    .select('*')
    .eq('organization_id', context.organizationId)

  const activePlan = subscription?.plans || {
    name: 'Trial',
    code: 'trial',
    limits: { ai_messages: 100, voice_minutes: 30, channels: 1 },
    monthly_price: 0
  }

  const aiMessagesUsed = usageMeters?.find(m => m.meter_key === 'ai_messages')?.consumed_value || 0
  const aiMessagesLimit = activePlan.limits.ai_messages || 100
  
  const voiceMinutesUsed = usageMeters?.find(m => m.meter_key === 'voice_minutes')?.consumed_value || 0
  const voiceMinutesLimit = activePlan.limits.voice_minutes || 30

  const aiPercent = Math.min(100, Math.round((aiMessagesUsed / aiMessagesLimit) * 100))
  const voicePercent = Math.min(100, Math.round((voiceMinutesUsed / voiceMinutesLimit) * 100))

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">الباقات والاستهلاك</h1>
        <p className="mt-1 text-sm text-text-muted">
          إدارة اشتراكك ومراقبة استهلاك الموارد وحصص الاستخدام.
        </p>
      </div>

      {/* Subscription Card */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-light/40">
              <CreditCard className="text-primary-dark" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-text-muted">الباقة الحالية</p>
              <h2 className="text-xl font-bold text-text flex items-center gap-2">
                {activePlan.name}
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                  {subscription?.status === 'active' ? 'نشط' : (subscription?.status === 'trial' ? 'فترة تجريبية' : 'تجريبي')}
                </span>
              </h2>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-text-muted">التكلفة الشهرية</p>
            <p className="text-2xl font-bold text-text">{activePlan.monthly_price} <span className="text-sm font-normal">ر.س</span></p>
          </div>
        </div>
        
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            ترقية الباقة
          </button>
          <button className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover transition-colors">
            تحديث طريقة الدفع
          </button>
        </div>
      </div>

      {/* Usage Meters */}
      <div>
        <h3 className="text-lg font-bold text-text mb-4">الاستهلاك الشهري (Meters)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* AI Messages Meter */}
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                  <Zap size={20} />
                </div>
                <div>
                  <h4 className="font-semibold text-text">رسائل الذكاء الاصطناعي</h4>
                  <p className="text-xs text-text-muted">تُستهلك عند رد الوكيل الذكي</p>
                </div>
              </div>
              <span className="text-sm font-bold text-text">{aiPercent}%</span>
            </div>
            
            <div className="h-2 w-full bg-border rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${aiPercent > 90 ? 'bg-red-500' : 'bg-purple-500'}`} 
                style={{ width: `${aiPercent}%` }}
              ></div>
            </div>
            <div className="mt-2 flex justify-between text-xs text-text-muted font-medium">
              <span>{formatNumber(aiMessagesUsed)} مستخدم</span>
              <span>{formatNumber(aiMessagesLimit)} كحد أقصى</span>
            </div>
          </div>

          {/* Voice Minutes Meter */}
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                  <Server size={20} />
                </div>
                <div>
                  <h4 className="font-semibold text-text">دقائق المكالمات الصوتية</h4>
                  <p className="text-xs text-text-muted">للوكلاء الصوتيين والرد الآلي</p>
                </div>
              </div>
              <span className="text-sm font-bold text-text">{voicePercent}%</span>
            </div>
            
            <div className="h-2 w-full bg-border rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${voicePercent > 90 ? 'bg-red-500' : 'bg-blue-500'}`} 
                style={{ width: `${voicePercent}%` }}
              ></div>
            </div>
            <div className="mt-2 flex justify-between text-xs text-text-muted font-medium">
              <span>{formatNumber(voiceMinutesUsed)} مستخدم</span>
              <span>{formatNumber(voiceMinutesLimit)} كحد أقصى</span>
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}
