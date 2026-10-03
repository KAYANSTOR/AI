import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  companyName: z.string().min(2),
  businessTypeId: z.string().min(1),
})

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json())
    const admin = createAdminClient()

    // Create user with email_confirm: true to bypass email rate limits and auto-activate the account
    const { data, error } = await admin.auth.admin.createUser({
      email: body.email.trim(),
      password: body.password,
      email_confirm: true,
      user_metadata: {
        organization_name: body.companyName.trim(),
        business_type_id: body.businessTypeId,
      },
    })

    if (error) {
      const msg = error.message.toLowerCase()
      // If user already exists in auth.users
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        const { data: list } = await admin.auth.admin.listUsers()
        const existing = list?.users.find(
          (u) => u.email?.toLowerCase() === body.email.trim().toLowerCase()
        )
        if (existing) {
          // If unconfirmed, confirm them and update their password
          if (!existing.email_confirmed_at) {
            await admin.auth.admin.updateUserById(existing.id, {
              password: body.password,
              email_confirm: true,
              user_metadata: {
                organization_name: body.companyName.trim(),
                business_type_id: body.businessTypeId,
              },
            })
            return NextResponse.json({ ok: true, confirmedExisting: true })
          }
        }
        return NextResponse.json(
          {
            error: 'user_already_registered',
            message: 'هذا البريد مسجّل بالفعل. يمكنك تسجيل الدخول مباشرة.',
          },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, userId: data?.user?.id })
  } catch (err) {
    console.error('Registration API error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'invalid_request' },
      { status: 400 }
    )
  }
}
