-- 0015_appointment_slot_uniqueness.sql
-- Forward-only.
--
-- Availability was previously only advisory: findAvailableSlots read the booked slots and
-- skipped them, but two concurrent writers (webhook runtime and dashboard) could both pass
-- that check and insert the same slot. The database is the source of truth, so the invariant
-- is enforced here.
--
-- Cancelled appointments release the slot; every other status holds it.

CREATE UNIQUE INDEX IF NOT EXISTS ux_appointment_slot
  ON appointments(organization_id, service_id, starts_at)
  WHERE status <> 'cancelled';
