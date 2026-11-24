import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db/admin'
import type { DbClient } from '@/lib/db/client'
import { getDashboardContext } from '@/lib/dashboard/context'
import { trainingChecklist, type TrainingTarget } from './checklists'
import type { Owner } from './submissions'

type TrainerContextInput = {
  userId: string
  organizationId: string
  role: string
  businessTypeId: string | null
  enabledCapabilities: string[]
  personalAssistantEnabled: boolean
}

export type TrainerApiContext = { admin: DbClient; owner: Owner; verticalId: string | null; target: TrainingTarget }

/**
 * 401 signed out; 403 unless the caller is owner/admin of the org AND the destination is
 * enabled (knowledge_base capability for business sectors, the personal-assistant sector
 * for memory). The server resolves the org and sector itself; nothing comes from the client.
 */
export async function requireTrainerApi(overrides: {
  getContext?: () => Promise<TrainerContextInput | null>
  adminDb?: () => DbClient
} = {}): Promise<TrainerApiContext | NextResponse> {
  const context = await (overrides.getContext ?? getDashboardContext)()
  if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (context.role !== 'owner' && context.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden', message: 'تدريب الوكيل متاح لمالك النشاط أو المدير فقط.' }, { status: 403 })
  }
  const { vertical, target } = trainingChecklist(context.businessTypeId)
  const allowed = target === 'memory' ? context.personalAssistantEnabled : context.enabledCapabilities.includes('knowledge_base')
  if (!allowed) return NextResponse.json({ error: 'capability_disabled', message: 'قاعدة المعرفة غير مفعّلة لحسابك.' }, { status: 403 })
  return {
    admin: (overrides.adminDb ?? createAdminClient)(),
    owner: { organizationId: context.organizationId, userId: context.userId },
    verticalId: vertical.id,
    target,
  }
}
