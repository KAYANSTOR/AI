import postgres from 'postgres';
import crypto from 'node:crypto';
import { freeQuotaFingerprint, validatePlatformSettingValue, walletSortOrder } from './billingContracts';
export { freeQuotaFingerprint } from './billingContracts';
import { sha256Hex, encryptSecret, decryptSecret, hashPassword, sanitizeLogText } from '../security/crypto';

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
  return { connected:true, engine:'PostgreSQL', database:r.db, counts:{users:count(r.users),organizations:count(r.orgs),subscriptions:count(r.subs)}, ownerSecurityStore:'PostgreSQL control plane' };
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
    (SELECT COUNT(*) FROM conversations c JOIN organization_members m ON m.organization_id=c.organization_id WHERE m.user_id=u.id AND m.role='owner')::int conversations_count,
    (SELECT CASE WHEN COUNT(*) FILTER(WHERE l.unit_cost IS NOT NULL)>0 THEN COALESCE(SUM(l.units*COALESCE(l.unit_cost,0)),0)::numeric ELSE NULL END
      FROM usage_ledger l JOIN organization_members m ON m.organization_id=l.organization_id
      WHERE m.user_id=u.id AND m.role='owner' AND l.event_type='ai_tokens' AND l.currency='USD') total_ai_cost_usd
    FROM auth.users u LEFT JOIN LATERAL(SELECT s.status,s.plan_tier,s.period_end FROM subscriptions s JOIN organization_members m ON m.organization_id=s.organization_id AND m.user_id=u.id AND m.role='owner' ORDER BY s.created_at DESC LIMIT 1) s ON TRUE
    WHERE ${w} ORDER BY ${sort} ${dir} NULLS LAST LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,size,(page-1)*size]);
  const total=count(totalRow?.total);
  return {items,pagination:{page,pageSize:size,total,totalPages:Math.max(1,Math.ceil(total/size))}};
}

export async function platformUserDetail(id:string) {
  const [user]=await query(`SELECT u.id::text id,${fullName} full_name,u.email,u.phone,u.created_at::text created_at,u.last_sign_in_at::text last_active_at,
    CASE WHEN u.banned_until>NOW() THEN 'suspended' ELSE 'active' END account_status,u.raw_user_meta_data user_metadata,
    COALESCE(u.raw_user_meta_data->>'admin_notes','') admin_notes FROM auth.users u WHERE u.id=$1::uuid AND u.deleted_at IS NULL`,[id]);
  if(!user)return null;
  const [workspaces,subscriptions,agents,channels,conversations,usage,payments,entitlements,recentEvents,auditActivity,knowledgeSources,errors]=await Promise.all([
    query(`SELECT o.id::text id,o.name,b.id::text business_id,b.name business_name,b.business_type_id business_type,COALESCE(b.status,'active') status,o.created_at::text created_at
      FROM organization_members m JOIN organizations o ON o.id=m.organization_id LEFT JOIN businesses b ON b.organization_id=o.id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY o.created_at DESC`,[id]),
    query(`SELECT s.id::text id,s.organization_id::text organization_id,s.plan_tier plan_code,COALESCE(p.name,INITCAP(s.plan_tier)) plan_name,p.monthly_price::numeric price_monthly,p.currency,s.billing_cycle,s.status,s.period_start::text current_period_start,s.period_end::text current_period_end,s.minutes_used,s.sms_used,s.created_at::text created_at FROM subscriptions s LEFT JOIN plans p ON p.id=s.plan_id JOIN organization_members m ON m.organization_id=s.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY s.created_at DESC`,[id]),
    query(`SELECT a.id::text id,a.organization_id::text organization_id,a.business_id::text workspace_id,a.name,a.model_provider provider_code,a.status,a.temperature,a.locale,a.created_at::text created_at FROM ai_agents a JOIN organization_members m ON m.organization_id=a.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY a.created_at DESC`,[id]),
    query(`SELECT c.id::text id,c.organization_id::text organization_id,c.channel_type,c.is_active,c.verification_status,c.external_identifier,c.created_at::text created_at FROM channels c JOIN organization_members m ON m.organization_id=c.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY c.created_at DESC`,[id]),
    query(`SELECT c.id::text id,c.status,c.state,c.channel_id::text channel_id,c.last_message_at::text last_message_at,ch.channel_type,
      COALESCE(NULLIF(ci.external_phone,''),NULLIF(ci.external_username,''),NULLIF(ci.external_user_id,''),ct.first_name) customer_name
      FROM conversations c JOIN organization_members m ON m.organization_id=c.organization_id LEFT JOIN channels ch ON ch.id=c.channel_id
      LEFT JOIN contacts ct ON ct.id=c.contact_id LEFT JOIN LATERAL(SELECT external_phone,external_username,external_user_id FROM contact_identities
        WHERE contact_id=c.contact_id AND channel=ch.channel_type ORDER BY created_at DESC LIMIT 1) ci ON TRUE
      WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY c.last_message_at DESC LIMIT 50`,[id]),
    query(`SELECT COUNT(*)::int requests,COALESCE(SUM(COALESCE(r.input_tokens,0)),0)::bigint input_tokens,
      COALESCE(SUM(COALESCE(r.output_tokens,0)),0)::bigint output_tokens,
      COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint total_tokens
      FROM agent_runs r JOIN organization_members m ON m.organization_id=r.organization_id WHERE m.user_id=$1::uuid AND m.role='owner'`,[id]),
    query(`SELECT i.id::text id,i.external_order_id,i.plan_code,i.amount_usd::numeric amount_usd,i.amount_yer::bigint amount_yer,i.status,i.provider,i.payment_reference,i.created_at::text created_at
      FROM billing_payment_intents i JOIN organization_members m ON m.organization_id=i.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY i.created_at DESC LIMIT 100`,[id]),
    query(`SELECT oc.organization_id::text organization_id,oc.capability_id feature_key,c.name feature_name,oc.is_enabled,
      be.limit_value,be.period,be.enabled quota_enabled FROM organization_capabilities oc JOIN capabilities c ON c.id=oc.capability_id
      JOIN organization_members m ON m.organization_id=oc.organization_id LEFT JOIN billing_entitlements be ON be.organization_id=oc.organization_id AND be.feature_key=oc.capability_id
      WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY c.name`,[id]),
    query(`SELECT r.id::text id,r.model_provider,r.model,r.status,r.input_tokens,r.output_tokens,r.latency_ms,r.error_code,r.created_at::text created_at
      FROM agent_runs r JOIN organization_members m ON m.organization_id=r.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY r.created_at DESC LIMIT 30`,[id]),
    query(`SELECT e.id::text id,e.action,e.entity_type,e.entity_id::text entity_id,e.metadata,e.created_at::text created_at
      FROM audit_events e JOIN organization_members m ON m.organization_id=e.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY e.created_at DESC LIMIT 50`,[id]),
    query(`SELECT d.id::text id,d.file_name title,d.mime_type file_type,d.status,d.created_at::text created_at,
      (SELECT COUNT(*) FROM knowledge_chunks k WHERE k.document_id=d.id)::int chunk_count
      FROM knowledge_documents d JOIN organization_members m ON m.organization_id=d.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY d.created_at DESC LIMIT 100`,[id]),
    query(`SELECT r.id::text id,r.model_provider,r.model,r.error_code,r.created_at::text created_at
      FROM agent_runs r JOIN organization_members m ON m.organization_id=r.organization_id WHERE m.user_id=$1::uuid AND m.role='owner' AND r.status='failed' ORDER BY r.created_at DESC LIMIT 50`,[id])
  ]);
  return {user,workspaces,subscriptions,invoices:[],payments,agents,channels,knowledgeSources,conversations,
    aiUsage:{summary:usage[0]||{},recentEvents},auditActivity,sessions:[],errors,entitlements};
}

export async function platformWorkspaces(search?:string) {
  const args:unknown[]=[];let where='';
  if(search?.trim()){args.push(`%${search.trim()}%`);where='WHERE o.name ILIKE $1 OR b.name ILIKE $1 OR u.email ILIKE $1';}
  return {items:await query(`SELECT o.id::text id,o.name,b.id::text business_id,b.name business_name,b.business_type_id business_type,
    COALESCE(b.status,'active') status,o.created_at::text created_at,COALESCE(o.personal_assistant_addon_enabled,FALSE) personal_assistant_addon_enabled,b.slug,
    u.id::text owner_user_id,${fullName} owner_name,u.email owner_email,
    (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id=o.id)::int member_count,
    (SELECT COUNT(*) FROM ai_agents a WHERE a.organization_id=o.id)::int agents_count,
    (SELECT COUNT(*) FROM channels ch WHERE ch.organization_id=o.id AND ch.is_active=TRUE)::int channels_count,
    (SELECT COALESCE(SUM(l.units),0)::numeric FROM usage_ledger l WHERE l.organization_id=o.id AND l.event_type='ai_tokens')::numeric tokens_used,
    (SELECT CASE WHEN COUNT(*) FILTER(WHERE l.unit_cost IS NOT NULL)>0 THEN SUM(l.units*COALESCE(l.unit_cost,0))::numeric ELSE NULL END
      FROM usage_ledger l WHERE l.organization_id=o.id AND l.event_type='ai_tokens' AND l.currency='USD') ai_cost_usd
    FROM organizations o LEFT JOIN businesses b ON b.organization_id=o.id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id ${where} ORDER BY o.created_at DESC LIMIT 500`,args)};
}

export async function platformPlans() {
  const rows=await query<{id:string;code:string;name:string;description:string|null;monthly_price:string|number;yearly_price:string|number|null;
    currency:string;limits:Record<string,unknown>|null;is_active:boolean;active_subscribers:string}>(`SELECT p.id::text id,p.code,p.name,p.description,p.monthly_price::text monthly_price,p.currency,p.limits,p.is_active,
    yearly.amount::text yearly_price,
    (SELECT COUNT(*) FROM subscriptions s WHERE s.plan_id=p.id AND s.status IN ('active','trial'))::text active_subscribers
    FROM plans p LEFT JOIN LATERAL(
      SELECT amount FROM plan_prices WHERE plan_id=p.id AND billing_cycle='yearly' AND currency=p.currency AND is_active=TRUE
      ORDER BY updated_at DESC LIMIT 1
    ) yearly ON TRUE ORDER BY p.monthly_price ASC,p.code ASC`);
  return {items:rows.map(p=>{
    const limits=p.limits||{};
    const value=(key:string)=>limits[key]===undefined||limits[key]===null?null:Number(limits[key]);
    return {id:p.id,code:p.code,name:p.name,name_en:p.name,description:p.description||'',
      price_monthly:Number(p.monthly_price),price_yearly:p.yearly_price===null?null:Number(p.yearly_price),currency:p.currency,
      billing_cycle:'monthly',trial_days:null,max_users:value('users'),max_agents:value('agents'),max_messages:value('ai_messages'),
      token_quota:null,max_channels:value('channels'),voice_minutes:value('voice_minutes'),automation_runs:value('automation_runs'),
      campaign_sends:value('campaign_sends'),storage_mb:value('storage_mb'),
      ai_messages_daily:value('ai_messages_daily'),media_monthly:value('media_monthly'),media_max_mb:value('media_max_mb'),audio_max_seconds:value('audio_max_seconds'),document_analysis:value('document_analysis'),max_input_chars:value('max_input_chars'),max_output_tokens:value('max_output_tokens'),flood_per_minute:value('flood_per_minute'),allowed_models:[],allowed_channels:[],
      allowed_tools:[],enabled_features:[],blocked_features:[],status:p.is_active?'active':'archived',
      active_subscribers:Number(p.active_subscribers),editable:true};
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
    (SELECT COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint FROM agent_runs r WHERE r.agent_id=a.id) total_tokens,
    (SELECT CASE WHEN COUNT(*) FILTER(WHERE l.unit_cost IS NOT NULL)>0 THEN COALESCE(SUM(l.units*COALESCE(l.unit_cost,0)),0)::numeric ELSE NULL END
      FROM usage_ledger l JOIN agent_runs r ON r.id=l.reference_id
      WHERE r.agent_id=a.id AND l.event_type='ai_tokens' AND l.currency='USD') total_cost_usd
    FROM ai_agents a JOIN organizations o ON o.id=a.organization_id LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY a.created_at DESC LIMIT 500`,args);
}

export async function platformCreateAgent(p:{workspaceId:string;name:string;systemPrompt?:string;dailyRequestLimit?:number;userId?:string}) {
  const workspaceId=p.workspaceId.trim(),name=p.name.trim();
  if(!workspaceId||!name)throw new Error('مساحة العمل واسم الوكيل مطلوبان.');
  if(name.length>100)throw new Error('اسم الوكيل يجب ألا يتجاوز 100 حرف.');
  const dailyLimit=Number(p.dailyRequestLimit??500);
  if(!Number.isFinite(dailyLimit)||dailyLimit<0)throw new Error('حد الطلبات اليومي غير صالح.');
  const [workspace]=await query<{organization_id:string;business_id:string;owner_user_id:string}>(`SELECT o.id::text organization_id,b.id::text business_id,
    (SELECT user_id::text FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) owner_user_id
    FROM organizations o LEFT JOIN businesses b ON b.organization_id=o.id WHERE o.id=$1::uuid`,[workspaceId]);
  if(!workspace?.organization_id||!workspace.business_id)throw new Error('مساحة العمل أو نشاطها غير موجود.');
  if(p.userId&&workspace.owner_user_id!==p.userId)throw new Error('المستخدم المحدد ليس مالك مساحة العمل.');
  const slug=(name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'agent')+'-'+crypto.randomUUID().slice(0,8);
  return sql().begin(async tx=>{
    const [agent]=await tx.unsafe(`INSERT INTO ai_agents(organization_id,business_id,name,slug,model_provider,temperature,status,locale)
      VALUES($1::uuid,$2::uuid,$3,$4,'gemini',0.7,'active','ar')
      RETURNING id::text id,organization_id::text organization_id,business_id::text workspace_id,name,model_provider provider_code,status,temperature,locale,slug,created_at::text created_at`,
      [workspace.organization_id,workspace.business_id,name,slug]);
    if(!agent)throw new Error('تعذر إنشاء الوكيل.');
    await tx.unsafe(`INSERT INTO agent_prompt_versions(agent_id,version,system_prompt_addition,status,published_at)
      VALUES($1::uuid,1,$2,'published',NOW()) ON CONFLICT(agent_id,version) DO NOTHING`,[agent.id,String(p.systemPrompt||'').trim()||null]);
    await tx.unsafe(`INSERT INTO billing_entitlements(organization_id,feature_key,limit_value,period,enabled)
      VALUES($1::uuid,'agent_daily_requests',$2,'daily',TRUE)
      ON CONFLICT(organization_id,feature_key) DO UPDATE SET limit_value=EXCLUDED.limit_value,period=EXCLUDED.period,enabled=TRUE`,
      [workspace.organization_id,dailyLimit]);
    return {agent};
  });
}

export async function platformAgentDetail(id:string) {
  const [agent]=await query(`SELECT a.id::text id,a.organization_id::text organization_id,a.business_id::text workspace_id,a.name,a.model_provider provider_code,a.status,a.temperature,a.locale,a.slug,a.created_at::text created_at,
    o.name workspace_name,u.email owner_email,${fullName} owner_name FROM ai_agents a JOIN organizations o ON o.id=a.organization_id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id WHERE a.id=$1::uuid`,[id]);
  if(!agent)return null;
  const [channels,executions,conversations,stats]=await Promise.all([
    query(`SELECT id::text id,channel_type,is_active,verification_status,external_identifier FROM channels WHERE organization_id=$1::uuid ORDER BY created_at DESC`,[agent.organization_id]),
    query(`SELECT r.id::text id,r.model_provider,r.model,r.status,r.input_tokens,r.output_tokens,(SELECT CASE WHEN COUNT(*) FILTER(WHERE l.unit_cost IS NOT NULL)>0 THEN SUM(l.units*COALESCE(l.unit_cost,0))::numeric ELSE NULL END FROM usage_ledger l WHERE l.reference_id=r.id AND l.event_type='ai_tokens' AND l.currency='USD') cost_usd,r.latency_ms,r.error_code,r.created_at::text created_at FROM agent_runs r WHERE r.agent_id=$1::uuid ORDER BY r.created_at DESC LIMIT 40`,[id]),
    query(`SELECT id::text id,status,state,channel_id::text channel_id,last_message_at::text last_message_at FROM conversations c WHERE EXISTS(SELECT 1 FROM agent_runs r WHERE r.conversation_id=c.id AND r.agent_id=$1::uuid) ORDER BY c.last_message_at DESC LIMIT 30`,[id]),
    query(`SELECT COUNT(*)::int total_runs,COUNT(*) FILTER(WHERE status='completed')::int success_runs,COUNT(*) FILTER(WHERE status='failed')::int failed_runs,
      COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint total_tokens,COALESCE(AVG(r.latency_ms),0)::int avg_latency_ms,
      (SELECT CASE WHEN COUNT(*) FILTER(WHERE l.unit_cost IS NOT NULL)>0 THEN SUM(l.units*COALESCE(l.unit_cost,0))::numeric ELSE NULL END FROM usage_ledger l JOIN agent_runs r2 ON r2.id=l.reference_id WHERE r2.agent_id=$1::uuid AND l.event_type='ai_tokens' AND l.currency='USD') total_cost_usd
      FROM agent_runs r WHERE r.agent_id=$1::uuid`,[id])
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
    (COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)) total_tokens,
    (SELECT CASE WHEN COUNT(*) FILTER(WHERE l.unit_cost IS NOT NULL)>0 THEN SUM(l.units*COALESCE(l.unit_cost,0))::numeric ELSE NULL END
      FROM usage_ledger l WHERE l.reference_id=r.id AND l.event_type='ai_tokens' AND l.currency='USD') cost_usd,
    CASE WHEN EXISTS(SELECT 1 FROM usage_ledger l WHERE l.reference_id=r.id AND l.event_type='ai_tokens' AND l.currency='USD' AND l.unit_cost IS NOT NULL) THEN 'actual' ELSE 'unavailable' END cost_type,
    CASE WHEN EXISTS(SELECT 1 FROM usage_ledger l WHERE l.reference_id=r.id AND l.event_type='ai_tokens' AND l.currency='USD' AND l.unit_cost IS NOT NULL) THEN 'usage_ledger' ELSE 'غير مسجل' END pricing_source,
    '—'::text pricing_version,r.latency_ms,r.error_code,r.created_at::text created_at,o.name workspace_name,a.name agent_name,u.id::text user_id,u.email user_email,${fullName} user_name
    FROM agent_runs r LEFT JOIN organizations o ON o.id=r.organization_id LEFT JOIN ai_agents a ON a.id=r.agent_id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=r.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
    LEFT JOIN auth.users u ON u.id=own.user_id ${where} ORDER BY r.created_at DESC LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,size,(page-1)*size]);
  const [summary]=await query(`SELECT COUNT(*)::int requests,COALESCE(SUM(COALESCE(r.input_tokens,0)),0)::bigint input_tokens,
    COALESCE(SUM(COALESCE(r.output_tokens,0)),0)::bigint output_tokens,
    COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint total_tokens
    FROM agent_runs r LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=r.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE ${where}`,args);
  const costWhere=clauses.length?where+` AND l.event_type='ai_tokens' AND l.currency='USD'`:`WHERE l.event_type='ai_tokens' AND l.currency='USD'`;
  const [costSummary]=await query(`SELECT CASE WHEN COUNT(*) FILTER(WHERE l.unit_cost IS NOT NULL)>0 THEN SUM(l.units*COALESCE(l.unit_cost,0))::numeric ELSE NULL END actual_cost_usd
    FROM usage_ledger l JOIN agent_runs r ON r.id=l.reference_id
    LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=r.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE ${costWhere}`,args);
  const total=count(totalRow?.total),actualCost=costSummary?.actual_cost_usd??null;
  return {items,summary:{...summary,actual_cost_usd:actualCost,estimated_cost_usd:null,total_cost_usd:actualCost,cached_tokens:null},
    pagination:{page,pageSize:size,total,totalPages:Math.max(1,Math.ceil(total/size))}};
}

export async function platformChannels() {
  return {items:await query(`SELECT c.id::text id,c.organization_id::text organization_id,c.business_id::text business_id,c.channel_type,c.connection_mode,
    c.is_active,c.verification_status,c.provider_account_id,c.external_identifier,c.created_at::text created_at,o.name organization_name,
    COALESCE(NULLIF(c.metadata->>'display_name',''),NULLIF(c.external_identifier,''),c.channel_type) display_name,o.name workspace_name,
    CASE WHEN c.channel_type='whatsapp' AND c.connection_mode='qr_unofficial' AND EXISTS(SELECT 1 FROM whatsapp_gateway_sessions q WHERE q.channel_id=c.id AND q.status='connected') THEN 'connected'
      WHEN c.is_active AND c.verification_status='verified' THEN 'connected' WHEN c.verification_status='failed' THEN 'error' ELSE 'pending' END connection_status,
    CASE WHEN EXISTS(SELECT 1 FROM webhook_events e WHERE e.channel_id=c.id AND e.processing_status='failed') THEN 'يوجد إخفاق'
      WHEN c.verification_status='verified' THEN 'متحقق' ELSE 'غير متحقق' END webhook_status,
    CASE WHEN EXISTS(SELECT 1 FROM provider_credentials pc WHERE pc.channel_id=c.id AND pc.status='active') THEN 'بيانات اعتماد مهيأة' ELSE 'بيانات اعتماد ناقصة' END provider_status,
    COALESCE((SELECT 'مشفّر: '||string_agg(pc.credential_type,', ' ORDER BY pc.credential_type) FROM provider_credentials pc WHERE pc.channel_id=c.id AND pc.status='active'),'لا توجد أسرار') secret_masked,
    (SELECT COUNT(*) FROM messages m JOIN conversations v ON v.id=m.conversation_id WHERE v.channel_id=c.id AND m.direction='inbound')::int messages_received,
    (SELECT COUNT(*) FROM messages m JOIN conversations v ON v.id=m.conversation_id WHERE v.channel_id=c.id AND m.direction='outbound')::int messages_sent,
    (SELECT COUNT(*) FROM webhook_events e WHERE e.channel_id=c.id AND e.processing_status='failed')::int error_count,
    (SELECT COUNT(*) FROM conversations v WHERE v.channel_id=c.id)::int conversations_count
    FROM channels c JOIN organizations o ON o.id=c.organization_id ORDER BY c.created_at DESC LIMIT 1000`)};
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
  const [paymentIntents,manualWalletRequests,wallets,ledgerEntries,s,mrr]=await Promise.all([
    query(`SELECT i.id::text id,i.external_order_id,i.plan_code,i.billing_cycle,i.amount_usd::numeric amount_usd,i.amount_yer::bigint amount_yer,
      i.exchange_rate::numeric exchange_rate,i.provider,i.payment_reference,i.provider_payment_id,i.status,i.failure_code,
      i.expires_at::text expires_at,i.verified_at::text verified_at,i.created_at::text created_at,o.name workspace_name,
      p.name plan_name,u.id::text user_id,${fullName} user_name,u.email user_email
      FROM billing_payment_intents i JOIN organizations o ON o.id=i.organization_id LEFT JOIN plans p ON p.id=i.plan_id
      LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
      LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY i.created_at DESC LIMIT 1000`),
    query(`SELECT r.id::text id,r.organization_id::text organization_id,r.plan_code,r.billing_cycle,r.amount_usd::numeric amount_usd,
      r.amount_yer::bigint amount_yer,r.exchange_rate::numeric exchange_rate,r.sender_name,r.transfer_reference,r.status,
      r.review_note,r.reviewed_by,r.reviewed_at::text reviewed_at,r.created_at::text created_at,
      (r.receipt_image_base64 IS NOT NULL) has_receipt,w.display_name wallet_name,w.provider_code,
      o.name workspace_name,p.name plan_name,u.id::text user_id,${fullName} user_name,u.email user_email
      FROM manual_wallet_payment_requests r JOIN organizations o ON o.id=r.organization_id
      JOIN manual_yemen_wallets w ON w.id=r.wallet_id LEFT JOIN plans p ON p.id=r.plan_id
      LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
      LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY r.created_at DESC LIMIT 1000`),
    query(`SELECT id::text id,provider_code,display_name,account_name,account_number,instructions,is_active,sort_order FROM manual_yemen_wallets ORDER BY sort_order, display_name`),
    query(`SELECT l.id::text id,l.organization_id::text organization_id,l.payment_request_id::text payment_request_id,
      l.amount_yer::bigint amount_yer,l.amount_usd::numeric amount_usd,l.currency,l.provider_code,l.sender_name,
      l.transfer_reference,l.recorded_by,l.recorded_at::text recorded_at,o.name workspace_name
      FROM billing_ledger_entries l JOIN organizations o ON o.id=l.organization_id ORDER BY recorded_at DESC LIMIT 1000`),
    query(`SELECT COALESCE(SUM(amount_usd) FILTER(WHERE status='verified'),0)::numeric collected,
      COALESCE(SUM(amount_usd) FILTER(WHERE status IN('pending','wrong_amount')),0)::numeric pending,
      COUNT(*) FILTER(WHERE status='verified')::int verified_count,COUNT(*) FILTER(WHERE status='pending')::int pending_count,
      COUNT(*) FILTER(WHERE status='wrong_amount')::int wrong_amount_count,COUNT(*) FILTER(WHERE status IN('failed','expired','cancelled'))::int closed_count
      FROM billing_payment_intents`),
    query(`SELECT COALESCE(SUM(p.monthly_price),0)::numeric amount FROM subscriptions s JOIN plans p ON p.id=s.plan_id
      WHERE s.status='active' AND COALESCE(s.billing_cycle,'monthly')='monthly'`)
  ]);
  const gateways=[
    {code:'esaalat',name:'إيصالات / المحافظ اليمنية',configured:Boolean(process.env.ESAALAT_CLIENT_ID?.trim()&&process.env.ESAALAT_CLIENT_SECRET?.trim()&&Number(process.env.YER_PER_USD)>0),webhookConfigured:Boolean(process.env.ESAALAT_WEBHOOK_SECRET?.trim()),supportsRefund:false},
    {code:'stripe',name:'Stripe',configured:Boolean(process.env.STRIPE_SECRET_KEY?.trim()),webhookConfigured:Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),supportsRefund:false}
  ];
  return {invoices:[],expenses:[],paymentIntents,manualWalletRequests,wallets,ledgerEntries,gateways,summary:{
    collectedRevenueUsd:Number(s?.[0]?.collected||0)+manualWalletRequests.filter((r:any)=>r.status==='approved').reduce((v:number,r:any)=>v+Number(r.amount_usd||0),0),
    unpaidInvoicesUsd:Number(s?.[0]?.pending||0)+manualWalletRequests.filter((r:any)=>r.status==='pending').reduce((v:number,r:any)=>v+Number(r.amount_usd||0),0),
    refundedUsd:0,estimatedMrrUsd:Number(mrr?.[0]?.amount||0),recordedExpensesUsd:0,
    verifiedPayments:Number(s?.[0]?.verified_count||0),pendingPayments:Number(s?.[0]?.pending_count||0),
    wrongAmountPayments:Number(s?.[0]?.wrong_amount_count||0),manualPendingPayments:manualWalletRequests.filter((r:any)=>r.status==='pending').length,
    manualApprovedPayments:manualWalletRequests.filter((r:any)=>r.status==='approved').length,closedPaymentIntents:Number(s?.[0]?.closed_count||0)
  },dataLimitations:{invoices:'المخطط الحالي لا يحتوي دفتر فواتير منفصلاً؛ طلبات الدفع والقيود المالية الفعلية معروضة أدناه.',
    expenses:'لا يوجد جدول مصروفات تشغيلية في قاعدة المنصة؛ لم يتم إنشاء بيانات بديلة.',
    refunds:'إيصالات والمحافظ اليدوية لا تدعم استرداداً آلياً من لوحة المالك.'}};
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
    query(`SELECT COALESCE(r.model,'غير محدد') model_id,COALESCE(r.model,'غير محدد') display_name,COUNT(*)::int requests,COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint tokens,
      (SELECT CASE WHEN COUNT(*) FILTER(WHERE l.unit_cost IS NOT NULL)>0 THEN SUM(l.units*COALESCE(l.unit_cost,0))::numeric ELSE NULL END
        FROM usage_ledger l JOIN agent_runs r2 ON r2.id=l.reference_id WHERE r2.model=r.model AND r2.created_at BETWEEN $1 AND $2 AND l.event_type='ai_tokens' AND l.currency='USD') cost_usd
      FROM agent_runs r WHERE r.created_at BETWEEN $1 AND $2 GROUP BY r.model ORDER BY requests DESC LIMIT 10`,[from,to])
  ]);
  const x=c[0]||{},v=(k:string)=>count(x[k]);
  const aiCostAvailable=v('ai_cost_records')>0;
  const [signals,integrations]=await Promise.all([platformOperationalSignals(),platformIntegrationStatus()]);
  const metrics={totalUsers:v('total_users'),activeUsers:v('active_users'),newUsersInPeriod:v('new_users'),suspendedUsers:v('suspended_users'),trialAccounts:v('trial_subscriptions'),
    activeSubscriptions:v('active_subscriptions'),expiredSubscriptions:v('expired_subscriptions'),cancelledSubscriptions:v('cancelled_subscriptions'),pastDueSubscriptions:v('past_due_subscriptions'),trialSubscriptions:v('trial_subscriptions'),
    totalWorkspaces:v('total_workspaces'),totalAgents:v('total_agents'),activeAgents:v('active_agents'),failingAgents:v('failing_agents'),totalConversations:v('total_conversations'),totalMessages:v('total_messages'),
    totalAiRequests:v('ai_requests'),successfulAgentRuns:v('success_runs'),failedAgentRuns:v('failed_runs'),totalTokens:v('total_tokens'),aiProviderCostsUsd:aiCostAvailable?v('ai_cost'):0,collectedRevenueUsd:v('collected_revenue'),unpaidInvoicesUsd:v('pending_payments'),recordedExpensesUsd:0,totalOperatingCostsUsd:0,netMarginUsd:0,netMarginPercent:null,
    connectedChannels:v('connected_channels'),disconnectedChannels:v('disconnected_channels'),currentSystemErrors:signals.systemErrors,unauthorizedAttempts24h:signals.unauthorizedAttempts24h};
  return {window:{startIso:from,endIso:to,days:Math.max(1,Math.ceil((end.getTime()-start.getTime())/86400000))},
    database:{engine:'PostgreSQL',mode:'بيانات المنصة الحقيقية؛ جلسات المالك وسجل تدقيقه منفصلان',externalPostgresConfigured:true,pathLabel:'Railway Postgres'},integrations,metrics,
    comparisons:{newUsersDeltaPct:null,subscriptionsDeltaPct:null,revenueDeltaPct:null,aiRequestsDeltaPct:null,aiCostDeltaPct:null},
    charts:{timeSeries:series.map((r:any)=>({date:r.date,users:count(r.users),subscriptions:count(r.subscriptions),revenueUsd:count(r.revenue_usd),tokens:count(r.tokens),aiCostUsd:count(r.ai_cost_usd),conversations:count(r.conversations),messages:count(r.messages),successRuns:count(r.success_runs),failedRuns:count(r.failed_runs)})),
      channelUsage:channels.map((r:any)=>({channel:r.channel,total:count(r.total),connected:count(r.connected),messages:count(r.messages)})),
      planDistribution:plans.map((r:any)=>({code:r.code,name:r.name,subscribers:count(r.subscribers)})),modelUsage:models.map((r:any)=>({modelId:r.model_id,displayName:r.display_name,requests:count(r.requests),tokens:count(r.tokens),costUsd:r.cost_usd==null?null:count(r.cost_usd)}))},
    attentionItems:{pastDueSubscriptions:v('past_due_subscriptions'),failingAgents:v('failing_agents'),disconnectedChannels:v('disconnected_channels'),unresolvedErrors:signals.systemErrors,unacknowledgedAlerts:signals.unacknowledgedAlerts,openTickets:signals.openTickets},
    dataLimitations:{revenue:'الإيراد المحصل محسوب من طلبات الدفع المؤكدة؛ لا يوجد دفتر فواتير منفصل.',expenses:'لا يوجد دفتر مصروفات تشغيلي في المخطط الحالي.',aiCost:aiCostAvailable?undefined:'سجل الرموز لا يحتوي تكلفة موثقة حتى الآن.'}};
}

export async function updatePlatformUser(id:string,p:{fullName?:string;email?:string;phone?:string|null;adminNotes?:string}) {
  const set:string[]=[],args:unknown[]=[];
  if(p.email!==undefined){args.push(p.email.trim().toLowerCase());set.push(`email=$${args.length}`);}
  if(p.phone!==undefined){args.push(p.phone||null);set.push(`phone=$${args.length}`);}
  const metadata:Record<string,string>={};
  if(p.fullName!==undefined)metadata.full_name=p.fullName.trim();
  if(p.adminNotes!==undefined)metadata.admin_notes=String(p.adminNotes||'').slice(0,4000);
  if(Object.keys(metadata).length){args.push(JSON.stringify(metadata));set.push(`raw_user_meta_data=COALESCE(raw_user_meta_data,'{}'::jsonb)||$${args.length}::text::jsonb`);}
  if(!set.length)throw new Error('لا توجد تغييرات لحفظها.');args.push(id);
  const [r]=await query(`UPDATE auth.users SET ${set.join(',')},updated_at=NOW() WHERE id=$${args.length}::uuid AND deleted_at IS NULL RETURNING id::text id,email,phone`,args);
  if(!r)throw new Error('المستخدم غير موجود.');return r;
}

export async function platformUserAction(id:string,action:string,payload:Record<string,unknown>={}) {
  const [user]=await query<{id:string;email:string}>(`SELECT id::text id,email FROM auth.users WHERE id=$1::uuid AND deleted_at IS NULL LIMIT 1`,[id]);
  if(!user)throw new Error('المستخدم غير موجود أو سبق حذفه.');
  if(['suspend','reactivate','reset_settings','delete'].includes(action)){
    const [row]=await query(`UPDATE auth.users SET
      banned_until=CASE WHEN $2 IN('suspend','delete') THEN NOW()+INTERVAL '100 years' ELSE NULL END,
      deleted_at=CASE WHEN $2='delete' THEN NOW() ELSE deleted_at END,
      session_version=COALESCE(session_version,0)+1,updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING id::text id,banned_until::text banned_until,deleted_at::text deleted_at,session_version`,[id,action]);
    if(!row)throw new Error('تعذر تحديث حالة المستخدم.');
    return {...row,account_status:action==='suspend'?'suspended':action==='delete'?'deleted':'active'};
  }
  if(['change_plan','extend_subscription','cancel_subscription'].includes(action)){
    const [subscription]=await query<{id:string}>(`SELECT s.id::text id FROM subscriptions s
      JOIN organization_members m ON m.organization_id=s.organization_id
      WHERE m.user_id=$1::uuid AND m.role='owner' ORDER BY s.created_at DESC LIMIT 1`,[id]);
    if(!subscription)throw new Error('لا يوجد اشتراك مرتبط بهذا المستخدم.');
    const nextAction=action==='change_plan'?'change_plan':action==='extend_subscription'?'extend':'cancel';
    return await subscriptionAction(subscription.id,nextAction,{planCode:String(payload.planCode||''),days:payload.days});
  }
  if(action==='send_notification'){
    const title=String(payload.title||'').trim(),body=String(payload.body||'').trim();
    if(title.length<2||title.length>255||!body||body.length>5000)throw new Error('عنوان الإشعار ومحتواه مطلوبان وبحدود الطول المسموح.');
    const orgs=await query<{organization_id:string}>(`SELECT organization_id::text organization_id FROM organization_members
      WHERE user_id=$1::uuid AND role='owner' ORDER BY created_at`,[id]);
    if(!orgs.length)throw new Error('المستخدم لا يملك مساحة عمل لإرسال الإشعار إليها.');
    for(const org of orgs)await query(`INSERT INTO notifications(organization_id,member_id,entity_type,entity_id,notification_type,title,body,idempotency_key)
      VALUES($1::uuid,NULL,'owner_notification',$1::uuid,'workflow',$2,$3,$4)`,
      [org.organization_id,title,body,'owner-console:'+crypto.randomUUID()]);
    return {id:user.id,notificationsCreated:orgs.length};
  }
  if(action==='add_credit'){
    const tokens=Number(payload.tokens),reason=String(payload.reason||'').trim();
    if(!Number.isSafeInteger(tokens)||tokens<1||tokens>10000000)throw new Error('قيمة الرصيد يجب أن تكون عدداً صحيحاً بين 1 و10,000,000.');
    if(reason.length<5||reason.length>1000)throw new Error('سبب إضافة الرصيد مطلوب (5 أحرف على الأقل).');
    const orgs=await query<{organization_id:string;plan_limit:number}>(`SELECT DISTINCT o.id::text organization_id,
      COALESCE(NULLIF(p.limits->>'ai_messages','')::numeric,40)::numeric plan_limit
      FROM organizations o JOIN organization_members m ON m.organization_id=o.id
      LEFT JOIN LATERAL(SELECT plan_id FROM subscriptions WHERE organization_id=o.id ORDER BY created_at DESC LIMIT 1) s ON TRUE
      LEFT JOIN plans p ON p.id=s.plan_id WHERE m.user_id=$1::uuid AND m.role='owner'`,[id]);
    if(!orgs.length)throw new Error('المستخدم لا يملك مساحة عمل لإضافة الرصيد إليها.');
    const updated=[];
    for(const org of orgs){
      const [quota]=await query(`INSERT INTO billing_entitlements(organization_id,feature_key,limit_value,period,enabled,source,updated_at)
        VALUES($1::uuid,'ai_messages_monthly',$2,'monthly',TRUE,'owner_override',NOW())
        ON CONFLICT(organization_id,feature_key) DO UPDATE SET
          limit_value=GREATEST(COALESCE(billing_entitlements.limit_value,EXCLUDED.limit_value-$3),EXCLUDED.limit_value-$3)+$3,
          period='monthly',enabled=TRUE,source='owner_override',updated_at=NOW()
        RETURNING id::text id,limit_value,period,enabled,source`,
        [org.organization_id,Number(org.plan_limit)+tokens,tokens]);
      updated.push({organizationId:org.organization_id,quota});
    }
    return {id:user.id,tokensAdded:tokens,reason,organizations:updated};
  }
  throw new Error('الإجراء الإداري غير مدعوم.');
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
  const [conversation]=await query(`SELECT c.id::text id,c.organization_id::text organization_id,c.status,c.state,c.priority,c.handoff_reason,
    c.last_message_at::text last_message_at,ch.channel_type,o.name workspace_name,
    COALESCE(NULLIF(ci.external_phone,''),NULLIF(ci.external_username,''),NULLIF(ci.external_user_id,''),NULLIF(ct.first_name,''),'عميل') customer_handle
    FROM conversations c JOIN organizations o ON o.id=c.organization_id LEFT JOIN channels ch ON ch.id=c.channel_id
    LEFT JOIN contacts ct ON ct.id=c.contact_id LEFT JOIN LATERAL(SELECT external_phone,external_username,external_user_id FROM contact_identities
      WHERE contact_id=c.contact_id AND channel=ch.channel_type ORDER BY created_at DESC LIMIT 1) ci ON TRUE WHERE c.id=$1::uuid`,[id]);
  if(!conversation)return null;
  const messages=await query(`SELECT id::text id,CASE WHEN direction='outbound' THEN 'assistant' ELSE 'customer' END sender_type,
    direction,message_type,content,created_at::text created_at FROM messages WHERE conversation_id=$1::uuid ORDER BY created_at ASC LIMIT 500`,[id]);
  return {conversation,messages};
}

export async function platformQueueConversationIntervention(id:string,content:string,reason:string) {
  const body=content.trim(),why=reason.trim();
  if(!body||!why)throw new Error('نص التدخل وسببه الإداري مطلوبان.');
  const [target]=await query(`SELECT c.id::text id,c.organization_id::text organization_id,c.business_id::text business_id,
    c.channel_id::text channel_id,ch.channel_type,ch.is_active,COALESCE(ci.external_phone,ci.external_user_id,ci.external_username) recipient
    FROM conversations c JOIN channels ch ON ch.id=c.channel_id
    LEFT JOIN LATERAL(SELECT external_phone,external_user_id,external_username FROM contact_identities
      WHERE contact_id=c.contact_id AND channel=ch.channel_type ORDER BY created_at DESC LIMIT 1) ci ON TRUE WHERE c.id=$1::uuid`,[id]);
  if(!target)throw new Error('المحادثة غير موجودة.');
  if(!target.is_active||!target.recipient)throw new Error('القناة متوقفة أو لا يوجد عنوان إرسال موثوق للعميل.');
  const idempotencyKey='owner-intervention:'+crypto.randomUUID();
  await query(`INSERT INTO outbox_events(organization_id,business_id,channel_id,event_type,idempotency_key,recipient,payload,status,scheduled_at)
    VALUES($1::uuid,$2::uuid,$3::uuid,'message.send',$4,$5,$6::text::jsonb,'pending',NOW())`,
    [target.organization_id,target.business_id,target.channel_id,idempotencyKey,target.recipient,JSON.stringify({body,conversation_id:id,source:'owner_console_intervention'})]);
  await query(`INSERT INTO audit_events(organization_id,business_id,actor_type,action,entity_type,entity_id,metadata)
    VALUES($1::uuid,$2::uuid,'system','owner.conversation_intervention_queued','conversation',$3::uuid,$4::text::jsonb)`,
    [target.organization_id,target.business_id,id,JSON.stringify({reason:why,idempotency_key:idempotencyKey,channel_type:target.channel_type})]);
  return await platformConversationDetail(id);
}

export async function updatePlatformWorkspaceStatus(organizationId:string,status:string) {
  if(!['active','suspended','archived'].includes(status))throw new Error('حالة مساحة العمل غير صالحة.');
  const rows=await query(`UPDATE businesses SET status=$2,updated_at=NOW() WHERE organization_id=$1::uuid
    RETURNING id::text id,organization_id::text organization_id,name,status`,[organizationId,status]);
  if(!rows.length)throw new Error('لم يتم العثور على نشاط مرتبط بمساحة العمل.');
  return {organizationId,status,businesses:rows};
}

export async function savePlatformPlan(p:Record<string,unknown>,id?:string) {
  const code=String(p.code||'').trim().toLowerCase(),name=String(p.name||'').trim();
  if(!code||!name)throw new Error('رمز الباقة واسمها مطلوبان.');
  if(!['trial','starter','growth','pro'].includes(code))throw new Error('رمز الباقة غير مدعوم في اشتراكات المنصة الحالية.');
  const monthly=Number(p.priceMonthly);
  const yearlyInput=p.priceYearly;
  const yearly=yearlyInput===undefined||yearlyInput===null||String(yearlyInput).trim()===''?null:Number(yearlyInput);
  if(!Number.isFinite(monthly)||monthly<0)throw new Error('السعر الشهري غير صالح.');
  if(yearly!==null&&(!Number.isFinite(yearly)||yearly<0))throw new Error('السعر السنوي غير صالح.');
  if(p.status==='draft')throw new Error('قاعدة الباقات الفعلية لا تدعم حالة المسودة.');
  const limits:Record<string,number>={};
  const mappings:Record<string,string>={maxUsers:'users',maxAgents:'agents',maxMessages:'ai_messages',maxChannels:'channels',
    voiceMinutes:'voice_minutes',automationRuns:'automation_runs',campaignSends:'campaign_sends',storageMb:'storage_mb',
    aiMessagesDaily:'ai_messages_daily',mediaMonthly:'media_monthly',mediaMaxMb:'media_max_mb',audioMaxSeconds:'audio_max_seconds',documentAnalysis:'document_analysis',maxInputChars:'max_input_chars',maxOutputTokens:'max_output_tokens',floodPerMinute:'flood_per_minute'};
  for(const [input,key] of Object.entries(mappings)){
    const value=p[input];
    if(value!==undefined&&value!==null&&String(value).trim()!==''){
      const n=Number(value);
      if(!Number.isFinite(n)||n<0)throw new Error('حدود الباقة يجب أن تكون أرقاماً غير سالبة.');
      limits[key]=n;
    }
  }
  const description=String(p.description||'');
  const currency=String(p.currency||'USD').toUpperCase();
  if(!['USD','YER','SAR'].includes(currency))throw new Error('عملة الباقة غير مدعومة.');
  const active=p.status!=='archived';
  return await sql().begin(async tx=>{
    let row:Record<string,unknown>|undefined;
    if(id){
      const [updated]=await tx.unsafe(`UPDATE plans SET code=$2,name=$3,description=$4,monthly_price=$5,currency=$6,
        limits=COALESCE(limits,'{}'::jsonb)||$7::text::jsonb,is_active=$8,updated_at=NOW()
        WHERE id=$1::uuid RETURNING id::text id,code,name,description,monthly_price::numeric price_monthly,currency,limits,is_active`,
        [id,code,name,description,monthly,currency,JSON.stringify(limits),active]);
      row=updated;
      if(!row)throw new Error('الباقة غير موجودة.');
    } else {
      const [created]=await tx.unsafe(`INSERT INTO plans(code,name,description,monthly_price,currency,limits,is_active)
        VALUES($1,$2,$3,$4,$5,$6::text::jsonb,$7)
        RETURNING id::text id,code,name,description,monthly_price::numeric price_monthly,currency,limits,is_active`,
        [code,name,description,monthly,currency,JSON.stringify(limits),active]);
      row=created;
    }
    const planId=String(row.id);
    if(yearly!==null&&yearly>0){
      await tx.unsafe(`INSERT INTO plan_prices(plan_id,billing_cycle,currency,amount,is_active,updated_at)
        VALUES($1::uuid,'yearly',$2,$3,TRUE,NOW())
        ON CONFLICT(plan_id,billing_cycle,currency) DO UPDATE SET amount=EXCLUDED.amount,is_active=TRUE,updated_at=NOW()`,
        [planId,currency,yearly]);
    } else {
      await tx.unsafe(`UPDATE plan_prices SET is_active=FALSE,updated_at=NOW()
        WHERE plan_id=$1::uuid AND billing_cycle='yearly' AND currency=$2`,[planId,currency]);
    }
    return {...row,price_yearly:yearly&&yearly>0?yearly:null};
  });
}


export async function updatePlatformWorkspaceAddon(organizationId:string,enabled:boolean,adminId:string) {
  const [row]=await query(`UPDATE organizations SET personal_assistant_addon_enabled=$2,
    personal_assistant_addon_updated_at=NOW(),personal_assistant_addon_updated_by=$3::uuid
    WHERE id=$1::uuid RETURNING id::text id,name,personal_assistant_addon_enabled,personal_assistant_addon_updated_at::text updated_at`,
    [organizationId,enabled,adminId]);
  if(!row)throw new Error('مساحة العمل غير موجودة.');
  return row;
}
export async function platformCreateConversation(p:{workspaceId:string;userId:string;channelType:string;customerHandle:string;initialMessage:string}) {
  const workspaceId=p.workspaceId.trim(),userId=p.userId.trim(),handle=p.customerHandle.trim(),message=p.initialMessage.trim();
  if(!workspaceId||!userId||handle.length<2||handle.length>255||message.length>10000)throw new Error('بيانات المحادثة غير مكتملة أو تتجاوز الحد المسموح.');
  const channelType=p.channelType==='webchat'?'website':p.channelType==='voice_vapi'?'phone':p.channelType;
  if(!['whatsapp','instagram','telegram','sms','website','phone','messenger'].includes(channelType))throw new Error('نوع القناة غير مدعوم.');
  const [workspace]=await query<{organization_id:string;business_id:string;owner_user_id:string}>(`SELECT o.id::text organization_id,b.id::text business_id,
    (SELECT user_id::text FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) owner_user_id
    FROM organizations o LEFT JOIN businesses b ON b.organization_id=o.id WHERE o.id=$1::uuid`,[workspaceId]);
  if(!workspace?.organization_id||!workspace.business_id||workspace.owner_user_id!==userId)throw new Error('مساحة العمل أو مالكها غير صحيح.');
  const [channel]=await query<{id:string;is_active:boolean}>(`SELECT id::text id,is_active FROM channels WHERE organization_id=$1::uuid AND channel_type=$2 ORDER BY created_at DESC LIMIT 1`,[workspaceId,channelType]);
  if(!channel)throw new Error('لا توجد قناة من هذا النوع في مساحة العمل؛ اربط القناة أولاً من إعدادات المؤسسة.');
  if(!channel.is_active)throw new Error('القناة متوقفة حالياً.');
  return sql().begin(async tx=>{
    const [contact]=await tx.unsafe(`INSERT INTO contacts(organization_id,first_name) VALUES($1::uuid,$2) RETURNING id::text id`,[workspaceId,handle.slice(0,100)]);
    if(['whatsapp','sms','phone'].includes(channelType))
      await tx.unsafe(`INSERT INTO contact_identities(contact_id,channel,external_phone) VALUES($1::uuid,$2,$3)`,[contact.id,channelType,handle]);
    else if(['telegram','website'].includes(channelType))
      await tx.unsafe(`INSERT INTO contact_identities(contact_id,channel,external_user_id) VALUES($1::uuid,$2,$3)`,[contact.id,channelType,handle]);
    else await tx.unsafe(`INSERT INTO contact_identities(contact_id,channel,external_username) VALUES($1::uuid,$2,$3)`,[contact.id,channelType,handle]);
    const [conversation]=await tx.unsafe(`INSERT INTO conversations(organization_id,business_id,contact_id,channel_id,status,state,ai_enabled,last_message_at)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'active','new',TRUE,NOW())
      RETURNING id::text id,organization_id::text organization_id,status,state`,[workspaceId,workspace.business_id,contact.id,channel.id]);
    if(message)await tx.unsafe(`INSERT INTO messages(organization_id,conversation_id,direction,message_type,content)
      VALUES($1::uuid,$2::uuid,'inbound','text',$3)`,[workspaceId,conversation.id,message]);
    return {conversationId:conversation.id,conversation};
  });
}


export async function platformCreateWorkspace(p:{ownerUserId:string;name:string;businessType?:string}) {
  const name=p.name.trim(),owner=p.ownerUserId.trim();
  if(!name||!owner)throw new Error('اسم مساحة العمل ومالكها مطلوبان.');
  const [type]=await query(`SELECT id FROM business_types WHERE id=$1`,[p.businessType||'appointments']);
  const businessType=type?.id||'appointments';
  return await sql().begin(async tx=>{
    const [org]=await tx.unsafe(`INSERT INTO organizations(name) VALUES($1) RETURNING id::text id,name,created_at::text created_at`,[name]);
    await tx.unsafe(`INSERT INTO organization_members(organization_id,user_id,role) VALUES($1::uuid,$2::uuid,'owner') ON CONFLICT(organization_id,user_id) DO NOTHING`,[org.id,owner]);
    const slug=(name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'business')+'-'+crypto.randomUUID().slice(0,8);
    const [business]=await tx.unsafe(`INSERT INTO businesses(organization_id,name,slug,business_type_id,timezone,status)
      VALUES($1::uuid,$2,$3,$4,'UTC','active') RETURNING id::text id,name,slug,business_type_id,status`,[org.id,name,slug,businessType]);
    await tx.unsafe(`INSERT INTO business_profiles(organization_id,business_id,industry,timezone,business_type_id)
      VALUES($1::uuid,$2::uuid,$3,'UTC',$3) ON CONFLICT(organization_id) DO UPDATE SET business_id=EXCLUDED.business_id,industry=EXCLUDED.industry,business_type_id=EXCLUDED.business_type_id`,
      [org.id,business.id,businessType]);
    const [agent]=await tx.unsafe(`INSERT INTO ai_agents(organization_id,business_id,name,slug,model_provider,temperature,status,locale)
      VALUES($1::uuid,$2::uuid,$3,'frontdesk','anthropic',0.2,'active','ar') RETURNING id::text id`,[org.id,business.id,name+' AI']);
    await tx.unsafe(`INSERT INTO agent_tool_policies(agent_id,tool_name,is_allowed,requires_confirmation) VALUES
      ($1::uuid,'get_customer',TRUE,FALSE),($1::uuid,'find_available_slots',TRUE,FALSE),($1::uuid,'create_appointment',TRUE,TRUE),($1::uuid,'request_human_handoff',TRUE,FALSE)
      ON CONFLICT(agent_id,tool_name) DO NOTHING`,[agent.id]);
    await tx.unsafe(`INSERT INTO agent_prompt_versions(agent_id,version,system_prompt_addition,status,published_at)
      VALUES($1::uuid,1,NULL,'published',NOW()) ON CONFLICT(agent_id,version) DO NOTHING`,[agent.id]);
    await tx.unsafe(`INSERT INTO organization_capabilities(organization_id,capability_id,is_enabled)
      SELECT $1::uuid,capability_id,TRUE FROM business_type_capabilities WHERE business_type_id=$2 AND is_default=TRUE
      ON CONFLICT(organization_id,capability_id) DO NOTHING`,[org.id,businessType]);
    await tx.unsafe(`INSERT INTO billing_entitlements(organization_id,feature_key,limit_value,period,enabled)
      VALUES($1::uuid,'ai_messages_monthly',10000,'monthly',TRUE),($1::uuid,'phone_minutes_monthly',300,'monthly',TRUE),($1::uuid,'sms_monthly',500,'monthly',TRUE)
      ON CONFLICT(organization_id,feature_key) DO NOTHING`,[org.id]);
    return {organization:org,business,agentId:agent.id};
  });
}

export async function platformAutomations() {
  const [workflows,campaigns,followups]=await Promise.all([
    query(`SELECT w.id::text id,'workflow' automation_type,w.name,w.description,w.status,w.trigger_type,w.created_at::text created_at,
      o.name workspace_name,COALESCE(u.email,'—') owner_name,(SELECT COUNT(*) FROM workflow_runs r WHERE r.workflow_id=w.id)::int total_runs,
      (SELECT COUNT(*) FROM workflow_runs r WHERE r.workflow_id=w.id AND r.status='completed')::int success_runs,
      (SELECT COUNT(*) FROM workflow_runs r WHERE r.workflow_id=w.id AND r.status='failed')::int failed_runs,
      COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (r.completed_at-r.started_at))*1000) FROM workflow_runs r WHERE r.workflow_id=w.id AND r.completed_at IS NOT NULL),0)::int avg_duration_ms
      FROM workflows w JOIN organizations o ON o.id=w.organization_id
      LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
      LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY w.created_at DESC LIMIT 500`),
    query(`SELECT c.id::text id,'campaign' automation_type,c.name,c.channel,c.status,c.scheduled_at::text scheduled_at,c.created_at::text created_at,
      o.name workspace_name,COALESCE(u.email,'—') owner_name,(SELECT COUNT(*) FROM campaign_recipients r WHERE r.campaign_id=c.id)::int total_runs,
      (SELECT COUNT(*) FROM campaign_recipients r WHERE r.campaign_id=c.id AND r.status='sent')::int success_runs,
      (SELECT COUNT(*) FROM campaign_recipients r WHERE r.campaign_id=c.id AND r.status='failed')::int failed_runs,0::int avg_duration_ms
      FROM campaigns c JOIN organizations o ON o.id=c.organization_id
      LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
      LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY c.created_at DESC LIMIT 500`),
    query(`SELECT f.id::text id,'followup' automation_type,f.name,f.trigger_type,f.is_active,f.created_at::text created_at,
      o.name workspace_name,COALESCE(u.email,'—') owner_name,(SELECT COUNT(*) FROM followup_enrollments e WHERE e.sequence_id=f.id)::int total_runs,
      (SELECT COUNT(*) FROM followup_enrollments e WHERE e.sequence_id=f.id AND e.status='sent')::int success_runs,0::int failed_runs,0::int avg_duration_ms
      FROM followup_sequences f JOIN organizations o ON o.id=f.organization_id
      LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
      LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY f.created_at DESC LIMIT 500`)
  ]);
  const items=[...workflows.map((r:any)=>({...r,id:'workflow:'+r.id,status:r.status==='published'?'active':r.status==='retired'?'disabled_by_owner':'paused'})),
    ...campaigns.map((r:any)=>({...r,id:'campaign:'+r.id})),
    ...followups.map((r:any)=>({...r,id:'followup:'+r.id,status:r.is_active?'active':'disabled_by_owner'}))];
  return {items:items.sort((a:any,b:any)=>String(b.created_at).localeCompare(String(a.created_at)))};
}

export async function createPlatformAutomation(p:{workspaceId:string;name:string;automationType:string}) {
  const name=p.name.trim();if(!name||!p.workspaceId)throw new Error('اسم الأتمتة ومساحة العمل مطلوبان.');
  const [business]=await query(`SELECT id::text id FROM businesses WHERE organization_id=$1::uuid ORDER BY created_at LIMIT 1`,[p.workspaceId]);
  if(!business)throw new Error('لا يوجد نشاط مرتبط بمساحة العمل.');
  if(p.automationType==='workflow'){
    const [row]=await query(`INSERT INTO workflows(organization_id,business_id,name,status,trigger_type,definition)
      VALUES($1::uuid,$2::uuid,$3,'draft','manual','{"nodes":[],"edges":[]}'::jsonb)
      RETURNING id::text id,name,status,trigger_type,created_at::text created_at`,[p.workspaceId,business.id,name]);
    return {...row,id:'workflow:'+row.id,automation_type:'workflow'};
  }
  if(p.automationType==='followup'){
    const [row]=await query(`INSERT INTO followup_sequences(organization_id,name,trigger_type,is_active)
      VALUES($1::uuid,$2,'new_lead',TRUE) RETURNING id::text id,name,trigger_type,is_active,created_at::text created_at`,[p.workspaceId,name]);
    return {...row,id:'followup:'+row.id,automation_type:'followup',status:'active'};
  }
  throw new Error('هذا النوع يحتاج إعدادات تشغيل ومحتوى غير متوفرة في نموذج الإدارة الحالي؛ لم يتم إنشاء سجل ناقص.');
}

export async function updatePlatformAutomation(id:string,status:string) {
  if(!['active','disabled_by_owner'].includes(status))throw new Error('حالة الأتمتة غير صالحة.');
  const [kind,rawId]=id.split(':');if(!rawId)throw new Error('معرّف الأتمتة غير صالح.');
  if(kind==='workflow'){
    const [row]=await query(`UPDATE workflows SET status=$2,published_at=CASE WHEN $2='published' THEN NOW() ELSE published_at END,updated_at=NOW()
      WHERE id=$1::uuid RETURNING id::text id,name,status`,[rawId,status==='active'?'published':'retired']);
    if(!row)throw new Error('الأتمتة غير موجودة.');return {...row,id:'workflow:'+row.id};
  }
  if(kind==='followup'){
    const [row]=await query(`UPDATE followup_sequences SET is_active=$2,updated_at=NOW() WHERE id=$1::uuid RETURNING id::text id,name,is_active`,[rawId,status==='active']);
    if(!row)throw new Error('الأتمتة غير موجودة.');return {...row,id:'followup:'+row.id,status};
  }
  if(kind==='campaign'){
    const [row]=await query(`UPDATE campaigns SET status=$2,updated_at=NOW() WHERE id=$1::uuid RETURNING id::text id,name,status`,[rawId,status==='active'?'running':'paused']);
    if(!row)throw new Error('الحملة غير موجودة.');return {...row,id:'campaign:'+row.id};
  }
  throw new Error('نوع الأتمتة غير مدعوم.');
}

export async function platformKnowledge() {
  const [documents,legacy]=await Promise.all([
    query(`SELECT d.id::text id,d.organization_id::text organization_id,d.file_name title,d.mime_type file_type,d.status,
      CASE WHEN d.status='completed' THEN 'indexed' ELSE d.status END processing_status,
      CASE WHEN (SELECT COUNT(*) FROM knowledge_chunks k WHERE k.document_id=d.id)>0 THEN 'indexed' ELSE 'pending' END search_index_status,
      d.created_at::text created_at,d.updated_at::text updated_at,o.name workspace_name,COALESCE(u.email,'—') owner_name,
      octet_length(d.original_text)::bigint storage_bytes,(SELECT COUNT(*) FROM knowledge_chunks k WHERE k.document_id=d.id)::int chunk_count
      FROM knowledge_documents d JOIN organizations o ON o.id=d.organization_id
      LEFT JOIN auth.users u ON u.id=d.created_by ORDER BY d.created_at DESC LIMIT 1000`),
    query(`SELECT k.id::text id,k.organization_id::text organization_id,k.title,'text/plain' file_type,
      CASE WHEN k.is_active THEN 'indexed' ELSE 'archived' END processing_status,
      CASE WHEN k.is_active THEN 'indexed' ELSE 'archived' END search_index_status,k.created_at::text created_at,k.updated_at::text updated_at,
      o.name workspace_name,COALESCE(u.email,'—') owner_name,octet_length(k.content)::bigint storage_bytes,1::int chunk_count
      FROM knowledge_base k JOIN organizations o ON o.id=k.organization_id
      LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
      LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY k.created_at DESC LIMIT 1000`)
  ]);
  const items=[...documents,...legacy].sort((a:any,b:any)=>String(b.created_at).localeCompare(String(a.created_at)));
  const summary={total_sources:items.length,total_chunks:items.reduce((n:any,r:any)=>n+Number(r.chunk_count||0),0),
    total_bytes:items.reduce((n:any,r:any)=>n+Number(r.storage_bytes||0),0),failed_count:items.filter((r:any)=>r.processing_status==='failed').length};
  return {items,summary};
}

export async function platformApiIntegrations() {
  const [apiKeys,webhookEvents]=await Promise.all([
    query(`SELECT k.id::text id,k.organization_id::text organization_id,o.name workspace_name,k.name,k.key_prefix,k.scopes,
      k.last_used_at::text last_used_at,k.revoked_at::text revoked_at,k.created_at::text created_at,
      CASE WHEN k.revoked_at IS NULL THEN 'active' ELSE 'revoked' END status,'غير محدد'::text rate_limit_per_min
      FROM organization_api_keys k JOIN organizations o ON o.id=k.organization_id ORDER BY k.created_at DESC LIMIT 1000`),
    query(`SELECT e.id::text id,e.organization_id::text organization_id,e.provider,e.event_type,e.processing_status status,
      e.error_message,e.received_at::text created_at,e.processed_at::text processed_at,o.name workspace_name
      FROM webhook_events e LEFT JOIN organizations o ON o.id=e.organization_id ORDER BY e.received_at DESC LIMIT 100`)
  ]);
  return {apiKeys,webhooks:[],webhookEvents,dataLimitations:{webhooks:'قاعدة المنصة تسجل أحداث Webhook الواردة، لكنها لا تحتوي حالياً على جدول تعريف Webhooks الصادرة.'}};
}

export async function createPlatformApiKey(p:{organizationId:string;name:string}) {
  const name=p.name.trim();if(!name||!p.organizationId)throw new Error('اسم المفتاح ومساحة العمل مطلوبان.');
  const raw='fdk_'+crypto.randomBytes(24).toString('base64url'),prefix=raw.slice(0,12),hash=sha256Hex(raw);
  const [row]=await query(`INSERT INTO organization_api_keys(organization_id,name,key_prefix,key_hash,scopes)
    VALUES($1::uuid,$2,$3,$4,ARRAY['read']::text[]) RETURNING id::text id,key_prefix`,[p.organizationId,name,prefix,hash]);
  if(!row)throw new Error('تعذر إصدار مفتاح API.');
  return {id:row.id,oneTimeSecret:raw,prefix:row.key_prefix};
}

export async function revokePlatformApiKey(id:string) {
  const [row]=await query(`UPDATE organization_api_keys SET revoked_at=NOW() WHERE id=$1::uuid AND revoked_at IS NULL
    RETURNING id::text id,revoked_at::text revoked_at`,[id]);
  if(!row)throw new Error('مفتاح API غير موجود أو مبطل مسبقاً.');
  return row;
}

export async function platformMonitoring() {
  const started=Date.now();await platformPing();const latencyMs=Date.now()-started;
  const mem=process.memoryUsage(),uptimeSec=Math.floor(process.uptime());
  const [counts,ackRows,migrations,agentStats]=await Promise.all([
    query(`SELECT (SELECT COUNT(*) FROM agent_runs WHERE status='failed' AND created_at>NOW()-INTERVAL '24 hours')::int failed_runs,
      (SELECT COUNT(*) FROM webhook_events WHERE processing_status='failed' AND received_at>NOW()-INTERVAL '24 hours')::int failed_webhooks,
      (SELECT COUNT(*) FROM inbound_jobs WHERE status='dead_letter' AND updated_at>NOW()-INTERVAL '24 hours')::int failed_inbound,
      (SELECT COUNT(*) FROM outbox_events WHERE status IN('failed','dead_letter') AND updated_at>NOW()-INTERVAL '24 hours')::int failed_outbound,
      (SELECT COUNT(*) FROM whatsapp_gateway_sessions WHERE status<>'connected' AND last_error IS NOT NULL)::int gateway_errors`),
    query(`SELECT alert_id FROM platform_alert_acknowledgements`),
    query(`SELECT version::text version,name,applied_at::text applied_at FROM public.schema_migrations WHERE failed_at IS NULL ORDER BY version DESC LIMIT 30`),
    platformPersonalAgentStats()
  ]);
  const c=counts[0]||{},acknowledged=new Set(ackRows.map((r:any)=>String(r.alert_id)));
  const failedRuns=count(c.failed_runs),failedWebhooks=count(c.failed_webhooks),failedInbound=count(c.failed_inbound),failedOutbound=count(c.failed_outbound),gatewayErrors=count(c.gateway_errors);
  const defs=[
    {id:'failed-agent-runs',title:'إخفاقات تشغيل الوكلاء',description:failedRuns+' إخفاقاً خلال آخر 24 ساعة',severity:'warning',active:failedRuns>0},
    {id:'failed-webhooks',title:'أحداث Webhook فاشلة',description:failedWebhooks+' حدثاً فاشلاً خلال آخر 24 ساعة',severity:'warning',active:failedWebhooks>0},
    {id:'failed-outbound',title:'رسائل لم تُرسل',description:failedOutbound+' محاولة إرسال فاشلة أو في قائمة العزل',severity:'warning',active:failedOutbound>0},
    {id:'failed-inbound',title:'رسائل واردة في قائمة العزل',description:failedInbound+' مهمة inbound في قائمة العزل خلال آخر 24 ساعة',severity:'warning',active:failedInbound>0},
    {id:'gateway-errors',title:'أخطاء جلسات WhatsApp Web',description:gatewayErrors+' جلسة بها خطأ مسجل',severity:'warning',active:gatewayErrors>0}
  ];
  return {runtime:{nodeVersion:process.version,platform:process.platform+' '+process.arch,uptimeSec,memoryMb:Number((mem.rss/1024/1024).toFixed(1)),
      unresolvedErrors:failedRuns+failedWebhooks+failedInbound+failedOutbound+gatewayErrors,unauthorizedAttempts24h:(await platformOperationalSignals()).unauthorizedAttempts24h},
    services:[
      {id:'backend_api',name:'خادم KAYAN AI',status:'operational',latencyMs:null,detail:'خدمة التطبيق ولوحة المالك تعملان ضمن خدمة Railway نفسها.'},
      {id:'postgres',name:'قاعدة بيانات PostgreSQL',status:'operational',latencyMs,detail:'تم تنفيذ فحص اتصال فعلي للجداول الأساسية في قاعدة بيانات المنصة.'}
    ],
    alerts:defs.filter(a=>a.active).map(a=>({...a,acknowledged:acknowledged.has(a.id)?1:0})),migrations,agentStats};
}

/**
 * Personal executive agent (0080) and WhatsApp trainer (0081) activity, read live from
 * agent_tasks, agent_approvals and whatsapp_training_submissions (last 30 days).
 */
export async function platformPersonalAgentStats() {
  const [row]=await query(`SELECT
      (SELECT COUNT(*) FROM agent_tasks WHERE created_at>NOW()-INTERVAL '30 days')::int tasks_total,
      (SELECT COUNT(*) FROM agent_tasks WHERE state IN('pending','planning','running','verifying'))::int tasks_active,
      (SELECT COUNT(*) FROM agent_tasks WHERE state='awaiting_approval')::int tasks_awaiting_approval,
      (SELECT COUNT(*) FROM agent_tasks WHERE state='done' AND created_at>NOW()-INTERVAL '30 days')::int tasks_done,
      (SELECT COUNT(*) FROM agent_tasks WHERE state='failed' AND created_at>NOW()-INTERVAL '30 days')::int tasks_failed,
      (SELECT COALESCE(SUM(cost_usd),0) FROM agent_tasks WHERE created_at>NOW()-INTERVAL '30 days')::float8 tasks_cost_usd,
      (SELECT COUNT(*) FROM agent_approvals WHERE status='pending' AND expires_at>NOW())::int approvals_pending,
      (SELECT COUNT(*) FROM agent_approvals WHERE status='approved' AND created_at>NOW()-INTERVAL '30 days')::int approvals_approved,
      (SELECT COUNT(*) FROM agent_approvals WHERE status='rejected' AND created_at>NOW()-INTERVAL '30 days')::int approvals_rejected,
      (SELECT COUNT(*) FROM agent_approvals WHERE (status='expired' OR (status='pending' AND expires_at<=NOW())) AND created_at>NOW()-INTERVAL '30 days')::int approvals_expired,
      (SELECT COUNT(*) FROM whatsapp_training_submissions WHERE created_at>NOW()-INTERVAL '30 days')::int training_total,
      (SELECT COUNT(*) FROM whatsapp_training_submissions WHERE status='pending')::int training_pending,
      (SELECT COUNT(*) FROM whatsapp_training_submissions WHERE status='indexed' AND created_at>NOW()-INTERVAL '30 days')::int training_indexed,
      (SELECT COUNT(*) FROM whatsapp_training_submissions WHERE status='failed' AND created_at>NOW()-INTERVAL '30 days')::int training_failed,
      (SELECT COUNT(*) FROM whatsapp_training_submissions WHERE flagged AND created_at>NOW()-INTERVAL '30 days')::int training_flagged,
      (SELECT COUNT(DISTINCT org_id) FROM agent_tasks WHERE created_at>NOW()-INTERVAL '30 days')::int active_orgs`);
  const r=(row||{}) as Record<string,unknown>;
  const n=(k:string)=>count(r[k]);
  return {
    windowDays:30,
    tasks:{total:n('tasks_total'),active:n('tasks_active'),awaitingApproval:n('tasks_awaiting_approval'),done:n('tasks_done'),failed:n('tasks_failed'),
      costUsd:Number(Number(r.tasks_cost_usd||0).toFixed(4)),activeOrganizations:n('active_orgs')},
    approvals:{pending:n('approvals_pending'),approved:n('approvals_approved'),rejected:n('approvals_rejected'),expired:n('approvals_expired')},
    training:{total:n('training_total'),pending:n('training_pending'),indexed:n('training_indexed'),failed:n('training_failed'),flagged:n('training_flagged')},
  };
}

export async function platformLogs(f:{category?:string;severity?:string;resolved?:string}) {
  const [rows,webhookRows,inboundRows,outboxRows,gatewayRows,platformAuditRows,resolutionRows]=await Promise.all([
    query(`SELECT id::text id,'ai' category,'AI' service_name,CASE WHEN status='failed' THEN 'error' ELSE 'warning' END severity,
      COALESCE(error_code,'agent_run_failed') message,COALESCE(error_code,'') details,status='completed' resolved,created_at::text created_at,'agent_run' source
      FROM agent_runs WHERE status IN('failed','blocked') ORDER BY created_at DESC LIMIT 200`),
    query(`SELECT id::text id,'webhook' category,'Webhook' service_name,'error' severity,COALESCE(error_message,'webhook_failed') message,
      provider||' · '||COALESCE(event_type,'') details,FALSE resolved,received_at::text created_at,'webhook_event' source
      FROM webhook_events WHERE processing_status='failed' ORDER BY received_at DESC LIMIT 200`),
    query(`SELECT id::text id,'inbound' category,'Inbound Worker' service_name,'error' severity,COALESCE(last_error,'inbound_dead_letter') message,
      'attempts='||attempts::text details,FALSE resolved,updated_at::text created_at,'inbound_job' source
      FROM inbound_jobs WHERE status='dead_letter' OR last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 200`),
    query(`SELECT id::text id,'outbox' category,'Outbox Worker' service_name,'error' severity,COALESCE(last_error,'outbound_failed') message,
      event_type||' · '||COALESCE(payload->>'provider','unknown_provider') details,FALSE resolved,updated_at::text created_at,'outbox_event' source
      FROM outbox_events WHERE status IN('failed','dead_letter') OR last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 200`),
    query(`SELECT id::text id,'whatsapp_gateway' category,'WhatsApp Gateway' service_name,'error' severity,COALESCE(last_error,'gateway_session_error') message,
      status||' · channel='||channel_id::text details,FALSE resolved,updated_at::text created_at,'whatsapp_gateway_session' source
      FROM whatsapp_gateway_sessions WHERE last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 200`),
    query(`SELECT id::text id,'admin_audit' category,'Owner Console' service_name,'info' severity,summary message,
      action||' · '||entity_type||' · '||entity_id details,TRUE resolved,created_at::text created_at,'platform_audit_log' source
      FROM platform_audit_logs ORDER BY created_at DESC LIMIT 200`),
    query(`SELECT source,log_id FROM platform_log_resolutions`)
  ]);
  const resolvedKeys=new Set(resolutionRows.map((r:any)=>String(r.source)+'|'+String(r.log_id)));
  const all=[...rows,...webhookRows,...inboundRows,...outboxRows,...gatewayRows,...platformAuditRows].map((r:any)=>{
    const resolved=Boolean(r.resolved)||resolvedKeys.has(String(r.source)+'|'+String(r.id));
    return {...r,resolved,details_sanitized:sanitizeLogText(String(r.details||'')),message:sanitizeLogText(String(r.message||''))};
  });
  return {items:all.filter((r:any)=>(!f.category||f.category==='all'||r.category===f.category)&&(!f.severity||f.severity==='all'||r.severity===f.severity)&&(!f.resolved||f.resolved==='all'||(f.resolved==='true'?r.resolved:!r.resolved)))
    .sort((a:any,b:any)=>String(b.created_at).localeCompare(String(a.created_at)))};
}

export async function platformSearch(term:string) {
  const q = term.trim().slice(0,120);
  if (q.length < 2) return {users:[],workspaces:[],agents:[],conversations:[],subscriptions:[],invoices:[],usageEvents:[],channels:[],systemLogs:[],auditLogs:[]};
  const like = `%${q}%`;
  const [users,workspaces,agents,conversations,subscriptions,usageEvents,channels,auditLogs] = await Promise.all([
    query(`SELECT u.id::text id,${fullName} full_name,u.email FROM auth.users u
      WHERE u.deleted_at IS NULL AND (u.email ILIKE $1 OR ${fullName} ILIKE $1) ORDER BY u.created_at DESC LIMIT 8`,[like]),
    query(`SELECT o.id::text id,o.name,COALESCE(b.slug,'') slug FROM organizations o
      LEFT JOIN businesses b ON b.organization_id=o.id WHERE o.name ILIKE $1 OR b.slug ILIKE $1
      ORDER BY o.created_at DESC LIMIT 8`,[like]),
    query(`SELECT a.id::text id,a.name,a.model_provider model_id FROM ai_agents a
      LEFT JOIN organizations o ON o.id=a.organization_id WHERE a.name ILIKE $1 OR a.model_provider ILIKE $1 OR o.name ILIKE $1
      ORDER BY a.created_at DESC LIMIT 8`,[like]),
    query(`SELECT c.id::text id,COALESCE(NULLIF(ci.external_phone,''),NULLIF(ci.external_username,''),NULLIF(ci.external_user_id,''),NULLIF(ct.first_name,''),'عميل') customer_handle,
      COALESCE(ch.channel_type,'unknown') channel_type FROM conversations c
      LEFT JOIN contacts ct ON ct.id=c.contact_id LEFT JOIN channels ch ON ch.id=c.channel_id
      LEFT JOIN LATERAL(SELECT external_phone,external_username,external_user_id FROM contact_identities
        WHERE contact_id=c.contact_id AND channel=ch.channel_type ORDER BY created_at DESC LIMIT 1) ci ON TRUE
      JOIN organizations o ON o.id=c.organization_id
      WHERE o.name ILIKE $1 OR COALESCE(ct.first_name,'') ILIKE $1 OR COALESCE(ci.external_phone,'') ILIKE $1 OR COALESCE(ci.external_username,'') ILIKE $1
      ORDER BY c.last_message_at DESC LIMIT 8`,[like]),
    query(`SELECT s.id::text id,${fullName} user_name,COALESCE(p.name,s.plan_tier) plan_name
      FROM subscriptions s JOIN organizations o ON o.id=s.organization_id
      LEFT JOIN plans p ON p.id=s.plan_id
      LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE
      LEFT JOIN auth.users u ON u.id=own.user_id
      WHERE o.name ILIKE $1 OR s.plan_tier ILIKE $1 OR u.email ILIKE $1 OR ${fullName} ILIKE $1
      ORDER BY s.created_at DESC LIMIT 8`,[like]),
    query(`SELECT r.id::text id,COALESCE(r.model,'غير محدد') model_id,
      (COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0))::bigint total_tokens
      FROM agent_runs r WHERE COALESCE(r.model,'') ILIKE $1 OR COALESCE(r.model_provider,'') ILIKE $1
      ORDER BY r.created_at DESC LIMIT 8`,[like]),
    query(`SELECT c.id::text id,COALESCE(NULLIF(c.external_identifier,''),c.channel_type) display_name,c.channel_type
      FROM channels c JOIN organizations o ON o.id=c.organization_id
      WHERE c.channel_type ILIKE $1 OR COALESCE(c.external_identifier,'') ILIKE $1 OR o.name ILIKE $1
      ORDER BY c.created_at DESC LIMIT 8`,[like]),
    query(`SELECT id::text id,action,summary FROM platform_audit_logs
      WHERE action ILIKE $1 OR summary ILIKE $1 OR actor_email ILIKE $1 OR entity_id ILIKE $1
      ORDER BY created_at DESC LIMIT 8`,[like])
  ]);
  return {users,workspaces,agents,conversations,subscriptions,invoices:[],usageEvents,channels,systemLogs:[],auditLogs};
}

export async function platformAuditLogs(f:{search?:string;entityType?:string;page?:number;pageSize?:number}={}) {
  const page = Math.max(1,Math.floor(f.page||1));
  const pageSize = Math.min(100,Math.max(10,Math.floor(f.pageSize||25)));
  const clauses:string[] = [];
  const args:unknown[] = [];
  if (f.entityType && f.entityType !== 'all') { args.push(f.entityType); clauses.push(`entity_type=$${args.length}`); }
  if (f.search?.trim()) {
    args.push(`%${f.search.trim().slice(0,120)}%`);
    const n=args.length;
    clauses.push(`(summary ILIKE $${n} OR action ILIKE $${n} OR actor_email ILIKE $${n} OR entity_id ILIKE $${n})`);
  }
  const where=clauses.length?`WHERE ${clauses.join(' AND ')}`:'';
  const [totalRow] = await query(`SELECT COUNT(*)::int total FROM platform_audit_logs ${where}`,args);
  args.push(pageSize,(page-1)*pageSize);
  const items=await query(`SELECT id::text id,actor_id::text actor_id,actor_email,actor_role,action,entity_type,entity_id,summary,
    before_json,after_json,ip_address::text ip_address,created_at::text created_at
    FROM platform_audit_logs ${where} ORDER BY created_at DESC LIMIT $${args.length-1} OFFSET $${args.length}`,args);
  const total=count(totalRow?.total);
  return {items,pagination:{page,pageSize,total,totalPages:Math.max(1,Math.ceil(total/pageSize))}};
}

export async function platformSettings() {
  return {items:await query(`SELECT s.key,CASE WHEN jsonb_typeof(s.value)='object' AND s.value ? 'value' THEN s.value->'value' ELSE s.value END value,
    COALESCE(s.value->>'category',split_part(s.key,'.',1)) category,
    COALESCE(s.value->>'description',s.key) description,
    COALESCE(a.email,'system') updated_by,s.updated_at::text updated_at
    FROM platform_settings s LEFT JOIN platform_admins a ON a.id=s.updated_by
    WHERE s.key NOT LIKE 'owner_mfa_pending:%' ORDER BY category,s.key`)};
}

export async function updatePlatformSetting(key:string,value:unknown,adminId:string) {
  const cleanKey=key.trim();
  if (!cleanKey || cleanKey.length>120 || cleanKey.startsWith('owner_mfa_pending:')) throw new Error('مفتاح الإعداد غير صالح.');
  const encoded=JSON.stringify(validatePlatformSettingValue(cleanKey,value===undefined?null:value));
  if (encoded.length>10000) throw new Error('قيمة الإعداد أكبر من الحد المسموح.');
  const [row]=await query(`INSERT INTO platform_settings(key,value,updated_by,updated_at)
    VALUES($1,$2::text::jsonb,$3::uuid,NOW())
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()
    RETURNING key,value,updated_at::text updated_at`,[cleanKey,encoded,adminId]);
  return row;
}

export async function platformSecurity(currentAdmin:{id:string;email:string;role:string;sessionId:string;mfaEnabled:boolean}) {
  const [sessionsRows,loginAttempts,admins]=await Promise.all([
    query(`SELECT s.id::text id,a.email,s.ip_address::text ip_address,s.user_agent,s.expires_at::text expires_at,
      s.revoked_at::text revoked_at,s.created_at::text created_at
      FROM platform_admin_sessions s JOIN platform_admins a ON a.id=s.admin_id
      WHERE s.expires_at>NOW() OR s.revoked_at IS NOT NULL ORDER BY s.created_at DESC LIMIT 100`),
    query(`SELECT id::text id,email,ip_address::text ip_address,user_agent,success,failure_reason,created_at::text created_at
      FROM platform_admin_login_attempts ORDER BY created_at DESC LIMIT 100`),
    query(`SELECT id::text id,email,full_name,role,status,(mfa_secret_encrypted IS NOT NULL) mfa_enabled,
      created_at::text created_at,last_login_at::text last_login_at FROM platform_admins ORDER BY created_at`)
  ]);
  return {currentAdmin,sessions:sessionsRows,loginAttempts,admins,encryptionKeyConfigured:Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY?.trim())};
}

export async function createPlatformAdmin(p:{fullName:string;email:string;role:'super_admin'|'ops_auditor';password:string}) {
  const fullNameValue=p.fullName.trim(),email=p.email.trim().toLowerCase();
  if(fullNameValue.length<2||fullNameValue.length>120||!/^\S+@\S+\.\S+$/.test(email)) throw new Error('اسم المدير أو بريده الإلكتروني غير صالح.');
  if(p.password.length<10) throw new Error('يجب أن تتكون كلمة المرور من 10 أحرف على الأقل.');
  if(!['super_admin','ops_auditor'].includes(p.role)) throw new Error('الدور الإداري غير صالح.');
  const perms=p.role==='super_admin'?['users:write','billing:write','ai:write','ops:write','settings:write']:[];
  const [row]=await query(`INSERT INTO platform_admins(email,full_name,role,permissions,password_hash)
    VALUES($1,$2,$3,$4::text::jsonb,$5) RETURNING id::text id,email,full_name,role,status,permissions`,
    [email,fullNameValue,p.role,JSON.stringify(perms),hashPassword(p.password)]);
  return row;
}


export async function platformReport(type:string) {
  const reports:Record<string,{title:string;headers:{key:string;label:string}[];sql:string}> = {
    users:{title:'تقرير المستخدمين',headers:[{key:'id',label:'المعرف'},{key:'full_name',label:'الاسم'},{key:'email',label:'البريد'},{key:'created_at',label:'تاريخ التسجيل'},{key:'account_status',label:'الحالة'}],sql:`SELECT u.id::text id,${fullName} full_name,u.email,u.created_at::text created_at,CASE WHEN u.banned_until>NOW() THEN 'suspended' ELSE 'active' END account_status FROM auth.users u WHERE u.deleted_at IS NULL ORDER BY u.created_at DESC LIMIT 2000`},
    subscriptions:{title:'تقرير الاشتراكات',headers:[{key:'workspace_name',label:'مساحة العمل'},{key:'user_email',label:'البريد'},{key:'plan_code',label:'الباقة'},{key:'status',label:'الحالة'},{key:'current_period_end',label:'نهاية الاشتراك'}],sql:`SELECT o.name workspace_name,u.email user_email,s.plan_tier plan_code,s.status,s.period_end::text current_period_end FROM subscriptions s JOIN organizations o ON o.id=s.organization_id LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=o.id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY s.created_at DESC LIMIT 2000`},
    revenue:{title:'تقرير الإيرادات الفعلية',headers:[{key:'payment_reference',label:'مرجع الدفع'},{key:'user_email',label:'البريد'},{key:'amount_usd',label:'المبلغ بالدولار'},{key:'amount_yer',label:'المبلغ بالريال'},{key:'status',label:'الحالة'},{key:'verified_at',label:'تاريخ التحقق'}],sql:`SELECT i.payment_reference,u.email user_email,i.amount_usd::numeric amount_usd,i.amount_yer::bigint amount_yer,i.status,i.verified_at::text verified_at FROM billing_payment_intents i LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=i.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY i.created_at DESC LIMIT 2000`},
    invoices:{title:'تقرير طلبات الدفع (لا يوجد دفتر فواتير منفصل)',headers:[{key:'external_order_id',label:'رقم الطلب'},{key:'user_email',label:'البريد'},{key:'plan_code',label:'الباقة'},{key:'amount_usd',label:'المبلغ'},{key:'status',label:'الحالة'}],sql:`SELECT i.external_order_id,u.email user_email,i.plan_code,i.amount_usd::numeric amount_usd,i.status FROM billing_payment_intents i LEFT JOIN LATERAL(SELECT user_id FROM organization_members WHERE organization_id=i.organization_id AND role='owner' ORDER BY created_at LIMIT 1) own ON TRUE LEFT JOIN auth.users u ON u.id=own.user_id ORDER BY i.created_at DESC LIMIT 2000`},
    ai_usage:{title:'تقرير استهلاك الذكاء الاصطناعي',headers:[{key:'created_at',label:'التاريخ'},{key:'workspace_name',label:'مساحة العمل'},{key:'agent_name',label:'الوكيل'},{key:'model',label:'النموذج'},{key:'input_tokens',label:'رموز الإدخال'},{key:'output_tokens',label:'رموز الإخراج'},{key:'status',label:'الحالة'}],sql:`SELECT r.created_at::text created_at,o.name workspace_name,a.name agent_name,r.model,r.input_tokens,r.output_tokens,r.status FROM agent_runs r LEFT JOIN organizations o ON o.id=r.organization_id LEFT JOIN ai_agents a ON a.id=r.agent_id ORDER BY r.created_at DESC LIMIT 2000`},
    model_costs:{title:'تقرير تكلفة النماذج',headers:[{key:'model',label:'النموذج'},{key:'requests',label:'الطلبات'},{key:'tokens',label:'الرموز'},{key:'recorded_cost_usd',label:'التكلفة المسجلة بالدولار'}],sql:`SELECT COALESCE(r.model,'غير محدد') model,COUNT(*)::int requests,COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint tokens,COALESCE(SUM(l.units*COALESCE(l.unit_cost,0)),0)::numeric recorded_cost_usd FROM agent_runs r LEFT JOIN usage_ledger l ON l.reference_id=r.id AND l.currency='USD' GROUP BY r.model ORDER BY requests DESC`},
    agents:{title:'تقرير أداء الوكلاء',headers:[{key:'agent_name',label:'الوكيل'},{key:'workspace_name',label:'مساحة العمل'},{key:'runs',label:'التشغيلات'},{key:'failed',label:'الفاشلة'},{key:'tokens',label:'الرموز'}],sql:`SELECT a.name agent_name,o.name workspace_name,COUNT(r.id)::int runs,COUNT(r.id) FILTER(WHERE r.status='failed')::int failed,COALESCE(SUM(COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)),0)::bigint tokens FROM ai_agents a JOIN organizations o ON o.id=a.organization_id LEFT JOIN agent_runs r ON r.agent_id=a.id GROUP BY a.id,a.name,o.name ORDER BY runs DESC`},
    agent_quality: {
      title: 'جودة الوكلاء ورضا العملاء خلال آخر 30 يوماً',
      headers: [{ key: 'workspace_name', label: 'مساحة العمل' }, { key: 'auto_resolution_rate', label: 'الحل التلقائي %' },
        { key: 'task_completion_rate', label: 'نجاح المهام %' }, { key: 'csat', label: 'رضا العميل %' }, { key: 'ratings', label: 'عدد التقييمات' }],
      sql: `SELECT o.name AS workspace_name,
        round(100.0 * q.auto_resolved / nullif(q.resolved, 0), 1) AS auto_resolution_rate,
        round(100.0 * q.tasks_completed / nullif(q.tasks, 0), 1) AS task_completion_rate,
        round(100.0 * q.positive_ratings / nullif(q.ratings, 0), 1) AS csat, q.ratings
        FROM (SELECT id, name FROM organizations ORDER BY created_at DESC LIMIT 2000) o
        CROSS JOIN LATERAL public.agent_quality_summary(o.id, now() - interval '30 days') q
        WHERE q.resolved > 0 OR q.tasks > 0 ORDER BY o.name`,
    },
    channels:{title:'تقرير استخدام القنوات',headers:[{key:'channel_type',label:'القناة'},{key:'channels',label:'عدد القنوات'},{key:'conversations',label:'المحادثات'},{key:'messages',label:'الرسائل'}],sql:`SELECT ch.channel_type,COUNT(DISTINCT ch.id)::int channels,COUNT(DISTINCT c.id)::int conversations,COUNT(m.id)::int messages FROM channels ch LEFT JOIN conversations c ON c.channel_id=ch.id LEFT JOIN messages m ON m.conversation_id=c.id GROUP BY ch.channel_type ORDER BY channels DESC`},
    errors:{title:'تقرير الأخطاء',headers:[{key:'source',label:'المصدر'},{key:'message',label:'الخطأ'},{key:'created_at',label:'التاريخ'}],sql:`SELECT 'agent_run' source,COALESCE(error_code,'failed') message,created_at::text created_at FROM agent_runs WHERE status IN('failed','blocked') UNION ALL SELECT 'webhook_event',COALESCE(error_message,'failed'),received_at::text FROM webhook_events WHERE processing_status='failed' ORDER BY created_at DESC LIMIT 2000`},
    activity:{title:'تقرير النشاط والتدقيق',headers:[{key:'organization_name',label:'مساحة العمل'},{key:'action',label:'الإجراء'},{key:'entity_type',label:'نوع السجل'},{key:'created_at',label:'التاريخ'}],sql:`SELECT o.name organization_name,e.action,e.entity_type,e.created_at::text created_at FROM audit_events e LEFT JOIN organizations o ON o.id=e.organization_id ORDER BY e.created_at DESC LIMIT 2000`}
  };
  const report=reports[type];if(!report)throw new Error('نوع التقرير غير معروف.');
  return {title:report.title,headers:report.headers,rows:await query(report.sql)};
}

export async function grantPlatformUsageCredits(orgId: string, requestId: string, actorId: string, amount: number) {
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (!uuid.test(orgId) || !uuid.test(requestId) || !Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) {
    throw new Error('حدد مؤسسة وعدداً صحيحاً من الأرصدة بين 1 ومليون.');
  }
  const [entry] = await query(`SELECT id, delta, balance_after::integer AS balance_after
    FROM public.grant_usage_credits($1::uuid, $2::uuid, $3::uuid, $4::integer)`, [orgId, requestId, actorId, amount]);
  return entry;
}


export async function platformAiProviders() {
  const usage=await query(`SELECT model_provider,COUNT(*)::int total_requests,
    COUNT(*) FILTER(WHERE status='completed')::int success_requests,COUNT(*) FILTER(WHERE status='failed')::int failed_requests,
    COALESCE(AVG(latency_ms),0)::int avg_latency_ms FROM agent_runs GROUP BY model_provider`);
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
  const models=await query(`SELECT r.model model_id,COALESCE(r.model,'غير محدد') display_name,
    0::numeric input_price_per_1m,0::numeric output_price_per_1m,0::numeric cached_input_price_per_1m,
    'غير متاح في مخطط التسعير الحالي' pricing_source,'—' pricing_version,'—' pricing_effective_date,
    COUNT(DISTINCT r.agent_id)::int agents_using,COUNT(*)::int requests_count,1::int is_allowed,
    MIN(r.model)::text id FROM agent_runs r WHERE r.model IS NOT NULL GROUP BY r.model ORDER BY requests_count DESC LIMIT 200`);
  return {providers,models};
}

export async function platformNotificationsSupport() {
  const [notifications,tickets,activity,adminActivity]=await Promise.all([
    query(`SELECT n.id::text id,n.title,n.body,n.notification_type type,n.is_read,CASE WHEN n.is_read THEN 'read' ELSE 'sent' END delivery_status,
      'مؤسسة: '||o.name target_type,1::int recipients_count,n.created_at::text created_at,o.name workspace_name
      FROM notifications n JOIN organizations o ON o.id=n.organization_id
      WHERE n.entity_type='platform_announcement' OR n.idempotency_key LIKE 'owner-console:%'
      ORDER BY n.created_at DESC LIMIT 300`),
    query(`SELECT t.id::text id,t.ticket_number,t.subject,t.description,t.priority,t.status,t.created_at::text created_at,
      t.updated_at::text updated_at,t.organization_id::text organization_id,o.name workspace_name,a.email opened_by
      FROM platform_support_tickets t LEFT JOIN organizations o ON o.id=t.organization_id
      LEFT JOIN platform_admins a ON a.id=t.opened_by_admin_id
      ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,t.created_at DESC LIMIT 300`),
    query(`SELECT e.id::text id,e.action event_type,e.entity_type,e.entity_id::text entity_id,e.actor_type actor,
      COALESCE(e.metadata->>'summary',e.action) summary,e.created_at::text created_at,'audit_events' source,o.name workspace_name
      FROM audit_events e LEFT JOIN organizations o ON o.id=e.organization_id ORDER BY e.created_at DESC LIMIT 100`),
    query(`SELECT id::text id,action event_type,entity_type,entity_id,actor_email actor,summary,
      created_at::text created_at,'platform_audit_logs' source,NULL::text workspace_name
      FROM platform_audit_logs ORDER BY created_at DESC LIMIT 100`)
  ]);
  return {notifications,tickets,activityFeed:[...activity,...adminActivity].sort((a:any,b:any)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,150)};
}


export async function createPlatformAnnouncement(p:{targetType:string;targetFilter?:string;title:string;body:string;scheduledFor?:string|null;adminId:string}) {
  const title=p.title.trim(),body=p.body.trim(),targetType=p.targetType;
  if(title.length<2||title.length>255||!body||body.length>5000)throw new Error('عنوان الإعلان ومحتواه مطلوبان وبحدود الطول المسموح.');
  if(!['all_users','plan_tier','trial_users','expiring_soon'].includes(targetType))throw new Error('شريحة الاستهداف غير مدعومة.');
  if(p.scheduledFor&&new Date(p.scheduledFor).getTime()>Date.now())throw new Error('جدولة الإرسال غير مفعلة في نظام الإشعارات الحالي؛ اختر الإرسال الفوري.');
  const filter=p.targetFilter||'';let where='';const args:unknown[]=[];
  if(targetType==='plan_tier'){args.push(filter);where='AND s.plan_tier=$1';}
  else if(targetType==='trial_users')where="AND (s.status='trial' OR s.plan_tier='trial')";
  else if(targetType==='expiring_soon')where="AND COALESCE(s.current_period_end,s.period_end)>NOW() AND COALESCE(s.current_period_end,s.period_end)<=NOW()+INTERVAL '7 days'";
  const orgs=await query<{id:string}>(`SELECT DISTINCT o.id::text id FROM organizations o JOIN organization_members m ON m.organization_id=o.id AND m.role='owner'
    LEFT JOIN LATERAL(SELECT plan_tier,status,period_end,current_period_end FROM subscriptions WHERE organization_id=o.id ORDER BY created_at DESC LIMIT 1) s ON TRUE
    WHERE TRUE ${where} ORDER BY id LIMIT 10000`,args);
  if(!orgs.length)throw new Error('لا توجد مؤسسات تطابق شريحة الاستهداف المحددة.');
  return sql().begin(async tx=>{
    const [announcement]=await tx.unsafe(`INSERT INTO platform_announcements(target_type,target_filter,title,body,status,recipients_count,sent_at,created_by_admin_id)
      VALUES($1,$2,$3,$4,'sent',$5,NOW(),$6::uuid) RETURNING id::text id,created_at::text created_at`,
      [targetType,filter||null,title,body,orgs.length,p.adminId]);
    for(const org of orgs)await tx.unsafe(`INSERT INTO notifications(organization_id,member_id,entity_type,entity_id,notification_type,title,body,idempotency_key)
      VALUES($1::uuid,NULL,'platform_announcement',$1::uuid,'workflow',$2,$3,$4)
      ON CONFLICT(organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
      [org.id,title,body,'platform-announcement:'+announcement.id+':'+org.id]);
    return {id:announcement.id,recipientsCount:orgs.length,status:'sent',createdAt:announcement.created_at};
  });
}
export async function createPlatformSupportTicket(p:{subject:string;description:string;priority:string;adminId:string}) {
  const subject=p.subject.trim(),description=p.description.trim();
  if(subject.length<3||subject.length>200||description.length<5||description.length>10000)throw new Error('موضوع التذكرة وتفاصيلها غير كافيين أو تجاوزا الحد المسموح.');
  if(!['low','medium','high','urgent'].includes(p.priority))throw new Error('أولوية التذكرة غير صالحة.');
  const number='KAY-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();
  const [row]=await query(`INSERT INTO platform_support_tickets(ticket_number,subject,description,priority,status,opened_by_admin_id)
    VALUES($1,$2,$3,$4,'open',$5::uuid) RETURNING id::text id,ticket_number,subject,description,priority,status,created_at::text created_at`,
    [number,subject,description,p.priority,p.adminId]);return row;
}
export async function updatePlatformSupportTicket(id:string,status:string) {
  if(!['open','in_progress','resolved','closed'].includes(status))throw new Error('حالة التذكرة غير صالحة.');
  const [row]=await query(`UPDATE platform_support_tickets SET status=$2,updated_at=NOW(),
    resolved_at=CASE WHEN $2 IN('resolved','closed') THEN COALESCE(resolved_at,NOW()) ELSE NULL END
    WHERE id=$1::uuid RETURNING id::text id,ticket_number,status,updated_at::text updated_at`,[id,status]);
  if(!row)throw new Error('التذكرة غير موجودة.');return row;
}
export async function acknowledgePlatformAlert(id:string,adminId:string) {
  if(!['failed-agent-runs','failed-webhooks','failed-outbound','failed-inbound','gateway-errors'].includes(id))throw new Error('معرّف التنبيه غير معروف.');
  const [row]=await query(`INSERT INTO platform_alert_acknowledgements(alert_id,acknowledged_by,acknowledged_at)
    VALUES($1,$2::uuid,NOW()) ON CONFLICT(alert_id) DO UPDATE SET acknowledged_by=EXCLUDED.acknowledged_by,acknowledged_at=NOW()
    RETURNING alert_id,acknowledged_at::text acknowledged_at`,[id,adminId]);return row;
}
export async function resolvePlatformLog(source:string,logId:string,adminId:string) {
  if(!['agent_run','webhook_event','inbound_job','outbox_event','whatsapp_gateway_session'].includes(source))throw new Error('مصدر السجل لا يدعم إجراء الحل الإداري.');
  if(!/^[0-9a-f-]{36}$/i.test(logId))throw new Error('معرّف السجل غير صالح.');
  const [row]=await query(`INSERT INTO platform_log_resolutions(source,log_id,resolved_by,resolved_at)
    VALUES($1,$2,$3::uuid,NOW()) ON CONFLICT(source,log_id) DO UPDATE SET resolved_by=EXCLUDED.resolved_by,resolved_at=NOW()
    RETURNING source,log_id,resolved_at::text resolved_at`,[source,logId,adminId]);return row;
}
export async function reviewPlatformWalletPayment(id:string,action:string,note:string,reviewedBy:string) {
  if(!['approve','reject'].includes(action))throw new Error('إجراء مراجعة طلب الدفع غير صالح.');
  if(action==='reject'&&note.trim().length<5)throw new Error('سبب رفض التحويل مطلوب.');
  const [row]=await query<{result:string}>(`SELECT public.review_manual_wallet_payment($1::uuid,$2::text,$3::text,$4::text) result`,[id,action,reviewedBy,note.trim()||null]);
  if(!row)throw new Error('لم يرجع النظام نتيجة مراجعة طلب الدفع.');
  if(row.result==='not_found')throw new Error('طلب الدفع غير موجود.');
  if(row.result.startsWith('already_'))throw new Error('تمت مراجعة هذا الطلب مسبقاً.');
  return {id,status:row.result};
}
export async function platformManualWalletReceipt(id:string) {
  const [row]=await query<{receipt_image_base64:string;receipt_mime_type:string}>(`SELECT receipt_image_base64,receipt_mime_type FROM manual_wallet_payment_requests WHERE id=$1::uuid LIMIT 1`,[id]);
  if(!row)throw new Error('إيصال التحويل غير موجود.');
  const bytes=Buffer.from(String(row.receipt_image_base64),'base64');
  if(bytes.length>2*1024*1024)throw new Error('ملف الإيصال يتجاوز الحد المسموح.');
  return {bytes,mimeType:row.receipt_mime_type};
}



export async function rotatePlatformChannelSecret(channelId:string,newSecret:string) {
  const secret=newSecret.trim();if(secret.length<8)throw new Error('السر الجديد قصير أو غير صالح.');
  const [channel]=await query(`SELECT id::text id,organization_id::text organization_id,channel_type FROM channels WHERE id=$1::uuid`,[channelId]);
  if(!channel)throw new Error('القناة غير موجودة.');
  const fields:Record<string,{provider:string;type:string}>={
    whatsapp:{provider:'meta',type:'access_token'},instagram:{provider:'meta',type:'access_token'},
    telegram:{provider:'telegram',type:'bot_token'},sms:{provider:'twilio',type:'auth_token'},
    phone:{provider:'vapi',type:'api_key'},messenger:{provider:'meta',type:'page_access_token'},
    website:{provider:'website',type:'widget_signing_secret'}
  };
  const field=fields[String(channel.channel_type)];if(!field)throw new Error('نوع القناة لا يدعم تدوير السر من هذه الشاشة.');
  const encrypted=encryptSecret(secret);
  await query(`INSERT INTO provider_credentials(organization_id,channel_id,provider,credential_type,encrypted_value,status,key_version,last_verified_at,updated_at)
    VALUES($1::uuid,$2::uuid,$3,$4,$5,'active',1,NULL,NOW())
    ON CONFLICT(channel_id,provider,credential_type) WHERE channel_id IS NOT NULL
    DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value,status='active',key_version=1,last_verified_at=NULL,updated_at=NOW()`,
    [channel.organization_id,channel.id,field.provider,field.type,encrypted]);
  await query(`UPDATE channels SET verification_status='pending',updated_at=NOW() WHERE id=$1::uuid`,[channelId]);
  return {id:channelId,credentialType:field.type,status:'updated_requires_test'};
}

export async function testPlatformChannel(channelId:string) {
  const [channel]=await query(`SELECT id::text id,organization_id::text organization_id,channel_type,connection_mode,is_active,provider_account_id,external_identifier
    FROM channels WHERE id=$1::uuid`,[channelId]);
  if(!channel)throw new Error('القناة غير موجودة.');
  if(!channel.is_active)throw new Error('القناة متوقفة؛ فعّلها قبل الاختبار.');
  try {
    if(channel.channel_type==='whatsapp'&&channel.connection_mode==='qr_unofficial'){
      const [session]=await query(`SELECT status,last_error FROM whatsapp_gateway_sessions WHERE channel_id=$1::uuid`,[channelId]);
      if(session?.status!=='connected')throw new Error('جلسة واتساب QR غير متصلة حالياً.');
    } else {
      const creds=await query(`SELECT provider,credential_type,encrypted_value FROM provider_credentials WHERE channel_id=$1::uuid AND status='active'`,[channelId]);
      const values:Record<string,string>={};
      for(const row of creds as any[])values[String(row.credential_type)]=decryptSecret(String(row.encrypted_value));
      const timeout=AbortSignal.timeout(12000);
      if(channel.channel_type==='whatsapp'||channel.channel_type==='instagram'||channel.channel_type==='messenger'){
        const token=values.access_token||values.page_access_token;
        if(!token||!channel.provider_account_id)throw new Error('بيانات القناة الأساسية غير مكتملة (المعرّف أو رمز الوصول).');
        const base=(process.env.META_GRAPH_BASE_URL||'https://graph.facebook.com/v23.0').replace(/\/+$/,'');
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
    await query(`UPDATE channels SET verification_status='verified',updated_at=NOW() WHERE id=$1::uuid`,[channelId]);
    await query(`UPDATE provider_credentials SET last_verified_at=NOW() WHERE channel_id=$1::uuid AND status='active'`,[channelId]);
    return {ok:true,diagnostic:'تم التحقق من بيانات القناة مع مزودها بنجاح.'};
  } catch(error) {
    const message=error instanceof Error?error.message:'فشل اختبار القناة.';
    await query(`UPDATE channels SET verification_status='failed',updated_at=NOW() WHERE id=$1::uuid`,[channelId]);
    return {ok:false,diagnostic:message};
  }
}


export async function platformBillingCatalog() {
  const [prices, wallets, providers, requests, rateRows] = await Promise.all([
    query(`SELECT pp.id::text id, p.code plan_code, p.name plan_name, pp.billing_cycle, pp.currency, pp.amount::numeric amount, pp.exchange_rate_to_usd::numeric exchange_rate_to_usd, pp.is_active FROM plan_prices pp JOIN plans p ON p.id=pp.plan_id WHERE pp.is_active=true ORDER BY p.code, pp.billing_cycle, pp.currency`),
    query(`SELECT id::text id,provider_code,display_name,account_name,account_number,instructions,is_active,sort_order,created_at::text created_at,updated_at::text updated_at FROM manual_yemen_wallets ORDER BY sort_order, display_name`),
    query(`SELECT id::text id,code,display_name,provider_type,configuration,is_active FROM billing_payment_providers ORDER BY display_name`),
    query(`SELECT r.id::text id,r.organization_id::text organization_id,r.plan_code,r.billing_cycle,r.wallet_id::text wallet_id,r.amount_usd::numeric amount_usd,r.amount_yer,r.exchange_rate,r.sender_name,r.transfer_reference,r.receipt_mime_type,r.status,r.review_note,r.reviewed_by,r.reviewed_at::text reviewed_at,r.created_at::text created_at,w.display_name wallet_name,w.account_number,o.name organization_name FROM manual_wallet_payment_requests r JOIN manual_yemen_wallets w ON w.id=r.wallet_id JOIN organizations o ON o.id=r.organization_id ORDER BY r.created_at DESC LIMIT 100`),
    query(`SELECT CASE WHEN jsonb_typeof(value)='object' THEN value->>'value' ELSE value#>>'{}' END rate FROM platform_settings WHERE key='billing.yer_per_usd' LIMIT 1`),
  ]);
  const yerPerUsd = Number(rateRows[0]?.rate);
  return { prices, wallets, providers, requests, yerPerUsd: Number.isFinite(yerPerUsd) && yerPerUsd > 0 ? yerPerUsd : null };
}

export async function savePlatformWallet(input: Record<string, unknown>) {
  const provider=String(input.provider_code||'').trim(), displayName=String(input.display_name||'').trim(), accountName=String(input.account_name||'').trim(), accountNumber=String(input.account_number||'').trim();
  if(!['jawali','jeeb','onecash','cacbank','kuraimi','other'].includes(provider)||displayName.length<2||accountName.length<2||accountNumber.length<3) throw new Error('بيانات المحفظة غير صالحة.');
  const id=String(input.id||'').trim(), values=[provider,displayName,accountName,accountNumber,String(input.instructions||'').slice(0,1000),input.is_active!==false,walletSortOrder(input.sort_order)];
  if(id){ const rows=await query(`UPDATE manual_yemen_wallets SET provider_code=$2,display_name=$3,account_name=$4,account_number=$5,instructions=$6,is_active=$7,sort_order=COALESCE($8::int,sort_order),updated_at=NOW() WHERE id=$1::uuid RETURNING id::text id,provider_code,display_name,account_name,account_number,instructions,is_active,sort_order`,[id,...values]); if(!rows[0]) throw new Error('المحفظة غير موجودة.'); return rows[0]; }
  const rows=await query(`INSERT INTO manual_yemen_wallets(provider_code,display_name,account_name,account_number,instructions,is_active,sort_order,updated_at) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::int,100),NOW()) RETURNING id::text id,provider_code,display_name,account_name,account_number,instructions,is_active,sort_order`,values); return rows[0];
}
export async function savePlatformPrice(input: Record<string, unknown>) {
  const planCode=String(input.planCode||'').trim(), cycle=String(input.billingCycle||''), currency=String(input.currency||'').toUpperCase(), amount=Number(input.amount), rate=input.exchangeRateToUsd==null?null:Number(input.exchangeRateToUsd);
  if(!['starter','growth','pro'].includes(planCode)||!['monthly','yearly'].includes(cycle)||!/^[A-Z]{3}$/.test(currency)||!Number.isFinite(amount)||amount<0) throw new Error('بيانات السعر غير صالحة.');
  const rows=await query(`INSERT INTO plan_prices(plan_id,billing_cycle,currency,amount,exchange_rate_to_usd,is_active,updated_at) SELECT id,$2,$3,$4,$5,true,NOW() FROM plans WHERE code=$1 ON CONFLICT(plan_id,billing_cycle,currency) DO UPDATE SET amount=EXCLUDED.amount,exchange_rate_to_usd=EXCLUDED.exchange_rate_to_usd,is_active=true,updated_at=NOW() RETURNING id::text id`,[planCode,cycle,currency,amount,rate]);
  if(!rows[0]) throw new Error('الباقة غير موجودة.'); return rows[0];
}

/** Same validation and result mapping as reviewPlatformWalletPayment (both UI paths). */
export async function reviewPlatformPayment(id:string, action:string, reviewedBy:string, note:string) {
  return reviewPlatformWalletPayment(id, action, note, reviewedBy);
}

export async function platformPaymentReceipt(id:string) {
  const rows=await query<{receipt_image_base64:string;receipt_mime_type:string}>(`SELECT receipt_image_base64,receipt_mime_type FROM manual_wallet_payment_requests WHERE id=$1::uuid LIMIT 1`,[id]);
  return rows[0]||null;
}

// ─── Real operational signals (replace hard-coded zeros) ────────────────────

/** Errors, alerts, tickets and unauthorized logins read from PostgreSQL. */
export async function platformOperationalSignals() {
  const [rows,ackRows]=await Promise.all([
    query(`SELECT (SELECT COUNT(*) FROM agent_runs WHERE status='failed' AND created_at>NOW()-INTERVAL '24 hours')::int failed_runs,
      (SELECT COUNT(*) FROM webhook_events WHERE processing_status='failed' AND received_at>NOW()-INTERVAL '24 hours')::int failed_webhooks,
      (SELECT COUNT(*) FROM inbound_jobs WHERE status='dead_letter' AND updated_at>NOW()-INTERVAL '24 hours')::int failed_inbound,
      (SELECT COUNT(*) FROM outbox_events WHERE status IN('failed','dead_letter') AND updated_at>NOW()-INTERVAL '24 hours')::int failed_outbound,
      (SELECT COUNT(*) FROM whatsapp_gateway_sessions WHERE status<>'connected' AND last_error IS NOT NULL)::int gateway_errors,
      (SELECT COUNT(*) FROM platform_support_tickets WHERE status IN('open','in_progress'))::int open_tickets,
      (SELECT COUNT(*) FROM platform_admin_login_attempts WHERE success=false AND created_at>NOW()-INTERVAL '24 hours')::int unauthorized_attempts`),
    query(`SELECT alert_id FROM platform_alert_acknowledgements`)
  ]);
  const c=rows[0]||{};
  const failedRuns=count(c.failed_runs),failedWebhooks=count(c.failed_webhooks),failedInbound=count(c.failed_inbound),failedOutbound=count(c.failed_outbound),gatewayErrors=count(c.gateway_errors);
  const acknowledged=new Set(ackRows.map((r:any)=>String(r.alert_id)));
  const activeAlertIds=[
    failedRuns>0&&'failed-agent-runs',failedWebhooks>0&&'failed-webhooks',failedOutbound>0&&'failed-outbound',
    failedInbound>0&&'failed-inbound',gatewayErrors>0&&'gateway-errors'
  ].filter(Boolean) as string[];
  return {failedRuns,failedWebhooks,failedInbound,failedOutbound,gatewayErrors,
    systemErrors:failedRuns+failedWebhooks+failedInbound+failedOutbound+gatewayErrors,
    unacknowledgedAlerts:activeAlertIds.filter((id)=>!acknowledged.has(id)).length,
    openTickets:count(c.open_tickets),unauthorizedAttempts24h:count(c.unauthorized_attempts)};
}

type IntegrationStatus={id:string;name:string;category:string;envVar:string;configured:boolean;status:'operational'|'degraded'|'not_configured';note:string};

/** Real integration status: env configuration + live probe / recent DB activity. */
export async function platformIntegrationStatus():Promise<IntegrationStatus[]> {
  const env=(name:string)=>Boolean(process.env[name]?.trim());
  const gatewayUrl=(process.env.WHATSAPP_GATEWAY_URL?.trim()||'http://127.0.0.1:'+(process.env.WHATSAPP_GATEWAY_PORT?.trim()||'3001')).replace(/\/+$/,'');
  const [gatewayProbe,providerRows,metaRows]=await Promise.all([
    fetch(gatewayUrl+'/health',{signal:AbortSignal.timeout(3000)}).then(async(r)=>({ok:r.ok,body:await r.json().catch(()=>null) as {activeSessions?:number}|null})).catch(()=>({ok:false,body:null})),
    query(`SELECT lower(model_provider) provider,COUNT(*) FILTER(WHERE status='completed')::int ok,COUNT(*) FILTER(WHERE status='failed')::int failed,MAX(created_at)::text last_at
      FROM agent_runs WHERE created_at>NOW()-INTERVAL '24 hours' GROUP BY lower(model_provider)`),
    query(`SELECT COUNT(*) FILTER(WHERE is_active AND verification_status='verified')::int verified,COUNT(*)::int total
      FROM channels WHERE channel_type IN('whatsapp','messenger','instagram') AND COALESCE(connection_mode,'')<>'qr_unofficial'`)
  ]);
  const provider=(needle:string)=>{
    const matches=(providerRows as any[]).filter((r)=>String(r.provider).includes(needle));
    return {ok:matches.reduce((n,r)=>n+count(r.ok),0),failed:matches.reduce((n,r)=>n+count(r.failed),0)};
  };
  const aiStatus=(id:string,name:string,envVar:string,needle:string):IntegrationStatus=>{
    const configured=env(envVar),p=provider(needle);
    const status=!configured?'not_configured':p.failed>0&&p.ok===0?'degraded':'operational';
    return {id,name,category:'ai',envVar,configured,status,
      note:!configured?'المفتاح غير مضبوط على الخادم.':`آخر 24 ساعة: ${p.ok} ناجحة / ${p.failed} فاشلة.`};
  };
  const meta=metaRows[0]||{};
  const metaConfigured=env('META_APP_ID')&&(env('META_APP_SECRET')||env('WHATSAPP_APP_SECRET'));
  return [
    {id:'whatsapp_gateway',name:'WhatsApp Gateway (QR)',category:'channel',envVar:'WHATSAPP_GATEWAY_TOKEN',configured:env('WHATSAPP_GATEWAY_TOKEN'),
      status:gatewayProbe.ok?'operational':env('WHATSAPP_GATEWAY_TOKEN')?'degraded':'not_configured',
      note:gatewayProbe.ok?`الخدمة تستجيب؛ الجلسات النشطة: ${count(gatewayProbe.body?.activeSessions)}.`:'فحص /health للبوابة فشل أو لا يستجيب.'},
    {id:'meta',name:'Meta (WhatsApp Cloud / Messenger)',category:'channel',envVar:'META_APP_ID / META_APP_SECRET',configured:metaConfigured,
      status:!metaConfigured?'not_configured':count(meta.verified)>0?'operational':'degraded',
      note:`القنوات الرسمية الموثقة: ${count(meta.verified)} من ${count(meta.total)}.`},
    aiStatus('gemini','Google Gemini','GEMINI_API_KEY','gemini'),
    aiStatus('groq','Groq','GROQ_API_KEY','groq'),
  ];
}

// ─── Agent sandbox test (real provider call, recorded in agent_runs) ────────

async function callSandboxModel(provider:'gemini'|'groq',system:string,message:string,temperature:number) {
  if(provider==='groq'){
    const model=process.env.GROQ_MODEL?.trim()||'llama-3.3-70b-versatile';
    const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(20000),
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.GROQ_API_KEY},
      body:JSON.stringify({model,temperature,max_tokens:512,messages:[{role:'system',content:system},{role:'user',content:message}]})});
    const payload=await response.json().catch(()=>null) as any;
    if(!response.ok)throw Object.assign(new Error('رفض مزود Groq الطلب (HTTP '+response.status+').'),{code:'provider_http_'+response.status,model});
    return {model,reply:String(payload?.choices?.[0]?.message?.content||'').trim(),inputTokens:payload?.usage?.prompt_tokens??null,outputTokens:payload?.usage?.completion_tokens??null};
  }
  const model=process.env.GEMINI_MODEL?.trim()||'gemini-3.1-flash-lite-preview';
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',signal:AbortSignal.timeout(20000),
    headers:{'Content-Type':'application/json','x-goog-api-key':String(process.env.GEMINI_API_KEY)},
    body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:message}]}],generationConfig:{temperature,maxOutputTokens:512}})});
  const payload=await response.json().catch(()=>null) as any;
  if(!response.ok)throw Object.assign(new Error('رفض مزود Gemini الطلب (HTTP '+response.status+').'),{code:'provider_http_'+response.status,model});
  const reply=(payload?.candidates?.[0]?.content?.parts||[]).map((p:any)=>String(p?.text||'')).join('').trim();
  return {model,reply,inputTokens:payload?.usageMetadata?.promptTokenCount??null,outputTokens:payload?.usageMetadata?.candidatesTokenCount??null};
}

export async function platformAgentSandboxTest(agentId:string,rawMessage:string) {
  const message=String(rawMessage||'').trim().slice(0,2000);
  if(!message)throw new Error('اكتب رسالة الاختبار أولاً.');
  const [agent]=await query(`SELECT a.id::text id,a.organization_id::text organization_id,a.business_id::text business_id,a.name,a.model_provider,a.status,
      COALESCE(a.temperature,0.4)::float temperature,o.name organization_name,
      (SELECT system_prompt_addition FROM agent_prompt_versions p WHERE p.agent_id=a.id AND p.status='published' LIMIT 1) prompt
    FROM ai_agents a JOIN organizations o ON o.id=a.organization_id WHERE a.id=$1::uuid`,[agentId]);
  if(!agent)return null;
  const wanted=String(agent.model_provider||'').toLowerCase().includes('groq')?'groq':'gemini';
  const provider:('gemini'|'groq')|null=(wanted==='groq'?process.env.GROQ_API_KEY:process.env.GEMINI_API_KEY)?.trim()?wanted
    :(process.env.GEMINI_API_KEY?.trim()?'gemini':process.env.GROQ_API_KEY?.trim()?'groq':null);
  if(!provider)return {executedLive:false,message:'لا يوجد مفتاح مزود ذكاء اصطناعي (GEMINI_API_KEY أو GROQ_API_KEY) مهيأ على الخادم.'};
  const system=[`أنت ${agent.name}، مساعد ذكي لنشاط «${agent.organization_name}». هذا اختبار معزول من لوحة المالك؛ لا تنفذ أي إجراء خارجي.`,
    agent.prompt?String(agent.prompt):''].filter(Boolean).join('\n\n');
  const temperature=Math.min(1,Math.max(0,Number(agent.temperature)||0.4));
  const started=Date.now();
  const [run]=await query(`INSERT INTO agent_runs(organization_id,business_id,agent_id,channel,model_provider,status,trace_id)
    VALUES($1::uuid,$2::uuid,$3::uuid,'owner_sandbox',$4,'running',$5) RETURNING id::text id`,
    [agent.organization_id,agent.business_id,agent.id,provider,'owner-sandbox-'+crypto.randomUUID()]);
  try{
    const result=await callSandboxModel(provider,system,message,temperature);
    const latencyMs=Date.now()-started;
    await query(`UPDATE agent_runs SET status='completed',model=$2,input_tokens=$3,output_tokens=$4,latency_ms=$5,completed_at=NOW() WHERE id=$1::uuid`,
      [run.id,result.model,result.inputTokens,result.outputTokens,latencyMs]);
    return {executedLive:true,runId:run.id,provider,model:result.model,reply:result.reply||'(لم يُرجع النموذج نصاً)',latencyMs,
      inputTokens:result.inputTokens,outputTokens:result.outputTokens};
  }catch(err){
    const latencyMs=Date.now()-started,e=err as {code?:string;model?:string;message?:string;name?:string};
    const code=e.name==='TimeoutError'?'provider_timeout':(e.code||'provider_error');
    await query(`UPDATE agent_runs SET status='failed',model=$2,error_code=$3,latency_ms=$4,completed_at=NOW() WHERE id=$1::uuid`,[run.id,e.model||null,code.slice(0,120),latencyMs]);
    throw new Error(e.name==='TimeoutError'?'انتهت مهلة استجابة المزود.':(e.message||'فشل اختبار الوكيل.'));
  }
}

export async function platformFreeQuotaExemptions(){
  const rows=await query<{fingerprint:string;reason:string;granted_by:string|null;created_at:string}>(
    `SELECT fingerprint,reason,granted_by,created_at::text created_at FROM free_tier_fingerprint_exemptions ORDER BY created_at DESC LIMIT 200`);
  return {items:rows};
}

export async function addFreeQuotaExemption(value:string,reason:string,grantedBy:string){
  const fingerprint=/^[0-9a-f]{64}$/.test(String(value||'').trim())?String(value).trim():freeQuotaFingerprint(value);
  if(!fingerprint)throw new Error('أدخل رقم هاتف أو معرّف قناة أو بصمة SHA-256 صحيحة.');
  const cleanReason=String(reason||'').trim();
  if(cleanReason.length<5||cleanReason.length>300)throw new Error('سبب الاستثناء مطلوب (5 أحرف على الأقل).');
  const [row]=await query<{fingerprint:string;reason:string;created_at:string}>(
    `INSERT INTO free_tier_fingerprint_exemptions(fingerprint,reason,granted_by) VALUES($1,$2,$3)
     ON CONFLICT(fingerprint) DO UPDATE SET reason=EXCLUDED.reason,granted_by=EXCLUDED.granted_by
     RETURNING fingerprint,reason,created_at::text created_at`,[fingerprint,cleanReason,String(grantedBy||'').slice(0,200)]);
  return row;
}

export async function removeFreeQuotaExemption(fingerprint:string){
  if(!/^[0-9a-f]{64}$/.test(fingerprint))throw new Error('بصمة غير صالحة.');
  const rows=await query<{fingerprint:string}>(`DELETE FROM free_tier_fingerprint_exemptions WHERE fingerprint=$1 RETURNING fingerprint`,[fingerprint]);
  if(!rows.length)throw new Error('الاستثناء غير موجود.');
  return {fingerprint,removed:true};
}
