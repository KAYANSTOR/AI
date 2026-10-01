'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrg, type OrgContext } from '@/lib/org'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'
import {
  credentialsStorageConfigured,
  deleteChannelCredential,
  encryptSecret,
  setChannelCredentialStatus,
} from '@/lib/credentials/service'
import { PROVIDER_FOR_CHANNEL, isCredentialField } from '@/lib/credentials/catalog'
import { getChannelSpec, type ChannelType } from '@/lib/channels/management'

export type CredentialActionResult = { ok: boolean; error?: string; message?: string }

async function requireCredentialAdmin(): Promise<OrgContext> {
  const org = await getCurrentOrg()
  if (!org) throw new Error('الجلسة منتهية. سجّل الدخول من جديد.')
  if (org.role !== 'owner' && org.role !== 'admin') {
    throw new Error('صلاحية إدارة بيانات الاعتماد متاحة للمالك أو المسؤول فقط.')
  }
  return org
}

async function audit(
  organizationId: string,
  businessId: string | null,
  action: string,
  channelId: string | null,
  metadata: Record<string, unknown>
) {
  const supabase = await createClient()
  // Metadata only: a credential value must never reach the audit ledger.
  const { error } = await supabase.rpc('log_audit_event', {
    p_organization_id: organizationId,
    p_action: action,
    p_entity_type: 'channel_credential',
    p_entity_id: channelId,
    p_business_id: businessId,
    p_metadata: metadata,
  })
  if (error) {
    console.error('Unable to record credential audit event', error)
    throw new Error('تعذّر تسجيل العملية في سجل التدقيق.')
  }
}

/** Resolves the tenant's channel row for a channel type, or explains why it cannot. */
async function loadChannel(organizationId: string, channelType: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('channels')
    .select('id, business_id')
    .eq('organization_id', organizationId)
    .eq('channel_type', channelType)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function saveChannelCredentialAction(input: {
  channelType: string
  credentialType: string
  value: string
}): Promise<CredentialActionResult> {
  try {
    const org = await requireCredentialAdmin()
    const spec = getChannelSpec(input.channelType)
    if (!spec) return { ok: false, error: 'نوع قناة غير معروف.' }

    if (!credentialsStorageConfigured()) {
      return {
        ok: false,
        error:
          'لم يتم إعداد تشفير بيانات الاعتماد على الخادم. أضف المتغيّر CREDENTIAL_ENCRYPTION_KEY (32 بايت) في إعدادات البيئة قبل حفظ أي بيانات اعتماد.',
      }
    }

    const channelType = spec.type as ChannelType
    if (!isCredentialField(channelType, input.credentialType)) {
      return { ok: false, error: 'نوع بيانات اعتماد غير معروف لهذه القناة.' }
    }

    const value = input.value.trim()
    if (!value) return { ok: false, error: 'أدخل القيمة قبل الحفظ.' }
    if (value.length > 4096) return { ok: false, error: 'القيمة أطول من الحد المسموح.' }

    const channel = await loadChannel(org.organizationId, spec.type)
    if (!channel) return { ok: false, error: 'اربط القناة أولًا قبل إضافة بيانات الاعتماد.' }

    const provider = PROVIDER_FOR_CHANNEL[channelType]
    const supabase = await createClient()

    // Encrypted here, on the server, with the platform key; only ciphertext is stored.
    const { error } = await supabase.rpc('put_channel_credential', {
      p_organization_id: org.organizationId,
      p_channel_id: channel.id,
      p_provider: provider,
      p_credential_type: input.credentialType,
      p_encrypted_value: encryptSecret(value),
      p_status: 'active',
    })
    if (error) return { ok: false, error: supabaseActionError(error) }

    await audit(org.organizationId, channel.business_id, 'channel.credential_saved', channel.id, {
      channel_type: spec.type,
      provider,
      credential_type: input.credentialType,
    })

    revalidatePath('/dashboard/channels')
    return { ok: true, message: 'تم حفظ بيانات الاعتماد.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حفظ بيانات الاعتماد. حاول مرة أخرى.') }
  }
}

export async function setChannelCredentialStatusAction(input: {
  channelType: string
  status: 'active' | 'disabled'
}): Promise<CredentialActionResult> {
  try {
    const org = await requireCredentialAdmin()
    const spec = getChannelSpec(input.channelType)
    if (!spec) return { ok: false, error: 'نوع قناة غير معروف.' }

    const channel = await loadChannel(org.organizationId, spec.type)
    if (!channel) return { ok: false, error: 'القناة غير مربوطة بعد.' }

    const provider = PROVIDER_FOR_CHANNEL[spec.type as ChannelType]
    const supabase = await createClient()

    // Delegates to the guarded function so the status change stays inside RLS policy.
    await setChannelCredentialStatus(supabase, {
      organizationId: org.organizationId,
      channelId: channel.id,
      provider,
      status: input.status,
    })

    await audit(
      org.organizationId,
      channel.business_id,
      input.status === 'active' ? 'channel.credential_enabled' : 'channel.credential_disabled',
      channel.id,
      { channel_type: spec.type, provider }
    )

    revalidatePath('/dashboard/channels')
    return { ok: true, message: input.status === 'active' ? 'تم تفعيل بيانات الاعتماد.' : 'تم تعطيل بيانات الاعتماد.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث حالة بيانات الاعتماد. حاول مرة أخرى.') }
  }
}

export async function deleteChannelCredentialAction(input: {
  channelType: string
  credentialType?: string
}): Promise<CredentialActionResult> {
  try {
    const org = await requireCredentialAdmin()
    const spec = getChannelSpec(input.channelType)
    if (!spec) return { ok: false, error: 'نوع قناة غير معروف.' }

    const channelType = spec.type as ChannelType
    if (input.credentialType && !isCredentialField(channelType, input.credentialType)) {
      return { ok: false, error: 'نوع بيانات اعتماد غير معروف لهذه القناة.' }
    }

    const channel = await loadChannel(org.organizationId, spec.type)
    if (!channel) return { ok: false, error: 'القناة غير مربوطة بعد.' }

    const provider = PROVIDER_FOR_CHANNEL[channelType]
    const supabase = await createClient()
    await deleteChannelCredential(supabase, {
      organizationId: org.organizationId,
      channelId: channel.id,
      provider,
      credentialType: input.credentialType,
    })

    await audit(org.organizationId, channel.business_id, 'channel.credential_deleted', channel.id, {
      channel_type: spec.type,
      provider,
      credential_type: input.credentialType ?? 'all',
    })

    revalidatePath('/dashboard/channels')
    return { ok: true, message: 'تم حذف بيانات الاعتماد.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حذف بيانات الاعتماد. حاول مرة أخرى.') }
  }
}
