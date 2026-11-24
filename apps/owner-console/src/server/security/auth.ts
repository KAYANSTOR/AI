import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import postgres from 'postgres'
import { hashPassword, verifyPassword, generateTotpSecret, verifyTotpCode, encryptSecret, decryptSecret } from './crypto'
export type AdminRole = 'platform_owner' | 'super_admin' | 'ops_auditor'
export interface AuthenticatedAdmin { id:string; email:string; fullName:string; role:AdminRole; permissions:string[]; sessionId:string; mfaEnabled:boolean }
declare global { namespace Express { interface Request { ownerAdmin?: AuthenticatedAdmin } } }
const sessions = new Map<string, AuthenticatedAdmin>(); let pool: ReturnType<typeof postgres>|undefined
function sql(){if(pool)return pool;const url=process.env.DATABASE_URL?.trim();if(!url)throw new Error('DATABASE_URL غير مهيأ.');const host=new URL(url).hostname;pool=postgres(url,{ssl:process.env.DATABASE_SSL==='require'?'require':host.endsWith('.railway.internal')?false:'require',prepare:false,max:5,connect_timeout:10,connection:{TimeZone:'UTC',application_name:'kayan-owner-auth'}});return pool}
const SESSION_DAYS = 30
const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60
const ownerEmail=()=> (process.env.OWNER_EMAIL?.trim()||process.env.OWNER_CONSOLE_OWNER_EMAIL?.trim()||'platform_owner@kayan.ai').toLowerCase(); const permissions=['users:write','billing:write','ai:write','ops:write','settings:write']
function rowAdmin(r:any,sessionId=''):AuthenticatedAdmin{const role=r.role as AdminRole;return{id:String(r.id),email:String(r.email),fullName:String(r.full_name||'Platform Owner'),role,permissions:role==='platform_owner'?['*']:Array.isArray(r.permissions)?r.permissions:permissions,sessionId,mfaEnabled:Boolean(r.mfa_secret_encrypted)}}
const ownerPasscode=()=>process.env.OWNER_PASSCODE?.trim()||process.env.OWNER_CONSOLE_OWNER_PASSCODE?.trim()||''
async function bootstrap(){const db=sql();const [c]=await db`SELECT COUNT(*)::int count FROM platform_admins`;if(Number(c?.count)!==0)return;const pass=ownerPasscode();if(!pass)return;const [r]=await db`INSERT INTO platform_admins(email,full_name,role,permissions,password_hash) VALUES(${ownerEmail()},'Platform Owner','platform_owner',${JSON.stringify(permissions)}::jsonb,${hashPassword(pass)}) ON CONFLICT(email) DO NOTHING RETURNING id`;if(r)console.info('owner_console_admin_bootstrap_completed')}
export function getClientIp(req:Request){const f=req.headers['x-forwarded-for'];return typeof f==='string'&&f?f.split(',')[0].trim():req.socket?.remoteAddress||'unknown'}
export async function getAuthStatus(){await bootstrap();const [r]=await sql()`SELECT id,email FROM platform_admins WHERE role='platform_owner' AND status='active' LIMIT 1`;return{needsFirstRunClaim:!r&&!ownerPasscode(),envPasscodeConfigured:Boolean(ownerPasscode()),defaultOwnerEmail:r?.email??ownerEmail(),ownerExists:Boolean(r)}}
export async function writeAuditLog(p:{actor:{id:string;email:string;role:string};action:string;entityType:string;entityId:string;summary:string;before?:unknown;after?:unknown;ipAddress?:string}){try{await sql()`INSERT INTO platform_audit_logs(actor_id,actor_email,actor_role,action,entity_type,entity_id,summary,before_json,after_json,ip_address) VALUES(${p.actor.id}::uuid,${p.actor.email},${p.actor.role},${p.action},${p.entityType},${p.entityId},${p.summary},${p.before==null?null:JSON.stringify(p.before)}::jsonb,${p.after==null?null:JSON.stringify(p.after)}::jsonb,${p.ipAddress??null})`}catch(e){console.error('owner_audit_log_failed',e)}}
export async function claimFirstRunOwner(p:{email:string;fullName:string;password:string;ipAddress:string;userAgent:string}){const [c]=await sql()`SELECT COUNT(*)::int count FROM platform_admins`;if(Number(c?.count)!==0)throw new Error('تم تفعيل حساب المالك مسبقاً.');if(p.password.length<8)throw new Error('Password must be at least 8 characters long.');const [r]=await sql()`INSERT INTO platform_admins(email,full_name,role,permissions,password_hash) VALUES(${p.email.trim().toLowerCase()},${p.fullName.trim()||'Platform Owner'},'platform_owner',${JSON.stringify(permissions)}::jsonb,${hashPassword(p.password)}) RETURNING id,email,full_name,role,permissions`;return{admin:rowAdmin(r),message:'تم إنشاء حساب مالك المنصة.'}}
export function setSessionCookie(res:Response,token:string,expiresAt:string){const secure=process.env.NODE_ENV==='production'?' Secure;':'';res.setHeader('Set-Cookie',`owner_session=${encodeURIComponent(token)}; Max-Age=${SESSION_MAX_AGE_SECONDS}; Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; SameSite=Lax; Path=/${secure}`)}
export function clearSessionCookie(res:Response){const secure=process.env.NODE_ENV==='production'?' Secure;':'';res.setHeader('Set-Cookie',`owner_session=; Max-Age=0; Expires=${new Date(0).toUTCString()}; HttpOnly; SameSite=Lax; Path=/${secure}`)}
function cookieToken(req:Request){const raw=String(req.headers.cookie||'');const match=raw.split(';').map((v)=>v.trim()).find((v)=>v.startsWith('owner_session='));return match?decodeURIComponent(match.slice('owner_session='.length)):''}
export async function loginOwner(p:{email:string;password:string;totpCode?:string;ipAddress:string;userAgent:string}) {
  await bootstrap();
  const [r] = await sql()`SELECT * FROM platform_admins WHERE lower(email)=lower(${p.email.trim()}) AND status='active' LIMIT 1`;
  const validPassword = Boolean(r && verifyPassword(p.password, String(r.password_hash)));
  const ip = p.ipAddress && p.ipAddress !== 'unknown' ? p.ipAddress : null;
  if (!validPassword) {
    try {
      await sql()`INSERT INTO platform_admin_login_attempts(email,ip_address,user_agent,success,failure_reason)
        VALUES(${p.email.trim().toLowerCase().slice(0,320)},${ip},${p.userAgent.slice(0,240)},FALSE,'invalid_credentials')`;
    } catch (error) {
      console.error('owner_login_attempt_record_failed', error instanceof Error ? error.message : 'unknown');
    }
    throw new Error('بيانات الدخول غير صحيحة.');
  }
  if (r.mfa_secret_encrypted) {
    if (!p.totpCode) return { requiresMfa: true as const };
    const secret = decryptSecret(String(r.mfa_secret_encrypted));
    if (!verifyTotpCode(secret, p.totpCode)) throw new Error('رمز المصادقة الثنائية غير صحيح أو منتهي الصلاحية.');
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [session] = await sql()`INSERT INTO platform_admin_sessions(admin_id,token_hash,ip_address,user_agent,expires_at)
    VALUES(${r.id},${crypto.createHash('sha256').update(token).digest('hex')},${ip},${p.userAgent.slice(0,240)},${expiresAt})
    RETURNING id::text session_id`;
  if (!session?.session_id) throw new Error('تعذر إنشاء جلسة دخول آمنة.');
  const admin = rowAdmin(r, String(session.session_id));
  sessions.set(token, admin);
  await sql()`UPDATE platform_admins SET last_login_at=now(),updated_at=now() WHERE id=${r.id}`;
  try {
    await sql()`INSERT INTO platform_admin_login_attempts(email,ip_address,user_agent,success,failure_reason)
      VALUES(${p.email.trim().toLowerCase().slice(0,320)},${ip},${p.userAgent.slice(0,240)},TRUE,NULL)`;
  } catch (error) {
    console.error('owner_login_attempt_record_failed', error instanceof Error ? error.message : 'unknown');
  }
  return { token, admin, expiresAt };
}

export async function requireOwnerAuth(req:Request,res:Response,next:NextFunction) {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\\s+/i,'') || cookieToken(req);
    if (!token) { res.status(401).json({error:'unauthorized'}); return; }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [row] = await sql()`SELECT a.*,s.id session_id
      FROM platform_admin_sessions s JOIN platform_admins a ON a.id=s.admin_id
      WHERE s.token_hash=${tokenHash} AND s.revoked_at IS NULL AND s.expires_at>now() AND a.status='active'
      LIMIT 1`;
    if (!row) {
      sessions.delete(token);
      res.status(401).json({error:'unauthorized'});
      return;
    }
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [renewed] = await sql()`UPDATE platform_admin_sessions SET expires_at=${expiresAt}
      WHERE id=${row.session_id} AND revoked_at IS NULL AND expires_at>now() RETURNING id`;
    if (!renewed) {
      sessions.delete(token);
      res.status(401).json({error:'unauthorized'});
      return;
    }
    const admin = rowAdmin(row, String(row.session_id));
    sessions.set(token, admin);
    setSessionCookie(res, token, expiresAt);
    req.ownerAdmin = admin;
    next();
  } catch (error) {
    console.error('owner_auth_database_failed', error instanceof Error ? error.message : 'unknown');
    res.status(503).json({error:'admin_database_unavailable',message:'تعذر التحقق من جلسة المالك حالياً.'});
  }
}

export function requirePermission(p:string){return(req:Request,res:Response,next:NextFunction)=>{if(!req.ownerAdmin?.permissions.includes('*')&&!req.ownerAdmin?.permissions.includes(p)&&req.ownerAdmin?.role!=='platform_owner'){res.status(403).json({error:'forbidden'});return}next()}}
export async function revokeOwnerSession(id:string,actor:AuthenticatedAdmin,ip:string){for(const [t,a] of sessions)if(a.sessionId===id)sessions.delete(t);await sql()`UPDATE platform_admin_sessions SET revoked_at=now() WHERE id=${id}::uuid`;await writeAuditLog({actor,action:'auth.session_revoked',entityType:'session',entityId:id,summary:'إبطال جلسة مالك.',ipAddress:ip});return{ok:true}}
export async function setupOwnerMfa(admin:AuthenticatedAdmin) {
  const secret = generateTotpSecret();
  const key = `owner_mfa_pending:${admin.id}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await sql()`INSERT INTO platform_settings(key,value,updated_by,updated_at)
    VALUES(${key},${JSON.stringify({encryptedSecret:encryptSecret(secret),expiresAt})}::jsonb,${admin.id}::uuid,NOW())
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()`;
  const label = encodeURIComponent(`Kayan AI:${admin.email}`);
  const issuer = encodeURIComponent('Kayan AI');
  const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  return {secret,otpauthUri,expiresAt};
}

export async function confirmOwnerMfa(admin:AuthenticatedAdmin,code:string) {
  const key = `owner_mfa_pending:${admin.id}`;
  const [pending] = await sql()`SELECT value FROM platform_settings WHERE key=${key} LIMIT 1`;
  const value = pending?.value as {encryptedSecret?:string;expiresAt?:string}|undefined;
  if (!value?.encryptedSecret || !value.expiresAt || new Date(value.expiresAt).getTime() < Date.now()) {
    throw new Error('انتهت صلاحية إعداد المصادقة؛ ابدأ الربط من جديد.');
  }
  const secret = decryptSecret(value.encryptedSecret);
  if (!verifyTotpCode(secret, code)) throw new Error('رمز المصادقة الثنائية غير صحيح.');
  await sql()`UPDATE platform_admins SET mfa_secret_encrypted=${value.encryptedSecret},updated_at=NOW() WHERE id=${admin.id}::uuid`;
  await sql()`DELETE FROM platform_settings WHERE key=${key}`;
  admin.mfaEnabled = true;
  for (const existing of sessions.values()) if (existing.id === admin.id) existing.mfaEnabled = true;
  await writeAuditLog({actor:admin,action:'auth.mfa_enabled',entityType:'admin',entityId:admin.id,summary:'تفعيل المصادقة الثنائية TOTP لحساب المدير.'});
  return {ok:true};
}

){throw new Error('MFA centralization is pending migration of the existing TOTP flow.')}
export function confirmOwnerMfa(){throw new Error('MFA centralization is pending migration of the existing TOTP flow.')}
