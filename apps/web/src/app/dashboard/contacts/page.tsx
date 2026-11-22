import { redirect } from 'next/navigation'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { formatDate } from '@/lib/i18n/format'
import { ContactsDirectory } from './contacts-directory'

export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const db = await createClient()
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
