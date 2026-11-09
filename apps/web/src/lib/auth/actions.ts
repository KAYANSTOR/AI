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
import { SESSION_COOKIE, sessionCookieOptions, signSession } from './session'
import { createUser, findUserByEmail, findUserById, normalizeEmail, recordSignIn, setPassword } from './users'

export type AuthActionResult = { ok: true; redirectTo: string } | { ok: false; error: string }

const FIFTEEN_MINUTES = 15 * 60 * 1000

async function clientIp(): Promise<string> {
  const list = await headers()
  return list.get('x-forwarded-for')?.split(',')[0]?.trim() || list.get('x-real-ip') || 'unknown'
}

function safeDestination(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}

async function startSession(user: { id: string; email: string; sessionVersion: number }) {
  const token = await signSession(user)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, sessionCookieOptions())
}

const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
  returnTo: z.string().optional(),
})

export async function signInAction(input: z.input<typeof signInSchema>): Promise<AuthActionResult> {
  if (!isAuthConfigured()) return { ok: false, error: AUTH_MESSAGES.notConfigured }
  const parsed = signInSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: AUTH_MESSAGES.invalidCredentials }

  const email = normalizeEmail(parsed.data.email)
  const ip = await clientIp()
  if (isRateLimited(`login:ip:${ip}`, 30, FIFTEEN_MINUTES) || isRateLimited(`login:email:${email}`, 8, FIFTEEN_MINUTES)) {
    return { ok: false, error: AUTH_MESSAGES.tooManyAttempts }
  }

  try {
    const user = await findUserByEmail(email)
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
  email: z.string().trim().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
})

export async function signUpAction(input: z.input<typeof signUpSchema>): Promise<AuthActionResult> {
  if (!isAuthConfigured()) return { ok: false, error: AUTH_MESSAGES.notConfigured }
  const parsed = signUpSchema.safeParse(input)
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]
    if (field === 'companyName') return { ok: false, error: AUTH_MESSAGES.companyRequired }
    if (field === 'email') return { ok: false, error: AUTH_MESSAGES.invalidEmail }
    if (field === 'password') return { ok: false, error: AUTH_MESSAGES.weakPassword }
    return { ok: false, error: AUTH_MESSAGES.generic }
  }

  const ip = await clientIp()
  if (isRateLimited(`signup:ip:${ip}`, 10, FIFTEEN_MINUTES)) return { ok: false, error: AUTH_MESSAGES.tooManyAttempts }

  const businessTypeId = BUSINESS_TYPES.some((type) => type.id === parsed.data.businessTypeId)
    ? parsed.data.businessTypeId
    : BUSINESS_TYPES[0]?.id

  try {
    if (await findUserByEmail(parsed.data.email)) return { ok: false, error: AUTH_MESSAGES.emailTaken }
    const user = await createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      metadata: { organization_name: parsed.data.companyName, business_type_id: businessTypeId },
    })
    await startSession(user)
    return { ok: true, redirectTo: '/onboarding' }
  } catch (error) {
    if ((error as { code?: string })?.code === '23505') return { ok: false, error: AUTH_MESSAGES.emailTaken }
    console.error('Sign-up failed', error)
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
