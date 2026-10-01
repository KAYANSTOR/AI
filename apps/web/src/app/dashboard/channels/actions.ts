'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrg, type OrgContext } from '@/lib/org'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'
import { ar } from '@/lib/i18n/ar'
import {
  getChannelSpec,
  normalizeChannelNumber,
  verifyChannelBinding,
  type BindingTestResult,
  type ChannelRow,
} from '@/lib/channels/management'
import { assertWithinLimit, EntitlementExceededError } from '@/lib/billing/entitlements'

export type ChannelActionResult = {
  ok: boolean
  error?: string
  message?: string
}

async function requireChannelAdmin(): Promise<OrgContext> {
  const org = await getCurrentOrg()
  if (!org) throw new Error('الجلسة منتهية. سجّل الدخول من جديد.')
  if (org.role !== 'owner' && org.role !== 'admin') {
    throw new Error('صلاحية إدارة القنوات متاحة للمالك أو المسؤول فقط.')
  }
  return org
}

/**
 * Channels.business_id FK points at businesses(id).
 * Signup may only seed business_profiles — ensure a businesses row exists.
 */
async function ensurePrimaryBusinessId(
  organizationId: string,
  organizationName?: string
): Promise<string | null> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('businesses')
    .select('id')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id as string

  const { data: profile } = await supabase
    .from('business_profiles')
    .select('business_id, display_name, name')
    .eq('organization_id', organizationId)
    .maybeSingle()

  // If profile already points at a valid businesses row, use it.
  if (profile?.business_id) {
    const { data: byId } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', profile.business_id)
      .maybeSingle()
    if (byId?.id) return byId.id as string
  }

  const name =
    (profile?.display_name as string | undefined) ||
    (profile?.name as string | undefined) ||
    organizationName ||
    'Business'

  const { data: created, error: createError } = await supabase
    .from('businesses')
    .insert({ organization_id: organizationId, name })
    .select('id')
    .single()

  if (createError || !created?.id) {
    console.error('Unable to ensure businesses row for channel bind', createError)
    // business_id is nullable on channels — allow bind without it
    return null
  }

  // Best-effort link profile → business
  await supabase
    .from('business_profiles')
    .update({ business_id: created.id })
    .eq('organization_id', organizationId)

  return created.id as string
}

async function audit(
  organizationId: string,
  businessId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('log_audit_event', {
    p_organization_id: organizationId,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_business_id: businessId,
    p_metadata: metadata,
  })
  if (error) {
    console.error('Unable to record channel audit event', error)
  }
}

function describeWriteError(code: string | undefined, message: string): string {
  if (code === '23505') {
    return 'هذا المعرّف مرتبط بشركة أخرى بالفعل. لا يمكن ربط الرقم أو الحساب نفسه لأكثر من شركة.'
  }
  if (code === '23503') {
    return 'مرجع النشاط غير صالح. أكمل إعداد النشاط من /dashboard/setup ثم أعد المحاولة.'
  }
  if (code === '42501') return 'لا تملك صلاحية تعديل قنوات هذه الشركة.'
  return supabaseActionError({ code, message }, ar.errors.save)
}

export async function saveChannelAction(input: {
  channelType: string
  identifier: string
  publicNumber?: string
}): Promise<ChannelActionResult> {
  try {
    const org = await requireChannelAdmin()
    const spec = getChannelSpec(input.channelType)
    if (!spec) return { ok: false, error: 'نوع قناة غير معروف.' }

    const raw = input.identifier.trim()
    if (!raw) return { ok: false, error: 'أدخل ' + spec.bindingLabel + '.' }

    if (spec.type === 'whatsapp' && !/^\\d+$/.test(raw)) {
      return {
        ok: false,
        error: 'أدخل phone_number_id الرقمي من لوحة Meta، وليس رقم الهاتف مثل +967....',
      }
    }
    if (spec.type === 'instagram' && !/^\\d+$/.test(raw)) {
      return { ok: false, error: 'أدخل معرّف حساب إنستغرام الرقمي من لوحة Meta.' }
    }

    const identifier =
      spec.type === 'whatsapp' || spec.type === 'instagram' ? raw : normalizeChannelNumber(raw)
    const publicNumber = spec.publicNumberLabel
      ? normalizeChannelNumber((input.publicNumber ?? '').trim())
      : null
    if (spec.type === 'phone' && !publicNumber) {
      return { ok: false, error: 'أدخل رقم شركتك الحالي.' }
    }

    const supabase = await createClient()
    const businessId = await ensurePrimaryBusinessId(org.organizationId, org.organizationName)

    const { data: existing, error: readError } = await supabase
      .from('channels')
      .select('id, is_active')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', spec.type)
      .maybeSingle()
    if (readError) throw new Error(readError.message)

    if (!existing) {
      try {
        await assertWithinLimit(supabase, org.organizationId, 'channels', 1)
      } catch (err) {
        if (err instanceof EntitlementExceededError) {
          return {
            ok: false,
            error: `وصلت لحد القنوات في خطتك (${err.used}/${err.limit}). رقِّ الباقة لإضافة قناة.`,
          }
        }
        throw err
      }
    }

    const binding =
      spec.bindingColumn === 'provider_account_id'
        ? { provider_account_id: identifier, external_identifier: publicNumber }
        : { external_identifier: identifier, provider_account_id: null }

    const patch = {
      ...binding,
      ...(businessId ? { business_id: businessId } : {}),
      is_active: true,
      verification_status: 'pending',
      updated_at: new Date().toISOString(),
    }

    const written = existing
      ? await supabase.from('channels').update(patch).eq('id', existing.id).select('id').single()
      : await supabase
          .from('channels')
          .insert({ organization_id: org.organizationId, channel_type: spec.type, ...patch })
          .select('id')
          .single()

    if (written.error || !written.data) {
      return {
        ok: false,
        error: describeWriteError(written.error?.code, written.error?.message ?? 'تعذّر حفظ القناة.'),
      }
    }

    await audit(org.organizationId, businessId, 'channel.connected', 'channel', written.data.id, {
      channel_type: spec.type,
      provider: spec.provider,
      reconnected: Boolean(existing),
    })

    revalidatePath('/dashboard/channels')
    revalidatePath('/dashboard/integrations')
    return { ok: true, message: 'تم ربط ' + spec.label + '.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حفظ القناة. حاول مرة أخرى.') }
  }
}

export async function setChannelActiveAction(input: {
  channelType: string
  active: boolean
}): Promise<ChannelActionResult> {
  try {
    const org = await requireChannelAdmin()
    const spec = getChannelSpec(input.channelType)
    if (!spec) return { ok: false, error: 'نوع قناة غير معروف.' }

    const supabase = await createClient()
    const businessId = await ensurePrimaryBusinessId(org.organizationId, org.organizationName)

    const { data, error } = await supabase
      .from('channels')
      .select('id, is_active')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', spec.type)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return { ok: false, error: 'القناة غير مربوطة بعد.' }

    if (input.active && !data.is_active) {
      try {
        await assertWithinLimit(supabase, org.organizationId, 'channels', 1)
      } catch (err) {
        if (err instanceof EntitlementExceededError) {
          return {
            ok: false,
            error: `وصلت لحد القنوات في خطتك (${err.used}/${err.limit}).`,
          }
        }
        throw err
      }
    }

    const { error: updateError } = await supabase
      .from('channels')
      .update({
        is_active: input.active,
        verification_status: input.active ? 'pending' : 'disabled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)
    if (updateError) return { ok: false, error: describeWriteError(updateError.code, updateError.message) }

    await audit(
      org.organizationId,
      businessId,
      input.active ? 'channel.enabled' : 'channel.disabled',
      'channel',
      data.id,
      { channel_type: spec.type }
    )

    revalidatePath('/dashboard/channels')
    revalidatePath('/dashboard/integrations')
    return {
      ok: true,
      message: input.active ? 'تم تفعيل ' + spec.label + '.' : 'تم إيقاف ' + spec.label + '.',
    }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث القناة. حاول مرة أخرى.') }
  }
}

export async function testChannelAction(input: {
  channelType: string
}): Promise<{ ok: boolean; error?: string; result?: BindingTestResult }> {
  try {
    const org = await requireChannelAdmin()
    const spec = getChannelSpec(input.channelType)
    if (!spec) return { ok: false, error: 'نوع قناة غير معروف.' }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('channels')
      .select(
        'id, channel_type, provider_account_id, external_identifier, verification_status, is_active, business_id, updated_at'
      )
      .eq('organization_id', org.organizationId)
      .eq('channel_type', spec.type)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return { ok: false, error: 'القناة غير مربوطة بعد.' }

    const result = await verifyChannelBinding(supabase, data as ChannelRow)

    await audit(org.organizationId, data.business_id, 'channel.tested', 'channel', data.id, {
      channel_type: spec.type,
      passed: result.ok,
    })

    return { ok: result.ok, result }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تنفيذ الفحص. حاول مرة أخرى.') }
  }
}
