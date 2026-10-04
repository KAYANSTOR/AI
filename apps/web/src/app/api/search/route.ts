import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type GlobalSearchResult = {
  id: string
  type: 'contact' | 'conversation'
  title: string
  subtitle: string | null
  href: string
}

/**
 * PostgREST treats `,` `(` `)` as filter separators, so raw user input would
 * break the `or()` expression. Strip the reserved characters before building
 * the ilike pattern.
 */
function sanitizeQuery(raw: string) {
  return raw.replace(/[%,()*\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}

export async function GET(request: Request) {
  const context = await getDashboardContext()
  if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const q = sanitizeQuery(new URL(request.url).searchParams.get('q') ?? '')
  if (q.length < 2) return NextResponse.json({ results: [] as GlobalSearchResult[] })

  const pattern = `%${q}%`
  const supabase = await createClient()

  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, full_name, phone, email')
    .eq('organization_id', context.organizationId)
    .or(`full_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
    .order('created_at', { ascending: false })
    .limit(6)

  if (error) {
    console.error('Global search failed:', error.message)
    return NextResponse.json({ error: 'search_failed' }, { status: 500 })
  }

  const contactRows = contacts ?? []
  const results: GlobalSearchResult[] = contactRows.map((row) => ({
    id: `contact:${row.id}`,
    type: 'contact',
    title: row.full_name?.trim() || row.phone || row.email || 'عميل غير مسجل',
    subtitle: row.phone || row.email || null,
    href: '/dashboard/contacts',
  }))

  if (contactRows.length > 0) {
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, contact_id, updated_at')
      .eq('organization_id', context.organizationId)
      .in(
        'contact_id',
        contactRows.map((row) => row.id)
      )
      .order('updated_at', { ascending: false })
      .limit(5)

    for (const conversation of conversations ?? []) {
      const contact = contactRows.find((row) => row.id === conversation.contact_id)
      results.push({
        id: `conversation:${conversation.id}`,
        type: 'conversation',
        title: contact?.full_name?.trim() || contact?.phone || 'محادثة عميل',
        subtitle: 'فتح المحادثة',
        href: `/dashboard/conversations/${conversation.id}`,
      })
    }
  }

  return NextResponse.json({ results })
}
