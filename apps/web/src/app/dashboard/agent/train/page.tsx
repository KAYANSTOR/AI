import Link from 'next/link'
import { loadAgentContext } from '../load-agent-context'
import { AgentTrainer } from '../agent-trainer'

export const dynamic = 'force-dynamic'

export default async function AgentTrainPage() {
  const data = await loadAgentContext()

  if (data.kind !== 'ok') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-text-muted">تعذّر تحميل الوكيل.</p>
        <Link href="/dashboard/agent" className="text-sm font-semibold text-secondary">
          العودة
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link href="/dashboard/agent" className="text-sm font-semibold text-secondary">
        ← الوكيل الذكي
      </Link>
      <AgentTrainer
        agentId={data.agentId}
        businessName={data.businessName}
        initialReadiness={data.readiness}
        consoleData={data.consoleData}
        initialProfile={data.initialProfile}
        view="train"
      />
    </div>
  )
}
