import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { DbClient } from '@/lib/db/client'
import { validateAppointmentInput } from '@/lib/appointments/validate-input'
import { createFakeDb } from './support/fake-db'

const ORG = 'org-a'
const input = { contactId: 'contact-a', serviceId: 'service-a', startsAt: '2026-12-01T10:00:00Z', endsAt: '2026-12-01T10:30:00Z' }
function db() {
  return createFakeDb({
    contacts: { rows: [{ id: 'contact-a', organization_id: ORG }, { id: 'contact-b', organization_id: 'org-b' }] },
    services: { rows: [
      { id: 'service-a', organization_id: ORG, is_active: true, duration_minutes: 30 },
      { id: 'service-b', organization_id: 'org-b', is_active: true, duration_minutes: 30 },
      { id: 'inactive', organization_id: ORG, is_active: false, duration_minutes: 30 },
    ] },
  }).client as unknown as DbClient
}

describe('appointment input and tenant scope', () => {
  test('accepts the owning tenant and authoritative duration', async () => {
    expect(await validateAppointmentInput(db(), ORG, input)).toEqual({ ok: true, startsAt: '2026-12-01T10:00:00.000Z', endsAt: '2026-12-01T10:30:00.000Z' })
  })
  test('rejects a contact in another tenant', async () => {
    expect((await validateAppointmentInput(db(), ORG, { ...input, contactId: 'contact-b' })).ok).toBe(false)
  })
  test('rejects a service in another tenant', async () => {
    expect((await validateAppointmentInput(db(), ORG, { ...input, serviceId: 'service-b' })).ok).toBe(false)
  })
  test('rejects inactive or missing services', async () => {
    for (const serviceId of ['inactive', 'missing']) expect((await validateAppointmentInput(db(), ORG, { ...input, serviceId })).ok).toBe(false)
  })
  test('rejects malformed, reversed or forged duration', async () => {
    for (const endsAt of ['invalid', input.startsAt, '2026-12-01T11:00:00Z']) expect((await validateAppointmentInput(db(), ORG, { ...input, endsAt })).ok).toBe(false)
  })
})

describe('dashboard server entrypoint wiring', () => {
  const source = (path: string) => readFileSync(new URL('../src/app/dashboard/' + path, import.meta.url), 'utf8')
  for (const path of ['appointments/page.tsx', 'services/page.tsx']) {
    test(path + ' enforces the capability before reading data', () => {
      expect(source(path)).toContain("await requireCapability('appointments')")
      expect(source(path)).toContain("if (error instanceof CapabilityDisabledError) redirect('/dashboard')")
    })
  }
  test('both service mutations enforce admin capability before writing', () => {
    const code = source('services/actions.ts')
    for (const name of ['createServiceAction', 'deleteServiceAction']) {
      const body = code.split('export async function ' + name)[1].split('export async function ')[0]
      expect(body.indexOf("await requireAdminCapability('appointments')")).toBeGreaterThan(-1)
      expect(body.indexOf("await requireAdminCapability('appointments')")).toBeLessThan(body.indexOf("ctx.db.from('services')"))
    }
  })
  test('appointment creation validates ownership before inserting', () => {
    const body = source('appointments/actions.ts').split('export async function createAppointmentAction')[1]
    expect(body.indexOf('await validateAppointmentInput')).toBeGreaterThan(-1)
    expect(body.indexOf('await validateAppointmentInput')).toBeLessThan(body.indexOf(".from('appointments').insert"))
  })
  test('status writes compare the previously observed status', () => {
    expect(source('appointments/actions.ts')).toContain(".eq('status', previousStatus)")
  })
})
