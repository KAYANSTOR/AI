-- Approved for STAGING first (docs/perf/STAGING_RUNBOOK.md).
--
-- Note: the migration runner wraps each file in a transaction, so CREATE INDEX CONCURRENTLY
-- is not possible here. Plain CREATE INDEX takes a SHARE lock (writes wait) for the build
-- time; all three targets are small (partial index, or ~20k-row tables) so this is
-- milliseconds–seconds. For very large tables, build with CONCURRENTLY by hand first.

-- Outbox worker claim query (/api/cron/outbox): WHERE status IN (pending,failed,processing)
-- AND scheduled_at <= now() ORDER BY scheduled_at LIMIT 50. Previously a sequential scan of
-- every row ever queued (sent rows accumulate). Partial index covers only the live rows, so it
-- stays tiny and write overhead on 'sent' rows is zero.
CREATE INDEX IF NOT EXISTS idx_outbox_events_due
  ON outbox_events (scheduled_at)
  WHERE status IN ('pending', 'failed', 'processing');

-- Quotes / orders lists: WHERE organization_id=? AND business_id=? ORDER BY created_at DESC LIMIT 100.
-- Existing (organization_id, business_id) index forces a sort of the whole tenant's rows.
CREATE INDEX IF NOT EXISTS idx_quotes_org_business_created
  ON quotes (organization_id, business_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_org_business_created
  ON orders (organization_id, business_id, created_at DESC, id DESC);
