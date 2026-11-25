import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { isSpecializedAgentKind, organizationAgentKind, SPECIALIZED_AGENTS } from '@/lib/personal-assistant/executive/specialized-agents'

async function selectAgent(formData: FormData) {
  'use server'
  const context = await getDashboardContext()
  const kind = formData.get('kind')
  if (!context || !['owner', 'admin'].includes(context.role) || !isSpecializedAgentKind(kind)) return
  if (kind === 'personal' && !context.personalAssistantEnabled) return
  const db = await createClient()
  const { error } = await db.from('organizations').update({ specialized_agent_kind: kind }).eq('id', context.organizationId)
  if (error) throw new Error('specialized_agent_update_failed')
  revalidatePath('/dashboard/agent/settings')
  revalidatePath('/dashboard/assistant')
}

export async function SpecializedAgentPanel() {
  const context = await getDashboardContext()
  if (!context) return null
  const db = await createClient()
  const selected = await organizationAgentKind(db, context.organizationId)
  const canSelect = ['owner', 'admin'].includes(context.role)
  return (
    <section aria-labelledby="specialized-agents" className="space-y-3" dir="rtl">
      <h2 id="specialized-agents" className="type-heading-3 text-primary-dark">الوكلاء المتخصصون</h2>
      {selected && canSelect ? <Link href="/dashboard/assistant" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-3 text-sm font-bold text-primary-dark">فتح {SPECIALIZED_AGENTS[selected].name}</Link> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(SPECIALIZED_AGENTS).map(([kind, profile]) => {
          const active = selected === kind
          return (
            <form action={selectAgent} key={kind} className="space-y-3 rounded-2xl border border-primary bg-white p-4 text-primary-dark">
              <input type="hidden" name="kind" value={kind} />
              <h3 className="font-bold" dir="ltr">{profile.name}</h3>
              <p className="text-sm leading-6">{profile.description}</p>
              <button type="submit" disabled={active || !canSelect || (kind === 'personal' && !context.personalAssistantEnabled)}
                className="min-h-11 w-full rounded-xl bg-accent px-3 text-sm font-bold text-primary-dark disabled:bg-primary">
                {active ? 'الوكيل المحدد' : kind === 'personal' && !context.personalAssistantEnabled ? 'يتطلب إضافة المساعد الشخصي' : `اختيار ${profile.name}`}
              </button>
            </form>
          )
        })}
      </div>
    </section>
  )
}
