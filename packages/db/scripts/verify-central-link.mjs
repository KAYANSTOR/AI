import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
const rollback = new Error('ROLLBACK_CENTRAL_LINK_FIXTURES')
const orgA = randomUUID(), orgB = randomUUID(), userA = randomUUID(), userB = randomUUID()
const phone = '+12025550101'
try {
  await sql.begin(async tx => {
    await tx`INSERT INTO public.organizations(id,name,personal_assistant_addon_enabled) VALUES
      (${orgA},'Link test A',true),(${orgB},'Link test B',true)`
    await tx`INSERT INTO auth.users(id) VALUES (${userA}),(${userB})`
    await tx`INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
      (${orgA},${userA},'owner'),(${orgB},${userB},'owner')`
    const [a] = await tx`INSERT INTO public.personal_assistant_links(org_id,user_id,verification_token,token_expires_at,kill_switch_active)
      VALUES (${orgA},${userA},'TESTA1',now()+interval '15 minutes',true) RETURNING id`
    const [b] = await tx`INSERT INTO public.personal_assistant_links(org_id,user_id,whatsapp_phone,verified_at)
      VALUES (${orgB},${userB},${phone},now()) RETURNING id`
    await tx`SET LOCAL ROLE authenticated`
    await assert.rejects(tx.savepoint(sp => sp`SELECT public.consume_central_link_activation(${a.id},${orgA},${userA},'TESTA1',${phone})`), { code: '42501' })
    await tx`RESET ROLE`
    await tx`SET LOCAL ROLE anon`
    await assert.rejects(tx.savepoint(sp => sp`SELECT public.consume_central_link_activation(${a.id},${orgA},${userA},'TESTA1',${phone})`), { code: '42501' })
    await tx`RESET ROLE`
    await tx`SET LOCAL ROLE service_role`
    const consume = async (link, org, user, token, number = phone) => {
      const [result] = await tx`SELECT public.consume_central_link_activation(${link},${org},${user},${token},${number}) AS ok`
      return result.ok
    }
    assert.equal(await consume(a.id, orgB, userA, 'TESTA1'), false)
    assert.equal(await consume(a.id, orgA, userA, 'WRONG1'), false)
    let [previous] = await tx`SELECT whatsapp_phone FROM public.personal_assistant_links WHERE id=${b.id}`
    assert.equal(previous.whatsapp_phone, phone)
    await tx`UPDATE public.personal_assistant_links SET token_expires_at=now()-interval '1 second' WHERE id=${a.id}`
    assert.equal(await consume(a.id, orgA, userA, 'TESTA1'), false)
    await tx`UPDATE public.personal_assistant_links SET token_expires_at=now()+interval '15 minutes' WHERE id=${a.id}`
    assert.equal(await consume(a.id, orgA, userA, 'TESTA1'), true)
    const [linked] = await tx`SELECT whatsapp_phone,verification_token,token_expires_at,kill_switch_active,verified_at FROM public.personal_assistant_links WHERE id=${a.id}`
    assert.equal(linked.whatsapp_phone, phone)
    assert.equal(linked.verification_token, null)
    assert.equal(linked.token_expires_at, null)
    assert.equal(linked.kill_switch_active, true)
    assert.ok(linked.verified_at)
    ;[previous] = await tx`SELECT whatsapp_phone,verified_at FROM public.personal_assistant_links WHERE id=${b.id}`
    assert.equal(previous.whatsapp_phone, null)
    assert.equal(previous.verified_at, null)
    assert.equal(await consume(a.id, orgA, userA, 'TESTA1', '+12025550102'), false)
    await tx`RESET ROLE`
    await tx`DELETE FROM public.organization_members WHERE organization_id=${orgA} AND user_id=${userA}`
    await tx`UPDATE public.personal_assistant_links SET verification_token='TESTA2',token_expires_at=now()+interval '15 minutes' WHERE id=${a.id}`
    await tx`SET LOCAL ROLE service_role`
    assert.equal(await consume(a.id, orgA, userA, 'TESTA2', '+12025550102'), false)
    const [unchanged] = await tx`SELECT whatsapp_phone FROM public.personal_assistant_links WHERE id=${a.id}`
    assert.equal(unchanged.whatsapp_phone, phone)
    await tx`RESET ROLE`
    throw rollback
  })
} catch (error) {
  if (error !== rollback) throw error
} finally {
  await sql.end({ timeout: 5 })
}
console.log('Central link PostgreSQL verification passed: RPC privileges, ownership, expiry, transfer, replay, kill switch, membership revocation.')
