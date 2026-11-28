import { describe, expect, test } from 'bun:test'
import { summarizeInboundJobMetrics, summarizeLatency } from '@/lib/runtime/metrics'

/** OPS-007 — percentiles exclude unmeasured phases instead of zero-filling them. */
describe('OPS-007 operational metric summaries', () => {
  test('p50/p95 use nearest-rank on the measured samples', () => {
    const summary = summarizeLatency([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    expect(summary.count).toBe(10)
    expect(summary.p50).toBe(50)
    expect(summary.p95).toBe(100)
    expect(summary.min).toBe(10)
    expect(summary.max).toBe(100)
  })

  test('empty and invalid samples are reported as zero count', () => {
    expect(summarizeLatency([])).toEqual({ count: 0, p50: 0, p95: 0, mean: 0, min: 0, max: 0 })
    expect(summarizeLatency([Number.NaN, -1]).count).toBe(0)
  })

  test('null phases are not counted as zero-latency observations', () => {
    const summary = summarizeInboundJobMetrics([
      { queue_wait_ms: 100, model_duration_ms: null, delivery_status: 'sent', deduplication_result: 'unique', retry_count: 0 },
      { queue_wait_ms: 300, model_duration_ms: 900, delivery_status: 'sent', deduplication_result: 'duplicate_suppressed', retry_count: 1 },
      { queue_wait_ms: null, model_duration_ms: null, delivery_status: 'none', deduplication_result: 'unique', retry_count: 0 },
    ])
    expect(summary.fields.queue_wait_ms.count).toBe(2)
    expect(summary.fields.queue_wait_ms.p50).toBe(100)
    expect(summary.fields.model_duration_ms.count).toBe(1)
    expect(summary.fields.model_duration_ms.p95).toBe(900)
    expect(summary.delivery).toEqual({ sent: 2, none: 1 })
    expect(summary.deduplication.duplicate_suppressed).toBe(1)
    expect(summary.retries.p95).toBe(1)
  })
})
