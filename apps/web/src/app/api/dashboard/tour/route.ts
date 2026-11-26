import { NextResponse } from 'next/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { dashboardTour, parseTourProgress, restoreTourProgress, TOUR_VERSION } from '@/lib/dashboard/tour'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

export async function GET() {
  const context = await getDashboardContext()
  if (!context) return json({ error: 'unauthorized' }, 401)
  const { track, steps } = dashboardTour(context)
  const db = await createClient()
  const { data, error } = await db.from('dashboard_tour_progress').select('step_id, status')
    .eq('organization_id', context.organizationId).eq('user_id', context.userId)
    .eq('tour_version', TOUR_VERSION).eq('track', track).maybeSingle()
  if (error) return json({ error: 'tour_load_failed' }, 500)
  return json({ progress: restoreTourProgress(data ? { stepId: data.step_id, status: data.status } : null, steps) })
}

export async function PUT(request: Request) {
  const context = await getDashboardContext()
  if (!context) return json({ error: 'unauthorized' }, 401)
  const { track, steps } = dashboardTour(context)
  const progress = parseTourProgress(await request.json().catch(() => null), steps)
  if (!progress) return json({ error: 'invalid_tour_progress' }, 400)
  const db = await createClient()
  const { error } = await db.from('dashboard_tour_progress').upsert({
    organization_id: context.organizationId, user_id: context.userId,
    tour_version: TOUR_VERSION, track, step_id: progress.stepId, status: progress.status,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,user_id,tour_version,track' })
  if (error) return json({ error: 'tour_save_failed' }, 500)
  return json({ progress })
}
