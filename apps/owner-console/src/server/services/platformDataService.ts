import postgres from 'postgres';
import crypto from 'node:crypto';
import { sha256Hex, encryptSecret, decryptSecret } from '../security/crypto';

type Pool = ReturnType<typeof postgres>;
let pool: Pool | undefined;
function sql(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL غير مهيأ.');
  const host = new URL(url).hostname;
  pool = postgres(url, { ssl: process.env.DATABASE_SSL === 'require' ? 'require' : process.env.DATABASE_SSL === 'disable' || host.endsWith('.railway.internal') ? false : 'require', max: 5, idle_timeout: 20, connect_timeout: 10, prepare: false, connection: { TimeZone: 'UTC', application_name: 'kayan-owner-console' }, onnotice: () => {} });
  return pool;
}
function query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values: unknown[] = []) { return sql().unsafe<T[]>(text, values as never[]); }
const count = (v: unknown) => Number(v ?? 0);
const fullName = "COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''),NULLIF(u.raw_user_meta_data->>'name',''),NULLIF(split_part(COALESCE(u.email,''),'@',1),''),'مستخدم')";

export async function platformPing() {
  const checks=[
    'SELECT id,email,phone,created_at,last_sign_in_at,banned_until,session_version,raw_user_meta_data,deleted_at,updated_at FROM auth.users LIMIT 0',
    'SELECT id,name,created_at FROM organizations LIMIT 0',
    'SELECT id,organization_id,user_id,role,created_at FROM organization_members LIMIT 0',
    'SELECT id,organization_id,name,business_type_id,status,created_at FROM businesses LIMIT 0',
    'SELECT id,organization_id,plan_id,plan_tier,billing_cycle,status,period_start,period_end,current_period_start,current_period_end,minutes_used,sms_used,created_at,updated_at FROM subscriptions LIMIT 0',
    'SELECT id,code,name,description,monthly_price,currency,limits,is_active,updated_at FROM plans LIMIT 0',
    'SELECT id,organization_id,business_id,name,model_provider,status,temperature,locale,slug,created_at,updated_at FROM ai_agents LIMIT 0',
    'SELECT id,organization_id,agent_id,model_provider,model,status,input_tokens,output_tokens,latency_ms,error_code,created_at FROM agent_runs LIMIT 0',
    'SELECT id,organization_id,business_id,channel_type,is_active,verification_status,provider_account_id,external_identifier,created_at FROM channels LIMIT 0',
    'SELECT id,organization_id,contact_id,channel_id,status,state,priority,ai_paused_at,handoff_reason,last_message_at,created_at FROM conversations LIMIT 0',
    'SELECT id,first_name,last_name FROM contacts LIMIT 0',
    'SELECT id,conversation_id,created_at FROM messages LIMIT 0',
    'SELECT id,organization_id,feature_key,limit_value,period,enabled,source,updated_at FROM billing_entitlements LIMIT 0',
    'SELECT id,name,description FROM capabilities LIMIT 0',
    'SELECT organization_id,capability_id,is_enabled,created_at FROM organization_capabilities LIMIT 0',
    'SELECT id,organization_id,plan_id,plan_code,billing_cycle,amount_usd,amount_yer,exchange_rate,provider,external_order_id,provider_intent_id,provider_payment_id,payment_reference,status,failure_code,expires_at,verified_at,created_at,updated_at FROM billing_payment_intents LIMIT 0',
    'SELECT id,organization_id,event_type,units,unit_cost,currency,occurred_at FROM usage_ledger LIMIT 0',
    'SELECT id,organization_id,actor_type,actor_id,action,entity_type,entity_id,metadata,created_at FROM audit_events LIMIT 0'
  ];
  await Promise.all(checks.map((statement)=>query(statement)));
  return true;
}

export async function platformStatus() {
  const [r] = await query<{db:string;users:string;orgs:string;subs:string}>(`SELECT current_database() db,(SELECT COUNT(*) FROM auth.users WHERE deleted_at IS NULL)::text users,(SELECT COUNT(*) FROM organizations)::text orgs,(SELECT COUNT(*) FROM subscriptions)::text subs`);
  return { connected:true, engine:'PostgreSQL', database:r.db, counts:{users:count(r.users),organizations:count(r.orgs),subscriptions:count(r.subs)}, ownerSecurityStore:'SQLite منفصلة للجلسات وسجل تدقيق المالك' };
}

export async function platformUsers(f:{search?:string;status?:string;paymentStatus?:string;sortBy?:string;sortDir?:'asc'|'desc';page?:number;pageSize?:number}) {
  const page=Math.max(1,Number(f.page)||1), size=Math.min(100,Math.max(5,Number(f.pageSize)||20));
  const where=['u.deleted_at IS NULL'], args:unknown[]=[];
  if(f.search?.trim()){args.push(`%${f.search.trim()}%`);const p=args.length;where.push(`(${fullName} ILIKE $${p} OR COALESCE(u.email,'') ILIKE $${p} OR COALESCE(u.phone,'') ILIKE $${p} OR u.id::text ILIKE $${p})`);}
  if(f.status==='suspended')where.push('u.banned_until>NOW()');
  if(f.status==='active')where.push('(u.banned_until IS NULL OR u.banned_until<=NOW())');
  if(f.status==='trial')where.push("EXISTS(SELECT 1 FROM subscriptions s JOIN organization_members m ON m.organization_id=s.organization_id WHERE m.user_id=u.id AND m.role='owner' AND s.status='trial')");
  if(f.paymentStatus&&f.paymentStatus!=='all'){args.push(f.paymentStatus==='paid'?'active':f.paymentStatus);where.push(`EXISTS(SELECT 1 FROM subscriptions s JOIN organization_members m ON m.organization_id=s.organization_id WHERE m.user_id=u.id AND m.role='owner' AND s.status=$${args.length})`);}
  const w=where.join(' AND '), sortMap:Record<string,string>={created_at:'u.created_at',full_name:fullName,last_active_at:'u.last_sign_in_at'};
  const sort=sortMap[f.sortBy||'created_at']||'u.created_at',dir=f.sortDir==='asc'?'ASC':'DESC';
  const [totalRow]=await query<{total:string}>(`SELECT COUNT(*)::text total FROM auth.users u WHERE ${w}`,args);
  const items=await query(`SELECT u.id::text id,${fullName} full_name,u.email,u.phone,
    CASE WHEN u.banned_until>NOW() THEN 'suspended' WHEN s.status='trial' THEN 'trial' ELSE 'active' END account_status,
    CASE WHEN s.status='active' THEN 'paid' WHEN s.status='trial' THEN 'trial' WHEN s.status='past_due' THEN 'past_due' ELSE 'unpaid' END payment_status,
    s.status subscription_status,s.plan_tier plan_code,s.plan_tier plan_name,s.period_end::text subscription_end_at,
    u.last_sign_in_at::text last_active_at,u.created_at::text created_at,
    (SELECT COUNT(*) FROM organization_members m WHERE m.user_id=u.id AND m.role='owner')::int workspaces_count,
    (SELECT COUNT(*) FROM ai_agents a JOIN organization_members m ON m.organization_id=a.organization_id WHERE m.user_id=u.id AND m.role='owner')::int agents_count,
    (SELECT COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint FROM agent_runs r JOIN organization_members m ON m.organization_id=r.organization_id WHERE m.user_id=u.id AND m.role='owner') total_tokens,
    (SELECT COUNT(*) FROM conversations c JOIN organization_members m ON m.organization_id=c.organization_id WHERE m.user_id=u.id AND m.role='owner')::int conversations_count
    FROM auth.users u LEFT JOIN LATERAL(SELECT s.status,s.plan_tier,s.period_end FROM subscriptions s JOIN organization_members m ON m.organization_id=s.organization_id AND m.user_id=u.id AND m.role='owner' ORDER BY s.created_at DESC LIMIT 1) s ON TRUE
    WHERE ${w} ORDER BY ${sort} ${dir} NULLS LAST LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,size,(page-1)*size]);
  const total=count(totalRow?.total);
  return {items,pagination:{page,pageSize:size,total,totalPages:Math.max(1,Math.ceil(total/size))}};
}

export async function platformUserDetail(id:string) {
  const [user]=await query(\`SELECT u.id::text id,\${fullName} full_name,u.email,u.phone,u.created_at::text created_at,u.last_sign_in_at::text last_active_at,
    CASE WHEN u.banned_until>NOW() THEN 'suspended' ELSE 'active' END account_status,u.raw_user_meta_data user_metadata,
    COALESCE(u.raw_user_meta_data->>'admin_notes','') admin_notes FROM auth.users u WHERE u.id=$1::uuid AND u.deleted_at IS NULL\`,[id]);
  if(!user)return null;
  const [workspaces,subscriptions,agents,channels,conversations,usage,payments,entitlements,recentEvents,auditActivity,knowledgeSources,errors]=await Promise.all([
    query(\`SELECT o.id::text id,o.name,b.id::text business_id,b.name business_name,b.business_type_id business_type,COALESCE(b.status,'active') status,o.created_at::text created_at
      FROM organization_members m JOIN organizations o ON o.id=m.organization_id LEFT JOIN businesses b ON b.organization_id=o.id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY o.created_at DESC\`,[id]),
    query(\`SELECT s.id::text id,s.organization_id::text organization_id,s.plan_tier plan_code,COALESCE(p.name,INITCAP(s.plan_tier)) plan_name,p.monthly_price::numeric price_monthly,p.currency,s.billing_cycle,s.status,s.period_start::text current_period_start,s.period_end::text current_period_end,s.minutes_used,s.sms_used,s.created_at::text created_at FROM subscriptions s LEFT JOIN plans p ON p.id=s.plan_id JOIN organization_members m ON m.organization_id=s.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY s.created_at DESC\`,[id]),
    query(\`SELECT a.id::text id,a.organization_id::text organization_id,a.business_id::text workspace_id,a.name,a.model_provider provider_code,a.status,a.temperature,a.locale,a.created_at::text created_at FROM ai_agents a JOIN organization_members m ON m.organization_id=a.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY a.created_at DESC\`,[id]),
    query(\`SELECT c.id::text id,c.organization_id::text organization_id,c.channel_type,c.is_active,c.verification_status,c.external_identifier,c.created_at::text created_at FROM channels c JOIN organization_members m ON m.organization_id=c.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY c.created_at DESC\`,[id]),
    query(\`SELECT c.id::text id,c.status,c.state,c.channel_id::text channel_id,c.last_message_at::text last_message_at,ch.channel_type,
      COALESCE(NULLIF(ci.external_phone,''),NULLIF(ci.external_username,''),NULLIF(ci.external_user_id,''),ct.first_name) customer_name
      FROM conversations c JOIN organization_members m ON m.organization_id=c.organization_id LEFT JOIN channels ch ON ch.id=c.channel_id
      LEFT JOIN contacts ct ON ct.id=c.contact_id LEFT JOIN LATERAL(SELECT external_phone,external_username,external_user_id FROM contact_identities
        WHERE contact_id=c.contact_id AND channel=ch.channel_type ORDER BY created_at DESC LIMIT 1) ci ON TRUE
      WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY c.last_message_at DESC LIMIT 50\`,[id]),
    query(\`SELECT COUNT(*)::int requests,COALESCE(SUM(COALESCE(r.input_tokens,0)),0)::bigint input_tokens,
      COALESCE(SUM(COALESCE(r.output_tokens,0)),0)::bigint output_tokens,
      COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint total_tokens
      FROM agent_runs r JOIN organization_members m ON m.organization_id=r.organization_id WHERE m.user_id=$1::uuid AND m.role='owner'\`,[id]),
    query(\`SELECT i.id::text id,i.external_order_id,i.plan_code,i.amount_usd::numeric amount_usd,i.amount_yer::bigint amount_yer,i.status,i.provider,i.payment_reference,i.created_at::text created_at
      FROM billing_payment_intents i JOIN organization_members m ON m.organization_id=i.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY i.created_at DESC LIMIT 100\`,[id]),
    query(\`SELECT oc.organization_id::text organization_id,oc.capability_id feature_key,c.name feature_name,oc.is_enabled,
      be.limit_value,be.period,be.enabled quota_enabled FROM organization_capabilities oc JOIN capabilities c ON c.id=oc.capability_id
      JOIN organization_members m ON m.organization_id=oc.organization_id LEFT JOIN billing_entitlements be ON be.organization_id=oc.organization_id AND be.feature_key=oc.capability_id
      WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY c.name\`,[id]),
    query(\`SELECT r.id::text id,r.model_provider,r.model,r.status,r.input_tokens,r.output_tokens,r.latency_ms,r.error_code,r.created_at::text created_at
      FROM agent_runs r JOIN organization_members m ON m.organization_id=r.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY r.created_at DESC LIMIT 30\`,[id]),
    query(\`SELECT e.id::text id,e.action,e.entity_type,e.entity_id::text entity_id,e.metadata,e.created_at::text created_at
      FROM audit_events e JOIN organization_members m ON m.organization_id=e.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY e.created_at DESC LIMIT 50\`,[id]),
    query(\`SELECT d.id::text id,d.file_name title,d.mime_type file_type,d.status,d.created_at::text created_at,
      (SELECT COUNT(*) FROM knowledge_chunks k WHERE k.document_id=d.id)::int chunk_count
      FROM knowledge_documents d JOIN organization_members m ON m.organization_id=d.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY d.created_at DESC LIMIT 100\`,[id]),
    query(\`SELECT r.id::text id,r.model_provider,r.model,r.error_code,r.created_at::text created_at
      FROM agent_runs r JOIN organization_members m ON m.organization_id=r.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' AND r.status='failed' ORDER BY r.created_at DESC LIMIT 50\`,[id])
  ]);
  return {user,workspaces,subscriptions,invoices:[],payments,agents,channels,knowledgeSources,conversations,
    aiUsage:{summary:usage[0]||{},recentEvents},auditActivity,sessions:[],errors,entitlements};
}

export async function platformWorkspaces(search?:string) {
  const args:unknown[]=[];let where='';
  if(search?.trim()){args.push(`%${search.trim()}%`);where='WHERE o.name ILIKE $1 OR b.name ILIKE $1 OR u.email ILIKE $1';}
  return {items:await query(`SELECT o.id::text id,o.name,b.id::text business_id,b.name business_name,b.business_type_id business_type,COALESCE(b.status,'active') status,o.created_at::text created_at,
    u.id::text owner_user_id,${fullName} owner_name,u.email owner_email,(SELECT COUNT(*) FROM organization_members m WHERE m.organization_id=o.id)::int member_count,
    (SELECT COUNT(*) FROM ai_agents a WHERE a.organization_id=o.id)::int agents_count FROM organizations o LEFT JOIN businesses b ON b.organization_id=o.id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id ${where} ORDER BY o.created_at DESC LIMIT 500`,args)};
}

export async function platformPlans() {
  const rows=await query<{id:string;code:string;name:string;description:string|null;monthly_price:string|number;currency:string;limits:Record<string,unknown>|null;is_active:boolean;active_subscribers:string}>(`SELECT p.id::text id,p.code,p.name,p.description,p.monthly_price::text monthly_price,p.currency,p.limits,p.is_active,
    (SELECT COUNT(*) FROM subscriptions s WHERE s.plan_id=p.id AND s.status IN ('active','trial'))::text active_subscribers
    FROM plans p ORDER BY p.monthly_price ASC,p.code ASC`);
  return {items:rows.map(p=>{
    const limits=p.limits||{};
    const value=(key:string)=>limits[key]===undefined||limits[key]===null?null:Number(limits[key]);
    return {id:p.id,code:p.code,name:p.name,name_en:p.name,description:p.description||'',price_monthly:Number(p.monthly_price),price_yearly:null,currency:p.currency,
      billing_cycle:'monthly',trial_days:null,max_users:null,max_agents:null,max_messages:value('ai_messages'),token_quota:null,max_channels:value('channels'),
      voice_minutes:value('voice_minutes'),automation_runs:value('automation_runs'),campaign_sends:value('campaign_sends'),storage_mb:null,
      allowed_models:[],allowed_channels:[],allowed_tools:[],enabled_features:[],blocked_features:[],status:p.is_active?'active':'archived',
      active_subscribers:Number(p.active_subscribers),editable:false};
  })};
}

export async function platformSubscriptions(status?:string) {
  const args:unknown[]=[];const where=status&&status!=='all'?(args.push(status),'WHERE s.status=$1'):'';
  const items=await query(`SELECT s.id::text id,s.organization_id::text organization_id,s.plan_tier plan_code,s.plan_tier plan_name,s.status,s.period_start::text current_period_start,
    s.period_end::text current_period_end,s.minutes_used,s.sms_used,s.created_at::text created_at,o.name workspace_name,u.id::text user_id,${fullName} user_name,u.email user_email
    FROM subscriptions s JOIN organizations o ON o.id=s.organization_id LEFT JOIN plans p ON p.id=s.plan_id LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id ${where} ORDER BY s.created_at DESC LIMIT 1000`,args);
  const [summary]=await query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='active')::int active,COUNT(*) FILTER(WHERE status='trial')::int trial,
    COUNT(*) FILTER(WHERE status='past_due')::int past_due,COUNT(*) FILTER(WHERE status='expired')::int expired,COUNT(*) FILTER(WHERE status='cancelled')::int cancelled FROM subscriptions`);
  return {items,summary};
}

export async function platformAgents(f:{search?:string;status?:string;provider?:string}={}) {
  const clauses:string[]=[];const args:unknown[]=[];const add=(s:string,v:unknown)=>{args.push(v);clauses.push(s.replace('?',`$${args.length}`));};
  if(f.status&&f.status!=='all')add('a.status=?',f.status);if(f.provider&&f.provider!=='all')add('a.model_provider=?',f.provider);
  if(f.search?.trim()){args.push(`%${f.search.trim()}%`);const p=args.length;clauses.push(`(a.name ILIKE $${p} OR o.name ILIKE $${p} OR u.email ILIKE $${p})`);}
  return query(`SELECT a.id::text id,a.organization_id::text organization_id,a.business_id::text workspace_id,a.name,a.model_provider provider_code,a.model_provider provider_name,a.status,a.temperature,a.locale,a.slug,a.created_at::text created_at,o.name workspace_name,u.email owner_email,${fullName} owner_name,
    (SELECT COUNT(DISTINCT r.conversation_id) FROM agent_runs r WHERE r.agent_id=a.id)::int conversations_count,(SELECT COUNT(*) FROM agent_runs r WHERE r.agent_id=a.id)::int executions_count,
    (SELECT COUNT(*) FROM agent_runs r WHERE r.agent_id=a.id AND r.status='completed')::int success_count,(SELECT COUNT(*) FROM agent_runs r WHERE r.agent_id=a.id AND r.status='failed')::int error_count,
    (SELECT COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint FROM agent_runs r WHERE r.agent_id=a.id) total_tokens
    FROM ai_agents a JOIN organizations o ON o.id=a.organization_id LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY a.created_at DESC LIMIT 500`,args);
}

export async function platformAgentDetail(id:string) {
  const [agent]=await query(`SELECT a.id::text id,a.organization_id::text organization_id,a.business_id::text workspace_id,a.name,a.model_provider provider_code,a.status,a.temperature,a.locale,a.slug,a.created_at::text created_at,
    o.name workspace_name,u.email owner_email,${fullName} owner_name FROM ai_agents a JOIN organizations o ON o.id=a.organization_id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id WHERE a.id=$1::uuid`,[id]);
  if(!agent)return null;
  const [channels,executions,conversations,stats]=await Promise.all([
    query(`SELECT id::text id,channel_type,is_active,verification_status,external_identifier FROM channels WHERE organization_id=$1::uuid ORDER BY created_at DESC`,[agent.organization_id]),
    query(`SELECT id::text id,model_provider,model,status,input_tokens,output_tokens,latency_ms,error_code,created_at::text created_at FROM agent_runs WHERE agent_id=$1::uuid ORDER BY created_at DESC LIMIT 40`,[id]),
    query(`SELECT id::text id,status,state,channel_id::text channel_id,last_message_at::text last_message_at FROM conversations c WHERE EXISTS(SELECT 1 FROM agent_runs r WHERE r.conversation_id=c.id AND r.agent_id=$1::uuid) ORDER BY c.last_message_at DESC LIMIT 30`,[id]),
    query(`SELECT COUNT(*)::int total_runs,COUNT(*) FILTER(WHERE status='completed')::int success_runs,COUNT(*) FILTER(WHERE status='failed')::int failed_runs,
      COALESCE(SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)),0)::bigint total_tokens,COALESCE(AVG(latency_ms),0)::int avg_latency_ms
      FROM agent_runs WHERE agent_id=$1::uuid`,[id])
  ]);
  return {agent,channels,knowledgeSources:[],executions,conversations,errors:executions.filter((r:any)=>r.status==='failed'),configHistory:[],stats:stats[0]||{}};
}

export async function platformAiUsage(f:{userId?:string;agentId?:string;modelId?:string;providerCode?:string;status?:string;page?:number;pageSize?:number}) {
  const page=Math.max(1,Number(f.page)||1),size=Math.min(100,Math.max(10,Number(f.pageSize)||25)),clauses:string[]=[],args:unknown[]=[];
  const add=(s:string,v:unknown)=>{args.push(v);clauses.push(s.replace('?',`$${args.length}`));};
  if(f.userId)add('own.user_id=?::uuid',f.userId);if(f.agentId)add('r.agent_id=?::uuid',f.agentId);if(f.modelId&&f.modelId!=='all')add('r.model=?',f.modelId);
  if(f.providerCode&&f.providerCode!=='all')add('r.model_provider=?',f.providerCode);if(f.status&&f.status!=='all')add('r.status=?',f.status);
  const where=clauses.length?'WHERE '+clauses.join(' AND '):'';
  const [totalRow]=await query<{total:string}>(`SELECT COUNT(*)::text total FROM agent_runs r LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=r.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE ${where}`,args);
  const items=await query(`SELECT r.id::text id,r.organization_id::text organization_id,r.agent_id::text agent_id,r.model_provider provider_code,r.model model_id,r.status,r.input_tokens,r.output_tokens,
    (COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)) total_tokens,r.latency_ms,r.error_code,r.created_at::text created_at,o.name workspace_name,a.name agent_name,u.id::text user_id,u.email user_email,${fullName} user_name
    FROM agent_runs r LEFT JOIN organizations o ON o.id=r.organization_id LEFT JOIN ai_agents a ON a.id=r.agent_id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=r.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE LEFT JOIN auth.users u ON u.id=own.user_id
    ${where} ORDER BY r.created_at DESC LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,size,(page-1)*size]);
  const [summary]=await query(`SELECT COUNT(*)::int requests,COALESCE(SUM(COALESCE(r.input_tokens,0)),0)::bigint input_tokens,COALESCE(SUM(COALESCE(r.output_tokens,0)),0)::bigint output_tokens,
    COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint total_tokens FROM agent_runs r
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=r.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE ${where}`,args);
  const total=count(totalRow?.total);return {items,summary,pagination:{page,pageSize:size,total,totalPages:Math.max(1,Math.ceil(total/size))}};
}

export async function platformChannels() {
  return {items:await query(\`SELECT c.id::text id,c.organization_id::text organization_id,c.business_id::text business_id,c.channel_type,c.connection_mode,
    c.is_active,c.verification_status,c.provider_account_id,c.external_identifier,c.created_at::text created_at,o.name organization_name,
    COALESCE((SELECT array_agg(pc.credential_type ORDER BY pc.credential_type) FROM provider_credentials pc WHERE pc.channel_id=c.id AND pc.status='active'),ARRAY[]::varchar[]) credential_types,
    (SELECT COUNT(*) FROM conversations v WHERE v.channel_id=c.id)::int conversations_count
    FROM channels c JOIN organizations o ON o.id=c.organization_id ORDER BY c.created_at DESC LIMIT 1000\`)};
}

export async function platformConversations(f:{search?:string;status?:string;channelType?:string;agentId?:string;userId?:string}={}) {
  const clauses:string[]=[],args:unknown[]=[];const add=(s:string,v:unknown)=>{args.push(v);clauses.push(s.replace('?',`$${args.length}`));};
  if(f.status&&f.status!=='all')add('c.status=?',f.status);if(f.channelType&&f.channelType!=='all')add('ch.channel_type=?',f.channelType);
  if(f.agentId)add('ar_agent.agent_id=?::uuid',f.agentId);if(f.userId)add('own.user_id=?::uuid',f.userId);
  if(f.search?.trim()){args.push(`%${f.search.trim()}%`);const p=args.length;clauses.push(`(COALESCE(ct.first_name,'')||' '||COALESCE(ct.last_name,'') ILIKE $${p} OR o.name ILIKE $${p})`);}
  const items=await query(`SELECT c.id::text id,c.organization_id::text organization_id,c.contact_id::text contact_id,c.channel_id::text channel_id,
    CASE WHEN c.state='human_handoff' OR c.status='handed_off' THEN 'needs_human' WHEN c.status='closed' OR c.state='closed' THEN 'closed'
      WHEN c.state='new' THEN 'new' WHEN EXISTS(SELECT 1 FROM agent_runs fr WHERE fr.conversation_id=c.id AND fr.status='failed') THEN 'failed' ELSE 'active' END status,
    c.state,c.priority,c.ai_paused_at::text ai_paused_at,c.handoff_reason,ar_agent.agent_id::text agent_id,
    c.last_message_at::text last_message_at,c.created_at::text created_at,ch.channel_type,
    COALESCE(NULLIF(ci.external_phone,''),NULLIF(ci.external_username,''),NULLIF(ci.external_user_id,''),NULLIF(ct.first_name,''),'عميل') customer_handle,
    a.name agent_name,o.name workspace_name,(SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id)::int message_count
    FROM conversations c JOIN organizations o ON o.id=c.organization_id
    LEFT JOIN channels ch ON ch.id=c.channel_id LEFT JOIN contacts ct ON ct.id=c.contact_id
    LEFT JOIN LATERAL(SELECT external_phone,external_username,external_user_id FROM contact_identities WHERE contact_id=c.contact_id AND channel=ch.channel_type ORDER BY created_at DESC LIMIT 1) ci ON TRUE
    LEFT JOIN LATERAL(SELECT r.agent_id FROM agent_runs r WHERE r.conversation_id=c.id AND r.agent_id IS NOT NULL ORDER BY r.created_at DESC LIMIT 1) ar_agent ON TRUE
    LEFT JOIN ai_agents a ON a.id=ar_agent.agent_id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=c.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY c.last_message_at DESC LIMIT 1000`,args);
  const [summary]=await query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='active')::int active,
    COUNT(*) FILTER(WHERE state='new')::int new_count,COUNT(*) FILTER(WHERE status='closed' OR state='closed')::int closed,
    COUNT(*) FILTER(WHERE state='human_handoff' OR status='handed_off')::int needs_human,
    COUNT(*) FILTER(WHERE EXISTS(SELECT 1 FROM agent_runs r WHERE r.conversation_id=conversations.id AND r.agent_id IS NOT NULL))::int agent_handled,
    (SELECT COUNT(*) FROM messages)::int total_messages,
    COALESCE(AVG(EXTRACT(EPOCH FROM (last_outbound_at-last_inbound_at))*1000) FILTER(WHERE last_outbound_at IS NOT NULL AND last_inbound_at IS NOT NULL),0)::numeric avg_response_ms
    FROM conversations`);
  return {items,summary:summary||{}};
}
export async function platformEntitlements() {
  const flags=await query(`SELECT c.id,c.id key,c.name,c.description,'capability' category,'paid' tier_type,1::int platform_enabled,
    ARRAY[]::text[] allowed_plan_codes,NULL::int default_quota,
    (SELECT COUNT(DISTINCT m.user_id) FROM organization_capabilities oc JOIN organization_members m ON m.organization_id=oc.organization_id AND m.role='owner'
      WHERE oc.capability_id=c.id AND oc.is_enabled)::int active_users_estimate,0::int granted_overrides,0::int revoked_overrides
    FROM capabilities c ORDER BY c.name`);
  const userOverrides=await query(`SELECT (oc.organization_id::text||':'||oc.capability_id) id,oc.organization_id::text organization_id,o.name organization_name,
    oc.capability_id feature_key,c.name feature_name,be.limit_value custom_limit,be.period,
    COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''),NULLIF(u.raw_user_meta_data->>'name',''),u.email) user_name,u.email user_email,
    CASE WHEN oc.is_enabled THEN 'granted' ELSE 'revoked' END override_state,oc.created_at::text updated_at
    FROM organization_capabilities oc JOIN organizations o ON o.id=oc.organization_id JOIN capabilities c ON c.id=oc.capability_id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=oc.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id LEFT JOIN billing_entitlements be ON be.organization_id=oc.organization_id AND be.feature_key=oc.capability_id ORDER BY oc.created_at DESC LIMIT 2000`);
  const activations=await query(`SELECT u.id::text id,COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''),NULLIF(u.raw_user_meta_data->>'name',''),u.email) full_name,u.email,
    CASE WHEN u.banned_until>NOW() THEN 'suspended' ELSE 'active' END account_status,s.status activation_status,
    s.period_start::text activation_start_at,s.period_end::text activation_end_at,p.name plan_name,NULL::text activation_source,NULL::text deactivation_reason
    FROM auth.users u LEFT JOIN LATERAL(SELECT * FROM subscriptions WHERE organization_id IN(SELECT organization_id FROM organization_members WHERE user_id=u.id AND role='owner')
      ORDER BY created_at DESC LIMIT 1) s ON TRUE LEFT JOIN plans p ON p.id=s.plan_id
    WHERE u.deleted_at IS NULL ORDER BY u.created_at DESC LIMIT 1000`);
  const history=await query(`SELECT e.id::text id,e.organization_id::text organization_id,o.name organization_name,e.actor_type,e.actor_id::text actor_id,
    e.action,e.entity_type,e.entity_id::text entity_id,e.metadata,e.created_at::text created_at,u.email actor_email,
    COALESCE(e.metadata->>'feature_key',e.metadata->>'capability_id') feature_key,e.entity_type target_type,
    COALESCE(e.metadata->>'reason',e.metadata->>'note') reason,e.metadata->>'previous_value' previous_value,e.metadata->>'new_value' new_value
    FROM audit_events e LEFT JOIN organizations o ON o.id=e.organization_id LEFT JOIN auth.users u ON u.id=e.actor_id
    ORDER BY e.created_at DESC LIMIT 60`);
  return {flags,userOverrides,activations,history};
}

export async function platformBillingLedger() {
  const paymentIntents=await query(`SELECT i.id::text id,i.external_order_id,i.plan_code,i.billing_cycle,i.amount_usd::numeric amount_usd,i.amount_yer::bigint amount_yer,
    i.exchange_rate::numeric exchange_rate,i.provider,i.payment_reference,i.provider_payment_id,i.status,i.failure_code,
    i.expires_at::text expires_at,i.verified_at::text verified_at,i.created_at::text created_at,o.name workspace_name,
    p.name plan_name,u.id::text user_id,${fullName} user_name,u.email user_email
    FROM billing_payment_intents i JOIN organizations o ON o.id=i.organization_id LEFT JOIN plans p ON p.id=i.plan_id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY i.created_at DESC LIMIT 1000`);
  const [s]=await query(`SELECT COALESCE(SUM(amount_usd) FILTER(WHERE status='verified'),0)::numeric collected,
    COALESCE(SUM(amount_usd) FILTER(WHERE status IN('pending','wrong_amount')),0)::numeric pending,
    COUNT(*) FILTER(WHERE status='verified')::int verified_count,COUNT(*) FILTER(WHERE status='pending')::int pending_count,
    COUNT(*) FILTER(WHERE status='wrong_amount')::int wrong_amount_count,COUNT(*) FILTER(WHERE status IN('failed','expired','cancelled'))::int closed_count
    FROM billing_payment_intents`);
  const [mrr]=await query(`SELECT COALESCE(SUM(p.monthly_price),0)::numeric amount FROM subscriptions s JOIN plans p ON p.id=s.plan_id
    WHERE s.status='active' AND COALESCE(s.billing_cycle,'monthly')='monthly'`);
  const gateways=[
    {code:'esaalat',name:'إيصالات / المحافظ اليمنية',configured:Boolean(process.env.ESAALAT_CLIENT_ID?.trim()&&process.env.ESAALAT_CLIENT_SECRET?.trim()&&Number(process.env.YER_PER_USD)>0),webhookConfigured:Boolean(process.env.ESAALAT_WEBHOOK_SECRET?.trim()),supportsRefund:false},
    {code:'stripe',name:'Stripe',configured:Boolean(process.env.STRIPE_SECRET_KEY?.trim()),webhookConfigured:Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),supportsRefund:false}
  ];
  return {invoices:[],expenses:[],paymentIntents,gateways,summary:{
    collectedRevenueUsd:Number(s?.collected||0),unpaidInvoicesUsd:Number(s?.pending||0),refundedUsd:0,estimatedMrrUsd:Number(mrr?.amount||0),recordedExpensesUsd:0,
    verifiedPayments:Number(s?.verified_count||0),pendingPayments:Number(s?.pending_count||0),wrongAmountPayments:Number(s?.wrong_amount_count||0),closedPaymentIntents:Number(s?.closed_count||0)
  },dataLimitations:{invoices:'المخطط الحالي يسجل طلبات الدفع والتحقق منها، ولا يحتوي دفتر فواتير منفصلاً.',expenses:'لا يوجد جدول مصروفات تشغيلية في قاعدة المنصة.',refunds:'بوابة إيصالات لا تدعم الاسترداد البرمجي في التدفق الحالي.'}};
}

export async function platformOverview(period:string,startDate?:string,endDate?:string) {
  const end=endDate?new Date(endDate+'T23:59:59.999Z'):new Date(),start=startDate?new Date(startDate+'T00:00:00.000Z'):new Date(end);
  if(!startDate){if(period==='day')start.setUTCHours(0,0,0,0);else if(period==='week')start.setUTCDate(start.getUTCDate()-6);else if(period==='year')start.setUTCMonth(0,1);else start.setUTCDate(1);}
  const from=start.toISOString(),to=end.toISOString();
  const [c,series,channels,plans,models]=await Promise.all([
    query(`SELECT (SELECT COUNT(*) FROM auth.users WHERE deleted_at IS NULL)::int total_users,(SELECT COUNT(*) FROM auth.users WHERE deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=NOW()))::int active_users,
      (SELECT COUNT(*) FROM auth.users WHERE deleted_at IS NULL AND banned_until>NOW())::int suspended_users,(SELECT COUNT(*) FROM auth.users WHERE deleted_at IS NULL AND created_at BETWEEN $1 AND $2)::int new_users,
      (SELECT COUNT(*) FROM organizations)::int total_workspaces,(SELECT COUNT(*) FROM subscriptions WHERE status='active')::int active_subscriptions,(SELECT COUNT(*) FROM subscriptions WHERE status='trial')::int trial_subscriptions,
      (SELECT COUNT(*) FROM subscriptions WHERE status='expired')::int expired_subscriptions,(SELECT COUNT(*) FROM subscriptions WHERE status='cancelled')::int cancelled_subscriptions,(SELECT COUNT(*) FROM subscriptions WHERE status='past_due')::int past_due_subscriptions,
      (SELECT COUNT(*) FROM ai_agents)::int total_agents,(SELECT COUNT(*) FROM ai_agents WHERE status='active')::int active_agents,(SELECT COUNT(*) FROM ai_agents WHERE status='error')::int failing_agents,
      (SELECT COUNT(*) FROM conversations)::int total_conversations,(SELECT COUNT(*) FROM messages)::int total_messages,(SELECT COUNT(*) FROM agent_runs WHERE created_at BETWEEN $1 AND $2)::int ai_requests,
      (SELECT COUNT(*) FROM agent_runs WHERE status='completed' AND created_at BETWEEN $1 AND $2)::int success_runs,(SELECT COUNT(*) FROM agent_runs WHERE status='failed' AND created_at BETWEEN $1 AND $2)::int failed_runs,
      (SELECT COALESCE(SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)),0)::bigint FROM agent_runs WHERE created_at BETWEEN $1 AND $2) total_tokens,
      (SELECT COALESCE(SUM(amount_usd),0)::numeric FROM billing_payment_intents WHERE status='verified' AND verified_at BETWEEN $1 AND $2) collected_revenue,
      (SELECT COALESCE(SUM(amount_usd),0)::numeric FROM billing_payment_intents WHERE status IN('pending','wrong_amount') AND created_at BETWEEN $1 AND $2) pending_payments,
      (SELECT COALESCE(SUM(units*COALESCE(unit_cost,0)),0)::numeric FROM usage_ledger WHERE event_type='ai_tokens' AND currency='USD' AND occurred_at BETWEEN $1 AND $2) ai_cost,
      (SELECT COUNT(*) FROM usage_ledger WHERE event_type='ai_tokens' AND currency='USD' AND unit_cost IS NOT NULL AND occurred_at BETWEEN $1 AND $2)::int ai_cost_records,
      (SELECT COUNT(*) FROM channels WHERE is_active AND verification_status='verified')::int connected_channels,
      (SELECT COUNT(*) FROM channels WHERE NOT(is_active AND verification_status='verified'))::int disconnected_channels`,[from,to]),
    query(`SELECT to_char(d.day,'YYYY-MM-DD') date,(SELECT COUNT(*) FROM auth.users u WHERE u.created_at::date=d.day AND u.deleted_at IS NULL)::int users,
      (SELECT COUNT(*) FROM subscriptions s WHERE s.created_at::date=d.day)::int subscriptions,(SELECT COUNT(*) FROM agent_runs r WHERE r.created_at::date=d.day)::int ai_requests,
      (SELECT COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint FROM agent_runs r WHERE r.created_at::date=d.day) tokens,
      (SELECT COUNT(*) FROM conversations v WHERE v.created_at::date=d.day)::int conversations,(SELECT COUNT(*) FROM messages m WHERE m.created_at::date=d.day)::int messages,
      (SELECT COALESCE(SUM(amount_usd),0)::numeric FROM billing_payment_intents i WHERE i.status='verified' AND i.verified_at::date=d.day) revenue_usd,
      (SELECT COALESCE(SUM(units*COALESCE(unit_cost,0)),0)::numeric FROM usage_ledger l WHERE l.event_type='ai_tokens' AND l.currency='USD' AND l.occurred_at::date=d.day) ai_cost_usd,
      (SELECT COUNT(*) FROM agent_runs r WHERE r.created_at::date=d.day AND r.status='completed')::int success_runs,(SELECT COUNT(*) FROM agent_runs r WHERE r.created_at::date=d.day AND r.status='failed')::int failed_runs
      FROM generate_series($1::date,$2::date,interval '1 day') d(day) ORDER BY d.day`,[from,to]),
    query(`SELECT ch.channel_type channel,COUNT(*)::int total,COUNT(*) FILTER(WHERE ch.is_active AND ch.verification_status='verified')::int connected,COALESCE(SUM(mc.messages),0)::int messages
      FROM channels ch LEFT JOIN (SELECT v.channel_id,COUNT(m.id)::int messages FROM conversations v JOIN messages m ON m.conversation_id=v.id GROUP BY v.channel_id) mc ON mc.channel_id=ch.id
      GROUP BY ch.channel_type ORDER BY total DESC`),
    query(`SELECT plan_tier code,INITCAP(plan_tier) name,COUNT(*)::int subscribers FROM subscriptions GROUP BY plan_tier ORDER BY subscribers DESC`),
    query(`SELECT COALESCE(model,'غير محدد') model_id,COALESCE(model,'غير محدد') display_name,COUNT(*)::int requests,COALESCE(SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)),0)::bigint tokens
      FROM agent_runs WHERE created_at BETWEEN $1 AND $2 GROUP BY model ORDER BY requests DESC LIMIT 10`,[from,to])
  ]);
  const x=c[0]||{},v=(k:string)=>count(x[k]);
  const aiCostAvailable=v('ai_cost_records')>0;
  const metrics={totalUsers:v('total_users'),activeUsers:v('active_users'),newUsersInPeriod:v('new_users'),suspendedUsers:v('suspended_users'),trialAccounts:v('trial_subscriptions'),
    activeSubscriptions:v('active_subscriptions'),expiredSubscriptions:v('expired_subscriptions'),cancelledSubscriptions:v('cancelled_subscriptions'),pastDueSubscriptions:v('past_due_subscriptions'),trialSubscriptions:v('trial_subscriptions'),
    totalWorkspaces:v('total_workspaces'),totalAgents:v('total_agents'),activeAgents:v('active_agents'),failingAgents:v('failing_agents'),totalConversations:v('total_conversations'),totalMessages:v('total_messages'),
    totalAiRequests:v('ai_requests'),successfulAgentRuns:v('success_runs'),failedAgentRuns:v('failed_runs'),totalTokens:v('total_tokens'),aiProviderCostsUsd:aiCostAvailable?v('ai_cost'):0,collectedRevenueUsd:v('collected_revenue'),unpaidInvoicesUsd:v('pending_payments'),recordedExpensesUsd:0,totalOperatingCostsUsd:0,netMarginUsd:0,netMarginPercent:null,
    connectedChannels:v('connected_channels'),disconnectedChannels:v('disconnected_channels'),currentSystemErrors:0};
  return {window:{startIso:from,endIso:to,days:Math.max(1,Math.ceil((end.getTime()-start.getTime())/86400000))},
    database:{engine:'PostgreSQL',mode:'بيانات المنصة الحقيقية؛ جلسات المالك وسجل تدقيقه منفصلان',externalPostgresConfigured:true,pathLabel:'Railway Postgres'},integrations:[],metrics,
    comparisons:{newUsersDeltaPct:null,subscriptionsDeltaPct:null,revenueDeltaPct:null,aiRequestsDeltaPct:null,aiCostDeltaPct:null},
    charts:{timeSeries:series.map((r:any)=>({date:r.date,users:count(r.users),subscriptions:count(r.subscriptions),revenueUsd:count(r.revenue_usd),tokens:count(r.tokens),aiCostUsd:count(r.ai_cost_usd),conversations:count(r.conversations),messages:count(r.messages),successRuns:count(r.success_runs),failedRuns:count(r.failed_runs)})),
      channelUsage:channels.map((r:any)=>({channel:r.channel,total:count(r.total),connected:count(r.connected),messages:count(r.messages)})),
      planDistribution:plans.map((r:any)=>({code:r.code,name:r.name,subscribers:count(r.subscribers)})),modelUsage:models.map((r:any)=>({modelId:r.model_id,displayName:r.display_name,requests:count(r.requests),tokens:count(r.tokens),costUsd:0}))},
    attentionItems:{pastDueSubscriptions:v('past_due_subscriptions'),failingAgents:v('failing_agents'),disconnectedChannels:v('disconnected_channels'),unresolvedErrors:0,unacknowledgedAlerts:0,openTickets:0},
    dataLimitations:{revenue:'الإيراد المحصل محسوب من طلبات الدفع المؤكدة؛ لا يوجد دفتر فواتير منفصل.',expenses:'لا يوجد دفتر مصروفات تشغيلي في المخطط الحالي.',aiCost:aiCostAvailable?undefined:'سجل الرموز لا يحتوي تكلفة موثقة حتى الآن.',systemErrors:'لا يوجد سجل أخطاء تشغيلي موحد في مخطط PostgreSQL الحالي.'}};
}

export async function updatePlatformUser(id:string,p:{fullName?:string;email?:string;phone?:string|null;adminNotes?:string}) {
  const set:string[]=[],args:unknown[]=[];
  if(p.email!==undefined){args.push(p.email.trim().toLowerCase());set.push(\`email=$\${args.length}\`);}
  if(p.phone!==undefined){args.push(p.phone||null);set.push(\`phone=$\${args.length}\`);}
  const metadata:Record<string,string>={};
  if(p.fullName!==undefined)metadata.full_name=p.fullName.trim();
  if(p.adminNotes!==undefined)metadata.admin_notes=String(p.adminNotes||'').slice(0,4000);
  if(Object.keys(metadata).length){args.push(JSON.stringify(metadata));set.push(\`raw_user_meta_data=COALESCE(raw_user_meta_data,'{}'::jsonb)||$\${args.length}::jsonb\`);}
  if(!set.length)throw new Error('لا توجد تغييرات لحفظها.');args.push(id);
  const [r]=await query(\`UPDATE auth.users SET \${set.join(',')},updated_at=NOW() WHERE id=$\${args.length}::uuid AND deleted_at IS NULL RETURNING id::text id,email,phone\`,args);
  if(!r)throw new Error('المستخدم غير موجود.');return r;
}

export async function platformUserAction(id:string,action:string) {
  if(!['suspend','reactivate'].includes(action))throw new Error('الإجراء غير مدعوم.');
  const [r]=await query(`UPDATE auth.users SET banned_until=${action==='suspend'?"NOW()+INTERVAL '100 years'":'NULL'},session_version=COALESCE(session_version,0)+1,updated_at=NOW()
    WHERE id=$1::uuid AND deleted_at IS NULL RETURNING id::text id,banned_until::text banned_until`,[id]);
  if(!r)throw new Error('المستخدم غير موجود.');return {...r,account_status:action==='suspend'?'suspended':'active'};
}
export async function subscriptionAction(id:string,action:string,p:Record<string,unknown>) {
  let result:Record<string,unknown>[]=[];
  if(action==='extend'){const days=Math.max(1,Math.min(730,Math.floor(Number(p.days)||30)));result=await query(`UPDATE subscriptions SET period_end=GREATEST(COALESCE(period_end,current_period_end,NOW()),NOW())+($2::int*INTERVAL '1 day'),current_period_end=GREATEST(COALESCE(current_period_end,period_end,NOW()),NOW())+($2::int*INTERVAL '1 day'),status='active',updated_at=NOW() WHERE id=$1::uuid RETURNING id::text id,status,period_end::text period_end,current_period_end::text current_period_end`,[id,days]);}
  else if(action==='change_plan'){const tier=String(p.planCode||'');if(!['trial','starter','growth','pro'].includes(tier))throw new Error('رمز الباقة غير صالح.');result=await query(`UPDATE subscriptions s SET plan_id=p.id,plan_tier=p.code,status=CASE WHEN s.status='expired' THEN 'active' ELSE s.status END,updated_at=NOW() FROM plans p WHERE s.id=$1::uuid AND p.code=$2 AND p.is_active=TRUE RETURNING s.id::text id,s.status,s.plan_tier,s.plan_id::text plan_id`,[id,tier]);}
  else if(action==='cancel'||action==='reactivate')result=await query(`UPDATE subscriptions SET status=$2,updated_at=NOW() WHERE id=$1::uuid RETURNING id::text id,status`,[id,action==='cancel'?'cancelled':'active']);
  else throw new Error('الإجراء غير مدعوم في نموذج الاشتراك الفعلي.');
  if(!result[0])throw new Error('الاشتراك غير موجود.');return result[0];
}
export async function updatePlatformAgent(id:string,p:{status?:string}) {
  if(p.status&&!['active','paused','disabled','archived'].includes(p.status))throw new Error('حالة الوكيل غير صالحة.');
  const [r]=await query(`UPDATE ai_agents SET status=COALESCE($2,status),updated_at=NOW() WHERE id=$1::uuid RETURNING id::text id,name,status,model_provider,temperature`,[id,p.status||null]);
  if(!r)throw new Error('الوكيل غير موجود.');return r;
}
export async function platformEntitlementOverride(p:{userId:string;featureKey:string;overrideState?:'granted'|'revoked';enabled?:boolean;customLimit?:number|null;limit?:number|null;period?:string}) {
  const [org]=await query<{organization_id:string}>(`SELECT organization_id::text organization_id FROM organization_members WHERE user_id=$1::uuid AND role='owner' ORDER BY created_at LIMIT 1`,[p.userId]);
  if(!org)throw new Error('لا توجد مؤسسة مملوكة لهذا المستخدم.');
  const [cap]=await query<{id:string}>(`SELECT id FROM capabilities WHERE id=$1`,[p.featureKey]);
  if(!cap)throw new Error('الميزة غير موجودة في كتالوج قدرات المنصة.');
  const enabled=p.enabled??(p.overrideState!=='revoked');
  const [result]=await query(`INSERT INTO organization_capabilities(organization_id,capability_id,is_enabled)
    VALUES($1::uuid,$2,$3) ON CONFLICT(organization_id,capability_id) DO UPDATE SET is_enabled=EXCLUDED.is_enabled
    RETURNING organization_id::text organization_id,capability_id,is_enabled,created_at::text created_at`,
    [org.organization_id,p.featureKey,enabled]);
  let quota:Record<string,unknown>|null=null;
  const limit=p.customLimit??p.limit;
  if(limit!==undefined&&limit!==null){
    const period=['daily','monthly','unlimited'].includes(p.period||'')?p.period:'monthly';
    const [qrow]=await query(`INSERT INTO billing_entitlements(organization_id,feature_key,limit_value,period,enabled,source,updated_at)
      VALUES($1::uuid,$2,$3,$4,$5,'owner_override',NOW()) ON CONFLICT(organization_id,feature_key)
      DO UPDATE SET limit_value=EXCLUDED.limit_value,period=EXCLUDED.period,enabled=EXCLUDED.enabled,source='owner_override',updated_at=NOW()
      RETURNING id::text id,limit_value,period,enabled,source`,[org.organization_id,p.featureKey,limit,period,enabled]);
    quota=qrow||null;
  }
  return {...result,id:`${org.organization_id}:${p.featureKey}`,feature_name:p.featureKey,override_state:enabled?'granted':'revoked',quota};
}


export async function platformConversationDetail(id:string) {
  const [conversation]=await query(\`SELECT c.id::text id,c.organization_id::text organization_id,c.status,c.state,c.priority,c.handoff_reason,
    c.last_message_at::text last_message_at,ch.channel_type,o.name workspace_name,
    COALESCE(NULLIF(ci.external_phone,''),NULLIF(ci.external_username,''),NULLIF(ci.external_user_id,''),NULLIF(ct.first_name,''),'عميل') customer_handle
    FROM conversations c JOIN organizations o ON o.id=c.organization_id LEFT JOIN channels ch ON ch.id=c.channel_id
    LEFT JOIN contacts ct ON ct.id=c.contact_id LEFT JOIN LATERAL(SELECT external_phone,external_username,external_user_id FROM contact_identities
      WHERE contact_id=c.contact_id AND channel=ch.channel_type ORDER BY created_at DESC LIMIT 1) ci ON TRUE WHERE c.id=$1::uuid\`,[id]);
  if(!conversation)return null;
  const messages=await query(\`SELECT id::text id,CASE WHEN direction='outbound' THEN 'assistant' ELSE 'customer' END sender_type,
    direction,message_type,content,created_at::text created_at FROM messages WHERE conversation_id=$1::uuid ORDER BY created_at ASC LIMIT 500\`,[id]);
  return {conversation,messages};
}

export async function platformQueueConversationIntervention(id:string,content:string,reason:string) {
  const body=content.trim(),why=reason.trim();
  if(!body||!why)throw new Error('نص التدخل وسببه الإداري مطلوبان.');
  const [target]=await query(\`SELECT c.id::text id,c.organization_id::text organization_id,c.business_id::text business_id,
    c.channel_id::text channel_id,ch.channel_type,ch.is_active,COALESCE(ci.external_phone,ci.external_user_id,ci.external_username) recipient
    FROM conversations c JOIN channels ch ON ch.id=c.channel_id
    LEFT JOIN LATERAL(SELECT external_phone,external_user_id,external_username FROM contact_identities
      WHERE contact_id=c.contact_id AND channel=ch.channel_type ORDER BY created_at DESC LIMIT 1) ci ON TRUE WHERE c.id=$1::uuid\`,[id]);
  if(!target)throw new Error('المحادثة غير موجودة.');
  if(!target.is_active||!target.recipient)throw new Error('القناة متوقفة أو لا يوجد عنوان إرسال موثوق للعميل.');
  const idempotencyKey='owner-intervention:'+crypto.randomUUID();
  await query(\`INSERT INTO outbox_events(organization_id,business_id,channel_id,event_type,idempotency_key,recipient,payload,status,scheduled_at)
    VALUES($1::uuid,$2::uuid,$3::uuid,'message.send',$4,$5,$6::jsonb,'pending',NOW())\`,
    [target.organization_id,target.business_id,target.channel_id,idempotencyKey,target.recipient,JSON.stringify({body,conversation_id:id,source:'owner_console_intervention'})]);
  await query(\`INSERT INTO audit_events(organization_id,business_id,actor_type,action,entity_type,entity_id,metadata)
    VALUES($1::uuid,$2::uuid,'system','owner.conversation_intervention_queued','conversation',$3::uuid,$4::jsonb)\`,
    [target.organization_id,target.business_id,id,JSON.stringify({reason:why,idempotency_key:idempotencyKey,channel_type:target.channel_type})]);
  return await platformConversationDetail(id);
}

export async function updatePlatformWorkspaceStatus(organizationId:string,status:string) {
  if(!['active','suspended','archived'].includes(status))throw new Error('حالة مساحة العمل غير صالحة.');
  const rows=await query(\`UPDATE businesses SET status=$2,updated_at=NOW() WHERE organization_id=$1::uuid
    RETURNING id::text id,organization_id::text organization_id,name,status\`,[organizationId,status]);
  if(!rows.length)throw new Error('لم يتم العثور على نشاط مرتبط بمساحة العمل.');
  return {organizationId,status,businesses:rows};
}

export async function savePlatformPlan(p:Record<string,unknown>,id?:string) {
  const code=String(p.code||'').trim().toLowerCase(),name=String(p.name||'').trim();
  if(!code||!name)throw new Error('رمز الباقة واسمها مطلوبان.');
  if(!['trial','starter','growth','pro'].includes(code))throw new Error('رمز الباقة غير مدعوم في اشتراكات المنصة الحالية.');
  const yearly=Number(p.priceYearly||0);
  if(yearly>0)throw new Error('مخطط المنصة الحالي يدعم السعر الشهري فقط؛ لم يتم حفظ سعر سنوي غير مدعوم.');
  const monthly=Number(p.priceMonthly);
  if(!Number.isFinite(monthly)||monthly<0)throw new Error('السعر الشهري غير صالح.');
  if(p.status==='draft')throw new Error('قاعدة الباقات الفعلية لا تدعم حالة المسودة.');
  const limits:Record<string,number>={};
  const mappings:Record<string,string>={maxMessages:'ai_messages',maxChannels:'channels',voiceMinutes:'voice_minutes',automationRuns:'automation_runs',campaignSends:'campaign_sends'};
  for(const [input,key] of Object.entries(mappings)){const value=p[input];if(value!==undefined&&value!==null&&String(value)!==''){const n=Number(value);if(!Number.isFinite(n)||n<0)throw new Error('حدود الباقة يجب أن تكون أرقاماً غير سالبة.');limits[key]=n;}}
  const description=String(p.description||'');
  const currency=String(p.currency||'USD').toUpperCase();
  if(!['USD','YER','SAR'].includes(currency))throw new Error('عملة الباقة غير مدعومة.');
  const active=p.status!=='archived';
  if(id){
    const [row]=await query(\`UPDATE plans SET code=$2,name=$3,description=$4,monthly_price=$5,currency=$6,
      limits=COALESCE(limits,'{}'::jsonb)||$7::jsonb,is_active=$8,updated_at=NOW() WHERE id=$1::uuid
      RETURNING id::text id,code,name,description,monthly_price::numeric price_monthly,currency,limits,is_active\`,
      [id,code,name,description,monthly,currency,JSON.stringify(limits),active]);
    if(!row)throw new Error('الباقة غير موجودة.');
    return row;
  }
  const [row]=await query(\`INSERT INTO plans(code,name,description,monthly_price,currency,limits,is_active)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING id::text id,code,name,description,monthly_price::numeric price_monthly,currency,limits,is_active\`,
    [code,name,description,monthly,currency,JSON.stringify(limits),active]);
  return row;
}

export async function platformCreateWorkspace(p:{ownerUserId:string;name:string;businessType?:string}) {
  const name=p.name.trim(),owner=p.ownerUserId.trim();
  if(!name||!owner)throw new Error('اسم مساحة العمل ومالكها مطلوبان.');
  const [type]=await query(\`SELECT id FROM business_types WHERE id=$1\`,[p.businessType||'appointments']);
  const businessType=type?.id||'appointments';
  return await sql().begin(async tx=>{
    const [org]=await tx.unsafe(\`INSERT INTO organizations(name) VALUES($1) RETURNING id::text id,name,created_at::text created_at\`,[name]);
    await tx.unsafe(\`INSERT INTO organization_members(organization_id,user_id,role) VALUES($1::uuid,$2::uuid,'owner') ON CONFLICT(organization_id,user_id) DO NOTHING\`,[org.id,owner]);
    const slug=(name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'business')+'-'+crypto.randomUUID().slice(0,8);
    const [business]=await tx.unsafe(\`INSERT INTO businesses(organization_id,name,slug,business_type_id,timezone,status)
      VALUES($1::uuid,$2,$3,$4,'UTC','active') RETURNING id::text id,name,slug,business_type_id,status\`,[org.id,name,slug,businessType]);
    await tx.unsafe(\`INSERT INTO business_profiles(organization_id,business_id,industry,timezone,business_type_id)
      VALUES($1::uuid,$2::uuid,$3,'UTC',$3) ON CONFLICT(organization_id) DO UPDATE SET business_id=EXCLUDED.business_id,industry=EXCLUDED.industry,business_type_id=EXCLUDED.business_type_id\`,
      [org.id,business.id,businessType]);
    const [agent]=await tx.unsafe(\`INSERT INTO ai_agents(organization_id,business_id,name,slug,model_provider,temperature,status,locale)
      VALUES($1::uuid,$2::uuid,$3,'frontdesk','anthropic',0.2,'active','ar') RETURNING id::text id\`,[org.id,business.id,name+' AI']);
    await tx.unsafe(\`INSERT INTO agent_tool_policies(agent_id,tool_name,is_allowed,requires_confirmation) VALUES
      ($1::uuid,'get_customer',TRUE,FALSE),($1::uuid,'find_available_slots',TRUE,FALSE),($1::uuid,'create_appointment',TRUE,TRUE),($1::uuid,'request_human_handoff',TRUE,FALSE)
      ON CONFLICT(agent_id,tool_name) DO NOTHING\`,[agent.id]);
    await tx.unsafe(\`INSERT INTO agent_prompt_versions(agent_id,version,system_prompt_addition,status,published_at)
      VALUES($1::uuid,1,NULL,'published',NOW()) ON CONFLICT(agent_id,version) DO NOTHING\`,[agent.id]);
    await tx.unsafe(\`INSERT INTO organization_capabilities(organization_id,capability_id,is_enabled)
      SELECT $1::uuid,capability_id,TRUE FROM business_type_capabilities WHERE business_type_id=$2 AND is_default=TRUE
      ON CONFLICT(organization_id,capability_id) DO NOTHING\`,[org.id,businessType]);
    await tx.unsafe(\`INSERT INTO billing_entitlements(organization_id,feature_key,limit_value,period,enabled)
      VALUES($1::uuid,'ai_messages_monthly',10000,'monthly',TRUE),($1::uuid,'phone_minutes_monthly',300,'monthly',TRUE),($1::uuid,'sms_monthly',500,'monthly',TRUE)
      ON CONFLICT(organization_id,feature_key) DO NOTHING\`,[org.id]);
    return {organization:org,business,agentId:agent.id};
  });
}

export async function platformAutomations() {
  const [workflows,campaigns,followups]=await Promise.all([
    query(\`SELECT w.id::text id,'workflow' automation_type,w.name,w.description,w.status,w.trigger_type,w.created_at::text created_at,
      o.name workspace_name,COALESCE(u.email,'—') owner_name,(SELECT COUNT(*) FROM workflow_runs r WHERE r.workflow_id=w.id)::int total_runs,
      (SELECT COUNT(*) FROM workflow_runs r WHERE r.workflow_id=w.id AND r.status='completed')::int success_runs,
      (SELECT COUNT(*) FROM workflow_runs r WHERE r.workflow_id=w.id AND r.status='failed')::int failed_runs,
      COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (r.completed_at-r.started_at))*1000) FROM workflow_runs r WHERE r.workflow_id=w.id AND r.completed_at IS NOT NULL),0)::int avg_duration_ms
      FROM workflows w JOIN organizations o ON o.id=w.organization_id
      LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
      LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY w.created_at DESC LIMIT 500\`),
    query(\`SELECT c.id::text id,'campaign' automation_type,c.name,c.channel,c.status,c.scheduled_at::text scheduled_at,c.created_at::text created_at,
      o.name workspace_name,COALESCE(u.email,'—') owner_name,(SELECT COUNT(*) FROM campaign_recipients r WHERE r.campaign_id=c.id)::int total_runs,
      (SELECT COUNT(*) FROM campaign_recipients r WHERE r.campaign_id=c.id AND r.status='sent')::int success_runs,
      (SELECT COUNT(*) FROM campaign_recipients r WHERE r.campaign_id=c.id AND r.status='failed')::int failed_runs,0::int avg_duration_ms
      FROM campaigns c JOIN organizations o ON o.id=c.organization_id
      LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
      LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY c.created_at DESC LIMIT 500\`),
    query(\`SELECT f.id::text id,'followup' automation_type,f.name,f.trigger_type,f.is_active,f.created_at::text created_at,
      o.name workspace_name,COALESCE(u.email,'—') owner_name,(SELECT COUNT(*) FROM followup_enrollments e WHERE e.sequence_id=f.id)::int total_runs,
      (SELECT COUNT(*) FROM followup_enrollments e WHERE e.sequence_id=f.id AND e.status='sent')::int success_runs,0::int failed_runs,0::int avg_duration_ms
      FROM followup_sequences f JOIN organizations o ON o.id=f.organization_id
      LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
      LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY f.created_at DESC LIMIT 500\`)
  ]);
  const items=[...workflows.map((r:any)=>({...r,id:'workflow:'+r.id,status:r.status==='published'?'active':r.status==='retired'?'disabled_by_owner':'paused'})),
    ...campaigns.map((r:any)=>({...r,id:'campaign:'+r.id})),
    ...followups.map((r:any)=>({...r,id:'followup:'+r.id,status:r.is_active?'active':'disabled_by_owner'}))];
  return {items:items.sort((a:any,b:any)=>String(b.created_at).localeCompare(String(a.created_at)))};
}

export async function createPlatformAutomation(p:{workspaceId:string;name:string;automationType:string}) {
  const name=p.name.trim();if(!name||!p.workspaceId)throw new Error('اسم الأتمتة ومساحة العمل مطلوبان.');
  const [business]=await query(\`SELECT id::text id FROM businesses WHERE organization_id=$1::uuid ORDER BY created_at LIMIT 1\`,[p.workspaceId]);
  if(!business)throw new Error('لا يوجد نشاط مرتبط بمساحة العمل.');
  if(p.automationType==='workflow'){
    const [row]=await query(\`INSERT INTO workflows(organization_id,business_id,name,status,trigger_type,definition)
      VALUES($1::uuid,$2::uuid,$3,'draft','manual','{"nodes":[],"edges":[]}'::jsonb)
      RETURNING id::text id,name,status,trigger_type,created_at::text created_at\`,[p.workspaceId,business.id,name]);
    return {...row,id:'workflow:'+row.id,automation_type:'workflow'};
  }
  if(p.automationType==='followup'){
    const [row]=await query(\`INSERT INTO followup_sequences(organization_id,name,trigger_type,is_active)
      VALUES($1::uuid,$2,'new_lead',TRUE) RETURNING id::text id,name,trigger_type,is_active,created_at::text created_at\`,[p.workspaceId,name]);
    return {...row,id:'followup:'+row.id,automation_type:'followup',status:'active'};
  }
  throw new Error('هذا النوع يحتاج إعدادات تشغيل ومحتوى غير متوفرة في نموذج الإدارة الحالي؛ لم يتم إنشاء سجل ناقص.');
}

export async function updatePlatformAutomation(id:string,status:string) {
  if(!['active','disabled_by_owner'].includes(status))throw new Error('حالة الأتمتة غير صالحة.');
  const [kind,rawId]=id.split(':');if(!rawId)throw new Error('معرّف الأتمتة غير صالح.');
  if(kind==='workflow'){
    const [row]=await query(\`UPDATE workflows SET status=$2,published_at=CASE WHEN $2='published' THEN NOW() ELSE published_at END,updated_at=NOW()
      WHERE id=$1::uuid RETURNING id::text id,name,status\`,[rawId,status==='active'?'published':'retired']);
    if(!row)throw new Error('الأتمتة غير موجودة.');return {...row,id:'workflow:'+row.id};
  }
  if(kind==='followup'){
    const [row]=await query(\`UPDATE followup_sequences SET is_active=$2,updated_at=NOW() WHERE id=$1::uuid RETURNING id::text id,name,is_active\`,[rawId,status==='active']);
    if(!row)throw new Error('الأتمتة غير موجودة.');return {...row,id:'followup:'+row.id,status};
  }
  if(kind==='campaign'){
    const [row]=await query(\`UPDATE campaigns SET status=$2,updated_at=NOW() WHERE id=$1::uuid RETURNING id::text id,name,status\`,[rawId,status==='active'?'running':'paused']);
    if(!row)throw new Error('الحملة غير موجودة.');return {...row,id:'campaign:'+row.id};
  }
  throw new Error('نوع الأتمتة غير مدعوم.');
}

export async function platformKnowledge() {
  const [documents,legacy]=await Promise.all([
    query(\`SELECT d.id::text id,d.organization_id::text organization_id,d.file_name title,d.mime_type file_type,d.status,
      CASE WHEN d.status='completed' THEN 'indexed' ELSE d.status END processing_status,
      CASE WHEN (SELECT COUNT(*) FROM knowledge_chunks k WHERE k.document_id=d.id)>0 THEN 'indexed' ELSE 'pending' END search_index_status,
      d.created_at::text created_at,d.updated_at::text updated_at,o.name workspace_name,COALESCE(u.email,'—') owner_name,
      octet_length(d.original_text)::bigint storage_bytes,(SELECT COUNT(*) FROM knowledge_chunks k WHERE k.document_id=d.id)::int chunk_count
      FROM knowledge_documents d JOIN organizations o ON o.id=d.organization_id
      LEFT JOIN auth.users u ON u.id=d.created_by ORDER BY d.created_at DESC LIMIT 1000\`),
    query(\`SELECT k.id::text id,k.organization_id::text organization_id,k.title,'text/plain' file_type,
      CASE WHEN k.is_active THEN 'indexed' ELSE 'archived' END processing_status,
      CASE WHEN k.is_active THEN 'indexed' ELSE 'archived' END search_index_status,k.created_at::text created_at,k.updated_at::text updated_at,
      o.name workspace_name,COALESCE(u.email,'—') owner_name,octet_length(k.content)::bigint storage_bytes,1::int chunk_count
      FROM knowledge_base k JOIN organizations o ON o.id=k.organization_id
      LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
      LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY k.created_at DESC LIMIT 1000\`)
  ]);
  const items=[...documents,...legacy].sort((a:any,b:any)=>String(b.created_at).localeCompare(String(a.created_at)));
  const summary={total_sources:items.length,total_chunks:items.reduce((n:any,r:any)=>n+Number(r.chunk_count||0),0),
    total_bytes:items.reduce((n:any,r:any)=>n+Number(r.storage_bytes||0),0),failed_count:items.filter((r:any)=>r.processing_status==='failed').length};
  return {items,summary};
}

export async function platformApiIntegrations() {
  const [apiKeys,webhookEvents]=await Promise.all([
    query(\`SELECT k.id::text id,k.organization_id::text organization_id,o.name workspace_name,k.name,k.key_prefix,k.scopes,
      k.last_used_at::text last_used_at,k.revoked_at::text revoked_at,k.created_at::text created_at,
      CASE WHEN k.revoked_at IS NULL THEN 'active' ELSE 'revoked' END status,'غير محدد'::text rate_limit_per_min
      FROM organization_api_keys k JOIN organizations o ON o.id=k.organization_id ORDER BY k.created_at DESC LIMIT 1000\`),
    query(\`SELECT e.id::text id,e.organization_id::text organization_id,e.provider,e.event_type,e.processing_status status,
      e.error_message,e.received_at::text created_at,e.processed_at::text processed_at,o.name workspace_name
      FROM webhook_events e LEFT JOIN organizations o ON o.id=e.organization_id ORDER BY e.received_at DESC LIMIT 100\`)
  ]);
  return {apiKeys,webhooks:[],webhookEvents,dataLimitations:{webhooks:'قاعدة المنصة تسجل أحداث Webhook الواردة، لكنها لا تحتوي حالياً على جدول تعريف Webhooks الصادرة.'}};
}

export async function createPlatformApiKey(p:{organizationId:string;name:string}) {
  const name=p.name.trim();if(!name||!p.organizationId)throw new Error('اسم المفتاح ومساحة العمل مطلوبان.');
  const raw='fdk_'+crypto.randomBytes(24).toString('base64url'),prefix=raw.slice(0,12),hash=sha256Hex(raw);
  const [row]=await query(\`INSERT INTO organization_api_keys(organization_id,name,key_prefix,key_hash,scopes)
    VALUES($1::uuid,$2,$3,$4,ARRAY['read']::text[]) RETURNING id::text id,key_prefix\`,[p.organizationId,name,prefix,hash]);
  if(!row)throw new Error('تعذر إصدار مفتاح API.');
  return {id:row.id,oneTimeSecret:raw,prefix:row.key_prefix};
}

export async function revokePlatformApiKey(id:string) {
  const [row]=await query(\`UPDATE organization_api_keys SET revoked_at=NOW() WHERE id=$1::uuid AND revoked_at IS NULL
    RETURNING id::text id,revoked_at::text revoked_at\`,[id]);
  if(!row)throw new Error('مفتاح API غير موجود أو مبطل مسبقاً.');
  return row;
}

export async function platformMonitoring() {
  const started=Date.now();await platformPing();const latencyMs=Date.now()-started;
  const [counts]=await query(\`SELECT (SELECT COUNT(*) FROM agent_runs WHERE status='failed' AND created_at>NOW()-INTERVAL '24 hours')::int failed_runs,
    (SELECT COUNT(*) FROM webhook_events WHERE processing_status='failed' AND received_at>NOW()-INTERVAL '24 hours')::int failed_webhooks,
    (SELECT COUNT(*) FROM outbox_events WHERE status IN('failed','dead_letter') AND updated_at>NOW()-INTERVAL '24 hours')::int failed_outbound\`);
  const migrations=await query(\`SELECT version::text version,name,applied_at::text applied_at FROM public.schema_migrations WHERE failed_at IS NULL ORDER BY version DESC LIMIT 30\`);
  const alerts=[];
  if(Number(counts?.failed_runs||0)>0)alerts.push({id:'failed-agent-runs',title:'إخفاقات تشغيل الوكلاء',description:String(counts.failed_runs)+' إخفاقاً خلال آخر 24 ساعة',acknowledged:0,severity:'warning'});
  if(Number(counts?.failed_webhooks||0)>0)alerts.push({id:'failed-webhooks',title:'أحداث Webhook فاشلة',description:String(counts.failed_webhooks)+' حدثاً فاشلاً خلال آخر 24 ساعة',acknowledged:0,severity:'warning'});
  if(Number(counts?.failed_outbound||0)>0)alerts.push({id:'failed-outbound',title:'رسائل لم تُرسل',description:String(counts.failed_outbound)+' محاولة إرسال فاشلة أو في قائمة العزل',acknowledged:0,severity:'warning'});
  return {services:[{id:'postgres',name:'PostgreSQL — Railway',status:'healthy',latencyMs,detail:'اتصال مباشر بقاعدة بيانات المنصة وفحص الجداول الأساسية ناجح.'},
    {id:'owner-console',name:'خدمة لوحة المالك',status:'healthy',latencyMs:null,detail:'خادم لوحة المالك يعمل داخل خدمة KAYAN AI.'}],
    alerts,migrations};
}

export async function platformLogs(f:{category?:string;severity?:string;resolved?:string}) {
  const rows=await query(\`SELECT id::text id,'ai' category,CASE WHEN status='failed' THEN 'error' ELSE 'warning' END severity,
    COALESCE(error_code,'agent_run_failed') message,COALESCE(error_code,'') details,status='completed' resolved,created_at::text created_at,
    'agent_run' source FROM agent_runs WHERE status IN('failed','blocked') ORDER BY created_at DESC LIMIT 200\`);
  const webhookRows=await query(\`SELECT id::text id,'webhook' category,'error' severity,COALESCE(error_message,'webhook_failed') message,
    provider||' · '||COALESCE(event_type,'') details,FALSE resolved,received_at::text created_at,'webhook_event' source
    FROM webhook_events WHERE processing_status='failed' ORDER BY received_at DESC LIMIT 200\`);
  const items=[...rows,...webhookRows].filter((r:any)=>(!f.category||f.category==='all'||r.category===f.category)&&(!f.severity||f.severity==='all'||r.severity===f.severity)&&(!f.resolved||f.resolved==='all'||(f.resolved==='true'?r.resolved:!r.resolved)));
  return {items:items.sort((a:any,b:any)=>String(b.created_at).localeCompare(String(a.created_at)))};
}

export async function platformReport(type:string) {
  const reports:Record<string,{title:string;headers:{key:string;label:string}[];sql:string}> = {
    users:{title:'تقرير المستخدمين',headers:[{key:'id',label:'المعرف'},{key:'full_name',label:'الاسم'},{key:'email',label:'البريد'},{key:'created_at',label:'تاريخ التسجيل'},{key:'account_status',label:'الحالة'}],sql:\`SELECT u.id::text id,\${fullName} full_name,u.email,u.created_at::text created_at,CASE WHEN u.banned_until>NOW() THEN 'suspended' ELSE 'active' END account_status FROM auth.users u WHERE u.deleted_at IS NULL ORDER BY u.created_at DESC LIMIT 2000\`},
    subscriptions:{title:'تقرير الاشتراكات',headers:[{key:'workspace_name',label:'مساحة العمل'},{key:'user_email',label:'البريد'},{key:'plan_code',label:'الباقة'},{key:'status',label:'الحالة'},{key:'current_period_end',label:'نهاية الاشتراك'}],sql:\`SELECT o.name workspace_name,u.email user_email,s.plan_tier plan_code,s.status,s.period_end::text current_period_end FROM subscriptions s JOIN organizations o ON o.id=s.organization_id LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY s.created_at DESC LIMIT 2000\`},
    revenue:{title:'تقرير الإيرادات الفعلية',headers:[{key:'payment_reference',label:'مرجع الدفع'},{key:'user_email',label:'البريد'},{key:'amount_usd',label:'المبلغ بالدولار'},{key:'amount_yer',label:'المبلغ بالريال'},{key:'status',label:'الحالة'},{key:'verified_at',label:'تاريخ التحقق'}],sql:\`SELECT i.payment_reference,u.email user_email,i.amount_usd::numeric amount_usd,i.amount_yer::bigint amount_yer,i.status,i.verified_at::text verified_at FROM billing_payment_intents i LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=i.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY i.created_at DESC LIMIT 2000\`},
    invoices:{title:'تقرير طلبات الدفع (لا يوجد دفتر فواتير منفصل)',headers:[{key:'external_order_id',label:'رقم الطلب'},{key:'user_email',label:'البريد'},{key:'plan_code',label:'الباقة'},{key:'amount_usd',label:'المبلغ'},{key:'status',label:'الحالة'}],sql:\`SELECT i.external_order_id,u.email user_email,i.plan_code,i.amount_usd::numeric amount_usd,i.status FROM billing_payment_intents i LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=i.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY i.created_at DESC LIMIT 2000\`},
    ai_usage:{title:'تقرير استهلاك الذكاء الاصطناعي',headers:[{key:'created_at',label:'التاريخ'},{key:'workspace_name',label:'مساحة العمل'},{key:'agent_name',label:'الوكيل'},{key:'model',label:'النموذج'},{key:'input_tokens',label:'رموز الإدخال'},{key:'output_tokens',label:'رموز الإخراج'},{key:'status',label:'الحالة'}],sql:\`SELECT r.created_at::text created_at,o.name workspace_name,a.name agent_name,r.model,r.input_tokens,r.output_tokens,r.status FROM agent_runs r LEFT JOIN organizations o ON o.id=r.organization_id LEFT JOIN ai_agents a ON a.id=r.agent_id ORDER BY r.created_at DESC LIMIT 2000\`},
    model_costs:{title:'تقرير تكلفة النماذج',headers:[{key:'model',label:'النموذج'},{key:'requests',label:'الطلبات'},{key:'tokens',label:'الرموز'},{key:'recorded_cost_usd',label:'التكلفة المسجلة بالدولار'}],sql:\`SELECT COALESCE(r.model,'غير محدد') model,COUNT(*)::int requests,COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint tokens,COALESCE(SUM(l.units*COALESCE(l.unit_cost,0)),0)::numeric recorded_cost_usd FROM agent_runs r LEFT JOIN usage_ledger l ON l.reference_id=r.id AND l.currency='USD' GROUP BY r.model ORDER BY requests DESC\`},
    agents:{title:'تقرير أداء الوكلاء',headers:[{key:'agent_name',label:'الوكيل'},{key:'workspace_name',label:'مساحة العمل'},{key:'runs',label:'التشغيلات'},{key:'failed',label:'الفاشلة'},{key:'tokens',label:'الرموز'}],sql:\`SELECT a.name agent_name,o.name workspace_name,COUNT(r.id)::int runs,COUNT(r.id) FILTER(WHERE r.status='failed')::int failed,COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint tokens FROM ai_agents a JOIN organizations o ON o.id=a.organization_id LEFT JOIN agent_runs r ON r.agent_id=a.id GROUP BY a.id,a.name,o.name ORDER BY runs DESC\`},
    channels:{title:'تقرير استخدام القنوات',headers:[{key:'channel_type',label:'القناة'},{key:'channels',label:'عدد القنوات'},{key:'conversations',label:'المحادثات'},{key:'messages',label:'الرسائل'}],sql:\`SELECT ch.channel_type,COUNT(DISTINCT ch.id)::int channels,COUNT(DISTINCT c.id)::int conversations,COUNT(m.id)::int messages FROM channels ch LEFT JOIN conversations c ON c.channel_id=ch.id LEFT JOIN messages m ON m.conversation_id=c.id GROUP BY ch.channel_type ORDER BY channels DESC\`},
    errors:{title:'تقرير الأخطاء',headers:[{key:'source',label:'المصدر'},{key:'message',label:'الخطأ'},{key:'created_at',label:'التاريخ'}],sql:\`SELECT 'agent_run' source,COALESCE(error_code,'failed') message,created_at::text created_at FROM agent_runs WHERE status IN('failed','blocked') UNION ALL SELECT 'webhook_event',COALESCE(error_message,'failed'),received_at::text FROM webhook_events WHERE processing_status='failed' ORDER BY created_at DESC LIMIT 2000\`},
    activity:{title:'تقرير النشاط والتدقيق',headers:[{key:'organization_name',label:'مساحة العمل'},{key:'action',label:'الإجراء'},{key:'entity_type',label:'نوع السجل'},{key:'created_at',label:'التاريخ'}],sql:\`SELECT o.name organization_name,e.action,e.entity_type,e.created_at::text created_at FROM audit_events e LEFT JOIN organizations o ON o.id=e.organization_id ORDER BY e.created_at DESC LIMIT 2000\`}
  };
  const report=reports[type];if(!report)throw new Error('نوع التقرير غير معروف.');
  return {title:report.title,headers:report.headers,rows:await query(report.sql)};
}


export async function platformAiProviders() {
  const usage=await query(\`SELECT model_provider,COUNT(*)::int total_requests,
    COUNT(*) FILTER(WHERE status='completed')::int success_requests,COUNT(*) FILTER(WHERE status='failed')::int failed_requests,
    COALESCE(AVG(latency_ms),0)::int avg_latency_ms FROM agent_runs GROUP BY model_provider\`);
  const byProvider=new Map(usage.map((r:any)=>[String(r.model_provider),r]));
  const definitions=[
    {id:'google',name:'Google Gemini',env_key_name:'GEMINI_API_KEY',env_configured:Boolean(process.env.GEMINI_API_KEY?.trim()),is_primary:1,keys:['google','gemini']},
    {id:'groq',name:'Groq',env_key_name:'GROQ_API_KEY',env_configured:Boolean(process.env.GROQ_API_KEY?.trim()),is_primary:0,keys:['groq']}
  ];
  const providers=definitions.map(p=>{const stats=byProvider.get(p.id)||p.keys.map(k=>byProvider.get(k)).find(Boolean)||{};
    return {id:p.id,name:p.name,env_key_name:p.env_key_name,env_configured:p.env_configured,is_primary:p.is_primary,
      stats:{total_requests:Number((stats as any).total_requests||0),success_requests:Number((stats as any).success_requests||0),
        failed_requests:Number((stats as any).failed_requests||0),avg_latency_ms:Number((stats as any).avg_latency_ms||0),total_cost_usd:0}};
  });
  const models=await query(\`SELECT r.model model_id,COALESCE(r.model,'غير محدد') display_name,
    0::numeric input_price_per_1m,0::numeric output_price_per_1m,0::numeric cached_input_price_per_1m,
    'غير متاح في مخطط التسعير الحالي' pricing_source,'—' pricing_version,'—' pricing_effective_date,
    COUNT(DISTINCT r.agent_id)::int agents_using,COUNT(*)::int requests_count,1::int is_allowed,
    MIN(r.model)::text id FROM agent_runs r WHERE r.model IS NOT NULL GROUP BY r.model ORDER BY requests_count DESC LIMIT 200\`);
  return {providers,models};
}

export async function platformNotificationsSupport() {
  const [notifications,activityFeed]=await Promise.all([
    query(\`SELECT n.id::text id,n.title,n.body,n.notification_type type,n.is_read,
      CASE WHEN n.is_read THEN 'read' ELSE 'unread' END delivery_status,'مؤسسة: '||o.name target_type,1::int recipients_count,n.created_at::text created_at,
      o.name workspace_name FROM notifications n JOIN organizations o ON o.id=n.organization_id
      ORDER BY n.created_at DESC LIMIT 300\`),
    query(\`SELECT e.id::text id,e.action event_type,e.entity_type,e.entity_id::text entity_id,e.actor_type actor,
      COALESCE(e.metadata->>'summary',e.action) summary,e.created_at::text created_at,'audit_events' source,
      o.name workspace_name,e.metadata FROM audit_events e LEFT JOIN organizations o ON o.id=e.organization_id
      ORDER BY e.created_at DESC LIMIT 100\`)
  ]);
  return {notifications,tickets:[],activityFeed,dataLimitations:{tickets:'لا يوجد جدول تذاكر دعم فني في مخطط قاعدة المنصة الحالي؛ لم يتم عرض تذاكر محلية على أنها تذاكر إنتاجية.'}};
}



export async function rotatePlatformChannelSecret(channelId:string,newSecret:string) {
  const secret=newSecret.trim();if(secret.length<8)throw new Error('السر الجديد قصير أو غير صالح.');
  const [channel]=await query(\`SELECT id::text id,organization_id::text organization_id,channel_type FROM channels WHERE id=$1::uuid\`,[channelId]);
  if(!channel)throw new Error('القناة غير موجودة.');
  const fields:Record<string,{provider:string;type:string}>={
    whatsapp:{provider:'meta',type:'access_token'},instagram:{provider:'meta',type:'access_token'},
    telegram:{provider:'telegram',type:'bot_token'},sms:{provider:'twilio',type:'auth_token'},
    phone:{provider:'vapi',type:'api_key'},messenger:{provider:'meta',type:'page_access_token'},
    website:{provider:'website',type:'widget_signing_secret'}
  };
  const field=fields[String(channel.channel_type)];if(!field)throw new Error('نوع القناة لا يدعم تدوير السر من هذه الشاشة.');
  const encrypted=encryptSecret(secret);
  await query(\`INSERT INTO provider_credentials(organization_id,channel_id,provider,credential_type,encrypted_value,status,key_version,last_verified_at,updated_at)
    VALUES($1::uuid,$2::uuid,$3,$4,$5,'active',1,NULL,NOW())
    ON CONFLICT(channel_id,provider,credential_type) WHERE channel_id IS NOT NULL
    DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value,status='active',key_version=1,last_verified_at=NULL,updated_at=NOW()\`,
    [channel.organization_id,channel.id,field.provider,field.type,encrypted]);
  await query(\`UPDATE channels SET verification_status='pending',updated_at=NOW() WHERE id=$1::uuid\`,[channelId]);
  return {id:channelId,credentialType:field.type,status:'updated_requires_test'};
}

export async function testPlatformChannel(channelId:string) {
  const [channel]=await query(\`SELECT id::text id,organization_id::text organization_id,channel_type,connection_mode,is_active,provider_account_id,external_identifier
    FROM channels WHERE id=$1::uuid\`,[channelId]);
  if(!channel)throw new Error('القناة غير موجودة.');
  if(!channel.is_active)throw new Error('القناة متوقفة؛ فعّلها قبل الاختبار.');
  try {
    if(channel.channel_type==='whatsapp'&&channel.connection_mode==='qr_unofficial'){
      const [session]=await query(\`SELECT status,last_error FROM whatsapp_gateway_sessions WHERE channel_id=$1::uuid\`,[channelId]);
      if(session?.status!=='connected')throw new Error('جلسة واتساب QR غير متصلة حالياً.');
    } else {
      const creds=await query(\`SELECT provider,credential_type,encrypted_value FROM provider_credentials WHERE channel_id=$1::uuid AND status='active'\`,[channelId]);
      const values:Record<string,string>={};
      for(const row of creds as any[])values[String(row.credential_type)]=decryptSecret(String(row.encrypted_value));
      const timeout=AbortSignal.timeout(12000);
      if(channel.channel_type==='whatsapp'||channel.channel_type==='instagram'||channel.channel_type==='messenger'){
        const token=values.access_token||values.page_access_token;
        if(!token||!channel.provider_account_id)throw new Error('بيانات القناة الأساسية غير مكتملة (المعرّف أو رمز الوصول).');
        const base=(process.env.META_GRAPH_BASE_URL||'https://graph.facebook.com/v23.0').replace(/\\/+$/,'');
        const response=await fetch(base+'/'+encodeURIComponent(String(channel.provider_account_id))+'?fields=id',{
          headers:{Authorization:'Bearer '+token},signal:timeout
        });
        if(!response.ok)throw new Error('رفض مزود Meta التحقق من القناة (HTTP '+response.status+').');
      } else if(channel.channel_type==='telegram'){
        if(!values.bot_token)throw new Error('رمز بوت Telegram غير موجود.');
        const response=await fetch('https://api.telegram.org/bot'+values.bot_token+'/getMe',{signal:timeout});
        const payload=await response.json().catch(()=>null) as {ok?:boolean;description?:string}|null;
        if(!response.ok||payload?.ok!==true)throw new Error('فشل تحقق Telegram من البوت.');
      } else if(channel.channel_type==='sms'){
        if(!values.account_sid||!values.auth_token)throw new Error('بيانات Twilio الأساسية غير مكتملة.');
        const auth=Buffer.from(values.account_sid+':'+values.auth_token).toString('base64');
        const response=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(values.account_sid)+'.json',{
          headers:{Authorization:'Basic '+auth},signal:timeout
        });
        if(!response.ok)throw new Error('رفض Twilio بيانات الحساب (HTTP '+response.status+').');
      } else if(channel.channel_type==='phone'){
        if(!values.api_key)throw new Error('مفتاح Vapi غير موجود.');
        const response=await fetch('https://api.vapi.ai/assistant',{headers:{Authorization:'Bearer '+values.api_key},signal:timeout});
        if(!response.ok)throw new Error('رفض Vapi مفتاح القناة (HTTP '+response.status+').');
      } else if(channel.channel_type==='website'){
        if(!values.widget_signing_secret)throw new Error('سر توقيع أداة الموقع غير موجود.');
      } else {
        throw new Error('نوع القناة لا يدعم اختباراً آلياً من لوحة المالك.');
      }
    }
    await query(\`UPDATE channels SET verification_status='verified',updated_at=NOW() WHERE id=$1::uuid\`,[channelId]);
    await query(\`UPDATE provider_credentials SET last_verified_at=NOW() WHERE channel_id=$1::uuid AND status='active'\`,[channelId]);
    return {ok:true,diagnostic:'تم التحقق من بيانات القناة مع مزودها بنجاح.'};
  } catch(error) {
    const message=error instanceof Error?error.message:'فشل اختبار القناة.';
    await query(\`UPDATE channels SET verification_status='failed',updated_at=NOW() WHERE id=$1::uuid\`,[channelId]);
    return {ok:false,diagnostic:message};
  }
}
