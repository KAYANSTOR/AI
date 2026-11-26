import type { DbClient } from '@/lib/db/client'
import { getCentralLinkConfig } from './config'

type LinkOwner = { organizationId: string; userId: string }

export async function readCentralLinkStatus(db: DbClient, owner: LinkOwner, env: NodeJS.ProcessEnv = process.env) {
  const { data, error } = await db.from('personal_assistant_links')
    .select('whatsapp_phone, verified_at, kill_switch_active')
    .eq('org_id', owner.organizationId).eq('user_id', owner.userId).maybeSingle()
  if (error) throw new Error('link_status_failed')
  const phone = data?.whatsapp_phone ? String(data.whatsapp_phone) : null
  const linked = Boolean(data?.verified_at && phone)
  return {
    configured: getCentralLinkConfig(env) !== null,
    linked,
    phoneMasked: linked && phone ? `${phone.slice(0, 5)}•••${phone.slice(-3)}` : null,
    killSwitchActive: data?.kill_switch_active === true,
  }
}

/** Unlink is idempotent and remains available even if central credentials are absent. */
export async function unlinkCentralBot(db: DbClient, owner: LinkOwner): Promise<void> {
  const { error } = await db.from('personal_assistant_links')
    .update({ whatsapp_phone: null, verified_at: null, verification_token: null, token_expires_at: null })
    .eq('org_id', owner.organizationId).eq('user_id', owner.userId)
  if (error) throw new Error('link_disconnect_failed')
}
