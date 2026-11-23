import { getDb } from '../db/connection';
import { generateId } from '../security/crypto';
import { writeAuditLog, type AuthenticatedAdmin } from '../security/auth';

export function getEntitlementsOverview() {
  const db = getDb();
  const flags = db.prepare('SELECT * FROM feature_flags ORDER BY category, name').all() as Array<Record<string, unknown>>;

  const enrichedFlags = flags.map((flag) => {
    const planCodes: string[] = JSON.parse(String(flag.allowed_plan_codes_json || '[]'));
    const grantedOverrides = Number(
      (
        db
          .prepare("SELECT COUNT(*) AS c FROM user_entitlements WHERE feature_key = ? AND override_state = 'granted'")
          .get(String(flag.key)) as { c: number }
      ).c
    );
    const revokedOverrides = Number(
      (
        db
          .prepare("SELECT COUNT(*) AS c FROM user_entitlements WHERE feature_key = ? AND override_state = 'revoked'")
          .get(String(flag.key)) as { c: number }
      ).c
    );

    let planEligibleUsers = 0;
    if (planCodes.length > 0 && Number(flag.platform_enabled) === 1) {
      const placeholders = planCodes.map(() => '?').join(',');
      const row = db
        .prepare(
          `SELECT COUNT(DISTINCT s.user_id) AS c
           FROM subscriptions s
           JOIN plans p ON p.id = s.plan_id
           WHERE s.status IN ('active', 'trial') AND p.code IN (${placeholders})`
        )
        .get(...planCodes) as { c: number };
      planEligibleUsers = Number(row?.c ?? 0);
    }

    return {
      ...flag,
      allowed_plan_codes: planCodes,
      active_users_estimate: Math.max(0, planEligibleUsers + grantedOverrides - revokedOverrides),
      granted_overrides: grantedOverrides,
      revoked_overrides: revokedOverrides,
    };
  });

  const userOverrides = db
    .prepare(
      `SELECT ue.*, u.full_name AS user_name, u.email AS user_email, ff.name AS feature_name
       FROM user_entitlements ue
       JOIN users u ON u.id = ue.user_id
       JOIN feature_flags ff ON ff.key = ue.feature_key
       ORDER BY ue.updated_at DESC`
    )
    .all();

  const activations = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.account_status, u.activation_status, u.activation_source,
              u.activation_start_at, u.activation_end_at, u.deactivation_reason, u.bonus_token_credit,
              (SELECT p.name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = u.id ORDER BY s.created_at DESC LIMIT 1) AS plan_name,
              (SELECT s.status FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.created_at DESC LIMIT 1) AS subscription_status
       FROM users u
       WHERE u.account_status != 'deleted'
       ORDER BY u.created_at DESC`
    )
    .all();

  const history = db
    .prepare('SELECT * FROM entitlement_history ORDER BY created_at DESC LIMIT 60')
    .all();

  return { flags: enrichedFlags, userOverrides, activations, history };
}

export function updateFeatureFlag(
  key: string,
  patch: {
    platformEnabled?: boolean;
    allowedPlanCodes?: string[];
    tierType?: 'free' | 'trial' | 'paid' | 'beta';
    defaultQuota?: number | null;
    reason?: string;
  },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const flag = db.prepare('SELECT * FROM feature_flags WHERE key = ?').get(key) as Record<string, unknown> | undefined;
  if (!flag) throw new Error('الميزة غير موجودة.');

  const nextEnabled = patch.platformEnabled !== undefined ? (patch.platformEnabled ? 1 : 0) : Number(flag.platform_enabled);
  const nextPlans = patch.allowedPlanCodes !== undefined ? patch.allowedPlanCodes : JSON.parse(String(flag.allowed_plan_codes_json));
  const nextTier = patch.tierType ?? String(flag.tier_type);
  const nextQuota = patch.defaultQuota !== undefined ? patch.defaultQuota : (flag.default_quota as number | null);

  db.prepare(
    `UPDATE feature_flags
     SET platform_enabled = ?, allowed_plan_codes_json = ?, tier_type = ?, default_quota = ?,
         updated_by = ?, updated_at = datetime('now')
     WHERE key = ?`
  ).run(nextEnabled, JSON.stringify(nextPlans), nextTier, nextQuota, actor.email, key);

  db.prepare(
    `INSERT INTO entitlement_history (id, target_type, target_id, feature_key, actor_email, previous_value, new_value, reason)
     VALUES (?, 'platform_flag', ?, ?, ?, ?, ?, ?)`
  ).run(
    generateId('eh'),
    key,
    key,
    actor.email,
    JSON.stringify({ enabled: flag.platform_enabled === 1, plans: JSON.parse(String(flag.allowed_plan_codes_json)), tier: flag.tier_type }),
    JSON.stringify({ enabled: nextEnabled === 1, plans: nextPlans, tier: nextTier }),
    patch.reason?.trim() || 'تحديث سياسة الميزة على مستوى المنصة'
  );

  writeAuditLog({
    actor,
    action: 'feature_flag.updated',
    entityType: 'feature_flag',
    entityId: key,
    summary: `تعديل الميزة "${flag.name}" (${nextEnabled === 1 ? 'مفعلة' : 'معطلة'}).`,
    before: { platform_enabled: flag.platform_enabled === 1, tier_type: flag.tier_type },
    after: { platform_enabled: nextEnabled === 1, allowed_plan_codes: nextPlans, tier_type: nextTier },
    ipAddress,
  });

  return db.prepare('SELECT * FROM feature_flags WHERE key = ?').get(key);
}

export function setUserEntitlementOverride(
  input: {
    userId: string;
    featureKey: string;
    overrideState: 'granted' | 'revoked';
    customLimit?: number | null;
    reason?: string;
    expiresAt?: string | null;
  },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const user = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(input.userId) as
    | { id: string; full_name: string }
    | undefined;
  const flag = db.prepare('SELECT key, name FROM feature_flags WHERE key = ?').get(input.featureKey) as
    | { key: string; name: string }
    | undefined;
  if (!user) throw new Error('المستخدم غير موجود.');
  if (!flag) throw new Error('الميزة غير موجودة.');

  const existing = db
    .prepare('SELECT * FROM user_entitlements WHERE user_id = ? AND feature_key = ?')
    .get(user.id, flag.key) as Record<string, unknown> | undefined;

  if (existing) {
    db.prepare(
      `UPDATE user_entitlements
       SET override_state = ?, custom_limit = ?, reason = ?, expires_at = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      input.overrideState,
      input.customLimit ?? null,
      input.reason?.trim() || '',
      input.expiresAt || null,
      actor.email,
      String(existing.id)
    );
  } else {
    db.prepare(
      `INSERT INTO user_entitlements (id, user_id, feature_key, override_state, custom_limit, source, reason, expires_at, updated_by)
       VALUES (?, ?, ?, ?, ?, 'owner_override', ?, ?, ?)`
    ).run(
      generateId('ue'),
      user.id,
      flag.key,
      input.overrideState,
      input.customLimit ?? null,
      input.reason?.trim() || '',
      input.expiresAt || null,
      actor.email
    );
  }

  db.prepare(
    `INSERT INTO entitlement_history (id, target_type, target_id, feature_key, actor_email, previous_value, new_value, reason)
     VALUES (?, 'user_entitlement', ?, ?, ?, ?, ?, ?)`
  ).run(
    generateId('eh'),
    user.id,
    flag.key,
    actor.email,
    existing ? String(existing.override_state) : 'plan_default',
    input.overrideState,
    input.reason?.trim() || (input.overrideState === 'granted' ? 'منح صلاحية مخصصة' : 'سحب صلاحية')
  );

  writeAuditLog({
    actor,
    action: input.overrideState === 'granted' ? 'entitlement.granted' : 'entitlement.revoked',
    entityType: 'user_entitlement',
    entityId: `${user.id}:${flag.key}`,
    summary: `${input.overrideState === 'granted' ? 'منح' : 'سحب'} ميزة "${flag.name}" للمستخدم ${user.full_name}.`,
    before: existing ? { override_state: existing.override_state, custom_limit: existing.custom_limit } : null,
    after: { override_state: input.overrideState, custom_limit: input.customLimit ?? null, reason: input.reason },
    ipAddress,
  });

  return { ok: true };
}
