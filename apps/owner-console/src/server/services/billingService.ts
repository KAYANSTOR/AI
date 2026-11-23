import { getDb } from '../db/connection';
import { generateId } from '../security/crypto';
import { writeAuditLog, type AuthenticatedAdmin } from '../security/auth';

export function listPlans() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM subscriptions s WHERE s.plan_id = p.id AND s.status IN ('active', 'trial')) AS active_subscribers
       FROM plans p
       ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, p.price_monthly ASC`
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    ...r,
    allowed_models: JSON.parse(String(r.allowed_models_json || '[]')),
    allowed_channels: JSON.parse(String(r.allowed_channels_json || '[]')),
    allowed_tools: JSON.parse(String(r.allowed_tools_json || '[]')),
    enabled_features: JSON.parse(String(r.enabled_features_json || '[]')),
    blocked_features: JSON.parse(String(r.blocked_features_json || '[]')),
  }));
}

export function savePlan(
  input: {
    id?: string;
    code: string;
    name: string;
    nameEn?: string;
    description?: string;
    priceMonthly: number;
    priceYearly: number;
    currency?: string;
    billingCycle?: 'monthly' | 'yearly' | 'custom';
    trialDays?: number;
    maxUsers?: number;
    maxAgents?: number;
    maxMessages?: number;
    tokenQuota?: number;
    maxChannels?: number;
    voiceMinutes?: number;
    automationRuns?: number;
    campaignSends?: number;
    storageMb?: number;
    allowedModels?: string[];
    allowedChannels?: string[];
    allowedTools?: string[];
    enabledFeatures?: string[];
    blockedFeatures?: string[];
    status?: 'active' | 'archived' | 'draft';
  },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const code = input.code?.trim().toLowerCase();
  const name = input.name?.trim();
  if (!code || !name) throw new Error('رمز الباقة واسمها مطلوبان.');

  const priceMonthly = Number(input.priceMonthly);
  const priceYearly = Number(input.priceYearly);
  if (!Number.isFinite(priceMonthly) || priceMonthly < 0 || !Number.isFinite(priceYearly) || priceYearly < 0) {
    throw new Error('أسعار الباقة يجب أن تكون أرقاماً غير سالبة.');
  }

  if (input.id) {
    const before = db.prepare('SELECT * FROM plans WHERE id = ?').get(input.id) as Record<string, unknown> | undefined;
    if (!before) throw new Error('الباقة غير موجودة.');

    db.prepare(
      `UPDATE plans SET
         name = ?, name_en = ?, description = ?, price_monthly = ?, price_yearly = ?, currency = ?,
         billing_cycle = ?, trial_days = ?, max_users = ?, max_agents = ?, max_messages = ?,
         token_quota = ?, max_channels = ?, voice_minutes = ?, automation_runs = ?, campaign_sends = ?,
         storage_mb = ?, allowed_models_json = ?, allowed_channels_json = ?, allowed_tools_json = ?,
         enabled_features_json = ?, blocked_features_json = ?, status = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      name,
      input.nameEn?.trim() || name,
      input.description?.trim() || '',
      priceMonthly,
      priceYearly,
      input.currency || 'USD',
      input.billingCycle || 'monthly',
      Math.max(0, Number(input.trialDays ?? before.trial_days)),
      Math.max(0, Number(input.maxUsers ?? before.max_users)),
      Math.max(0, Number(input.maxAgents ?? before.max_agents)),
      Math.max(0, Number(input.maxMessages ?? before.max_messages)),
      Math.max(0, Number(input.tokenQuota ?? before.token_quota)),
      Math.max(0, Number(input.maxChannels ?? before.max_channels)),
      Math.max(0, Number(input.voiceMinutes ?? before.voice_minutes)),
      Math.max(0, Number(input.automationRuns ?? before.automation_runs)),
      Math.max(0, Number(input.campaignSends ?? before.campaign_sends)),
      Math.max(0, Number(input.storageMb ?? before.storage_mb)),
      JSON.stringify(input.allowedModels ?? JSON.parse(String(before.allowed_models_json))),
      JSON.stringify(input.allowedChannels ?? JSON.parse(String(before.allowed_channels_json))),
      JSON.stringify(input.allowedTools ?? JSON.parse(String(before.allowed_tools_json))),
      JSON.stringify(input.enabledFeatures ?? JSON.parse(String(before.enabled_features_json))),
      JSON.stringify(input.blockedFeatures ?? JSON.parse(String(before.blocked_features_json))),
      input.status || String(before.status),
      input.id
    );

    writeAuditLog({
      actor,
      action: 'plan.updated',
      entityType: 'plan',
      entityId: input.id,
      summary: `تحديث إعدادات وسعر الباقة "${name}" ($${priceMonthly}/شهرياً).`,
      before: {
        price_monthly: before.price_monthly,
        price_yearly: before.price_yearly,
        status: before.status,
      },
      after: { price_monthly: priceMonthly, price_yearly: priceYearly, status: input.status || before.status },
      ipAddress,
    });
    return db.prepare('SELECT * FROM plans WHERE id = ?').get(input.id);
  }

  const existingCode = db.prepare('SELECT id FROM plans WHERE code = ?').get(code);
  if (existingCode) throw new Error('يوجد باقة بنفس الرمز البرمجي.');

  const id = generateId('plan');
  db.prepare(
    `INSERT INTO plans (
       id, code, name, name_en, description, price_monthly, price_yearly, currency, billing_cycle,
       trial_days, max_users, max_agents, max_messages, token_quota, max_channels, voice_minutes,
       automation_runs, campaign_sends, storage_mb, allowed_models_json, allowed_channels_json,
       allowed_tools_json, enabled_features_json, blocked_features_json, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    code,
    name,
    input.nameEn?.trim() || name,
    input.description?.trim() || '',
    priceMonthly,
    priceYearly,
    input.currency || 'USD',
    input.billingCycle || 'monthly',
    Math.max(0, Number(input.trialDays ?? 7)),
    Math.max(1, Number(input.maxUsers ?? 5)),
    Math.max(1, Number(input.maxAgents ?? 2)),
    Math.max(0, Number(input.maxMessages ?? 1000)),
    Math.max(0, Number(input.tokenQuota ?? 1000000)),
    Math.max(1, Number(input.maxChannels ?? 2)),
    Math.max(0, Number(input.voiceMinutes ?? 100)),
    Math.max(0, Number(input.automationRuns ?? 200)),
    Math.max(0, Number(input.campaignSends ?? 500)),
    Math.max(50, Number(input.storageMb ?? 500)),
    JSON.stringify(input.allowedModels ?? ['gemini-2.5-flash']),
    JSON.stringify(input.allowedChannels ?? ['whatsapp', 'webchat']),
    JSON.stringify(input.allowedTools ?? ['knowledge_search']),
    JSON.stringify(input.enabledFeatures ?? ['whatsapp_cloud_api']),
    JSON.stringify(input.blockedFeatures ?? []),
    input.status || 'active'
  );

  writeAuditLog({
    actor,
    action: 'plan.created',
    entityType: 'plan',
    entityId: id,
    summary: `إنشاء باقة جديدة "${name}" (${code}) بسعر $${priceMonthly}/شهر.`,
    after: { id, code, name, priceMonthly, priceYearly },
    ipAddress,
  });

  return db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
}

export function listSubscriptions(status?: string) {
  const db = getDb();
  const where = status && status !== 'all' ? 'WHERE s.status = ?' : '';
  const params = status && status !== 'all' ? [status] : [];

  const items = db
    .prepare(
      `SELECT s.*, u.full_name AS user_name, u.email AS user_email,
              p.name AS plan_name, p.code AS plan_code, p.price_monthly, p.price_yearly, p.currency
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       JOIN plans p ON p.id = s.plan_id
       ${where}
       ORDER BY s.created_at DESC`
    )
    .all(...params);

  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'trial' THEN 1 ELSE 0 END) AS trial,
         SUM(CASE WHEN status = 'past_due' THEN 1 ELSE 0 END) AS past_due,
         SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
       FROM subscriptions`
    )
    .get();

  return { items, summary };
}

export function updateSubscriptionAction(
  subId: string,
  action: 'extend' | 'change_plan' | 'toggle_renew' | 'cancel' | 'reactivate',
  payload: Record<string, unknown>,
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId) as Record<string, unknown> | undefined;
  if (!sub) throw new Error('الاشتراك غير موجود.');

  if (action === 'extend') {
    const days = Math.max(1, Math.min(730, Math.floor(Number(payload.days || 30))));
    const base = Math.max(Date.now(), Date.parse(String(sub.current_period_end)) || Date.now());
    const nextEnd = new Date(base + days * 86_400_000).toISOString();
    db.prepare(
      "UPDATE subscriptions SET current_period_end = ?, status = 'active', updated_at = datetime('now') WHERE id = ?"
    ).run(nextEnd, subId);
    writeAuditLog({
      actor,
      action: 'subscription.extended',
      entityType: 'subscription',
      entityId: subId,
      summary: `تمديد الاشتراك لمدة ${days} يوماً.`,
      before: { current_period_end: sub.current_period_end },
      after: { current_period_end: nextEnd },
      ipAddress,
    });
  } else if (action === 'change_plan') {
    const planCode = String(payload.planCode || '');
    const plan = db.prepare('SELECT id, name FROM plans WHERE code = ?').get(planCode) as
      | { id: string; name: string }
      | undefined;
    if (!plan) throw new Error('الباقة المطلوبة غير موجودة.');
    db.prepare("UPDATE subscriptions SET plan_id = ?, updated_at = datetime('now') WHERE id = ?").run(plan.id, subId);
    writeAuditLog({
      actor,
      action: 'subscription.plan_changed',
      entityType: 'subscription',
      entityId: subId,
      summary: `تغيير باقة الاشتراك إلى "${plan.name}".`,
      before: { plan_id: sub.plan_id },
      after: { plan_id: plan.id },
      ipAddress,
    });
  } else if (action === 'toggle_renew') {
    const nextRenew = Number(sub.auto_renew) === 1 ? 0 : 1;
    db.prepare("UPDATE subscriptions SET auto_renew = ?, updated_at = datetime('now') WHERE id = ?").run(
      nextRenew,
      subId
    );
    writeAuditLog({
      actor,
      action: 'subscription.auto_renew_toggled',
      entityType: 'subscription',
      entityId: subId,
      summary: nextRenew === 1 ? 'تفعيل التجديد التلقائي للاشتراك.' : 'إيقاف التجديد التلقائي للاشتراك.',
      before: { auto_renew: sub.auto_renew },
      after: { auto_renew: nextRenew },
      ipAddress,
    });
  } else if (action === 'cancel') {
    db.prepare(
      "UPDATE subscriptions SET status = 'cancelled', auto_renew = 0, cancelled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(subId);
    writeAuditLog({
      actor,
      action: 'subscription.cancelled',
      entityType: 'subscription',
      entityId: subId,
      summary: 'إلغاء الاشتراك من لوحة المالك.',
      before: { status: sub.status },
      after: { status: 'cancelled' },
      ipAddress,
    });
  } else if (action === 'reactivate') {
    db.prepare(
      "UPDATE subscriptions SET status = 'active', cancelled_at = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(subId);
    writeAuditLog({
      actor,
      action: 'subscription.reactivated',
      entityType: 'subscription',
      entityId: subId,
      summary: 'إعادة تفعيل الاشتراك.',
      before: { status: sub.status },
      after: { status: 'active' },
      ipAddress,
    });
  }

  return db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId);
}

export function getBillingLedger() {
  const db = getDb();
  const invoices = db
    .prepare(
      `SELECT i.*, u.full_name AS user_name, u.email AS user_email, p.name AS plan_name
       FROM invoices i
       JOIN users u ON u.id = i.user_id
       LEFT JOIN plans p ON p.id = i.plan_id
       ORDER BY i.created_at DESC`
    )
    .all();

  const expenses = db.prepare('SELECT * FROM operating_expenses ORDER BY incurred_at DESC').all();

  // Strict financial separation: Collected vs Unpaid vs Estimated MRR vs Refunded
  const collectedRevenueUsd = Number(
    (
      db
        .prepare(
          "SELECT COALESCE(SUM(amount), 0) AS s FROM invoices WHERE status = 'paid' AND revenue_classification = 'collected'"
        )
        .get() as { s: number }
    ).s.toFixed(2)
  );
  const unpaidInvoicesUsd = Number(
    (
      db
        .prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM invoices WHERE status IN ('unpaid', 'failed')")
        .get() as { s: number }
    ).s.toFixed(2)
  );
  const refundedUsd = Number(
    (
      db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM invoices WHERE status = 'refunded'").get() as { s: number }
    ).s.toFixed(2)
  );
  const estimatedMrrUsd = Number(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN s.billing_cycle = 'yearly' THEN p.price_yearly / 12.0 ELSE p.price_monthly END), 0) AS s
           FROM subscriptions s
           JOIN plans p ON p.id = s.plan_id
           WHERE s.status = 'active'`
        )
        .get() as { s: number }
    ).s.toFixed(2)
  );
  const recordedExpensesUsd = Number(
    (db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM operating_expenses').get() as { s: number }).s.toFixed(2)
  );

  const gateways = [
    {
      code: 'stripe',
      name: 'Stripe',
      configured: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
      webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
      supportsRefund: true,
    },
    {
      code: 'esaalat',
      name: 'إيصالات / المحافظ اليمنية',
      configured: Boolean(process.env.ESAALAT_API_KEY?.trim()),
      webhookConfigured: Boolean(process.env.ESAALAT_WEBHOOK_SECRET?.trim()),
      supportsRefund: false,
    },
  ];

  return {
    invoices,
    expenses,
    gateways,
    summary: {
      collectedRevenueUsd,
      unpaidInvoicesUsd,
      refundedUsd,
      estimatedMrrUsd,
      recordedExpensesUsd,
    },
  };
}

export function createInvoice(
  input: {
    userId: string;
    planCode?: string;
    amount: number;
    currency?: string;
    status: 'paid' | 'unpaid' | 'failed';
    paymentMethod?: string;
    gateway?: 'stripe' | 'esaalat' | 'manual';
    providerTransactionId?: string;
  },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const user = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(input.userId) as
    | { id: string; full_name: string }
    | undefined;
  if (!user) throw new Error('المستخدم غير موجود.');

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('مبلغ الفاتورة غير صالح.');

  const plan = input.planCode
    ? (db.prepare('SELECT id FROM plans WHERE code = ?').get(input.planCode) as { id: string } | undefined)
    : undefined;

  const id = generateId('inv');
  const invoiceNumber = `KYN-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-6)}`;
  const revenueClassification = input.status === 'paid' ? 'collected' : 'unpaid';
  const paidAt = input.status === 'paid' ? new Date().toISOString() : null;

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO invoices (
         id, invoice_number, user_id, plan_id, amount, currency, status, revenue_classification,
         payment_method, gateway, provider_transaction_id, paid_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      invoiceNumber,
      user.id,
      plan?.id ?? null,
      amount,
      input.currency || 'USD',
      input.status,
      revenueClassification,
      input.paymentMethod || 'تحويل / يدوي',
      input.gateway || 'manual',
      input.providerTransactionId?.trim() || null,
      paidAt
    );

    if (input.status === 'paid' || input.status === 'failed') {
      db.prepare(
        `INSERT INTO payments (id, invoice_id, user_id, amount, currency, gateway, status, provider_reference)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        generateId('pay'),
        id,
        user.id,
        amount,
        input.currency || 'USD',
        input.gateway || 'manual',
        input.status === 'paid' ? 'succeeded' : 'failed',
        input.providerTransactionId?.trim() || null
      );
      db.prepare("UPDATE users SET payment_status = ?, updated_at = datetime('now') WHERE id = ?").run(
        input.status === 'paid' ? 'paid' : 'past_due',
        user.id
      );
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  writeAuditLog({
    actor,
    action: 'invoice.created',
    entityType: 'invoice',
    entityId: id,
    summary: `تسجيل فاتورة ${invoiceNumber} للمستخدم ${user.full_name} بمبلغ ${amount} ${input.currency || 'USD'} (${input.status}).`,
    after: { invoiceNumber, amount, status: input.status, gateway: input.gateway || 'manual' },
    ipAddress,
  });

  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
}

export function refundInvoice(invoiceId: string, reason: string, actor: AuthenticatedAdmin, ipAddress: string) {
  const db = getDb();
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as Record<string, unknown> | undefined;
  if (!inv) throw new Error('الفاتورة غير موجودة.');
  if (inv.status !== 'paid') throw new Error('يمكن تسجيل الاسترداد للفواتير المدفوعة فقط.');

  db.prepare(
    "UPDATE invoices SET status = 'refunded', revenue_classification = 'refunded' WHERE id = ?"
  ).run(invoiceId);
  db.prepare(
    `INSERT INTO payments (id, invoice_id, user_id, amount, currency, gateway, status, failure_reason)
     VALUES (?, ?, ?, ?, ?, ?, 'refunded', ?)`
  ).run(
    generateId('pay'),
    invoiceId,
    String(inv.user_id),
    Number(inv.amount),
    String(inv.currency || 'USD'),
    String(inv.gateway || 'manual'),
    reason || 'استرداد إداري'
  );

  writeAuditLog({
    actor,
    action: 'invoice.refunded',
    entityType: 'invoice',
    entityId: invoiceId,
    summary: `تسجيل استرداد للفاتورة ${inv.invoice_number}. السبب: ${reason || 'قرار إداري'}`,
    before: { status: inv.status },
    after: { status: 'refunded', reason },
    ipAddress,
  });

  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
}

export function recordOperatingExpense(
  input: { category: string; vendor: string; description?: string; amount: number; currency?: string; incurredAt?: string },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const amount = Number(input.amount);
  if (!input.category?.trim() || !input.vendor?.trim()) throw new Error('الفئة والمورد مطلوبان.');
  if (!Number.isFinite(amount) || amount < 0) throw new Error('مبلغ المصروف غير صالح.');

  const id = generateId('exp');
  db.prepare(
    `INSERT INTO operating_expenses (id, category, vendor, description, amount, currency, incurred_at, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.category.trim(),
    input.vendor.trim(),
    input.description?.trim() || '',
    amount,
    input.currency || 'USD',
    input.incurredAt || new Date().toISOString(),
    actor.email
  );

  writeAuditLog({
    actor,
    action: 'expense.recorded',
    entityType: 'operating_expense',
    entityId: id,
    summary: `تسجيل مصروف تشغيلي (${input.vendor}) بقيمة ${amount} ${input.currency || 'USD'}.`,
    after: input,
    ipAddress,
  });

  return db.prepare('SELECT * FROM operating_expenses WHERE id = ?').get(id);
}
