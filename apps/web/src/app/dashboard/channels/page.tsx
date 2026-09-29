import { redirect } from 'next/navigation'
import { Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/org'
import { CHANNEL_SPECS } from '@/lib/channels/management'
import { ChannelCard, type ChannelCardData } from './channel-card'

export const dynamic = 'force-dynamic'

type ChannelRow = {
  id: string
  channel_type: string
  provider_account_id: string | null
  external_identifier: string | null
  verification_status: string | null
  is_active: boolean | null
}

export default async function ChannelsPage() {
  const org = await getCurrentOrg()
  if (!org) redirect('/login')

  const supabase = await createClient()
  const [{ data: rows, error }, { data: business }] = await Promise.all([
    supabase
      .from('channels')
      .select('id, channel_type, provider_account_id, external_identifier, verification_status, is_active')
      .eq('organization_id', org.organizationId),
    supabase
      .from('businesses')
      .select('id, name')
      .eq('organization_id', org.organizationId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const byType = new Map((rows ?? []).map((row) => [row.channel_type as string, row as ChannelRow]))
  const canManage = org.role === 'owner' || org.role === 'admin'

  const cards: ChannelCardData[] = CHANNEL_SPECS.map((spec) => {
    const row = byType.get(spec.type)
    return {
      spec,
      identifier: row?.provider_account_id ?? row?.external_identifier ?? null,
      publicNumber: spec.publicNumberLabel ? (row?.external_identifier ?? null) : null,
      isActive: row?.is_active === true,
      connected: Boolean(row?.id),
      verificationStatus: row?.verification_status ?? null,
    }
  })

  const activeCount = cards.filter((card) => card.connected && card.isActive).length

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-text">القنوات</h1>
        <p className="text-sm text-text-muted">
          اربط القنوات التي يتواصل بها عملاؤك. كل قناة تُوجَّه إلى شركتك بمعرّفها الصريح فقط، فلا تصل
          رسالة إلى شركة أخرى.
        </p>
      </header>

      {!canManage && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          إدارة القنوات متاحة للمالك أو المسؤول. يمكنك الاطلاع على الحالة فقط.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-text">
          تعذّر تحميل القنوات: {error.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryTile label="قنوات مُفعّلة" value={String(activeCount)} />
        <SummaryTile label="قنوات مربوطة" value={String(cards.filter((card) => card.connected).length)} />
        <SummaryTile label="النشاط" value={business?.name ?? 'غير مُهيّأ'} />
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-info/40 bg-info/5 px-4 py-3 text-xs leading-relaxed text-text">
        <Info size={16} className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
        <span>
          هذه الصفحة تحفظ <strong>معرّفات الربط</strong> فقط ولا تحفظ أي مفاتيح سرية، فتظهر أسرار
          المزوّدين في الواجهة الخلفية حصرًا ولا تصل إلى المتصفح ولا إلى سياق الذكاء الاصطناعي.
        </span>
      </p>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {cards.map((card) => (
          <ChannelCard key={card.spec.type} data={card} />
        ))}
      </div>
    </div>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 truncate text-xl font-bold tracking-tight text-text">{value}</p>
    </div>
  )
}
