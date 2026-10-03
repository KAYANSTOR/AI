import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = (body.email || '').trim().toLowerCase()
    const newPassword = body.newPassword || 'Password123!'

    if (!email) {
      return NextResponse.json({ error: 'البريد الإلكتروني مطلوب' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: users, error: listError } = await admin.auth.admin.listUsers()
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 })
    }

    const targetUser = users?.users?.find(
      (u) => (u.email || '').toLowerCase() === email
    )

    if (!targetUser) {
      return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(targetUser.id, {
      password: newPassword,
      email_confirm: true,
      user_metadata: {
        ...(targetUser.user_metadata || {}),
        email_verified: true,
      },
    })

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: 'تم تعيين كلمة المرور وتفعيل الحساب بنجاح',
      email: targetUser.email,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
