import { createHash, randomBytes } from 'node:crypto'
import { getSql } from '@/lib/db/pool'
import { hashPassword } from './password'

const RESET_TTL_MINUTES = 30

export function isPasswordRecoveryConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
    process.env.AUTH_EMAIL_FROM?.trim() &&
    (process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim())
  )
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function sendPasswordReset(email: string): Promise<void> {
  if (!isPasswordRecoveryConfigured()) throw new Error('Password recovery email is not configured.')
  const normalizedEmail = email.trim().toLowerCase()
  const rows = await getSql().unsafe<{ id: string }[]>(
    'select id from auth.users where lower(email) = $1 and deleted_at is null limit 1',
    [normalizedEmail]
  )
  const user = rows[0]
  if (!user) return

  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  const sql = getSql()
  await sql.begin(async (tx) => {
    await tx.unsafe(
      'update public.auth_password_reset_tokens set used_at = now() where user_id = $1::uuid and used_at is null',
      [user.id]
    )
    await tx.unsafe(
      'insert into public.auth_password_reset_tokens (user_id, token_hash, expires_at) values ($1::uuid, $2, now() + ($3 * interval \'1 minute\'))',
      [user.id, tokenHash, RESET_TTL_MINUTES]
    )
  })

  const baseUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '')
  const resetUrl = new URL('/reset-password', baseUrl)
  resetUrl.searchParams.set('token', token)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM!.trim(),
      to: [normalizedEmail],
      subject: 'إعادة تعيين كلمة مرور KAYAN AI',
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.9;color:#1f2937"><h2>إعادة تعيين كلمة المرور</h2><p>وصلنا طلب لإعادة تعيين كلمة مرور حسابك في KAYAN AI.</p><p><a href="${resetUrl.toString()}" style="display:inline-block;padding:12px 20px;background:#1F3B22;color:#fff;text-decoration:none;border-radius:8px">تعيين كلمة مرور جديدة</a></p><p>ينتهي الرابط خلال 30 دقيقة، ويُستخدم مرة واحدة فقط. إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.</p></div>`,
    }),
  })

  if (!response.ok) {
    await sql.unsafe(
      'update public.auth_password_reset_tokens set used_at = now() where token_hash = $1 and used_at is null',
      [tokenHash]
    )
    throw new Error(`Password reset email delivery failed: ${response.status}`)
  }
}

export async function completePasswordReset(token: string, password: string): Promise<boolean> {
  if (!token || token.length > 200) return false
  const tokenHash = hashToken(token)
  const passwordHash = await hashPassword(password)
  return getSql().begin(async (tx) => {
    const rows = await tx.unsafe<{ user_id: string }[]>(
      `update public.auth_password_reset_tokens
          set used_at = now()
        where token_hash = $1
          and used_at is null
          and expires_at > now()
        returning user_id::text as user_id`,
      [tokenHash]
    )
    const user = rows[0]
    if (!user) return false
    const updated = await tx.unsafe<{ id: string }[]>(
      `update auth.users
          set encrypted_password = $2,
              session_version = session_version + 1,
              updated_at = now()
        where id = $1::uuid and deleted_at is null
        returning id`,
      [user.user_id, passwordHash]
    )
    if (!updated[0]) throw new Error('Password reset account no longer exists.')
    await tx.unsafe(
      'update public.auth_password_reset_tokens set used_at = now() where user_id = $1::uuid and used_at is null',
      [user.user_id]
    )
    return true
  })
}
