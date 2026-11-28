/**
 * OPS-007 — operational p50/p95 from the durable metrics the inbound worker writes.
 *
 * This reads real `public.inbound_jobs` rows through the service-role client and is
 * therefore an OPERATIONAL measurement, unlike scripts/measure-ext-005-latency.ts
 * (synthetic in-memory baseline). Run it where DATABASE_URL/service credentials exist:
 *
 *   cd apps/web && bun run scripts/report-inbound-metrics.ts
 *   METRICS_HOURS=24 METRICS_LIMIT=2000 bun run scripts/report-inbound-metrics.ts
 *
 * It prints only aggregate numbers and delivery/dedupe counts. No phone, message
 * text or credential is selected.
 */
import { createAdminClient } from '@/lib/db/admin'
import { summarizeInboundJobMetrics, type InboundMetricRow } from '@/lib/runtime/metrics'

async function main() {
  const hours = Math.max(1, Math.min(24 * 30, Number(process.env.METRICS_HOURS ?? 24)))
  const limit = Math.max(1, Math.min(5000, Number(process.env.METRICS_LIMIT ?? 1000)))
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  const db = createAdminClient()

  const { data, error } = await db
    .from('inbound_jobs')
    .select('queue_wait_ms,processing_duration_ms,model_duration_ms,outbound_duration_ms,delivery_status,deduplication_result,retry_count')
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('inbound_metrics_report_failed', { reason: error.message.slice(0, 200) })
    process.exitCode = 1
    return
  }

  const summary = summarizeInboundJobMetrics((data ?? []) as InboundMetricRow[])
  console.log(JSON.stringify({
    source: 'operational',
    window_hours: hours,
    rows: data?.length ?? 0,
    fields: summary.fields,
    delivery: summary.delivery,
    deduplication: summary.deduplication,
    retries: summary.retries,
  }, null, 2))
}

main().catch((error) => {
  console.error('inbound_metrics_report_failed', { reason: error instanceof Error ? error.message.slice(0, 200) : 'report_error' })
  process.exit(1)
})
