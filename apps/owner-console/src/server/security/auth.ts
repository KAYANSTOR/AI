import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/connection';
import {
  decryptSecret,
  encryptSecret,
  generateId,
  generateTotpSecret,
  hashPassword,
  sha256Hex,
  verifyPassword,
  verifyTotpCode,
} from './crypto';

export type AdminRole = 'platform_owner' | 'super_admin' | 'ops_auditor';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  permissions: string[];
  sessionId: string;
  mfaEnabled: boolean;
}

declare global {
  namespace Express {
    interface Request {
      ownerAdmin?: AuthenticatedAdmin;
    }
  }
}

const DEFAULT_OWNER_EMAIL = (process.env.OWNER_EMAIL?.trim() || 'jarallhalkboudi@gmail.com').toLowerCase();

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function getAuthStatus(): {
  needsFirstRunClaim: boolean;
  envPasscodeConfigured: boolean;
  defaultOwnerEmail: string;
  ownerExists: boolean;
} {
  const db = getDb();
  const row = db
    .prepare("SELECT id, email FROM platform_admins WHERE role = 'platform_owner' AND status = 'active' LIMIT 1")
    .get() as { id: string; email: string } | undefined;
  const envPasscodeConfigured = Boolean(process.env.OWNER_PASSCODE?.trim());
  return {
    needsFirstRunClaim: !row && !envPasscodeConfigured,
    envPasscodeConfigured,
    defaultOwnerEmail: row?.email ?? DEFAULT_OWNER_EMAIL,
    ownerExists: Boolean(row),
  };
}

export function recordLoginAttempt(params: {
  email: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  failureReason?: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO admin_login_attempts (id, email, ip_address, user_agent, success, failure_reason)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    generateId('lga'),
    params.email.toLowerCase(),
    params.ipAddress,
    params.userAgent.slice(0, 240),
    params.success ? 1 : 0,
    params.failureReason ?? null
  );
}

export function isRateLimited(ipAddress: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS fail_count
       FROM admin_login_attempts
       WHERE ip_address = ?
         AND success = 0
         AND created_at >= datetime('now', '-15 minutes')`
    )
    .get(ipAddress) as { fail_count: number };
  return Number(row?.fail_count ?? 0) >= 12;
}

export function writeAuditLog(params: {
  actor: { id: string; email: string; role: string };
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_logs (
       id, actor_id, actor_email, actor_role, action, entity_type, entity_id,
       summary, before_json, after_json, ip_address
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    generateId('aud'),
    params.actor.id,
    params.actor.email,
    params.actor.role,
    params.action,
    params.entityType,
    params.entityId,
    params.summary,
    params.before !== undefined ? JSON.stringify(params.before) : null,
    params.after !== undefined ? JSON.stringify(params.after) : null,
    params.ipAddress ?? 'server'
  );
}

export function createOwnerSession(adminId: string, ipAddress: string, userAgent: string, mfaVerified: boolean): {
  token: string;
  sessionId: string;
  expiresAt: string;
} {
  const db = getDb();
  const settingRow = db
    .prepare("SELECT value_json FROM platform_settings WHERE key = 'session_ttl_hours'")
    .get() as { value_json: string } | undefined;
  const ttlHours = settingRow ? Math.max(1, Math.min(72, Number(JSON.parse(settingRow.value_json)) || 12)) : 12;

  const rawToken = `kyn_own_${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = sha256Hex(rawToken);
  const sessionId = generateId('ses');
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000).toISOString();

  db.prepare(
    `INSERT INTO owner_sessions (id, admin_id, token_hash, ip_address, user_agent, mfa_verified, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(sessionId, adminId, tokenHash, ipAddress, userAgent.slice(0, 240), mfaVerified ? 1 : 0, expiresAt);

  db.prepare("UPDATE platform_admins SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(
    adminId
  );

  return { token: rawToken, sessionId, expiresAt };
}

export function claimFirstRunOwner(params: {
  email: string;
  fullName: string;
  password: string;
  ipAddress: string;
  userAgent: string;
}): { token: string; admin: AuthenticatedAdmin; expiresAt: string } {
  const status = getAuthStatus();
  if (!status.needsFirstRunClaim) {
    throw new Error('Owner account is already initialized or managed by OWNER_PASSCODE.');
  }

  const email = params.email.trim().toLowerCase();
  const fullName = params.fullName.trim();
  if (!email || !email.includes('@')) {
    throw new Error('يرجى إدخال بريد إلكتروني صحيح لمالك المنصة.');
  }
  if (fullName.length < 2) {
    throw new Error('يرجى إدخال اسم المالك الكامل.');
  }
  if (!params.password || params.password.length < 10) {
    throw new Error('يجب أن تتكون كلمة مرور المالك من 10 أحرف على الأقل.');
  }

  const db = getDb();
  const adminId = generateId('adm');
  const passwordHash = hashPassword(params.password);

  db.exec('BEGIN IMMEDIATE;');
  try {
    const existing = db
      .prepare("SELECT id FROM platform_admins WHERE role = 'platform_owner' LIMIT 1")
      .get();
    if (existing) {
      throw new Error('تم تفعيل حساب المالك مسبقاً.');
    }

    db.prepare(
      `INSERT INTO platform_admins (id, email, full_name, role, password_hash, permissions_json, status)
       VALUES (?, ?, ?, 'platform_owner', ?, '["*"]', 'active')`
    ).run(adminId, email, fullName, passwordHash);

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  const session = createOwnerSession(adminId, params.ipAddress, params.userAgent, true);
  recordLoginAttempt({
    email,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    success: true,
  });

  const admin: AuthenticatedAdmin = {
    id: adminId,
    email,
    fullName,
    role: 'platform_owner',
    permissions: ['*'],
    sessionId: session.sessionId,
    mfaEnabled: false,
  };

  writeAuditLog({
    actor: admin,
    action: 'owner.claim_initialized',
    entityType: 'platform_admin',
    entityId: adminId,
    summary: `تم تفعيل حساب مالك المنصة الأولي (${email}) وإغلاق مسار التهيئة.`,
    after: { email, role: 'platform_owner' },
    ipAddress: params.ipAddress,
  });

  return { token: session.token, admin, expiresAt: session.expiresAt };
}

export function loginOwner(params: {
  email: string;
  password: string;
  totpCode?: string;
  ipAddress: string;
  userAgent: string;
}): { token: string; admin: AuthenticatedAdmin; expiresAt: string; requiresMfa?: boolean } {
  if (isRateLimited(params.ipAddress)) {
    throw new Error('تم تجاوز عدد محاولات الدخول المسموحة. حاول بعد 15 دقيقة.');
  }

  const email = params.email.trim().toLowerCase();
  const db = getDb();
  const envPasscode = process.env.OWNER_PASSCODE?.trim();

  let adminRow = db
    .prepare(
      `SELECT id, email, full_name, role, password_hash, mfa_enabled, mfa_secret_encrypted, permissions_json, status
       FROM platform_admins WHERE email = ?`
    )
    .get(email) as
    | {
        id: string;
        email: string;
        full_name: string;
        role: AdminRole;
        password_hash: string;
        mfa_enabled: number;
        mfa_secret_encrypted: string | null;
        permissions_json: string;
        status: string;
      }
    | undefined;

  // Support env OWNER_PASSCODE bootstrap for configured owner email
  if (!adminRow && envPasscode && email === DEFAULT_OWNER_EMAIL) {
    const passBuf = Buffer.from(params.password);
    const envBuf = Buffer.from(envPasscode);
    if (passBuf.length === envBuf.length && crypto.timingSafeEqual(passBuf, envBuf)) {
      const adminId = generateId('adm');
      db.prepare(
        `INSERT INTO platform_admins (id, email, full_name, role, password_hash, permissions_json, status)
         VALUES (?, ?, 'مالك منصة Kayan AI', 'platform_owner', ?, '["*"]', 'active')`
      ).run(adminId, email, hashPassword(envPasscode));
      adminRow = db
        .prepare(
          `SELECT id, email, full_name, role, password_hash, mfa_enabled, mfa_secret_encrypted, permissions_json, status
           FROM platform_admins WHERE id = ?`
        )
        .get(adminId) as typeof adminRow;
    }
  }

  if (!adminRow || adminRow.status !== 'active') {
    recordLoginAttempt({
      email,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      success: false,
      failureReason: 'invalid_admin_account',
    });
    db.prepare(
      `INSERT INTO system_logs (id, category, severity, service_name, message, details_sanitized)
       VALUES (?, 'security_unauthorized', 'warning', 'owner-auth', ?, ?)`
    ).run(
      generateId('log'),
      'محاولة دخول غير مصرح بها إلى لوحة المالك',
      `email=${email} ip=${params.ipAddress}`
    );
    throw new Error('بيانات الدخول غير صحيحة أو الحساب لا يملك صلاحية مالك المنصة.');
  }

  let passwordValid = verifyPassword(params.password, adminRow.password_hash);
  if (!passwordValid && envPasscode && adminRow.role === 'platform_owner') {
    const passBuf = Buffer.from(params.password);
    const envBuf = Buffer.from(envPasscode);
    passwordValid = passBuf.length === envBuf.length && crypto.timingSafeEqual(passBuf, envBuf);
  }

  if (!passwordValid) {
    recordLoginAttempt({
      email,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      success: false,
      failureReason: 'invalid_password',
    });
    throw new Error('بيانات الدخول غير صحيحة.');
  }

  if (adminRow.mfa_enabled === 1 && adminRow.mfa_secret_encrypted) {
    if (!params.totpCode?.trim()) {
      return {
        token: '',
        expiresAt: '',
        requiresMfa: true,
        admin: {
          id: adminRow.id,
          email: adminRow.email,
          fullName: adminRow.full_name,
          role: adminRow.role,
          permissions: JSON.parse(adminRow.permissions_json),
          sessionId: '',
          mfaEnabled: true,
        },
      };
    }
    const secret = decryptSecret(adminRow.mfa_secret_encrypted);
    if (!verifyTotpCode(secret, params.totpCode)) {
      recordLoginAttempt({
        email,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        success: false,
        failureReason: 'invalid_totp',
      });
      throw new Error('رمز المصادقة الثنائية غير صحيح أو منتهي الصلاحية.');
    }
  }

  const session = createOwnerSession(adminRow.id, params.ipAddress, params.userAgent, true);
  recordLoginAttempt({
    email,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    success: true,
  });

  const admin: AuthenticatedAdmin = {
    id: adminRow.id,
    email: adminRow.email,
    fullName: adminRow.full_name,
    role: adminRow.role,
    permissions: JSON.parse(adminRow.permissions_json),
    sessionId: session.sessionId,
    mfaEnabled: adminRow.mfa_enabled === 1,
  };

  writeAuditLog({
    actor: admin,
    action: 'owner.login',
    entityType: 'owner_session',
    entityId: session.sessionId,
    summary: `تسجيل دخول ناجح إلى مركز تحكم المالك (${email}).`,
    ipAddress: params.ipAddress,
  });

  return { token: session.token, admin, expiresAt: session.expiresAt };
}

export function setupOwnerMfa(admin: AuthenticatedAdmin): { secret: string; otpauthUri: string } {
  const secret = generateTotpSecret();
  const db = getDb();
  db.prepare('UPDATE platform_admins SET mfa_secret_encrypted = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
    encryptSecret(secret),
    admin.id
  );
  const issuer = encodeURIComponent('Kayan AI Owner Console');
  const label = encodeURIComponent(`Kayan AI Owner:${admin.email}`);
  return {
    secret,
    otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&digits=6&period=30`,
  };
}

export function confirmOwnerMfa(admin: AuthenticatedAdmin, code: string, ipAddress: string): void {
  const db = getDb();
  const row = db
    .prepare('SELECT mfa_secret_encrypted FROM platform_admins WHERE id = ?')
    .get(admin.id) as { mfa_secret_encrypted: string | null } | undefined;
  if (!row?.mfa_secret_encrypted) {
    throw new Error('لم يتم تهيئة سر المصادقة الثنائية بعد.');
  }
  const secret = decryptSecret(row.mfa_secret_encrypted);
  if (!verifyTotpCode(secret, code)) {
    throw new Error('رمز التحقق غير صحيح. يرجى التأكد من تطبيق المصادقة.');
  }
  db.prepare("UPDATE platform_admins SET mfa_enabled = 1, updated_at = datetime('now') WHERE id = ?").run(admin.id);
  writeAuditLog({
    actor: admin,
    action: 'owner.mfa_enabled',
    entityType: 'platform_admin',
    entityId: admin.id,
    summary: 'تم تفعيل المصادقة متعددة العوامل (TOTP MFA) لحساب المالك.',
    ipAddress,
  });
}

export function requireOwnerAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'مطلوب تسجيل دخول مالك المنصة للوصول إلى هذا المورد.',
    });
    return;
  }

  const rawToken = authHeader.slice(7).trim();
  if (!rawToken.startsWith('kyn_own_')) {
    const db = getDb();
    db.prepare(
      `INSERT INTO system_logs (id, category, severity, service_name, message, details_sanitized)
       VALUES (?, 'security_unauthorized', 'warning', 'owner-rbac', ?, ?)`
    ).run(
      generateId('log'),
      'رفض محاولة وصول برمز غير مصرح له إلى واجهة المالك',
      `path=${req.path} ip=${getClientIp(req)}`
    );
    res.status(403).json({
      error: 'forbidden',
      message: 'غير مصرح للمستخدمين العاديين بالوصول إلى واجهات مالك المنصة.',
    });
    return;
  }

  const tokenHash = sha256Hex(rawToken);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, s.revoked_at,
              a.id AS admin_id, a.email, a.full_name, a.role, a.permissions_json, a.status, a.mfa_enabled
       FROM owner_sessions s
       JOIN platform_admins a ON a.id = s.admin_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | {
        session_id: string;
        expires_at: string;
        revoked_at: string | null;
        admin_id: string;
        email: string;
        full_name: string;
        role: AdminRole;
        permissions_json: string;
        status: string;
        mfa_enabled: number;
      }
    | undefined;

  if (!row || row.revoked_at !== null || Date.parse(row.expires_at) <= Date.now()) {
    res.status(401).json({
      error: 'session_invalid',
      message: 'انتهت صلاحية الجلسة أو تم إبطالها. يرجى إعادة تسجيل الدخول.',
    });
    return;
  }

  if (row.status !== 'active' || !['platform_owner', 'super_admin', 'ops_auditor'].includes(row.role)) {
    res.status(403).json({
      error: 'forbidden_role',
      message: 'هذا الحساب لا يملك صلاحية إدارية نشطة.',
    });
    return;
  }

  req.ownerAdmin = {
    id: row.admin_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    permissions: JSON.parse(row.permissions_json),
    sessionId: row.session_id,
    mfaEnabled: row.mfa_enabled === 1,
  };
  next();
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const admin = req.ownerAdmin;
    if (!admin) {
      res.status(401).json({ error: 'unauthorized', message: 'غير مصادق.' });
      return;
    }
    if (admin.role === 'platform_owner' || admin.permissions.includes('*') || admin.permissions.includes(permission)) {
      next();
      return;
    }
    res.status(403).json({
      error: 'insufficient_permissions',
      message: `ليست لديك الصلاحية المطلوبة (${permission}).`,
    });
  };
}
