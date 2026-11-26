import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
const rollback = new Error('ROLLBACK_TOUR_FIXTURES')
const a = randomUUID(), b = randomUUID(), owner = randomUUID(), colleague = randomUUID(), outsider = randomUUID()
try {
  await sql.begin(async tx => {
    await tx`INSERT INTO public.organizations(id,name) VALUES (${a},'Guide A'),(${b},'Guide B')`
    await tx`INSERT INTO auth.users(id) VALUES (${owner}),(${colleague}),(${outsider})`
    await tx`INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
      (${a},${owner},'owner'),(${a},${colleague},'read_only'),(${b},${outsider},'owner')`
    async function asRole(role,user,check) {
      await tx`SELECT set_config('request.jwt.claim.sub', ${user}, true), set_config('request.jwt.claim.role', ${role}, true)`
      await tx`SET LOCAL ROLE ${tx(role)}`
      await check()
      await tx`RESET ROLE`
    }
    const write = (org,user,version,track,step,status) => tx`INSERT INTO public.dashboard_tour_progress
      (organization_id,user_id,tour_version,track,step_id,status)
      VALUES (${org},${user},${version},${track},${step},${status})
      ON CONFLICT (organization_id,user_id,tour_version,track) DO UPDATE SET step_id=EXCLUDED.step_id,status=EXCLUDED.status`
    for (const [org,user] of [[a,owner],[a,colleague],[b,outsider]]) {
      await asRole('authenticated',user,async () => {
        await write(org,user,1,'commercial','navigation','active')
        await write(org,user,1,'commercial','account','paused')
        const rows = await tx`SELECT organization_id,user_id,step_id,status FROM public.dashboard_tour_progress`
        assert.deepEqual(rows.map(row=>({...row})),[{organization_id:org,user_id:user,step_id:'account',status:'paused'}])
      })
    }
    await asRole('authenticated',owner,async () => {
      await write(a,owner,1,'personal','personal_main','active')
      await write(a,owner,2,'commercial','business_services','active')
      const rows = await tx`SELECT track,tour_version FROM public.dashboard_tour_progress ORDER BY tour_version,track`
      assert.deepEqual(rows.map(row=>({...row})),[{track:'commercial',tour_version:1},{track:'personal',tour_version:1},{track:'commercial',tour_version:2}])
      await assert.rejects(tx.savepoint(sp=>sp`INSERT INTO public.dashboard_tour_progress
        (organization_id,user_id,tour_version,track,step_id,status)
        VALUES (${b},${owner},1,'commercial','account','active')`),{code:'42501'})
      await assert.rejects(tx.savepoint(sp=>sp`INSERT INTO public.dashboard_tour_progress
        (organization_id,user_id,tour_version,track,step_id,status)
        VALUES (${a},${colleague},2,'commercial','account','active')`),{code:'42501'})
      const changed=await tx`UPDATE public.dashboard_tour_progress SET status='completed' WHERE user_id=${colleague} RETURNING user_id`
      assert.equal(changed.length,0)
      await assert.rejects(tx.savepoint(sp=>sp`DELETE FROM public.dashboard_tour_progress WHERE user_id=${owner}`),{code:'42501'})
    })
    await asRole('anon','',async () => {
      await assert.rejects(tx.savepoint(sp=>sp`SELECT * FROM public.dashboard_tour_progress`),{code:'42501'})
    })
    throw rollback
  })
} catch (error) {
  if (error !== rollback) throw error
} finally {
  await sql.end({ timeout:5 })
}
console.log('Dashboard tour PostgreSQL verification passed: owner-scoped upsert, same-org user isolation, tenant isolation, track/version persistence, anonymous denial.')
