export type WhatsAppConnectionMode = 'cloud_api' | 'coexistence' | 'qr_unofficial'

/** Resolve the final mode from Meta's phone resource, not only a browser callback. */
export function resolveWhatsAppConnectionMode(input: { isOnBizApp: boolean; platformType: string | null | undefined; sessionMarkedCoexistence: boolean }): 'cloud_api' | 'coexistence' {
  if (input.sessionMarkedCoexistence && input.isOnBizApp !== true) throw new Error('لم تؤكد ميتا أن الرقم يعمل مع تطبيق واتساب للأعمال.')
  if (input.isOnBizApp === true) {
    if (input.platformType?.trim().toUpperCase() !== 'CLOUD_API') throw new Error('لم تؤكد ميتا تسجيل الرقم في خدمة واتساب السحابية.')
    return 'coexistence'
  }
  return 'cloud_api'
}

/** Coexistence is already registered during Embedded Signup; never call /register. */
export function canRegisterWhatsAppCloudApiNumber(mode: string | null | undefined): boolean {
  return mode !== 'coexistence' && mode !== 'qr_unofficial'
}

export function publicMetaConnectionMode(mode: string | null): 'cloud_only' | 'coexistence' | null {
  if (mode === 'coexistence') return 'coexistence'
  if (mode === 'cloud_api' || mode === 'cloud_only') return 'cloud_only'
  return null
}

export function whatsAppConnectionModeLabel(mode: string | null): string | null {
  const publicMode = publicMetaConnectionMode(mode)
  if (publicMode === 'coexistence') return 'التعايش مع تطبيق واتساب للأعمال'
  if (publicMode === 'cloud_only') return 'الربط السحابي فقط'
  return null
}
