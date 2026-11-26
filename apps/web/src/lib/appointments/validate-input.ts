import type { DbClient } from '@/lib/db/client'

type AppointmentInput = { contactId: string; serviceId: string; startsAt: string; endsAt: string }
type Validation = { ok: true; startsAt: string; endsAt: string } | { ok: false; error: string }

/** Never trust caller-supplied resource ownership or appointment duration. */
export async function validateAppointmentInput(db: DbClient, organizationId: string, input: AppointmentInput): Promise<Validation> {
  if (!input || typeof input.contactId !== 'string' || !input.contactId || typeof input.serviceId !== 'string' || !input.serviceId) {
    return { ok: false, error: 'اختر العميل والخدمة.' }
  }
  const start = typeof input.startsAt === 'string' ? Date.parse(input.startsAt) : NaN
  const end = typeof input.endsAt === 'string' ? Date.parse(input.endsAt) : NaN
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { ok: false, error: 'تاريخ الموعد أو مدته غير صحيح.' }
  }
  const [contact, service] = await Promise.all([
    db.from('contacts').select('id').eq('id', input.contactId).eq('organization_id', organizationId).maybeSingle(),
    db.from('services').select('id, duration_minutes').eq('id', input.serviceId).eq('organization_id', organizationId).eq('is_active', true).maybeSingle(),
  ])
  if (contact.error || service.error) return { ok: false, error: 'تعذّر التحقق من بيانات الموعد.' }
  if (!contact.data || !service.data) return { ok: false, error: 'العميل أو الخدمة غير متاحين في هذا النشاط.' }
  const duration = Number(service.data.duration_minutes)
  if (!Number.isInteger(duration) || duration <= 0 || duration > 1440 || end - start !== duration * 60_000) {
    return { ok: false, error: 'تغيّرت مدة الخدمة أو أن مدة الموعد غير صحيحة. حدّث الصفحة وحاول مجددًا.' }
  }
  return { ok: true, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() }
}
