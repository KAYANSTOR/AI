import os from 'node:os';
import { getDb, getDatabaseMetadata } from '../db/connection';
import { serializeToCsv } from '../domain/analytics';
import { generateId, hashPassword, isEncryptionKeyConfigured, sanitizeLogText } from '../security/crypto';
import { writeAuditLog, type AdminRole, type AuthenticatedAdmin } from '../security/auth';
import { getExternalIntegrationStatuses } from './overviewService';

// ---------- SYSTEM MONITORING & HEALTH ----------
export function getSystemMonitoring() {
  const db = getDb();
  const dbStart = performance.now();
  db.prepare('SELECT 1 AS ok').get();
  const dbLatencyMs = Number((performance.now() - dbStart).toFixed(2));

  const uptimeSec = Math.floor(process.uptime());
  const mem = process.memoryUsage();
  const integrations = getExternalIntegrationStatuses();

  const unresolvedErrors = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS c FROM system_logs WHERE severity IN ('error', 'critical') AND resolved = 0")
        .get() as { c: number }
    ).c
  );
  const unauthorizedAttempts = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS c FROM system_logs WHERE category = 'security_unauthorized' AND created_at >= datetime('now', '-24 hours')")
        .get() as { c: number }
    ).c
  );

  const services = [
    {
      id: 'backend_api',
      name: 'الخادم الخلفي (Owner API & Express)',
      status: 'operational',
      latencyMs: 1,
      detail: `يعمل منذ ${uptimeSec} ثانية · الذاكرة المستخدمة ${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
    },
    {
      id: 'database_engine',
      name: 'قاعدة البيانات الرئيسية',
      status: 'operational',
      latencyMs: dbLatencyMs,
      detail: `${getDatabaseMetadata().engine} · ${getDatabaseMetadata().mode}`,
    },
    {
      id: 'owner_auth_rbac',
      name: 'نظام المصادقة والصلاحيات (Super Admin RBAC)',
      status: 'operational',
      latencyMs: dbLatencyMs,
      detail: isEncryptionKeyConfigured()
        ? 'تشفير الأسرار AES-256-GCM مفعل بمفتاح البيئة.'
        : 'تشفير الأسرار يعمل بمفتاح جلسة مؤقت — أضف CREDENTIAL_ENCRYPTION_KEY للإنتاج.',
    },
    {
      id: 'ai_providers',
      name: 'خدمات الذكاء الاصطناعي (Gemini / Groq)',
      status: integrations.some((i) => i.category === 'ai' && i.configured) ? 'operational' : 'unconfigured',
      latencyMs: null,
      detail: integrations
        .filter((i) => i.category === 'ai')
        .map((i) => `${i.name}: ${i.configured ? 'مهيأ' : 'غير مربوط'}`)
        .join(' · '),
    },
    {
      id: 'messaging_channels',
      name: 'خدمة استقبال الرسائل والقنوات',
      status: integrations.some((i) => i.category === 'channel' && i.configured) ? 'operational' : 'unconfigured',
      latencyMs: null,
      detail: integrations
        .filter((i) => i.category === 'channel')
        .map((i) => `${i.envVar}: ${i.configured ? 'مهيأ' : 'ناقص'}`)
        .join(' · '),
    },
    {
      id: 'webhooks_pipeline',
      name: 'منظومة Webhooks والتكاملات',
      status: 'operational',
      latencyMs: null,
      detail: `${Number((db.prepare("SELECT COUNT(*) AS c FROM webhooks WHERE status = 'active'").get() as { c: number }).c)} Webhook نشط مسجل`,
    },
    {
      id: 'background_cron',
      name: 'مهام الخلفية والمجدولة (Cron / Outbox)',
      status: Boolean(process.env.CRON_SECRET?.trim()) ? 'operational' : 'unconfigured',
      latencyMs: null,
      detail: Boolean(process.env.CRON_SECRET?.trim())
        ? 'CRON_SECRET مهيأ لتشغيل مهام Outbox وSLA والحملات.'
        : 'متغير CRON_SECRET غير مهيأ — المهام المجدولة الخارجية متوقفة حتى الإعداد.',
    },
    {
      id: 'knowledge_storage',
      name: 'تخزين قاعدة المعرفة والفهرسة',
      status: 'operational',
      latencyMs: dbLatencyMs,
      detail: `${Number((db.prepare('SELECT COUNT(*) AS c FROM knowledge_sources').get() as { c: number }).c)} مصدر معرفة مسجل`,
    },
    {
      id: 'billing_gateways',
      name: 'بوابات الدفع والفوترة (Stripe / إيصالات)',
      status: integrations.some((i) => i.category === 'billing' && i.configured) ? 'operational' : 'unconfigured',
      latencyMs: null,
      detail: integrations
        .filter((i) => i.category === 'billing')
        .map((i) => `${i.name}: ${i.configured ? 'مهيأ' : 'غير مربوط'}`)
        .join(' · '),
    },
  ];

  const alerts = db.prepare('SELECT * FROM owner_alerts ORDER BY acknowledged ASC, created_at DESC LIMIT 50').all();
  const migrations = db.prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version ASC').all();

  return {
    runtime: {
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.arch()}`,
      uptimeSec,
      memoryMb: Number((mem.rss / 1024 / 1024).toFixed(1)),
      unresolvedErrors,
      unauthorizedAttempts24h: unauthorizedAttempts,
    },
    services,
    alerts,
    migrations,
  };
}

export function acknowledgeAlert(alertId: string, actor: AuthenticatedAdmin, ipAddress: string) {
  const db = getDb();
  db.prepare('UPDATE owner_alerts SET acknowledged = 1 WHERE id = ?').run(alertId);
  writeAuditLog({
    actor,
    action: 'alert.acknowledged',
    entityType: 'owner_alert',
    entityId: alertId,
    summary: `إقرار ومتابعة التنبيه الإداري ${alertId}.`,
    ipAddress,
  });
  return { ok: true };
}

// ---------- ERRORS & SYSTEM LOGS ----------
export function listSystemLogs(filters: { category?: string; severity?: string; resolved?: string }) {
  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.category && filters.category !== 'all') {
    where.push('category = ?');
    params.push(filters.category);
  }
  if (filters.severity && filters.severity !== 'all') {
    where.push('severity = ?');
    params.push(filters.severity);
  }
  if (filters.resolved === 'open') {
    where.push('resolved = 0');
  } else if (filters.resolved === 'resolved') {
    where.push('resolved = 1');
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM system_logs ${whereSql} ORDER BY created_at DESC LIMIT 150`)
    .all(...params);
}

export function resolveSystemLog(logId: string, actor: AuthenticatedAdmin, ipAddress: string) {
  const db = getDb();
  db.prepare('UPDATE system_logs SET resolved = 1 WHERE id = ?').run(logId);
  writeAuditLog({
    actor,
    action: 'system_log.resolved',
    entityType: 'system_log',
    entityId: logId,
    summary: `تحديد سجل الخطأ ${logId} كمحلول.`,
    ipAddress,
  });
  return { ok: true };
}

export function logSystemError(input: {
  category: 'server' | 'api' | 'database' | 'ai_provider' | 'agent' | 'automation' | 'messaging' | 'security_unauthorized';
  severity: 'info' | 'warning' | 'error' | 'critical';
  serviceName: string;
  message: string;
  details?: string;
  userId?: string;
}) {
  const db = getDb();
  db.prepare(
    `INSERT INTO system_logs (id, category, severity, service_name, message, details_sanitized, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    generateId('log'),
    input.category,
    input.severity,
    input.serviceName,
    sanitizeLogText(input.message),
    sanitizeLogText(input.details || ''),
    input.userId || null
  );
}

// ---------- NOTIFICATIONS & SUPPORT ----------
export function getNotificationsAndSupport() {
  const db = getDb();
  const notifications = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 80').all();
  const tickets = db
    .prepare(
      `SELECT t.*, u.full_name AS user_name, u.email AS user_email, w.name AS workspace_name
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN workspaces w ON w.id = t.workspace_id
       ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, t.created_at DESC`
    )
    .all();

  const activityFeed = db
    .prepare(
      `SELECT id, 'audit' AS source, action AS event_type, actor_email AS actor, summary, created_at, 'success' AS status
       FROM audit_logs
       UNION ALL
       SELECT id, 'system' AS source, category AS event_type, service_name AS actor, message AS summary, created_at, severity AS status
       FROM system_logs
       ORDER BY created_at DESC
       LIMIT 80`
    )
    .all();

  return { notifications, tickets, activityFeed };
}

export function sendNotificationBroadcast(
  input: {
    targetType: 'single_user' | 'user_group' | 'all_users' | 'plan_tier' | 'trial_users' | 'expiring_soon';
    targetFilter?: string;
    title: string;
    body: string;
    scheduledFor?: string | null;
  },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  if (!input.title?.trim() || !input.body?.trim()) {
    throw new Error('عنوان ونص الإشعار مطلوبان.');
  }

  let recipientCount = 0;
  if (input.targetType === 'single_user') {
    recipientCount = Number(
      (db.prepare('SELECT COUNT(*) AS c FROM users WHERE id = ?').get(input.targetFilter || '') as { c: number }).c
    );
  } else if (input.targetType === 'all_users') {
    recipientCount = Number(
      (db.prepare("SELECT COUNT(*) AS c FROM users WHERE account_status != 'deleted'").get() as { c: number }).c
    );
  } else if (input.targetType === 'trial_users') {
    recipientCount = Number(
      (db.prepare("SELECT COUNT(*) AS c FROM users WHERE account_status = 'trial'").get() as { c: number }).c
    );
  } else if (input.targetType === 'plan_tier') {
    recipientCount = Number(
      (
        db
          .prepare(
            `SELECT COUNT(DISTINCT s.user_id) AS c FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE p.code = ? AND s.status IN ('active','trial')`
          )
          .get(input.targetFilter || '') as { c: number }
      ).c
    );
  } else if (input.targetType === 'expiring_soon') {
    recipientCount = Number(
      (
        db
          .prepare(
            "SELECT COUNT(DISTINCT user_id) AS c FROM subscriptions WHERE status IN ('active','trial') AND current_period_end <= datetime('now', '+7 days')"
          )
          .get() as { c: number }
      ).c
    );
  } else {
    recipientCount = Number(
      (db.prepare("SELECT COUNT(*) AS c FROM users WHERE account_status = 'active'").get() as { c: number }).c
    );
  }

  const isScheduled = Boolean(input.scheduledFor && Date.parse(input.scheduledFor) > Date.now());
  const id = generateId('ntf');
  db.prepare(
    `INSERT INTO notifications (
       id, target_type, target_filter, title, body, channel, delivery_status,
       recipients_count, sent_count, failed_count, scheduled_for, created_by
     ) VALUES (?, ?, ?, ?, ?, 'in_app', ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    input.targetType,
    input.targetFilter?.trim() || '',
    input.title.trim(),
    input.body.trim(),
    isScheduled ? 'scheduled' : 'sent',
    recipientCount,
    isScheduled ? 0 : recipientCount,
    input.scheduledFor || null,
    actor.email
  );

  writeAuditLog({
    actor,
    action: 'notification.dispatched',
    entityType: 'notification',
    entityId: id,
    summary: `${isScheduled ? 'جدولة' : 'إرسال'} إشعار "${input.title.trim()}" إلى ${recipientCount} مستخدم (الفئة: ${input.targetType}).`,
    after: { targetType: input.targetType, recipientCount, isScheduled },
    ipAddress,
  });

  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
}

export function createSupportTicket(
  input: { userId?: string; workspaceId?: string; subject: string; description: string; priority?: string },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  if (!input.subject?.trim() || !input.description?.trim()) {
    throw new Error('موضوع وتفاصيل التذكرة مطلوبان.');
  }
  const id = generateId('tkt');
  const ticketNumber = `SUP-${String(Date.now()).slice(-6)}`;
  db.prepare(
    `INSERT INTO support_tickets (id, ticket_number, user_id, workspace_id, subject, description, priority, status, assigned_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`
  ).run(
    id,
    ticketNumber,
    input.userId || null,
    input.workspaceId || null,
    input.subject.trim(),
    input.description.trim(),
    input.priority || 'medium',
    actor.email
  );
  writeAuditLog({
    actor,
    action: 'support_ticket.created',
    entityType: 'support_ticket',
    entityId: id,
    summary: `فتح تذكرة دعم ${ticketNumber}: "${input.subject.trim()}".`,
    ipAddress,
  });
  return db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id);
}

export function updateTicketStatus(
  ticketId: string,
  status: 'open' | 'in_progress' | 'resolved' | 'closed',
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  db.prepare("UPDATE support_tickets SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, ticketId);
  writeAuditLog({
    actor,
    action: 'support_ticket.updated',
    entityType: 'support_ticket',
    entityId: ticketId,
    summary: `تحديث حالة تذكرة الدعم ${ticketId} إلى ${status}.`,
    ipAddress,
  });
  return db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticketId);
}

// ---------- GLOBAL ADMIN SEARCH (ALL 10 ENTITY TYPES) ----------
export function globalOwnerSearch(query: string) {
  const q = query.trim();
  if (!q) {
    return {
      users: [],
      workspaces: [],
      agents: [],
      conversations: [],
      subscriptions: [],
      invoices: [],
      usageEvents: [],
      channels: [],
      systemLogs: [],
      auditLogs: [],
    };
  }
  const db = getDb();
  const like = `%${q}%`;

  return {
    users: db
      .prepare('SELECT id, full_name, email, account_status FROM users WHERE full_name LIKE ? OR email LIKE ? OR id LIKE ? LIMIT 8')
      .all(like, like, like),
    workspaces: db
      .prepare('SELECT id, name, slug, status FROM workspaces WHERE name LIKE ? OR slug LIKE ? OR id LIKE ? LIMIT 8')
      .all(like, like, like),
    agents: db
      .prepare('SELECT id, name, model_id, status FROM agents WHERE name LIKE ? OR model_id LIKE ? OR id LIKE ? LIMIT 8')
      .all(like, like, like),
    conversations: db
      .prepare('SELECT id, customer_handle, channel_type, status FROM conversations WHERE customer_handle LIKE ? OR id LIKE ? LIMIT 8')
      .all(like, like),
    subscriptions: db
      .prepare(
        `SELECT s.id, s.status, p.name AS plan_name, u.full_name AS user_name
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id JOIN users u ON u.id = s.user_id
         WHERE s.id LIKE ? OR u.full_name LIKE ? OR p.name LIKE ? LIMIT 8`
      )
      .all(like, like, like),
    invoices: db
      .prepare(
        'SELECT id, invoice_number, amount, currency, status, provider_transaction_id FROM invoices WHERE invoice_number LIKE ? OR id LIKE ? OR COALESCE(provider_transaction_id, \'\') LIKE ? LIMIT 8'
      )
      .all(like, like, like),
    usageEvents: db
      .prepare('SELECT id, idempotency_key, model_id, total_tokens, cost_usd, status FROM ai_usage_events WHERE id LIKE ? OR idempotency_key LIKE ? OR model_id LIKE ? LIMIT 8')
      .all(like, like, like),
    channels: db
      .prepare('SELECT id, display_name, channel_type, connection_status FROM channels WHERE display_name LIKE ? OR channel_type LIKE ? OR id LIKE ? LIMIT 8')
      .all(like, like, like),
    systemLogs: db
      .prepare('SELECT id, category, severity, service_name, message FROM system_logs WHERE message LIKE ? OR service_name LIKE ? OR id LIKE ? LIMIT 8')
      .all(like, like, like),
    auditLogs: db
      .prepare('SELECT id, action, entity_type, entity_id, summary FROM audit_logs WHERE summary LIKE ? OR action LIKE ? OR entity_id LIKE ? LIMIT 8')
      .all(like, like, like),
  };
}

// ---------- REPORTS & EXPORT ----------
export function buildReport(reportType: string) {
  const db = getDb();
  switch (reportType) {
    case 'users': {
      const rows = db
        .prepare(
          `SELECT id, full_name, email, phone, account_status, activation_status, payment_status, created_at
           FROM users WHERE account_status != 'deleted' ORDER BY created_at DESC`
        )
        .all() as Record<string, unknown>[];
      const headers = [
        { key: 'id', label: 'المعرّف' },
        { key: 'full_name', label: 'الاسم' },
        { key: 'email', label: 'البريد الإلكتروني' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'account_status', label: 'حالة الحساب' },
        { key: 'activation_status', label: 'التفعيل' },
        { key: 'payment_status', label: 'الدفع' },
        { key: 'created_at', label: 'تاريخ التسجيل' },
      ];
      return { title: 'تقرير المستخدمين', headers, rows, csv: serializeToCsv(headers, rows) };
    }
    case 'subscriptions': {
      const rows = db
        .prepare(
          `SELECT s.id, u.full_name, u.email, p.name AS plan_name, s.status, s.billing_cycle, s.gateway, s.current_period_end
           FROM subscriptions s JOIN users u ON u.id = s.user_id JOIN plans p ON p.id = s.plan_id
           ORDER BY s.created_at DESC`
        )
        .all() as Record<string, unknown>[];
      const headers = [
        { key: 'id', label: 'معرف الاشتراك' },
        { key: 'full_name', label: 'المستخدم' },
        { key: 'email', label: 'البريد' },
        { key: 'plan_name', label: 'الباقة' },
        { key: 'status', label: 'الحالة' },
        { key: 'billing_cycle', label: 'دورة الفوترة' },
        { key: 'gateway', label: 'البوابة' },
        { key: 'current_period_end', label: 'نهاية الفترة' },
      ];
      return { title: 'تقرير الاشتراكات', headers, rows, csv: serializeToCsv(headers, rows) };
    }
    case 'revenue':
    case 'invoices': {
      const rows = db
        .prepare(
          `SELECT i.invoice_number, u.full_name, p.name AS plan_name, i.amount, i.currency, i.status, i.revenue_classification, i.gateway, i.paid_at, i.created_at
           FROM invoices i JOIN users u ON u.id = i.user_id LEFT JOIN plans p ON p.id = i.plan_id
           ORDER BY i.created_at DESC`
        )
        .all() as Record<string, unknown>[];
      const headers = [
        { key: 'invoice_number', label: 'رقم الفاتورة' },
        { key: 'full_name', label: 'المستخدم' },
        { key: 'plan_name', label: 'الباقة' },
        { key: 'amount', label: 'المبلغ' },
        { key: 'currency', label: 'العملة' },
        { key: 'status', label: 'الحالة' },
        { key: 'revenue_classification', label: 'تصنيف الإيراد' },
        { key: 'gateway', label: 'البوابة' },
        { key: 'paid_at', label: 'تاريخ الدفع' },
      ];
      return {
        title: reportType === 'revenue' ? 'تقرير الإيرادات الفعلية' : 'تقرير الفواتير',
        headers,
        rows,
        csv: serializeToCsv(headers, rows),
      };
    }
    case 'ai_usage':
    case 'model_costs': {
      const rows = db
        .prepare(
          `SELECT e.id, e.provider_code, e.model_id, e.operation_type, e.input_tokens, e.output_tokens, e.cached_tokens,
                  e.total_tokens, e.cost_usd, e.cost_type, e.pricing_version, e.latency_ms, e.status, e.created_at
           FROM ai_usage_events e ORDER BY e.created_at DESC LIMIT 500`
        )
        .all() as Record<string, unknown>[];
      const headers = [
        { key: 'id', label: 'الحدث' },
        { key: 'provider_code', label: 'المزود' },
        { key: 'model_id', label: 'النموذج' },
        { key: 'input_tokens', label: 'Tokens الإدخال' },
        { key: 'output_tokens', label: 'Tokens الإخراج' },
        { key: 'cached_tokens', label: 'Tokens مخزنة' },
        { key: 'cost_usd', label: 'التكلفة ($)' },
        { key: 'cost_type', label: 'نوع التكلفة' },
        { key: 'pricing_version', label: 'إصدار التسعير' },
        { key: 'status', label: 'الحالة' },
        { key: 'created_at', label: 'الوقت' },
      ];
      return {
        title: reportType === 'model_costs' ? 'تقرير تكلفة النماذج' : 'تقرير استهلاك الذكاء الاصطناعي',
        headers,
        rows,
        csv: serializeToCsv(headers, rows),
      };
    }
    case 'agents': {
      const rows = db
        .prepare(
          `SELECT a.id, a.name, a.agent_type, a.provider_code, a.model_id, a.status,
                  (SELECT COUNT(*) FROM ai_usage_events e WHERE e.agent_id = a.id) AS runs,
                  (SELECT COALESCE(SUM(e.total_tokens), 0) FROM ai_usage_events e WHERE e.agent_id = a.id) AS tokens,
                  (SELECT COALESCE(SUM(e.cost_usd), 0) FROM ai_usage_events e WHERE e.agent_id = a.id) AS cost_usd
           FROM agents a ORDER BY a.created_at DESC`
        )
        .all() as Record<string, unknown>[];
      const headers = [
        { key: 'id', label: 'معرف الوكيل' },
        { key: 'name', label: 'الاسم' },
        { key: 'agent_type', label: 'النوع' },
        { key: 'provider_code', label: 'المزود' },
        { key: 'model_id', label: 'النموذج' },
        { key: 'status', label: 'الحالة' },
        { key: 'runs', label: 'التنفيذات' },
        { key: 'tokens', label: 'Tokens' },
        { key: 'cost_usd', label: 'التكلفة ($)' },
      ];
      return { title: 'تقرير أداء الوكلاء الذكيين', headers, rows, csv: serializeToCsv(headers, rows) };
    }
    case 'channels': {
      const rows = db
        .prepare(
          `SELECT id, display_name, channel_type, connection_status, webhook_status, messages_received, messages_sent, error_count
           FROM channels ORDER BY created_at DESC`
        )
        .all() as Record<string, unknown>[];
      const headers = [
        { key: 'id', label: 'المعرف' },
        { key: 'display_name', label: 'القناة' },
        { key: 'channel_type', label: 'النوع' },
        { key: 'connection_status', label: 'الربط' },
        { key: 'webhook_status', label: 'Webhook' },
        { key: 'messages_received', label: 'مستلمة' },
        { key: 'messages_sent', label: 'مرسلة' },
        { key: 'error_count', label: 'الأخطاء' },
      ];
      return { title: 'تقرير استخدام القنوات', headers, rows, csv: serializeToCsv(headers, rows) };
    }
    case 'errors': {
      const rows = db
        .prepare(
          'SELECT id, category, severity, service_name, message, occurrence_count, resolved, created_at FROM system_logs ORDER BY created_at DESC LIMIT 300'
        )
        .all() as Record<string, unknown>[];
      const headers = [
        { key: 'id', label: 'المعرف' },
        { key: 'category', label: 'التصنيف' },
        { key: 'severity', label: 'الخطورة' },
        { key: 'service_name', label: 'الخدمة' },
        { key: 'message', label: 'الرسالة' },
        { key: 'resolved', label: 'محلول' },
        { key: 'created_at', label: 'الوقت' },
      ];
      return { title: 'تقرير الأخطاء والسجلات', headers, rows, csv: serializeToCsv(headers, rows) };
    }
    default: {
      const rows = db
        .prepare(
          'SELECT id, actor_email, actor_role, action, entity_type, entity_id, summary, ip_address, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 300'
        )
        .all() as Record<string, unknown>[];
      const headers = [
        { key: 'id', label: 'المعرف' },
        { key: 'actor_email', label: 'المنفذ' },
        { key: 'action', label: 'الإجراء' },
        { key: 'entity_type', label: 'الكيان' },
        { key: 'summary', label: 'الملخص' },
        { key: 'ip_address', label: 'IP' },
        { key: 'created_at', label: 'الوقت' },
      ];
      return { title: 'تقرير نشاط المنصة وسجل التدقيق', headers, rows, csv: serializeToCsv(headers, rows) };
    }
  }
}

// ---------- AUDIT LOGS ----------
export function listAuditLogs(filters: { action?: string; entityType?: string; search?: string; page?: number; pageSize?: number }) {
  const db = getDb();
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(filters.pageSize) || 30));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.action && filters.action !== 'all') {
    where.push('action LIKE ?');
    params.push(`${filters.action}%`);
  }
  if (filters.entityType && filters.entityType !== 'all') {
    where.push('entity_type = ?');
    params.push(filters.entityType);
  }
  if (filters.search?.trim()) {
    const like = `%${filters.search.trim()}%`;
    where.push('(summary LIKE ? OR actor_email LIKE ? OR entity_id LIKE ? OR action LIKE ?)');
    params.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS c FROM audit_logs ${whereSql}`).get(...params) as { c: number }).c
  );
  const items = db
    .prepare(`SELECT * FROM audit_logs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);

  return {
    items,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

// ---------- PLATFORM SETTINGS & OWNER SECURITY ----------
export function listPlatformSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM platform_settings ORDER BY category, key').all() as Array<{
    key: string;
    category: string;
    value_json: string;
    description: string;
    updated_by: string;
    updated_at: string;
  }>;
  return rows.map((r) => ({ ...r, value: JSON.parse(r.value_json) }));
}

export function updatePlatformSetting(
  key: string,
  value: unknown,
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM platform_settings WHERE key = ?').get(key) as
    | { key: string; value_json: string; category: string }
    | undefined;
  if (!existing) throw new Error('الإعداد غير موجود.');

  const serialized = JSON.stringify(value);
  db.prepare(
    "UPDATE platform_settings SET value_json = ?, updated_by = ?, updated_at = datetime('now') WHERE key = ?"
  ).run(serialized, actor.email, key);

  writeAuditLog({
    actor,
    action: 'platform_setting.updated',
    entityType: 'platform_setting',
    entityId: key,
    summary: `تعديل إعداد المنصة "${key}".`,
    before: JSON.parse(existing.value_json),
    after: value,
    ipAddress,
  });

  return { key, value };
}

export function getOwnerSecurityCenter(currentAdmin: AuthenticatedAdmin) {
  const db = getDb();
  const sessions = db
    .prepare(
      `SELECT s.id, s.ip_address, s.user_agent, s.mfa_verified, s.expires_at, s.revoked_at, s.created_at,
              a.email, a.role
       FROM owner_sessions s
       JOIN platform_admins a ON a.id = s.admin_id
       ORDER BY s.created_at DESC LIMIT 30`
    )
    .all();

  const loginAttempts = db
    .prepare('SELECT * FROM admin_login_attempts ORDER BY created_at DESC LIMIT 30')
    .all();

  const admins = db
    .prepare(
      'SELECT id, email, full_name, role, mfa_enabled, status, last_login_at, created_at FROM platform_admins ORDER BY created_at ASC'
    )
    .all();

  return {
    currentAdmin,
    sessions,
    loginAttempts,
    admins,
    encryptionKeyConfigured: isEncryptionKeyConfigured(),
  };
}

export function revokeOwnerSession(sessionId: string, actor: AuthenticatedAdmin, ipAddress: string) {
  const db = getDb();
  db.prepare("UPDATE owner_sessions SET revoked_at = datetime('now') WHERE id = ?").run(sessionId);
  writeAuditLog({
    actor,
    action: 'owner_session.revoked',
    entityType: 'owner_session',
    entityId: sessionId,
    summary: `إبطال الجلسة الإدارية ${sessionId}.`,
    ipAddress,
  });
  return { ok: true };
}

export function addInternalAdmin(
  input: { email: string; fullName: string; role: AdminRole; password: string },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  if (actor.role !== 'platform_owner') {
    throw new Error('إضافة مديرين داخليين محصورة بحساب مالك المنصة فقط.');
  }
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new Error('البريد الإلكتروني غير صالح.');
  if (!input.fullName?.trim()) throw new Error('الاسم مطلوب.');
  if (!input.password || input.password.length < 10) throw new Error('كلمة المرور يجب ألا تقل عن 10 أحرف.');

  const existing = db.prepare('SELECT id FROM platform_admins WHERE email = ?').get(email);
  if (existing) throw new Error('يوجد مدير مسجل بهذا البريد الإلكتروني.');

  const perms =
    input.role === 'platform_owner'
      ? ['*']
      : input.role === 'super_admin'
        ? ['users:write', 'billing:write', 'ai:write', 'ops:write']
        : ['audit:read', 'monitoring:read'];
  const id = generateId('adm');

  db.prepare(
    `INSERT INTO platform_admins (id, email, full_name, role, password_hash, permissions_json, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`
  ).run(id, email, input.fullName.trim(), input.role, hashPassword(input.password), JSON.stringify(perms));

  writeAuditLog({
    actor,
    action: 'platform_admin.added',
    entityType: 'platform_admin',
    entityId: id,
    summary: `إضافة مدير داخلي "${input.fullName.trim()}" (${email}) بصلاحية ${input.role}.`,
    after: { email, role: input.role },
    ipAddress,
  });

  return { id, email, role: input.role };
}
