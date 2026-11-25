import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required for the Phase 6 PostgreSQL check.')

const sql = postgres(databaseUrl, { max: 1 })
const rollback = new Error('ROLLBACK_PHASE6_FIXTURES')
const organizations = [randomUUID(), randomUUID()]
const users = [randomUUID(), randomUUID()]
const actor = randomUUID()

try {
  await sql.begin(async tx => {
    await tx`INSERT INTO public.organizations(id,name,conversation_csat_enabled) VALUES
      (${organizations[0]},'Phase 6 A',true),(${organizations[1]},'Phase 6 B',false)`
    await tx`INSERT INTO auth.users(id) VALUES (${users[0]}),(${users[1]})`
    await tx`INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
      (${organizations[0]},${users[0]},'owner'),(${organizations[1]},${users[1]},'owner')`
    await tx`INSERT INTO public.platform_admins(id,email,full_name,role,password_hash) VALUES
      (${actor},${`${actor}@example.test`},'CI billing owner','platform_owner','unused fixture')`

    const [first, second] = await tx`INSERT INTO public.agent_tasks(org_id,user_id,goal,state,specialized_agent_kind) VALUES
      (${organizations[0]},${users[0]},'Heavy task','done','ops'),
      (${organizations[0]},${users[0]},'Second heavy task','failed','ops') RETURNING id`
    const requestId = randomUUID()
    const [grant] = await tx`SELECT id, balance_after FROM public.grant_usage_credits(${organizations[0]},${requestId},${actor},3)`
    const [duplicate] = await tx`SELECT id, balance_after FROM public.grant_usage_credits(${organizations[0]},${requestId},${actor},3)`
    assert.deepEqual(duplicate, grant)
    assert.equal(Number(grant.balance_after), 3)
    await tx`SELECT public.grant_usage_credits(${organizations[1]},${randomUUID()},${actor},7)`

    const [channel] = await tx`INSERT INTO public.channels(organization_id,channel_type,connection_mode)
      VALUES (${organizations[0]},'whatsapp','cloud_api') RETURNING id`
    const [contact] = await tx`INSERT INTO public.contacts(organization_id,phone) VALUES (${organizations[0]},'+967700000000') RETURNING id`
    const [conversation] = await tx`INSERT INTO public.conversations(organization_id,channel_id,contact_id)
      VALUES (${organizations[0]},${channel.id},${contact.id}) RETURNING id`
    await tx`INSERT INTO public.messages(organization_id,conversation_id,direction,sender_type,content) VALUES
      (${organizations[0]},${conversation.id},'inbound','contact','hello'),
      (${organizations[0]},${conversation.id},'outbound','ai','hello back')`
    await tx`UPDATE public.conversations SET status='closed',state='closed',resolved_at=now() WHERE id=${conversation.id}`
    const [event] = await tx`SELECT id,resolved_automatically,survey_requested FROM public.conversation_quality_events WHERE conversation_id=${conversation.id}`
    assert.equal(event.resolved_automatically, true)
    assert.equal(event.survey_requested, true)
    const [outbox] = await tx`UPDATE public.outbox_events SET status='sent' WHERE idempotency_key=${`csat:${event.id}`}
      RETURNING recipient,event_type`
    assert.equal(outbox.event_type, 'conversation.csat_requested')

    const tables = ['org_credit_wallets', 'credit_ledger_entries', 'conversation_quality_events']
    const rls = await tx`SELECT relname FROM pg_class WHERE relname IN ${tx(tables)} AND relrowsecurity`
    assert.equal(rls.length, tables.length)
    async function asRole(role, userId, check) {
      await tx`SELECT set_config('request.jwt.claim.sub', ${userId}, true), set_config('request.jwt.claim.role', ${role}, true)`
      await tx`SET LOCAL ROLE ${tx(role)}`
      await check()
      await tx`RESET ROLE`
    }
    const denied = { code: '42501' }
    await asRole('service_role', '', async () => {
      const debit = async (task, amount, org = organizations[0]) => {
        const [row] = await tx`SELECT public.consume_usage_credits(${org},${task},${amount}) AS decision`
        return row.decision
      }
      assert.equal(await debit(first.id, 2), 'charged')
      assert.equal(await debit(first.id, 2), 'already_charged')
      assert.equal(await debit(second.id, 2), 'insufficient')
      const [wallet] = await tx`SELECT balance FROM public.org_credit_wallets WHERE org_id=${organizations[0]}`
      assert.equal(Number(wallet.balance), 1)
      await assert.rejects(tx.savepoint(sp => sp`DELETE FROM public.credit_ledger_entries WHERE task_id=${first.id}`), denied)
      await assert.rejects(tx.savepoint(sp => sp`SELECT public.consume_usage_credits(${organizations[1]},${first.id},1)`), { code: '22023' })
      const rate = async (phone, rating) => {
        const [row] = await tx`SELECT public.record_conversation_rating(${event.id},${organizations[0]},${channel.id},${phone},${rating}) AS accepted`
        return row.accepted
      }
      assert.equal(await rate('967711111111', 'excellent'), false)
      assert.equal(await rate(outbox.recipient, 'excellent'), true)
      assert.equal(await rate(outbox.recipient, 'needs_improvement'), false)
    })

    await asRole('authenticated', users[0], async () => {
      for (const table of tables) {
        const rows = await tx`SELECT org_id FROM public.${tx(table)} WHERE org_id IN ${tx(organizations)}`
        assert.ok(rows.length > 0)
        assert.ok(rows.every(row => row.org_id === organizations[0]))
        await assert.rejects(tx.savepoint(sp => sp`DELETE FROM public.${sp(table)} WHERE org_id=${organizations[0]}`), denied)
      }
      const [quality] = await tx`SELECT * FROM public.agent_quality_summary(${organizations[0]},now() - interval '30 days')`
      assert.deepEqual({ ...quality }, { resolved: 1, auto_resolved: 1, tasks: 2, tasks_completed: 1, ratings: 1, positive_ratings: 1 })
      await assert.rejects(tx.savepoint(sp => sp`SELECT * FROM public.agent_quality_summary(${organizations[1]},now())`), denied)
      await assert.rejects(tx.savepoint(sp => sp`SELECT public.consume_usage_credits(${organizations[0]},${second.id},1)`), denied)
      await assert.rejects(tx.savepoint(sp => sp`SELECT actor_id, request_id FROM public.credit_ledger_entries`), denied)
    })
    await asRole('anon', '', async () => {
      for (const table of tables) {
        await assert.rejects(tx.savepoint(sp => sp`SELECT org_id FROM public.${sp(table)}`), denied)
      }
    })
    throw rollback
  })
} catch (error) {
  if (error !== rollback) throw error
} finally {
  await sql.end({ timeout: 5 })
}

console.log('Phase 6 PostgreSQL verification passed: RLS, append-only credits, idempotent spending and grants, CSAT and organization-scoped metrics.')
