import { getCurrentOrg } from '@/lib/org'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, Clock, Wrench, Phone } from 'lucide-react'

export default async function SettingsPage() {
  const org = await getCurrentOrg()
  if (!org) redirect('/login')

  const supabase = await createClient()
  const [{ data: profile }, { count: servicesCount }, { count: hoursCount }] = await Promise.all([
    supabase.from('business_profiles').select('*').eq('organization_id', org.organizationId).maybeSingle(),
    supabase.from('services').select('*', { count: 'exact', head: true }).eq('organization_id', org.organizationId),
    supabase.from('business_hours').select('*', { count: 'exact', head: true }).eq('organization_id', org.organizationId),
  ])

  const cards = [
    { title: 'Business Profile', description: profile ? `${profile.industry ?? 'Not set'} · ${profile.timezone ?? 'UTC'}` : 'Set industry, timezone, and AI context', href: '/dashboard/settings/profile', icon: Building2, status: profile ? 'Configured' : 'Required' },
    { title: 'Services & Pricing', description: `${servicesCount ?? 0} services defined`, href: '/dashboard/services', icon: Wrench, status: (servicesCount ?? 0) > 0 ? 'Ready' : 'Add services' },
    { title: 'Business Hours', description: `${hoursCount ?? 0} day schedules`, href: '/dashboard/settings/hours', icon: Clock, status: (hoursCount ?? 0) >= 7 ? 'Complete' : 'Incomplete' },
    { title: 'Phone Forwarding', description: 'Connect existing number via Call Forwarding', href: '/dashboard/telephony', icon: Phone, status: 'Phase 2' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Configure {org.organizationName} for the AI receptionist.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Link key={card.href} href={card.href} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-lg bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <Icon size={22} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold text-slate-900">{card.title}</h2>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{card.status}</span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{card.description}</p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
