import type { DbClient } from '@/lib/db/client'
import { encryptSecret } from '@/lib/credentials/service'
import { MetaLinkError, type MetaChannelType } from './meta-connection'

export async function bindMetaChannel(db: DbClient, input: {
  organizationId: string
  businessId: string
  channelType: MetaChannelType
  assetId: string
  accessToken: string
  displayName?: string
  whatsapp?: {
    displayNumber: string | null
    wabaId: string
    connectionMode: 'coexistence' | 'cloud_api'
    primaryWaacIds: string[]
  }
}): Promise<string> {
  const { whatsapp } = input
  const credentials: Record<string, string> = {
    [input.channelType === 'messenger' ? 'page_access_token' : 'access_token']: encryptSecret(input.accessToken),
  }
  if (whatsapp) {
    credentials.business_account_id = encryptSecret(whatsapp.wabaId)
    credentials.phone_number_id = encryptSecret(input.assetId)
  }

  const { data, error } = await db.rpc('bind_meta_channel', {
    p_organization_id: input.organizationId,
    p_business_id: input.businessId,
    p_channel_type: input.channelType,
    p_asset_id: input.assetId,
    p_display_number: whatsapp?.displayNumber ?? input.displayName ?? null,
    p_waba_id: whatsapp?.wabaId ?? null,
    p_connection_mode: whatsapp?.connectionMode ?? 'cloud_only',
    p_primary_waac_ids: whatsapp?.primaryWaacIds ?? [],
    p_credentials: credentials,
  })
  if (error || typeof data !== 'string') {
    console.error('Meta binding failed', { code: error?.code })
    if (error?.code === '23505') {
      throw new MetaLinkError('meta_conflict')
    }
    throw new Error('تعذّر حفظ ربط القناة. أعد المحاولة.')
  }
  return data
}
