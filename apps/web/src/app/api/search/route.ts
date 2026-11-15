import { NextResponse } from 'next/server'
import { createClient } from '@/lib/db/server'
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
 * The query builder treats `,` `(` `)` as filter separators inside `or()`, so raw
 * user input would break the expression. Strip reserved characters first.
 */
function sanitizeQuery(raw: string) {
  // Keep a single token for or() filters: spaces become wildcards, reserved
  // PostgREST separators are stripped so user input cannot break the expression.
  return raw
    .replace(/[%,()*\\"]/g, ' ')
    .trim()
    .replace(/\s+/g, '%')
    .slice(0, 60)
}

export async function GET(request: Request) {
  const context = await getDashboardContext()
  if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const q = sanitizeQuery(new URL(request.url).searchParams.get('q') ?? '')
  if (q.length < 2) return NextResponse.json({ results: [] as GlobalSearchResult[] })

  const pattern = `%${q}%`
  const db = await createClient()

  const { data: contacts, error } = await db
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
    type: 'contact' as const,
    title:
      (row.full_name as string | null)?.trim() ||
      (row.phone as string | null) ||
      (row.email as string | null) ||
      'عميل غير مسجل',
    subtitle: (row.phone as string | null) || (row.email as string | null) || null,
    href: '/dashboard/contacts',
  }))

  if (contactRows.length > 0) {
    const { data: conversations } = await db
      .from('conversations')
      .select('id, contact_id, updated_at')
      .eq('organization_id', context.organizationId)
      .in(
        'contact_id',
        contactRows.map((row) => row.id as string)
      )
      .order('updated_at', { ascending: false })
      .limit(5)

    for (const conversation of conversations ?? []) {
      const contact = contactRows.find((row) => row.id === conversation.contact_id)
      results.push({
        id: `conversation:${conversation.id}`,
        type: 'conversation',
        title:
          (contact?.full_name as string | null)?.trim() ||
          (contact?.phone as string | null) ||
          'محادثة عميل',
        subtitle: 'فتح المحادثة',
        href: `/dashboard/conversations/${conversation.id}`,
      })
    }
  }

  return NextResponse.json({ results })
}
