import { redirect } from 'next/navigation'
import { requireBusinessDashboardCapability, CapabilityDisabledError, NotAuthorizedError } from '@/lib/capabilities/guard'
import { formatDate } from '@/lib/i18n/format'
import { ContactsDirectory } from './contacts-directory'

export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  let context
  try {
    context = await requireBusinessDashboardCapability('lead_capture')
  } catch (error) {
    if (error instanceof CapabilityDisabledError) redirect('/dashboard')
    if (error instanceof NotAuthorizedError) redirect('/login')
    throw error
  }
  const db = context.db
  const { data: contacts, error } = await db
    .from('contacts')
    .select('id, full_name, phone, email, created_at')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .limit(500)

  return (
    <ContactsDirectory
      organizationId={context.organizationId}
      canManage={context.role === 'owner' || context.role === 'admin'}
      error={error ? 'تعذّر تحميل جهات الاتصال. حدّث الصفحة وحاول مجدداً.' : null}
      contacts={(contacts ?? []).map((contact) => ({
        id: String(contact.id),
        fullName: String(contact.full_name ?? ''),
        phone: String(contact.phone ?? ''),
        email: String(contact.email ?? ''),
        createdLabel: formatDate(contact.created_at, context.timezone),
      }))}
    />
  )
}
