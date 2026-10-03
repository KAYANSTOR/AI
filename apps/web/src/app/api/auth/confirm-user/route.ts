import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: z.string().email(),
})

export async function POST(req: Request) {
  try {
    const { email } = schema.parse(await req.json())
    const admin = createAdminClient()

    const { data } = await admin.auth.admin.listUsers()
    const user = data?.users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase())

    if (user && !user.email_confirmed_at) {
      await admin.auth.admin.updateUserById(user.id, { email_confirm: true })
      return NextResponse.json({ ok: true, confirmed: true })
    }

    return NextResponse.json({ ok: true, confirmed: Boolean(user?.email_confirmed_at) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'invalid_request' },
      { status: 400 }
    )
  }
}
