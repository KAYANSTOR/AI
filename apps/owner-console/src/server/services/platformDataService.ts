import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;
let pool: Sql | null = null;
function db(): Sql {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL غير مهيأ.');
  const host = new URL(url).hostname;
  pool = postgres(url, {
    ssl: process.env.DATABASE_SSL === 'require' ? 'require' : process.env.DATABASE_SSL === 'disable' || host.endsWith('.railway.internal') ? false : 'require',
    max: 5, idle_timeout: 20, connect_timeout: 10, prepare: false,
    connection: { TimeZone: 'UTC', application_name: 'kayan-owner-console' }, onnotice: () => {},
  });
  return pool;
}
function q<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  return db().unsafe<T[]>(sql, args as never[]);
}
const n = (v: unknown) => Number(v ?? 0);
const nameSql = "COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''),NULLIF(u.raw_user_meta_data->>'name',''),NULLIF(split_part(COALESCE(u.email,''),'@',1),''),'مستخدم')";

export async function platformStatus() {
  const [r] = await q<{database_name:string;users:string;organizations:string;subscriptions:string}>(`SELECT current_database() database_name,
    (SELECT COUNT(*) FROM auth.users WHERE deleted_at IS NULL)::text users,
    (SELECT COUNT(*) FROM organizations)::text organizations,
    (SELECT COUNT(*) FROM subscriptions)::text subscriptions`);
  return {connected:true,engine:'PostgreSQL',database:r.database_name,counts:{users:n(r.users),organizations:n(r.organizations),subscriptions:n(r.subscriptions)},ownerSecurityStore:'SQLite منفصلة لسجلات المالك والجلسات'};
}

export async function platformUsers(f:{search?:string;status?:string;paymentStatus?:string;sortBy?:string;sortDir?:'asc'|'desc';page?:number;pageSize?:number}) {
  const page=Math.max(1,Number(f.page)||1),size=Math.min(100,Math.max(5,Number(f.pageSize)||20));
  const where=['u.deleted_at IS NULL'],args:unknown[]=[];
  const add=(s:string,v:unknown)=>{args.push(v);where.push(s.replace('?',`$${args.length}`));};
  if(f.search?.trim()){args.push(`%${f.search.trim()}%`);const p=args.length;where.push(`(${nameSql} ILIKE $${p} OR COALESCE(u.email,'') ILIKE $${p} OR COALESCE(u.phone,'') ILIKE $${p} OR u.id::text ILIKE $${p})`);}
  if(f.status==='suspended')where.push('u.banned_until>NOW()');
  if(f.status==='active')where.push('(u.banned_until IS NULL OR u.banned_until<=NOW())');
  if(f.status==='trial')where.push("EXISTS(SELECT 1 FROM subscriptions s JOIN organization_members m ON m.organization_id=s.organization_id WHERE m.user_id=u.id AND m.role='owner' AND s.status='trial')");
  if(f.paymentStatus&&f.paymentStatus!=='all')add("EXISTS(SELECT 1 FROM subscriptions s JOIN organization_members m ON m.organization_id=s.organization_id WHERE m.user_id=u.id AND m.role='owner' AND s.status=?)",f.paymentStatus==='paid'?'active':f.paymentStatus);
  const w=where.join(' AND '),sorts:Record<string,string>={created_at:'u.created_at',full_name:nameSql,last_active_at:'u.last_sign_in_at'};
  const sort=sorts[f.sortBy||'created_at']||'u.created_at',dir=f.sortDir==='asc'?'ASC':'DESC';
  const [count]=await q<{total:string}>(`SELECT COUNT(*)::text total FROM auth.users u WHERE ${w}`,args);
  const items=await q(`SELECT u.id::text id,${nameSql} full_name,u.email,u.phone,
    CASE WHEN u.banned_until>NOW() THEN 'suspended' WHEN latest.status='trial' THEN 'trial' ELSE 'active' END account_status,
    CASE WHEN latest.status='active' THEN 'paid' WHEN latest.status='trial' THEN 'trial' WHEN latest.status='past_due' THEN 'past_due' ELSE 'unpaid' END payment_status,
    latest.status subscription_status,latest.plan_tier plan_code,latest.plan_tier plan_name,latest.period_end::text subscription_end_at,
    u.last_sign_in_at::text last_active_at,u.created_at::text created_at,
    (SELECT COUNT(*) FROM organization_members m WHERE m.user_id=u.id AND m.role='owner')::int workspaces_count,
    (SELECT COUNT(*) FROM ai_agents a JOIN organization_members m ON m.organization_id=a.organization_id WHERE m.user_id=u.id AND m.role='owner')::int agents_count,
    (SELECT COALESCE(SUM(COALESCE(ar.input_tokens,0)+COALESCE(ar.output_tokens,0)),0)::bigint FROM agent_runs ar JOIN organization_members m ON m.organization_id=ar.organization_id WHERE m.user_id=u.id AND m.role='owner') total_tokens,
    (SELECT COUNT(*) FROM conversations c JOIN organization_members m ON m.organization_id=c.organization_id WHERE m.user_id=u.id AND m.role='owner')::int conversations_count
    FROM auth.users u LEFT JOIN LATERAL(SELECT s.status,s.plan_tier,s.period_end FROM subscriptions s JOIN organization_members m ON m.organization_id=s.organization_id AND m.user_id=u.id AND m.role='owner' ORDER BY s.created_at DESC LIMIT 1) latest ON TRUE
    WHERE ${w} ORDER BY ${sort} ${dir} NULLS LAST LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,size,(page-1)*size]);
  const total=n(count?.total);
  return {items,pagination:{page,pageSize:size,total,totalPages:Math.max(1,Math.ceil(total/size))}};
}

export async function platformUserDetail(id:string) {
  const [user]=await q(`SELECT u.id::text id,${nameSql} full_name,u.email,u.phone,u.created_at::text created_at,u.last_sign_in_at::text last_active_at,
    CASE WHEN u.banned_until>NOW() THEN 'suspended' ELSE 'active' END account_status,u.raw_user_meta_data user_metadata
    FROM auth.users u WHERE u.id=$1::uuid AND u.deleted_at IS NULL`,[id]);
  if(!user)return null;
  const [workspaces,subscriptions,agents,channels,conversations,usage]=await Promise.all([
    q(`SELECT o.id::text id,o.name,b.id::text business_id,b.name business_name,b.business_type_id business_type,COALESCE(b.status,'active') status,o.created_at::text created_at
      FROM organization_members m JOIN organizations o ON o.id=m.organization_id LEFT JOIN businesses b ON b.organization_id=o.id
      WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY o.created_at DESC`,[id]),
    q(`SELECT s.id::text id,s.organization_id::text organization_id,s.plan_tier plan_code,s.plan_tier plan_name,s.status,s.period_start::text current_period_start,
      s.period_end::text current_period_end,s.minutes_used,s.sms_used,s.created_at::text created_at FROM subscriptions s
      JOIN organization_members m ON m.organization_id=s.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY s.created_at DESC`,[id]),
    q(`SELECT a.id::text id,a.organization_id::text organization_id,a.business_id::text workspace_id,a.name,a.model_provider provider_code,a.status,a.temperature,a.locale,a.created_at::text created_at
      FROM ai_agents a JOIN organization_members m ON m.organization_id=a.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY a.created_at DESC`,[id]),
    q(`SELECT c.id::text id,c.organization_id::text organization_id,c.channel_type,c.is_active,c.verification_status,c.external_identifier,c.created_at::text created_at
      FROM channels c JOIN organization_members m ON m.organization_id=c.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY c.created_at DESC`,[id]),
    q(`SELECT c.id::text id,c.status,c.state,c.channel_id::text channel_id,c.last_message_at::text last_message_at,ch.channel_type,
      COALESCE(ct.first_name,'')||CASE WHEN ct.last_name IS NULL THEN '' ELSE ' '||ct.last_name END customer_name
      FROM conversations c JOIN organization_members m ON m.organization_id=c.organization_id LEFT JOIN channels ch ON ch.id=c.channel_id
      LEFT JOIN contacts ct ON ct.id=c.contact_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY c.last_message_at DESC LIMIT 50`,[id]),
    q(`SELECT COUNT(*)::int requests,COALESCE(SUM(COALESCE(ar.input_tokens,0)),0)::bigint input_tokens,
      COALESCE(SUM(COALESCE(ar.output_tokens,0)),0)::bigint output_tokens,COALESCE(SUM(COALESCE(ar.input_tokens,0)+COALESCE(ar.output_tokens,0)),0)::bigint total_tokens
      FROM agent_runs ar JOIN organization_members m ON m.organization_id=ar.organization_id WHERE m.user_id=$1::uuid AND m.role='owner'`,[id])
  ]);
  return {user,workspaces,subscriptions,invoices:[],payments:[],agents,channels,knowledgeSources:[],conversations,aiUsage:{summary:usage[0]||{},recentEvents:[]},auditActivity:[],sessions:[],errors:[],entitlements:[]};
}

export async function platformWorkspaces(search?:string) {
  const args:unknown[]=[];let where='';
  if(search?.trim()){args.push(`%${search.trim()}%`);where='WHERE o.name ILIKE $1 OR b.name ILIKE $1 OR u.email ILIKE $1';}
  const items=await q(`SELECT o.id::text id,o.name,b.id::text business_id,b.name business_name,b.business_type_id business_type,COALESCE(b.status,'active') status,
    o.created_at::text created_at,u.id::text owner_user_id,${nameSql} owner_name,u.email owner_email,
    (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id=o.id)::int member_count,
    (SELECT COUNT(*) FROM ai_agents a WHERE a.organization_id=o.id)::int agents_count
    FROM organizations o LEFT JOIN businesses b ON b.organization_id=o.id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id ${where} ORDER BY o.created_at DESC LIMIT 500`,args);
  return {items};
}

export async function platformSubscriptions(status?:string) {
  const args:unknown[]=[];const where=status&&status!=='all'?(args.push(status),'WHERE s.status=$1'):'';
  const items=await q(`SELECT s.id::text id,s.organization_id::text organization_id,s.plan_tier plan_code,s.plan_tier plan_name,s.status,
    s.period_start::text current_period_start,s.period_end::text current_period_end,s.minutes_used,s.sms_used,s.created_at::text created_at,
    o.name workspace_name,u.id::text user_id,${nameSql} user_name,u.email user_email
    FROM subscriptions s JOIN organizations o ON o.id=s.organization_id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id ${where} ORDER BY s.created_at DESC LIMIT 1000`,args);
  const [summary]=await q(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='active')::int active,COUNT(*) FILTER(WHERE status='trial')::int trial,
    COUNT(*) FILTER(WHERE status='past_due')::int past_due,COUNT(*) FILTER(WHERE status='expired')::int expired,COUNT(*) FILTER(WHERE status='cancelled')::int cancelled FROM subscriptions`);
  return {items,summary};
}

export async function platformAgents(f:{search?:string;status?:string;provider?:string}={}) {
  const clauses:string[]=[];const args:unknown[]=[];
  const add=(s:string,v:unknown)=>{args.push(v);clauses.push(s.replace('?',`$${args.length}`));};
  if(f.status&&f.status!=='all')add('a.status=?',f.status);
  if(f.provider&&f.provider!=='all')add('a.model_provider=?',f.provider);
  if(f.search?.trim()){args.push(`%${f.search.trim()}%`);const p=args.length;clauses.push(`(a.name ILIKE $${p} OR o.name ILIKE $${p} OR u.email ILIKE $${p})`);}
  return q(`SELECT a.id::text id,a.organization_id::text organization_id,a.business_id::text workspace_id,a.name,a.model_provider provider_code,
    a.model_provider provider_name,a.status,a.temperature,a.locale,a.slug,a.created_at::text created_at,o.name workspace_name,u.email owner_email,
    ${nameSql} owner_name,(SELECT COUNT(*) FROM conversations c WHERE c.organization_id=a.organization_id)::int conversations_count,
    (SELECT COUNT(*) FROM agent_runs r WHERE r.agent_id=a.id)::int executions_count,
    (SELECT COUNT(*) FROM agent_runs r WHERE r.agent_id=a.id AND r.status='completed')::int success_count,
    (SELECT COUNT(*) FROM agent_runs r WHERE r.agent_id=a.id AND r.status='failed')::int error_count,
    (SELECT COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint FROM agent_runs r WHERE r.agent_id=a.id) total_tokens
    FROM ai_agents a JOIN organizations o ON o.id=a.organization_id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY a.created_at DESC LIMIT 500`,args);
}

export async function platformAiUsage(f:{userId?:string;agentId?:string;modelId?:string;providerCode?:string;status?:string;page?:number;pageSize?:number}) {
  const page=Math.max(1,Number(f.page)||1),size=Math.min(100,Math.max(10,Number(f.pageSize)||25));
  const clauses:string[]=[];const args:unknown[]=[];
  const add=(s:string,v:unknown)=>{args.push(v);clauses.push(s.replace('?',`$${args.length}`));};
  if(f.userId)add('own.user_id=?::uuid',f.userId);if(f.agentId)add('r.agent_id=?::uuid',f.agentId);
  if(f.modelId&&f.modelId!=='all')add('r.model=?',f.modelId);if(f.providerCode&&f.providerCode!=='all')add('r.model_provider=?',f.providerCode);
  if(f.status&&f.status!=='all')add('r.status=?',f.status);
  const where=clauses.length?'WHERE '+clauses.join(' AND '):'';
  const [cnt]=await q<{total:string}>(`SELECT COUNT(*)::text total FROM agent_runs r LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=r.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE ${where}`,args);
  const items=await q(`SELECT r.id::text id,r.organization_id::text organization_id,r.agent_id::text agent_id,r.model_provider provider_code,r.model model_id,r.status,
    r.input_tokens,r.output_tokens,(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)) total_tokens,r.latency_ms,r.error_code,r.created_at::text created_at,
    o.name workspace_name,a.name agent_name,u.id::text user_id,u.email user_email,${nameSql} user_name
    FROM agent_runs r LEFT JOIN organizations o ON o.id=r.organization_id LEFT JOIN ai_agents a ON a.id=r.agent_id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=r.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id ${where} ORDER BY r.created_at DESC LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,size,(page-1)*size]);
  const [summary]=await q(`SELECT COUNT(*)::int requests,COALESCE(SUM(COALESCE(r.input_tokens,0)),0)::bigint input_tokens,
    COALESCE(SUM(COALESCE(r.output_tokens,0)),0)::bigint output_tokens,COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint total_tokens
    FROM agent_runs r LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=r.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE ${where}`,args);
  const total=n(cnt?.total);return {items,summary,pagination:{page,pageSize:size,total,totalPages:Math.max(1,Math.ceil(total/size))}};
}

export async function platformChannels() {
  return {items:await q(`SELECT c.id::text id,c.organization_id::text organization_id,c.business_id::text business_id,c.channel_type,c.is_active,
    c.verification_status,c.provider_account_id,c.external_identifier,c.created_at::text created_at,o.name organization_name,
    (SELECT COUNT(*) FROM conversations cv WHERE cv.channel_id=c.id)::int conversations_count
    FROM channels c JOIN organizations o ON o.id=c.organization_id ORDER BY c.created_at DESC LIMIT 1000`)};
}
export async function platformConversations(f:{search?:string;status?:string;channelType?:string;agentId?:string;userId?:string}={}) {
  const clauses:string[]=[];const args:unknown[]=[];const add=(s:string,v:unknown)=>{args.push(v);clauses.push(s.replace('?',`$${args.length}`));};
  if(f.status&&f.status!=='all')add('c.status=?',f.status);if(f.channelType&&f.channelType!=='all')add('ch.channel_type=?',f.channelType);
  if(f.agentId)add('c.agent_id=?::uuid',f.agentId);if(f.userId)add('own.user_id=?::uuid',f.userId);
  if(f.search?.trim()){args.push(`%${f.search.trim()}%`);const p=args.length;clauses.push(`(COALESCE(ct.first_name,'')||' '||COALESCE(ct.last_name,'') ILIKE $${p} OR o.name ILIKE $${p})`);}
  return q(`SELECT c.id::text id,c.organization_id::text organization_id,c.contact_id::text contact_id,c.channel_id::text channel_id,c.agent_id::text agent_id,
    c.status,c.state,c.priority,c.ai_paused_at::text ai_paused_at,c.handoff_reason,c.last_message_at::text last_message_at,c.created_at::text created_at,
    ch.channel_type,COALESCE(ct.first_name,'')||CASE WHEN ct.last_name IS NULL THEN '' ELSE ' '||ct.last_name END customer_name,a.name agent_name,o.name workspace_name,
    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id)::int message_count
    FROM conversations c JOIN organizations o ON o.id=c.organization_id LEFT JOIN channels ch ON ch.id=c.channel_id
    LEFT JOIN contacts ct ON ct.id=c.contact_id LEFT JOIN ai_agents a ON a.id=c.agent_id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=c.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY c.last_message_at DESC LIMIT 1000`,args);
}
export async function platformEntitlements() {
  return {items:await q(`SELECT e.id::text id,e.organization_id::text organization_id,o.name organization_name,e.feature_key,e.limit_value,e.period,e.enabled,e.source,e.updated_at::text updated_at
    FROM billing_entitlements e JOIN organizations o ON o.id=e.organization_id ORDER BY o.name,e.feature_key LIMIT 2000`)};
}

export async function platformOverview(period:string,startDate?:string,endDate?:string) {
  const end=endDate?new Date(endDate+'T23:59:59.999Z'):new Date(),start=startDate?new Date(startDate+'T00:00:00.000Z'):new Date(end);
  if(!startDate){if(period==='day')start.setUTCHours(0,0,0,0);else if(period==='week')start.setUTCDate(start.getUTCDate()-6);else if(period==='year')start.setUTCMonth(0,1);else start.setUTCDate(1);}
  const from=start.toISOString(),to=end.toISOString();
  const [c,series,channels,plans,models]=await Promise.all([
    q(`SELECT (SELECT COUNT(*) FROM auth.users WHERE deleted_at IS NULL)::int total_users,
      (SELECT COUNT(*) FROM auth.users WHERE deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=NOW()))::int active_users,
      (SELECT COUNT(*) FROM auth.users WHERE deleted_at IS NULL AND banned_until>NOW())::int suspended_users,
      (SELECT COUNT(*) FROM auth.users WHERE deleted_at IS NULL AND created_at BETWEEN $1 AND $2)::int new_users,
      (SELECT COUNT(*) FROM organizations)::int total_workspaces,(SELECT COUNT(*) FROM subscriptions WHERE status='active')::int active_subscriptions,
      (SELECT COUNT(*) FROM subscriptions WHERE status='trial')::int trial_subscriptions,(SELECT COUNT(*) FROM subscriptions WHERE status='expired')::int expired_subscriptions,
      (SELECT COUNT(*) FROM subscriptions WHERE status='cancelled')::int cancelled_subscriptions,(SELECT COUNT(*) FROM subscriptions WHERE status='past_due')::int past_due_subscriptions,
      (SELECT COUNT(*) FROM ai_agents)::int total_agents,(SELECT COUNT(*) FROM ai_agents WHERE status='active')::int active_agents,
      (SELECT COUNT(*) FROM ai_agents WHERE status='error')::int failing_agents,(SELECT COUNT(*) FROM conversations)::int total_conversations,
      (SELECT COUNT(*) FROM messages)::int total_messages,(SELECT COUNT(*) FROM agent_runs WHERE created_at BETWEEN $1 AND $2)::int ai_requests,
      (SELECT COUNT(*) FROM agent_runs WHERE status='completed' AND created_at BETWEEN $1 AND $2)::int success_runs,
      (SELECT COUNT(*) FROM agent_runs WHERE status='failed' AND created_at BETWEEN $1 AND $2)::int failed_runs,
      (SELECT COALESCE(SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)),0)::bigint FROM agent_runs WHERE created_at BETWEEN $1 AND $2) total_tokens,
      (SELECT COUNT(*) FROM channels WHERE is_active AND verification_status='verified')::int connected_channels,
      (SELECT COUNT(*) FROM channels WHERE NOT(is_active AND verification_status='verified'))::int disconnected_channels`,[from,to]),
    q(`SELECT to_char(d.day,'YYYY-MM-DD') date,(SELECT COUNT(*) FROM auth.users u WHERE u.created_at::date=d.day AND u.deleted_at IS NULL)::int users,
      (SELECT COUNT(*) FROM subscriptions s WHERE s.created_at::date=d.day)::int subscriptions,(SELECT COUNT(*) FROM agent_runs r WHERE r.created_at::date=d.day)::int ai_requests,
      (SELECT COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint FROM agent_runs r WHERE r.created_at::date=d.day) tokens,
      (SELECT COUNT(*) FROM conversations v WHERE v.created_at::date=d.day)::int conversations,(SELECT COUNT(*) FROM messages m WHERE m.created_at::date=d.day)::int messages,
      (SELECT COUNT(*) FROM agent_runs r WHERE r.created_at::date=d.day AND r.status='completed')::int success_runs,
      (SELECT COUNT(*) FROM agent_runs r WHERE r.created_at::date=d.day AND r.status='failed')::int failed_runs
      FROM generate_series($1::date,$2::date,interval '1 day') d(day) ORDER BY d.day`,[from,to]),
    q(`SELECT channel_type channel,COUNT(*)::int total,COUNT(*) FILTER(WHERE is_active AND verification_status='verified')::int connected,
      (SELECT COUNT(*) FROM messages m JOIN conversations v ON v.id=m.conversation_id WHERE v.channel_id=channels.id)::int messages
      FROM channels GROUP BY channel_type ORDER BY total DESC`),
    q(`SELECT plan_tier code,INITCAP(plan_tier) name,COUNT(*)::int subscribers FROM subscriptions GROUP BY plan_tier ORDER BY subscribers DESC`),
    q(`SELECT COALESCE(model,'غير محدد') model_id,COALESCE(model,'غير محدد') display_name,COUNT(*)::int requests,
      COALESCE(SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)),0)::bigint tokens FROM agent_runs
      WHERE created_at BETWEEN $1 AND $2 GROUP BY model ORDER BY requests DESC LIMIT 10`,[from,to])
  ]);
  const x=c[0]||{},v=(k:string)=>n(x[k]);
  const metrics={totalUsers:v('total_users'),activeUsers:v('active_users'),newUsersInPeriod:v('new_users'),suspendedUsers:v('suspended_users'),trialAccounts:v('trial_subscriptions'),
    activeSubscriptions:v('active_subscriptions'),expiredSubscriptions:v('expired_subscriptions'),cancelledSubscriptions:v('cancelled_subscriptions'),pastDueSubscriptions:v('past_due_subscriptions'),trialSubscriptions:v('trial_subscriptions'),
    totalWorkspaces:v('total_workspaces'),totalAgents:v('total_agents'),activeAgents:v('active_agents'),failingAgents:v('failing_agents'),totalConversations:v('total_conversations'),totalMessages:v('total_messages'),
    totalAiRequests:v('ai_requests'),successfulAgentRuns:v('success_runs'),failedAgentRuns:v('failed_runs'),totalTokens:v('total_tokens'),
    aiProviderCostsUsd:0,collectedRevenueUsd:0,unpaidInvoicesUsd:0,recordedExpensesUsd:0,totalOperatingCostsUsd:0,netMarginUsd:0,netMarginPercent:null,
    connectedChannels:v('connected_channels'),disconnectedChannels:v('disconnected_channels'),currentSystemErrors:v('failed_runs')};
  return {window:{startIso:from,endIso:to,days:Math.max(1,Math.ceil((end.getTime()-start.getTime())/86400000))},
    database:{engine:'PostgreSQL',mode:'مصدر بيانات المنصة الفعلي؛ جلسات وسجل المالك في مخزن منفصل',externalPostgresConfigured:true,pathLabel:'Railway Postgres'},
    integrations:[],metrics,comparisons:{newUsersDeltaPct:null,subscriptionsDeltaPct:null,revenueDeltaPct:null,aiRequestsDeltaPct:null,aiCostDeltaPct:null},
    charts:{timeSeries:series.map((r:any)=>({date:r.date,users:n(r.users),subscriptions:n(r.subscriptions),revenueUsd:0,tokens:n(r.tokens),aiCostUsd:0,conversations:n(r.conversations),messages:n(r.messages),successRuns:n(r.success_runs),failedRuns:n(r.failed_runs)})),
      channelUsage:channels.map((r:any)=>({channel:r.channel,total:n(r.total),connected:n(r.connected),messages:n(r.messages)})),
      planDistribution:plans.map((r:any)=>({code:r.code,name:r.name,subscribers:n(r.subscribers)})),
      modelUsage:models.map((r:any)=>({modelId:r.model_id,displayName:r.display_name,requests:n(r.requests),tokens:n(r.tokens),costUsd:0}))},
    attentionItems:{pastDueSubscriptions:v('past_due_subscriptions'),failingAgents:v('failing_agents'),disconnectedChannels:v('disconnected_channels'),unresolvedErrors:v('failed_runs'),unacknowledgedAlerts:0,openTickets:0},
    dataLimitations:{revenue:'لا توجد جداول فواتير ومدفوعات في مخطط المنصة الحالي.',expenses:'لا يوجد دفتر مصروفات تشغيلي في المخطط الحالي.',aiCost:'المتاح حالياً عدد الرموز؛ لا توجد تكلفة فعلية موثقة لكل تشغيل.'}};
}

export async function updatePlatformUser(id:string,p:{fullName?:string;email?:string;phone?:string|null}) {
  const set:string[]=[];const args:unknown[]=[];const add=(s:string,v:unknown)=>{args.push(v);set.push(s.replace('?',`$${args.length}`));};
  if(p.email!==undefined)add('email=?',p.email.trim().toLowerCase());
  if(p.phone!==undefined)add('phone=?',p.phone||null);
  if(p.fullName!==undefined){args.push(JSON.stringify({full_name:p.fullName.trim()}));set.push(`raw_user_meta_data=COALESCE(raw_user_meta_data,'{}'::jsonb)||$${args.length}::jsonb`);}
  if(!set.length)throw new Error('لا توجد تغييرات لحفظها.');
  args.push(id);const [r]=await q(`UPDATE auth.users SET ${set.join(',')},updated_at=NOW() WHERE id=$${args.length}::uuid AND deleted_at IS NULL RETURNING id::text id,email,phone`,args);
  if(!r)throw new Error('المستخدم غير موجود.');return r;
}
export async function platformUserAction(id:string,action:string) {
  if(!['suspend','reactivate'].includes(action))throw new Error('الإجراء غير مدعوم في قاعدة المنصة الحالية.');
  const [r]=await q(`UPDATE auth.users SET banned_until=${action==='suspend'?"NOW()+INTERVAL '100 years'":'NULL'},
    session_version=COALESCE(session_version,0)+1,updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING id::text id,banned_until::text banned_until`,[id]);
  if(!r)throw new Error('المستخدم غير موجود.');return {...r,account_status:action==='suspend'?'suspended':'active'};
}
export async function subscriptionAction(id:string,action:string,p:Record<string,unknown>) {
  let result:Record<string,unknown>[]=[];
  if(action==='extend'){const days=Math.max(1,Math.min(730,Math.floor(Number(p.days)||30)));result=await q(`UPDATE subscriptions SET period_end=GREATEST(COALESCE(period_end,NOW()),NOW())+($2::int*INTERVAL '1 day'),status='active',updated_at=NOW() WHERE id=$1::uuid RETURNING id::text id,status,period_end::text period_end`,[id,days]);}
  else if(action==='change_plan'){const tier=String(p.planCode||'');if(!['starter','growth','pro'].includes(tier))throw new Error('الباقة يجب أن تكون starter أو growth أو pro.');result=await q(`UPDATE subscriptions SET plan_tier=$2,updated_at=NOW() WHERE id=$1::uuid RETURNING id::text id,status,plan_tier`,[id,tier]);}
  else if(action==='cancel'||action==='reactivate'){result=await q(`UPDATE subscriptions SET status=$2,updated_at=NOW() WHERE id=$1::uuid RETURNING id::text id,status`,[id,action==='cancel'?'cancelled':'active']);}
  else throw new Error('الإجراء غير مدعوم في نموذج الاشتراك الفعلي.');
  if(!result[0])throw new Error('الاشتراك غير موجود.');return result[0];
}
export async function updatePlatformAgent(id:string,p:{status?:string}) {
  if(p.status&&!['active','paused','disabled','archived'].includes(p.status))throw new Error('حالة الوكيل غير صالحة.');
  const [r]=await q(`UPDATE ai_agents SET status=COALESCE($2,status),updated_at=NOW() WHERE id=$1::uuid RETURNING id::text id,name,status,model_provider,temperature`,[id,p.status||null]);
  if(!r)throw new Error('الوكيل غير موجود.');return r;
}
export async function platformEntitlementOverride(p:{userId:string;featureKey:string;enabled:boolean;limit?:number|null;period?:string}) {
  const [org]=await q<{organization_id:string}>(`SELECT organization_id::text organization_id FROM organization_members WHERE user_id=$1::uuid AND role='owner' ORDER BY created_at LIMIT 1`,[p.userId]);
  if(!org)throw new Error('لا توجد مؤسسة مملوكة لهذا المستخدم.');
  const period=['daily','monthly','unlimited'].includes(p.period||'')?p.period:'monthly';
  const [r]=await q(`INSERT INTO billing_entitlements(organization_id,feature_key,limit_value,period,enabled,source,updated_at)
    VALUES($1::uuid,$2,$3,$4,$5,'owner_override',NOW()) ON CONFLICT(organization_id,feature_key)
    DO UPDATE SET limit_value=EXCLUDED.limit_value,period=EXCLUDED.period,enabled=EXCLUDED.enabled,source='owner_override',updated_at=NOW()
    RETURNING id::text id,organization_id::text organization_id,feature_key,limit_value,period,enabled,source`,
    [org.organization_id,p.featureKey,p.limit??null,period,p.enabled]);
  return r;
}
