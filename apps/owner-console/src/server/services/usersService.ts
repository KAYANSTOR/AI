import { getDb } from '../db/connection';
import { generateId } from '../security/crypto';
import { writeAuditLog, type AuthenticatedAdmin } from '../security/auth';
import { resolveEntitlement } from '../domain/entitlements';

export interface UserListQuery {
  search?: string;
  status?: string;
  paymentStatus?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  created_at: 'u.created_at',
  full_name: 'u.full_name',
  last_active_at: 'u.last_active_at',
  account_status: 'u.account_status',
  payment_status: 'u.payment_status',
};

export function listUsers(query: UserListQuery) {
  const db = getDb();
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  if (query.status && query.status !== 'all') {
    whereClauses.push('u.account_status = ?');
    params.push(query.status);
  } else {
    whereClauses.push("u.account_status != 'deleted'");
  }

  if (query.paymentStatus && query.paymentStatus !== 'all') {
    whereClauses.push('u.payment_status = ?');
    params.push(query.paymentStatus);
  }

  if (query.search?.trim()) {
    const like = `%${query.search.trim()}%`;
    whereClauses.push('(u.full_name LIKE ? OR u.email LIKE ? OR COALESCE(u.phone, \'\') LIKE ? OR u.id LIKE ?)');
    params.push(like, like, like, like);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const sortCol = ALLOWED_SORT_COLUMNS[query.sortBy || 'created_at'] || 'u.created_at';
  const sortDir = query.sortDir === 'asc' ? 'ASC' : 'DESC';

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM users u ${whereSql}`)
    .get(...params) as { c: number };

  const rows = db
    .prepare(
      `SELECT u.*,
              (SELECT p.name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = u.id ORDER BY s.created_at DESC LIMIT 1) AS plan_name,
              (SELECT p.code FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = u.id ORDER BY s.created_at DESC LIMIT 1) AS plan_code,
              (SELECT s.status FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.created_at DESC LIMIT 1) AS subscription_status,
              (SELECT s.current_period_end FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.created_at DESC LIMIT 1) AS subscription_end_at,
              (SELECT COUNT(*) FROM workspaces w WHERE w.owner_user_id = u.id) AS workspaces_count,
              (SELECT COUNT(*) FROM agents a WHERE a.user_id = u.id) AS agents_count,
              (SELECT COALESCE(SUM(e.total_tokens), 0) FROM ai_usage_events e WHERE e.user_id = u.id) AS total_tokens,
              (SELECT COALESCE(SUM(e.cost_usd), 0) FROM ai_usage_events e WHERE e.user_id = u.id) AS total_ai_cost_usd,
              (SELECT COUNT(*) FROM conversations c WHERE c.user_id = u.id) AS conversations_count
       FROM users u
       ${whereSql}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  return {
    items: rows,
    pagination: {
      page,
      pageSize,
      total: Number(totalRow?.c ?? 0),
      totalPages: Math.max(1, Math.ceil(Number(totalRow?.c ?? 0) / pageSize)),
    },
  };
}

export function getUserFullDetail(userId: string) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!user) return null;

  const workspaces = db
    .prepare('SELECT * FROM workspaces WHERE owner_user_id = ? ORDER BY created_at DESC')
    .all(userId);
  const subscriptions = db
    .prepare(
      `SELECT s.*, p.name AS plan_name, p.code AS plan_code, p.price_monthly, p.currency
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.user_id = ?
       ORDER BY s.created_at DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;
  const invoices = db
    .prepare(
      `SELECT i.*, p.name AS plan_name
       FROM invoices i
       LEFT JOIN plans p ON p.id = i.plan_id
       WHERE i.user_id = ?
       ORDER BY i.created_at DESC`
    )
    .all(userId);
  const payments = db
    .prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId);
  const agents = db
    .prepare(
      `SELECT a.*, w.name AS workspace_name,
              (SELECT COUNT(*) FROM ai_usage_events e WHERE e.agent_id = a.id) AS executions_count,
              (SELECT COALESCE(SUM(e.total_tokens), 0) FROM ai_usage_events e WHERE e.agent_id = a.id) AS tokens_used,
              (SELECT COALESCE(SUM(e.cost_usd), 0) FROM ai_usage_events e WHERE e.agent_id = a.id) AS cost_usd
       FROM agents a
       JOIN workspaces w ON w.id = a.workspace_id
       WHERE a.user_id = ?
       ORDER BY a.created_at DESC`
    )
    .all(userId);
  const channels = db
    .prepare(
      `SELECT id, user_id, workspace_id, agent_id, channel_type, display_name, connection_status,
              webhook_status, provider_status, secret_masked, secret_rotated_at, connected_at,
              last_connected_at, last_activity_at, messages_received, messages_sent, error_count, last_error
       FROM channels WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(userId);
  const knowledgeSources = db
    .prepare('SELECT * FROM knowledge_sources WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId);
  const conversations = db
    .prepare(
      `SELECT c.*, a.name AS agent_name
       FROM conversations c
       LEFT JOIN agents a ON a.id = c.agent_id
       WHERE c.user_id = ?
       ORDER BY c.last_message_at DESC
       LIMIT 50`
    )
    .all(userId);
  const aiUsageSummary = db
    .prepare(
      `SELECT COUNT(*) AS requests,
              COALESCE(SUM(input_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens,
              COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
              COALESCE(SUM(total_tokens), 0) AS total_tokens,
              COALESCE(SUM(cost_usd), 0) AS cost_usd
       FROM ai_usage_events WHERE user_id = ?`
    )
    .get(userId);
  const recentAiEvents = db
    .prepare('SELECT * FROM ai_usage_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(userId);
  const auditActivity = db
    .prepare(
      `SELECT * FROM audit_logs
       WHERE (entity_type = 'user' AND entity_id = ?) OR after_json LIKE ?
       ORDER BY created_at DESC LIMIT 40`
    )
    .all(userId, `%${userId}%`);
  const sessions = db
    .prepare('SELECT * FROM user_sessions WHERE user_id = ? ORDER BY last_seen_at DESC')
    .all(userId);
  const errors = db
    .prepare('SELECT * FROM system_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(userId);

  const activePlanCode = (subscriptions[0]?.plan_code as string) || null;
  const allFlags = db.prepare('SELECT * FROM feature_flags ORDER BY category, name').all() as Array<{
    key: string;
    name: string;
    category: string;
    tier_type: string;
    platform_enabled: number;
    allowed_plan_codes_json: string;
    default_quota: number | null;
  }>;
  const overrides = db
    .prepare('SELECT * FROM user_entitlements WHERE user_id = ?')
    .all(userId) as Array<{
    feature_key: string;
    override_state: 'granted' | 'revoked';
    custom_limit: number | null;
    expires_at: string | null;
    reason: string;
  }>;
  const overrideMap = new Map(overrides.map((o) => [o.feature_key, o]));

  const entitlements = allFlags.map((flag) => {
    const ov = overrideMap.get(flag.key) ?? null;
    const resolved = resolveEntitlement(
      {
        key: flag.key,
        platformEnabled: flag.platform_enabled === 1,
        allowedPlanCodes: JSON.parse(flag.allowed_plan_codes_json),
        defaultQuota: flag.default_quota,
      },
      activePlanCode,
      ov
        ? {
            featureKey: ov.feature_key,
            overrideState: ov.override_state,
            customLimit: ov.custom_limit,
            expiresAt: ov.expires_at,
          }
        : null
    );
    return {
      key: flag.key,
      name: flag.name,
      category: flag.category,
      tierType: flag.tier_type,
      ...resolved,
      overrideReason: ov?.reason ?? null,
    };
  });

  return {
    user,
    workspaces,
    subscriptions,
    invoices,
    payments,
    agents,
    channels,
    knowledgeSources,
    conversations,
    aiUsage: { summary: aiUsageSummary, recentEvents: recentAiEvents },
    auditActivity,
    sessions,
    errors,
    entitlements,
  };
}

export function createUserWithWorkspace(
  input: {
    fullName: string;
    email: string;
    phone?: string;
    accountStatus?: 'active' | 'trial' | 'suspended';
    planCode?: string;
    workspaceName?: string;
    businessType?: string;
    adminNotes?: string;
  },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const fullName = input.fullName?.trim();
  const email = input.email?.trim().toLowerCase();
  if (!fullName || fullName.length < 2) throw new Error('اسم المستخدم مطلوب (حرفان على الأقل).');
  if (!email || !email.includes('@')) throw new Error('البريد الإلكتروني غير صالح.');

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) throw new Error('يوجد مستخدم مسجل بهذا البريد الإلكتروني مسبقاً.');

  const userId = generateId('usr');
  const workspaceId = generateId('ws');
  const accountStatus = input.accountStatus || 'active';
  const nowIso = new Date().toISOString();
  const planCode = input.planCode || 'trial';
  const plan = db.prepare('SELECT id, trial_days, code FROM plans WHERE code = ?').get(planCode) as
    | { id: string; trial_days: number; code: string }
    | undefined;

  const wsName = input.workspaceName?.trim() || `مساحة عمل ${fullName}`;
  const slugBase = wsName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const slug = `${slugBase || 'workspace'}-${userId.slice(-6)}`;

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO users (
         id, full_name, email, phone, account_status, activation_status, activation_source,
         activation_start_at, payment_status, admin_notes, last_active_at
       ) VALUES (?, ?, ?, ?, ?, 'activated', 'owner_console', ?, ?, ?, ?)`
    ).run(
      userId,
      fullName,
      email,
      input.phone?.trim() || null,
      accountStatus,
      nowIso,
      planCode === 'trial' ? 'trial' : 'unpaid',
      input.adminNotes?.trim() || '',
      nowIso
    );

    db.prepare(
      `INSERT INTO workspaces (id, owner_user_id, name, slug, business_type, status, member_count)
       VALUES (?, ?, ?, ?, ?, 'active', 1)`
    ).run(workspaceId, userId, wsName, slug, input.businessType?.trim() || 'general');

    if (plan) {
      const subId = generateId('sub');
      const endDate = new Date(Date.now() + (plan.trial_days > 0 ? plan.trial_days : 30) * 86_400_000).toISOString();
      db.prepare(
        `INSERT INTO subscriptions (
           id, user_id, workspace_id, plan_id, status, billing_cycle, auto_renew, gateway,
           current_period_start, current_period_end
         ) VALUES (?, ?, ?, ?, ?, 'monthly', 1, 'manual', ?, ?)`
      ).run(subId, userId, workspaceId, plan.id, plan.code === 'trial' ? 'trial' : 'active', nowIso, endDate);
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  writeAuditLog({
    actor,
    action: 'user.created',
    entityType: 'user',
    entityId: userId,
    summary: `إنشاء حساب المستخدم ${fullName} (${email}) مع مساحة العمل "${wsName}".`,
    after: { userId, email, workspaceId, planCode },
    ipAddress,
  });

  return getUserFullDetail(userId);
}

export function updateUser(
  userId: string,
  patch: {
    fullName?: string;
    email?: string;
    phone?: string | null;
    adminNotes?: string;
    activationStatus?: 'activated' | 'pending' | 'deactivated';
    deactivationReason?: string | null;
  },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const before = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!before) throw new Error('المستخدم غير موجود.');

  const fullName = patch.fullName !== undefined ? patch.fullName.trim() : String(before.full_name);
  const email = patch.email !== undefined ? patch.email.trim().toLowerCase() : String(before.email);
  const phone = patch.phone !== undefined ? (patch.phone ? patch.phone.trim() : null) : (before.phone as string | null);
  const adminNotes = patch.adminNotes !== undefined ? patch.adminNotes : String(before.admin_notes || '');
  const activationStatus = patch.activationStatus ?? String(before.activation_status);
  const deactivationReason =
    patch.deactivationReason !== undefined ? patch.deactivationReason : (before.deactivation_reason as string | null);

  db.prepare(
    `UPDATE users
     SET full_name = ?, email = ?, phone = ?, admin_notes = ?, activation_status = ?,
         deactivation_reason = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(fullName, email, phone, adminNotes, activationStatus, deactivationReason, userId);

  if (patch.activationStatus && patch.activationStatus !== before.activation_status) {
    db.prepare(
      `INSERT INTO entitlement_history (id, target_type, target_id, actor_email, previous_value, new_value, reason)
       VALUES (?, 'user_activation', ?, ?, ?, ?, ?)`
    ).run(
      generateId('eh'),
      userId,
      actor.email,
      String(before.activation_status),
      activationStatus,
      deactivationReason || 'تعديل حالة التفعيل من لوحة المالك'
    );
  }

  writeAuditLog({
    actor,
    action: 'user.updated',
    entityType: 'user',
    entityId: userId,
    summary: `تحديث بيانات المستخدم ${fullName}.`,
    before: {
      full_name: before.full_name,
      email: before.email,
      activation_status: before.activation_status,
    },
    after: { full_name: fullName, email, activation_status: activationStatus },
    ipAddress,
  });

  return getUserFullDetail(userId);
}

export function performUserAdminAction(
  userId: string,
  action: string,
  payload: Record<string, unknown>,
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!user) throw new Error('المستخدم غير موجود.');

  const reason = String(payload.reason || '').trim();

  if (action === 'suspend') {
    db.prepare(
      `UPDATE users SET account_status = 'suspended', activation_status = 'deactivated',
       deactivation_reason = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(reason || 'تم التعليق بواسطة مالك المنصة', userId);
    db.prepare("UPDATE user_sessions SET status = 'revoked' WHERE user_id = ?").run(userId);
    db.prepare(
      `INSERT INTO entitlement_history (id, target_type, target_id, actor_email, previous_value, new_value, reason)
       VALUES (?, 'user_activation', ?, ?, ?, 'deactivated', ?)`
    ).run(generateId('eh'), userId, actor.email, String(user.activation_status), reason || 'تعليق الحساب');
    writeAuditLog({
      actor,
      action: 'user.suspended',
      entityType: 'user',
      entityId: userId,
      summary: `تعليق حساب المستخدم ${user.full_name}. السبب: ${reason || 'قرار إداري'}`,
      before: { account_status: user.account_status },
      after: { account_status: 'suspended', reason },
      ipAddress,
    });
  } else if (action === 'reactivate') {
    db.prepare(
      `UPDATE users SET account_status = 'active', activation_status = 'activated',
       deactivation_reason = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(userId);
    db.prepare(
      `INSERT INTO entitlement_history (id, target_type, target_id, actor_email, previous_value, new_value, reason)
       VALUES (?, 'user_activation', ?, ?, ?, 'activated', ?)`
    ).run(generateId('eh'), userId, actor.email, String(user.activation_status), reason || 'إعادة تفعيل الحساب');
    writeAuditLog({
      actor,
      action: 'user.reactivated',
      entityType: 'user',
      entityId: userId,
      summary: `إعادة تفعيل حساب المستخدم ${user.full_name}.`,
      before: { account_status: user.account_status },
      after: { account_status: 'active' },
      ipAddress,
    });
  } else if (action === 'add_credit') {
    const tokens = Math.floor(Number(payload.tokens || 0));
    if (!Number.isFinite(tokens) || tokens <= 0) {
      throw new Error('يجب إدخال رصيد Tokens موجب.');
    }
    if (!reason) {
      throw new Error('يجب تسجيل سبب إضافة الرصيد أو حصة الاستخدام.');
    }
    const nextCredit = Number(user.bonus_token_credit || 0) + tokens;
    db.prepare("UPDATE users SET bonus_token_credit = ?, updated_at = datetime('now') WHERE id = ?").run(
      nextCredit,
      userId
    );
    writeAuditLog({
      actor,
      action: 'user.credit_added',
      entityType: 'user',
      entityId: userId,
      summary: `إضافة ${tokens.toLocaleString('en-US')} Token للمستخدم ${user.full_name}. السبب: ${reason}`,
      before: { bonus_token_credit: user.bonus_token_credit },
      after: { bonus_token_credit: nextCredit, reason },
      ipAddress,
    });
  } else if (action === 'change_plan') {
    const planCode = String(payload.planCode || '');
    const plan = db.prepare('SELECT id, name, code FROM plans WHERE code = ?').get(planCode) as
      | { id: string; name: string; code: string }
      | undefined;
    if (!plan) throw new Error('الباقة المختارة غير موجودة.');

    const existingSub = db
      .prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(userId) as { id: string; plan_id: string } | undefined;

    if (existingSub) {
      db.prepare(
        "UPDATE subscriptions SET plan_id = ?, status = 'active', updated_at = datetime('now') WHERE id = ?"
      ).run(plan.id, existingSub.id);
    } else {
      const ws = db.prepare('SELECT id FROM workspaces WHERE owner_user_id = ? LIMIT 1').get(userId) as
        | { id: string }
        | undefined;
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 30 * 86_400_000).toISOString();
      db.prepare(
        `INSERT INTO subscriptions (id, user_id, workspace_id, plan_id, status, billing_cycle, auto_renew, gateway, current_period_start, current_period_end)
         VALUES (?, ?, ?, ?, 'active', 'monthly', 1, 'manual', ?, ?)`
      ).run(generateId('sub'), userId, ws?.id ?? null, plan.id, now, end);
    }
    writeAuditLog({
      actor,
      action: 'user.plan_changed',
      entityType: 'user',
      entityId: userId,
      summary: `تغيير باقة المستخدم ${user.full_name} إلى "${plan.name}".`,
      before: { previousPlanId: existingSub?.plan_id ?? null },
      after: { planCode: plan.code, planName: plan.name, reason },
      ipAddress,
    });
  } else if (action === 'extend_subscription') {
    const extraDays = Math.floor(Number(payload.days || 0));
    if (!Number.isFinite(extraDays) || extraDays <= 0 || extraDays > 730) {
      throw new Error('عدد أيام التمديد يجب أن يكون بين 1 و 730 يوماً.');
    }
    const sub = db
      .prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(userId) as { id: string; current_period_end: string } | undefined;
    if (!sub) throw new Error('لا يوجد اشتراك حالي لتمديده.');
    const baseMs = Math.max(Date.now(), Date.parse(sub.current_period_end) || Date.now());
    const newEnd = new Date(baseMs + extraDays * 86_400_000).toISOString();
    db.prepare(
      "UPDATE subscriptions SET current_period_end = ?, status = 'active', updated_at = datetime('now') WHERE id = ?"
    ).run(newEnd, sub.id);
    writeAuditLog({
      actor,
      action: 'subscription.extended',
      entityType: 'subscription',
      entityId: sub.id,
      summary: `تمديد اشتراك المستخدم ${user.full_name} لمدة ${extraDays} يوماً.`,
      before: { current_period_end: sub.current_period_end },
      after: { current_period_end: newEnd, reason },
      ipAddress,
    });
  } else if (action === 'cancel_subscription') {
    const sub = db
      .prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(userId) as { id: string; status: string } | undefined;
    if (!sub) throw new Error('لا يوجد اشتراك حالي لإلغائه.');
    db.prepare(
      "UPDATE subscriptions SET status = 'cancelled', auto_renew = 0, cancelled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(sub.id);
    writeAuditLog({
      actor,
      action: 'subscription.cancelled',
      entityType: 'subscription',
      entityId: sub.id,
      summary: `إلغاء اشتراك المستخدم ${user.full_name}. السبب: ${reason || 'إلغاء إداري'}`,
      before: { status: sub.status },
      after: { status: 'cancelled', reason },
      ipAddress,
    });
  } else if (action === 'reset_settings') {
    db.prepare("UPDATE user_sessions SET status = 'revoked' WHERE user_id = ?").run(userId);
    writeAuditLog({
      actor,
      action: 'user.settings_reset',
      entityType: 'user',
      entityId: userId,
      summary: `إعادة تعيين جلسات وإعدادات الأمان للمستخدم ${user.full_name}.`,
      after: { reason },
      ipAddress,
    });
  } else if (action === 'send_notification') {
    const title = String(payload.title || '').trim();
    const body = String(payload.body || '').trim();
    if (!title || !body) throw new Error('عنوان ونص الإشعار مطلوبان.');
    const notifId = generateId('ntf');
    db.prepare(
      `INSERT INTO notifications (id, target_type, target_filter, title, body, channel, delivery_status, recipients_count, sent_count, failed_count, created_by)
       VALUES (?, 'single_user', ?, ?, ?, 'in_app', 'sent', 1, 1, 0, ?)`
    ).run(notifId, userId, title, body, actor.email);
    writeAuditLog({
      actor,
      action: 'user.notification_sent',
      entityType: 'notification',
      entityId: notifId,
      summary: `إرسال إشعار للمستخدم ${user.full_name}: "${title}".`,
      after: { userId, title },
      ipAddress,
    });
  } else if (action === 'delete') {
    db.prepare(
      "UPDATE users SET account_status = 'deleted', activation_status = 'deactivated', deleted_at = datetime('now'), deactivation_reason = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(reason || 'حذف وفق سياسة الاحتفاظ بالبيانات', userId);
    db.prepare("UPDATE user_sessions SET status = 'revoked' WHERE user_id = ?").run(userId);
    writeAuditLog({
      actor,
      action: 'user.deleted_retention',
      entityType: 'user',
      entityId: userId,
      summary: `حذف حساب المستخدم ${user.full_name} وفق سياسة الاحتفاظ بالسجلات.`,
      before: { account_status: user.account_status },
      after: { account_status: 'deleted', reason },
      ipAddress,
    });
  } else {
    throw new Error('إجراء إداري غير معروف.');
  }

  return getUserFullDetail(userId);
}

export function listWorkspaces(search?: string) {
  const db = getDb();
  const where = search?.trim() ? 'WHERE w.name LIKE ? OR w.slug LIKE ? OR u.email LIKE ?' : '';
  const params = search?.trim() ? [`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`] : [];
  return db
    .prepare(
      `SELECT w.*, u.full_name AS owner_name, u.email AS owner_email,
              (SELECT COUNT(*) FROM agents a WHERE a.workspace_id = w.id) AS agents_count,
              (SELECT COUNT(*) FROM channels c WHERE c.workspace_id = w.id) AS channels_count,
              (SELECT COUNT(*) FROM conversations cv WHERE cv.workspace_id = w.id) AS conversations_count,
              (SELECT COALESCE(SUM(e.total_tokens), 0) FROM ai_usage_events e WHERE e.workspace_id = w.id) AS tokens_used,
              (SELECT COALESCE(SUM(e.cost_usd), 0) FROM ai_usage_events e WHERE e.workspace_id = w.id) AS ai_cost_usd
       FROM workspaces w
       JOIN users u ON u.id = w.owner_user_id
       ${where}
       ORDER BY w.created_at DESC`
    )
    .all(...params);
}

export function createWorkspace(
  input: { ownerUserId: string; name: string; businessType?: string; memberCount?: number },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const user = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(input.ownerUserId) as
    | { id: string; full_name: string }
    | undefined;
  if (!user) throw new Error('المستخدم المالك غير موجود.');
  const name = input.name?.trim();
  if (!name) throw new Error('اسم مساحة العمل مطلوب.');

  const id = generateId('ws');
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ws'}-${id.slice(-6)}`;
  db.prepare(
    `INSERT INTO workspaces (id, owner_user_id, name, slug, business_type, status, member_count)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`
  ).run(id, user.id, name, slug, input.businessType?.trim() || 'general', Math.max(1, Number(input.memberCount) || 1));

  writeAuditLog({
    actor,
    action: 'workspace.created',
    entityType: 'workspace',
    entityId: id,
    summary: `إنشاء مساحة عمل جديدة "${name}" للمستخدم ${user.full_name}.`,
    after: { id, ownerUserId: user.id, name },
    ipAddress,
  });

  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
}

export function updateWorkspaceStatus(
  workspaceId: string,
  status: 'active' | 'suspended' | 'archived',
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId) as Record<string, unknown> | undefined;
  if (!ws) throw new Error('مساحة العمل غير موجودة.');
  db.prepare("UPDATE workspaces SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, workspaceId);
  writeAuditLog({
    actor,
    action: 'workspace.status_changed',
    entityType: 'workspace',
    entityId: workspaceId,
    summary: `تغيير حالة مساحة العمل "${ws.name}" إلى ${status}.`,
    before: { status: ws.status },
    after: { status },
    ipAddress,
  });
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
}
