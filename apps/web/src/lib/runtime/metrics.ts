/**
 * OPS-007 — percentile helper shared by the synthetic measurement script and the
 * operational report. Values are milliseconds measured around explicit phases; the
 * caller must label whether they are synthetic or production observations.
 */
export type LatencySummary = {
  count: number
  p50: number
  p95: number
  mean: number
  min: number
  max: number
}

export function summarizeLatency(samples: number[]): LatencySummary {
  const clean = samples.filter((value) => Number.isFinite(value) && value >= 0)
  if (clean.length === 0) return { count: 0, p50: 0, p95: 0, mean: 0, min: 0, max: 0 }
  const sorted = [...clean].sort((a, b) => a - b)
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] ?? 0
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length
  return { count: sorted.length, p50: at(50), p95: at(95), mean, min: sorted[0] ?? 0, max: sorted[sorted.length - 1] ?? 0 }
}

export const INBOUND_METRIC_FIELDS = [
  'queue_wait_ms',
  'processing_duration_ms',
  'model_duration_ms',
  'outbound_duration_ms',
] as const

export type InboundMetricField = (typeof INBOUND_METRIC_FIELDS)[number]

export type InboundMetricRow = Partial<Record<InboundMetricField, number | null>> &
  Partial<Record<'delivery_status' | 'deduplication_result' | 'retry_count', unknown>>

/** Summarizes the measured latency columns; null phases are excluded, never zero-filled. */
export function summarizeInboundJobMetrics(rows: InboundMetricRow[]): {
  fields: Record<InboundMetricField, LatencySummary>
  delivery: Record<string, number>
  deduplication: Record<string, number>
  retries: LatencySummary
} {
  const fields = Object.fromEntries(
    INBOUND_METRIC_FIELDS.map((field) => [
      field,
      summarizeLatency(rows.map((row) => row[field]).filter((value): value is number => typeof value === 'number')),
    ])
  ) as Record<InboundMetricField, LatencySummary>

  const countBy = (key: 'delivery_status' | 'deduplication_result') => {
    const counts: Record<string, number> = {}
    for (const row of rows) {
      const value = row[key]
      if (typeof value !== 'string' || !value) continue
      counts[value] = (counts[value] ?? 0) + 1
    }
    return counts
  }

  return {
    fields,
    delivery: countBy('delivery_status'),
    deduplication: countBy('deduplication_result'),
    retries: summarizeLatency(
      rows.map((row) => row.retry_count).filter((value): value is number => typeof value === 'number')
    ),
  }
}
