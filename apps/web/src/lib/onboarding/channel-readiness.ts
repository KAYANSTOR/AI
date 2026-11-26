import type { DbClient } from '@/lib/db/client'
import { isOnboardingMessagingChannel, isOnboardingChannelReady } from '@/lib/channels/connect'
import { callWhatsAppGateway } from '@/lib/providers/whatsapp-gateway'

export type OnboardingChannel = {
  id: string
  channel_type: string
  verification_status: string | null
  external_identifier: string | null
  is_active: boolean | null
  connection_mode: string | null
}

async function qrIsConnected(id: string): Promise<boolean> {
  const result = await callWhatsAppGateway<{ connected: boolean }>(
    'GET', '/sessions/' + encodeURIComponent(id) + '/readiness', undefined, 2_000
  )
  return result.connected === true
}

/** Read the same scoped channel readiness for the wizard and the activation gate.
 * QR must have a live socket, not merely a previously verified database row.
 * Official integrations retain their provider-verified persisted state.
 */
export async function loadOnboardingChannels(
  db: DbClient, organizationId: string, businessId: string,
  checkQr: (id: string) => Promise<boolean> = qrIsConnected
): Promise<OnboardingChannel[]> {
  const { data, error } = await db.from('channels')
    .select('id, channel_type, verification_status, external_identifier, is_active, connection_mode')
    .eq('organization_id', organizationId).eq('business_id', businessId)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as OnboardingChannel[]
  return Promise.all(rows.filter((row) => isOnboardingMessagingChannel(row.channel_type)).map(async (row) => {
    if (row.channel_type !== 'whatsapp' || row.connection_mode !== 'qr_unofficial' || !isOnboardingChannelReady(row)) return row
    try {
      if (await checkQr(row.id)) return row
    } catch {
      // A temporary gateway outage never becomes a false positive.
    }
    return { ...row, verification_status: 'pending' }
  }))
}
