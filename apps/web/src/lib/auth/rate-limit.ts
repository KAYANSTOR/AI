/**
 * Small in-memory sliding-window limiter for authentication endpoints.
 * It is per instance; it slows down password guessing without adding infrastructure.
 */
const buckets = new Map<string, number[]>()

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((at) => now - at < windowMs)
  hits.push(now)
  buckets.set(key, hits)
  if (buckets.size > 5000) {
    for (const [bucket, times] of buckets) {
      if (!times.some((at) => now - at < windowMs)) buckets.delete(bucket)
    }
  }
  return hits.length > limit
}
