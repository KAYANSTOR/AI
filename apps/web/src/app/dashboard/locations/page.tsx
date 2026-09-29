import { redirect } from 'next/navigation'
import { requireMember } from '@/lib/capabilities/guard'
import { LocationsManager, type LocationRow } from './locations-manager'

export default async function LocationsPage() {
  const ctx = await requireMember().catch(() => null)
  if (!ctx) redirect('/login')

  const { data } = ctx.businessId
    ? await ctx.supabase
        .from('business_locations')
        .select('id, name, address, timezone, is_active, metadata')
        .eq('business_id', ctx.businessId)
        .order('created_at')
    : { data: [] }

  const canManage = ctx.role === 'owner' || ctx.role === 'admin'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">الفروع</h1>
        <p className="mt-1 text-sm text-muted">
          الفروع تُربط بالنشاط، ويمكن ربط القنوات بفرع محدد لاحقًا. تعطيل الفرع يحفظ تاريخه
          ولا يحذفه.
        </p>
      </div>

      {!ctx.businessId && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          أكمل إعداد النشاط أولًا حتى تصبح الفروع مرتبطة به.
        </div>
      )}

      <LocationsManager rows={(data ?? []) as LocationRow[]} canManage={canManage} />
    </div>
  )
}
