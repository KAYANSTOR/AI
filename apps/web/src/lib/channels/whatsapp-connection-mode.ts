export type WhatsAppConnectionMode = 'cloud_api' | 'coexistence'

/** Resolve the final mode from Meta's phone resource, not only a browser callback. */
export function resolveWhatsAppConnectionMode(input: { isOnBizApp: boolean; platformType: string | null | undefined; sessionMarkedCoexistence: boolean }): WhatsAppConnectionMode {
  if (input.sessionMarkedCoexistence && input.isOnBizApp !== true) throw new Error('Meta did not confirm that this number is active in WhatsApp Business App Coexistence.')
  if (input.isOnBizApp === true) {
    if (input.platformType?.trim().toUpperCase() !== 'CLOUD_API') throw new Error('Meta confirmed WhatsApp Business App use but did not confirm Cloud API registration.')
    return 'coexistence'
  }
  return 'cloud_api'
}

/** Coexistence is already registered during Embedded Signup; never call /register. */
export function canRegisterWhatsAppCloudApiNumber(mode: string | null | undefined): boolean { return mode !== 'coexistence' }
