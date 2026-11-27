import { NextResponse } from 'next/server'
import { readProductionHealth } from '@/lib/runtime/production-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const health = await readProductionHealth()
  return NextResponse.json(health, {
    status: health.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
