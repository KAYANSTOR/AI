import { z } from 'zod'
import { isBusinessTypeId, type BusinessTypeId } from '@/lib/capabilities/business-types'
import { AUTH_MESSAGES } from './messages'
import { MIN_PASSWORD_LENGTH } from './password'
import { westernDigits } from '@/lib/phone/arab-countries'

function normalizeSignUpPhone(phone: string): string {
  const compact = westernDigits(phone).replace(/[^0-9+]/g, '')
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact
}

const signUpSchema = z.object({
  companyName: z.string().trim().max(120).optional(),
  businessTypeId: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  acceptedTerms: z.boolean().refine((value) => value === true),
}).refine(
  (value) =>
    (Boolean(value.email) && !value.phone) ||
    (!value.email && Boolean(value.phone && /^[+][1-9][0-9]{7,14}$/.test(normalizeSignUpPhone(value.phone)))),
  { path: ['email'], message: 'اختر بريداً إلكترونياً أو رقم هاتف دولياً صحيحاً.' }
)

export type ValidatedSignUpInput = {
  companyName: string | null
  businessTypeId: BusinessTypeId
  email: string | null
  phone: string | null
  password: string
}

export function validateSignUpInput(
  input: z.input<typeof signUpSchema>
): { ok: true; data: ValidatedSignUpInput } | { ok: false; error: string } {
  const parsed = signUpSchema.safeParse(input)
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]
    if (field === 'businessTypeId') return { ok: false, error: AUTH_MESSAGES.businessTypeRequired }
    if (field === 'email' || field === 'phone') return { ok: false, error: 'اكتب بريداً إلكترونياً أو رقم هاتف دولياً صحيحاً.' }
    if (field === 'password') return { ok: false, error: AUTH_MESSAGES.weakPassword }
    if (field === 'acceptedTerms') return { ok: false, error: 'يجب الموافقة على الشروط وسياسة الخصوصية لإنشاء الحساب.' }
    return { ok: false, error: AUTH_MESSAGES.generic }
  }

  const businessTypeId = parsed.data.businessTypeId.trim()
  if (!isBusinessTypeId(businessTypeId)) {
    return { ok: false, error: AUTH_MESSAGES.businessTypeRequired }
  }

  const rawCompany = parsed.data.companyName?.trim() ?? ''
  return {
    ok: true,
    data: {
      companyName: rawCompany.length >= 2 ? rawCompany : null,
      businessTypeId,
      email: parsed.data.email ? parsed.data.email.trim().toLowerCase() : null,
      phone: parsed.data.phone ? normalizeSignUpPhone(parsed.data.phone) : null,
      password: parsed.data.password,
    },
  }
}
