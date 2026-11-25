import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required for the Phase 5 RLS check.')

const sql = postgres(databaseUrl, { max: 1 })
const rollback = new Error('ROLLBACK_PHASE5_RLS_FIXTURES')
const tables = ['whatsapp_message_templates', 'user_tool_connections', 'user_secret_vault']
const sharedOrg = randomUUID()
const separateOrg = randomUUID()
const owner = randomUUID()
const colleague = randomUUID()
const outsider = randomUUID()

try {
  await sql.begin(async tx => {
    await tx`INSERT INTO public.organizations (id, name) VALUES
      (${sharedOrg}, 'Phase 5 audit organization A'), (${separateOrg}, 'Phase 5 audit organization B')`

    const [channelA, channelB] = await tx`INSERT INTO public.channels (organization_id, channel_type)
      VALUES (${sharedOrg}, 'whatsapp'), (${separateOrg}, 'whatsapp') RETURNING id`

    await tx`INSERT INTO auth.users (id) VALUES (${owner}), (${colleague}), (${outsider})`
    await tx`INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
      (${sharedOrg}, ${owner}, 'owner'), (${sharedOrg}, ${colleague}, 'admin'), (${separateOrg}, ${outsider}, 'owner')`

    const rls = await tx`SELECT relname FROM pg_class WHERE oid IN (
      'public.whatsapp_message_templates'::regclass, 'public.user_tool_connections'::regclass,
      'public.user_secret_vault'::regclass) AND relrowsecurity`
    assert.equal(rls.length, tables.length)

    async function asRole(role, userId, check) {
      await tx`SELECT set_config('request.jwt.claim.sub', ${userId}, true),
        set_config('request.jwt.claim.role', ${role}, true)`
      await tx`SET LOCAL ROLE ${tx(role)}`
      await check()
      await tx`RESET ROLE`
    }

    async function expectDenied(query, description) {
      await assert.rejects(tx.savepoint(query), { code: '42501' }, description)
    }

    await asRole('service_role', '', async () => {
      await tx`INSERT INTO public.whatsapp_message_templates
        (org_id, channel_id, template_name, language_code, category, body_text) VALUES
        (${sharedOrg}, ${channelA.id}, 'audit_a', 'ar', 'UTILITY', 'A'),
        (${separateOrg}, ${channelB.id}, 'audit_b', 'ar', 'UTILITY', 'B')`

      await tx.savepoint(async sp => {
        await sp`INSERT INTO public.whatsapp_message_templates
          (org_id, channel_id, template_name, language_code, category, body_text)
          VALUES (${sharedOrg}, ${channelA.id}, ${'a'.repeat(512)}, 'en', 'UTILITY', 'Length boundary')`
        await sp`DELETE FROM public.whatsapp_message_templates WHERE template_name = ${'a'.repeat(512)} AND org_id = ${sharedOrg}`
      })
      for (const name of ['a'.repeat(513), 'invalid-name']) {
        await assert.rejects(tx.savepoint(sp => sp`INSERT INTO public.whatsapp_message_templates
          (org_id, channel_id, template_name, language_code, category, body_text)
          VALUES (${sharedOrg}, ${channelA.id}, ${name}, 'en', 'UTILITY', 'Invalid name')`), { code: '23514' })
      }

      for (const [orgId, userId] of [[sharedOrg, owner], [sharedOrg, colleague], [separateOrg, outsider]]) {
        await tx`INSERT INTO public.user_tool_connections (org_id, user_id, provider, encrypted_tokens)
          VALUES (${orgId}, ${userId}, 'gmail', 'fixture token envelope')`
        await tx`INSERT INTO public.user_secret_vault (org_id, user_id, secret_ref, label, ciphertext, fingerprint)
          VALUES (${orgId}, ${userId}, ${`sec_${userId.replaceAll('-', '')}`}, 'fixture', 'fixture ciphertext', '0000000000000000')`
      }

      const connectors = await tx`SELECT encrypted_tokens FROM public.user_tool_connections
        WHERE user_id IN (${owner}, ${colleague}, ${outsider})`
      assert.equal(connectors.length, 3)
      const secrets = await tx`SELECT ciphertext FROM public.user_secret_vault
        WHERE user_id IN (${owner}, ${colleague}, ${outsider})`
      assert.equal(secrets.length, 3)
      await expectDenied(sp => sp`UPDATE public.user_secret_vault SET ciphertext = 'replacement'
        WHERE user_id = ${owner}`, 'service_role cannot replace an existing vault value')
    })

    for (const [userId, orgId] of [[owner, sharedOrg], [colleague, sharedOrg], [outsider, separateOrg]]) {
      await asRole('authenticated', userId, async () => {
        const templates = await tx`SELECT org_id FROM public.whatsapp_message_templates
          WHERE org_id IN (${sharedOrg}, ${separateOrg})`
        assert.deepEqual(templates.map(row => row.org_id), [orgId])

        for (const table of ['user_tool_connections', 'user_secret_vault']) {
          const rows = await tx`SELECT org_id, user_id FROM public.${tx(table)}
            WHERE org_id IN (${sharedOrg}, ${separateOrg})`
          assert.deepEqual(rows.map(row => [row.org_id, row.user_id]), [[orgId, userId]])
        }

        await expectDenied(sp => sp`SELECT encrypted_tokens FROM public.user_tool_connections WHERE user_id = ${userId}`,
          'authenticated cannot read encrypted connector tokens')
        await expectDenied(sp => sp`SELECT ciphertext FROM public.user_secret_vault WHERE user_id = ${userId}`,
          'authenticated cannot read vault ciphertext')
        for (const table of tables) {
          await expectDenied(sp => sp`DELETE FROM public.${sp(table)} WHERE org_id = ${orgId}`,
            `authenticated cannot delete from ${table}`)
        }
      })
    }

    await asRole('anon', '', async () => {
      for (const table of tables) {
        await expectDenied(sp => sp`SELECT org_id FROM public.${sp(table)}`, `anon cannot read ${table}`)
      }
    })

    for (const table of ['agent_receipts', 'billing_ledger_entries']) {
      for (const privilege of ['UPDATE', 'DELETE']) {
        const [{ granted }] = await tx`SELECT has_table_privilege('service_role', ${`public.${table}`}, ${privilege}) AS granted`
        assert.equal(granted, false, `${table} stays append-only for service_role (${privilege})`)
      }
    }
    for (const role of ['anon', 'authenticated']) {
      const [{ canTruncate, canAlterLedger }] = await tx`SELECT
        has_table_privilege(${role}, 'public.plan_prices', 'TRUNCATE') AS "canTruncate",
        has_table_privilege(${role}, 'public.schema_migrations', 'INSERT, UPDATE, DELETE') AS "canAlterLedger"`
      assert.equal(canTruncate, false, `${role} cannot truncate plans outside RLS`)
      assert.equal(canAlterLedger, false, `${role} cannot modify the migration ledger`)
      for (const table of ['whatsapp_gateway_sessions', 'whatsapp_gateway_auth_keys']) {
        const [{ enabled, canRead, canWrite }] = await tx`SELECT relrowsecurity AS enabled,
          has_table_privilege(${role}, oid, 'SELECT') AS "canRead",
          has_table_privilege(${role}, oid, 'INSERT, UPDATE, DELETE') AS "canWrite"
          FROM pg_class WHERE oid = ${`public.${table}`}::regclass`
        assert.equal(enabled, true, `${table} enforces RLS`)
        assert.equal(canRead, false, `${role} cannot read ${table}`)
        assert.equal(canWrite, false, `${role} cannot write ${table}`)
      }
    }

    throw rollback
  })
} catch (error) {
  if (error !== rollback) throw error
} finally {
  await sql.end({ timeout: 5 })
}

console.log('Phase 5 PostgreSQL RLS passed: three roles, two organizations, same-org user isolation, protected columns, and append-only grants.')
