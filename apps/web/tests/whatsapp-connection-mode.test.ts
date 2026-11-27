import { describe, expect, test } from 'bun:test'
import { canRegisterWhatsAppCloudApiNumber, resolveWhatsAppConnectionMode } from '@/lib/channels/whatsapp-connection-mode'

describe('WhatsApp connection mode', () => {
  test('confirms coexistence only when Meta reports the app and Cloud API together', () => {
    expect(resolveWhatsAppConnectionMode({ isOnBizApp: true, platformType: 'CLOUD_API', sessionMarkedCoexistence: true })).toBe('coexistence')
  })
  test('rejects a browser Coexistence event when Meta does not confirm app usage', () => {
    expect(() => resolveWhatsAppConnectionMode({ isOnBizApp: false, platformType: 'CLOUD_API', sessionMarkedCoexistence: true })).toThrow('لم تؤكد ميتا أن الرقم يعمل مع تطبيق واتساب للأعمال.')
  })
  test('rejects app usage when Cloud API registration is not confirmed', () => {
    expect(() => resolveWhatsAppConnectionMode({ isOnBizApp: true, platformType: 'WHATSAPP_BUSINESS_APP', sessionMarkedCoexistence: true })).toThrow('لم تؤكد ميتا تسجيل الرقم في خدمة واتساب السحابية.')
  })
  test('uses standard mode when Meta reports no Business App connection', () => {
    expect(resolveWhatsAppConnectionMode({ isOnBizApp: false, platformType: 'CLOUD_API', sessionMarkedCoexistence: false })).toBe('cloud_api')
  })
  test('blocks /register only for Coexistence', () => {
    expect(canRegisterWhatsAppCloudApiNumber('coexistence')).toBe(false)
    expect(canRegisterWhatsAppCloudApiNumber('cloud_api')).toBe(true)
  })
})
