'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { BUSINESS_TYPES } from '@/lib/capabilities/business-types'
import { isAuthConfigured } from './config'
import { getCurrentUser } from './current-user'
import { AUTH_MESSAGES } from './messages'
import { burnPasswordCheck, MIN_PASSWORD_LENGTH, verifyPassword } from './password'
import { isRateLimited } from './rate-limit'
import { completePasswordReset, isPasswordRecoveryConfigured, sendPasswordReset } from './password-recovery'
import { SESSION_COOKIE, sessionCookieOptions, signSession } from './session'
import { createUser, findUserByEmail, findUserByPhone, findUserById, normalizeEmail, normalizePhone, recordSignIn, setPassword } from './users'

export type AuthActionResult = { ok: true; redirectTo: string } | { ok: false; error: string }

const FIFTEEN_MINUTES = 15 * 60 * 1000

async function clientIp(): Promise<string> {
  const list = await headers()
  return list.get('x-forwarded-for')?.split(',')[0]?.trim() || list.get('x-real-ip') || 'unknown'
}

function safeDestination(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}

async function startSession(user: { id: string; email: string | null; sessionVersion: number }) {
  const token = await signSession(user)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, sessionCookieOptions())
}

const signInSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
  returnTo: z.string().optional(),
})

export async function signInAction(input: z.input<typeof signInSchema>): Promise<AuthActionResult> {
  if (!isAuthConfigured()) return { ok: false, error: AUTH_MESSAGES.notConfigured }
  const parsed = signInSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: AUTH_MESSAGES.invalidCredentials }

  const identifier = parsed.data.identifier.includes('@')
    ? normalizeEmail(parsed.data.identifier)
    : normalizePhone(parsed.data.identifier)
  const isEmail = identifier.includes('@')
  if (!isEmail && !/^[+][1-9][0-9]{7,14}$/.test(identifier)) {
    return { ok: false, error: AUTH_MESSAGES.invalidCredentials }
  }
  const ip = await clientIp()
  if (isRateLimited(`login:ip:${ip}`, 30, FIFTEEN_MINUTES) || isRateLimited(`login:identity:${identifier}`, 8, FIFTEEN_MINUTES)) {
    return { ok: false, error: AUTH_MESSAGES.tooManyAttempts }
  }

  try {
    const user = isEmail ? await findUserByEmail(identifier) : await findUserByPhone(identifier)
    if (!user) {
      await burnPasswordCheck(parsed.data.password)
      return { ok: false, error: AUTH_MESSAGES.invalidCredentials }
    }
    if (!(await verifyPassword(parsed.data.password, user.encryptedPassword))) {
      return { ok: false, error: AUTH_MESSAGES.invalidCredentials }
    }
    if (user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now()) {
      return { ok: false, error: AUTH_MESSAGES.accountSuspended }
    }

    await startSession(user)
    await recordSignIn(user.id).catch(() => undefined)
    return { ok: true, redirectTo: safeDestination(parsed.data.returnTo, '/dashboard') }
  } catch (error) {
    console.error('Sign-in failed', error)
    return { ok: false, error: AUTH_MESSAGES.generic }
  }
}

const signUpSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  businessTypeId: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  acceptedTerms: z.boolean().refine((value) => value === true),
}).refine(
  (value) =>
    (Boolean(value.email) && !value.phone) ||
    (!value.email && Boolean(value.phone && /^[+][1-9][0-9]{7,14}$/.test(normalizePhone(value.phone)))),
  { path: ['email'], message: 'اختر بريداً إلكترونياً أو رقم هاتف دولياً صحيحاً.' }
)

export async function signUpAction(input: z.input<typeof signUpSchema>): Promise<AuthActionResult> {
  if (!isAuthConfigured()) return { ok: false, error: AUTH_MESSAGES.notConfigured }
  const parsed = signUpSchema.safeParse(input)
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]
    if (field === 'companyName') return { ok: false, error: AUTH_MESSAGES.companyRequired }
    if (field === 'email' || field === 'phone') return { ok: false, error: 'اكتب بريداً إلكترونياً أو رقم هاتف دولياً صحيحاً.' }
    if (field === 'password') return { ok: false, error: AUTH_MESSAGES.weakPassword }
    if (field === 'acceptedTerms') return { ok: false, error: 'يجب الموافقة على الشروط وسياسة الخصوصية لإنشاء الحساب.' }
    return { ok: false, error: AUTH_MESSAGES.generic }
  }

  const ip = await clientIp()
  if (isRateLimited(`signup:ip:${ip}`, 10, FIFTEEN_MINUTES)) return { ok: false, error: AUTH_MESSAGES.tooManyAttempts }

  const email = parsed.data.email ? normalizeEmail(parsed.data.email) : null
  const phone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null
  const businessTypeId = BUSINESS_TYPES.some((type) => type.id === parsed.data.businessTypeId)
    ? parsed.data.businessTypeId
    : BUSINESS_TYPES[0]?.id

  try {
    if (email && (await findUserByEmail(email))) return { ok: false, error: AUTH_MESSAGES.emailTaken }
    if (phone && (await findUserByPhone(phone))) return { ok: false, error: AUTH_MESSAGES.emailTaken }
    const user = await createUser({
      email,
      phone,
      password: parsed.data.password,
      metadata: { organization_name: parsed.data.companyName, business_type_id: businessTypeId },
      termsAcceptedAt: new Date(),
      termsVersion: '2026-11-22',
      privacyPolicyVersion: '2026-11-11',
    })
    await startSession(user)
    return { ok: true, redirectTo: '/onboarding' }
  } catch (error) {
    if ((error as { code?: string })?.code === '23505') return { ok: false, error: AUTH_MESSAGES.emailTaken }
    console.error('Sign-up failed', error)
    return { ok: false, error: AUTH_MESSAGES.generic }
  }
}


const passwordResetRequestSchema = z.object({ email: z.string().trim().email().max(254) })

export async function requestPasswordResetAction(
  input: z.input<typeof passwordResetRequestSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAuthConfigured() || !isPasswordRecoveryConfigured()) {
    return { ok: false, error: 'خدمة استعادة كلمة المرور غير مهيأة بعد. يرجى التواصل مع الدعم.' }
  }
  const parsed = passwordResetRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: AUTH_MESSAGES.invalidEmail }
  const ip = await clientIp()
  const email = normalizeEmail(parsed.data.email)
  if (isRateLimited(`password-reset:ip:${ip}`, 10, FIFTEEN_MINUTES) ||
      isRateLimited(`password-reset:email:${email}`, 3, FIFTEEN_MINUTES)) {
    return { ok: false, error: AUTH_MESSAGES.tooManyAttempts }
  }
  try {
    await sendPasswordReset(email)
    return { ok: true }
  } catch (error) {
    console.error('Password reset request failed', error)
    return { ok: false, error: AUTH_MESSAGES.generic }
  }
}

const completePasswordResetSchema = z.object({
  token: z.string().min(32).max(200),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
})

export async function completePasswordResetAction(
  input: z.input<typeof completePasswordResetSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = completePasswordResetSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: AUTH_MESSAGES.weakPassword }
  try {
    const completed = await completePasswordReset(parsed.data.token, parsed.data.password)
    if (!completed) return { ok: false, error: 'الرابط غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.' }
    const store = await cookies()
    store.delete(SESSION_COOKIE)
    return { ok: true }
  } catch (error) {
    console.error('Password reset completion failed', error)
    return { ok: false, error: AUTH_MESSAGES.generic }
  }
}

export async function signOutAction(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  redirect('/login')
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
})

export async function changePasswordAction(
  input: z.input<typeof changePasswordSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await getCurrentUser()
  if (!current) return { ok: false, error: AUTH_MESSAGES.generic }
  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: AUTH_MESSAGES.weakPassword }
  if (isRateLimited(`password:${current.id}`, 5, FIFTEEN_MINUTES)) return { ok: false, error: AUTH_MESSAGES.tooManyAttempts }

  const user = await findUserById(current.id)
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.encryptedPassword))) {
    return { ok: false, error: AUTH_MESSAGES.wrongCurrentPassword }
  }
  const sessionVersion = await setPassword(user.id, parsed.data.newPassword)
  await startSession({ id: user.id, email: user.email, sessionVersion })
  return { ok: true }
}
