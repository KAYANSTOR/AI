import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  BILLING_PROVIDER_PUBLIC_COLUMNS,
  redactProviderConfiguration,
} from '@/lib/billing/payment-providers'

/**
 * OPS-004 — `billing_payment_providers` is service-role only. The dashboard must
 * read only public columns through the admin client, and admin responses must not
 * echo credentials.
 */
describe('OPS-004 billing provider access', () => {
  test('the public catalogue columns never include configuration', () => {
    const columns = BILLING_PROVIDER_PUBLIC_COLUMNS.split(',').map((column) => column.trim())
    expect(columns).toEqual(['code', 'display_name', 'provider_type', 'is_active'])
    expect(columns).not.toContain('configuration')
  })

  test('credential-bearing configuration values are redacted at every depth', () => {
    const redacted = redactProviderConfiguration({
      mode: 'live',
      api_key: 'should-not-leak',
      nested: { webhook_secret: 'nope', display_name: 'Esaalat' },
      public_wallet: '123',
    })
    expect(redacted.api_key).toBe('[redacted]')
    expect(redacted.nested).toEqual({ webhook_secret: '[redacted]', display_name: 'Esaalat' })
    expect(redacted.mode).toBe('live')
    expect(JSON.stringify(redacted)).not.toContain('should-not-leak')
    expect(JSON.stringify(redacted)).not.toContain('nope')
  })

  test('the dashboard page uses the admin catalogue loader, not the RLS client', () => {
    const source = readFileSync(new URL('../src/app/dashboard/billing/page.tsx', import.meta.url), 'utf8')
    expect(source).toContain('loadPublicPaymentProviders(admin)')
    expect(source).not.toContain(".from('billing_payment_providers')")
  })

  test('the owner console catalogue does not select configuration', () => {
    const source = readFileSync(
      new URL('../../owner-console/src/server/services/platformDataService.ts', import.meta.url),
      'utf8'
    )
    expect(source).toContain('SELECT id::text id,code,display_name,provider_type,is_active FROM billing_payment_providers')
    expect(source).not.toContain('provider_type,configuration,is_active')
  })
})
