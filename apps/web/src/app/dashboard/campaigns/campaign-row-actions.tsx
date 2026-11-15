'use client'

import { useState, useTransition } from 'react'
import { pauseCampaignAction, startCampaignAction } from './actions'

export function CampaignRowActions({
  campaignId,
  status,
}: {
  campaignId: string
  status: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const canStart = ['draft', 'scheduled', 'paused'].includes(status)
  const canPause = status === 'running'

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {canStart ? (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            onClick={() =>
              start(async () => {
                setError(null)
                const r = await startCampaignAction(campaignId)
                if (!r.ok) setError(r.error)
              })
            }
          >
            بدء
          </button>
        ) : null}
        {canPause ? (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-text disabled:opacity-50"
            onClick={() =>
              start(async () => {
                setError(null)
                const r = await pauseCampaignAction(campaignId)
                if (!r.ok) setError(r.error)
              })
            }
          >
            إيقاف
          </button>
        ) : null}
      </div>
      {error ? <p className="max-w-[12rem] text-[11px] text-error">{error}</p> : null}
    </div>
  )
}
