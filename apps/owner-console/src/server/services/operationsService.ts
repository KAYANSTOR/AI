import crypto from 'node:crypto';
import { getDb } from '../db/connection';
import { encryptSecret, generateId, maskSecret, sha256Hex } from '../security/crypto';
import { writeAuditLog, type AuthenticatedAdmin } from '../security/auth';

// ---------- CONVERSATIONS & MESSAGES ----------
export function listConversations(filters: {
  search?: string;
  status?: string;
  channelType?: string;
  agentId?: string;
  userId?: string;
}) {
  const db = getDb();
  const where: string[] = [];
  const params: string[] = [];
  if (filters.status && filters.status !== 'all') {
    where.push('c.status = ?');
    params.push(filters.status);
  }
  if (filters.channelType && filters.channelType !== 'all') {
    where.push('c.channel_type = ?');
    params.push(filters.channelType);
  }
  if (filters.agentId) {
    where.push('c.agent_id = ?');
    params.push(filters.agentId);
  }
  if (filters.userId) {
    where.push('c.user_id = ?');
    params.push(filters.userId);
  }
  if (filters.search?.trim()) {
    const like = `%${filters.search.trim()}%`;
    where.push('(c.customer_handle LIKE ? OR u.full_name LIKE ? OR c.id LIKE ?)');
    params.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const items = db
    .prepare(
      `SELECT c.*, u.full_name AS user_name, w.name AS workspace_name, a.name AS agent_name
       FROM conversations c
       JOIN users u ON u.id = c.user_id
       JOIN workspaces w ON w.id = c.workspace_id
       LEFT JOIN agents a ON a.id = c.agent_id
       ${whereSql}
       ORDER BY c.last_message_at DESC
       LIMIT 100`
    )
    .all(...params);

  const summary = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
              SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed,
              SUM(CASE WHEN status = 'needs_human' THEN 1 ELSE 0 END) AS needs_human,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN handled_by = 'agent' THEN 1 ELSE 0 END) AS agent_handled,
              COALESCE(SUM(message_count), 0) AS total_messages,
              COALESCE(AVG(avg_response_ms), 0) AS avg_response_ms
       FROM conversations`
    )
    .get();

  return { items, summary };
}

export function getConversationMessages(conversationId: string) {
  const db = getDb();
  const conversation = db
    .prepare(
      `SELECT c.*, u.full_name AS user_name, w.name AS workspace_name, a.name AS agent_name
       FROM conversations c
       JOIN users u ON u.id = c.user_id
       JOIN workspaces w ON w.id = c.workspace_id
       LEFT JOIN agents a ON a.id = c.agent_id
       WHERE c.id = ?`
    )
    .get(conversationId);
  if (!conversation) return null;
  const messages = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId);
  return { conversation, messages };
}

export function createConversationRecord(
  input: {
    userId: string;
    workspaceId: string;
    agentId?: string;
    channelType: string;
    customerHandle: string;
    initialMessage: string;
    status?: 'new' | 'active' | 'needs_human' | 'closed' | 'failed';
  },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  if (!input.customerHandle?.trim() || !input.initialMessage?.trim()) {
    throw new Error('معرّف العميل ونص الرسالة مطلوبان.');
  }
  const convId = generateId('cnv');
  const msgId = generateId('msg');
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO conversations (id, user_id, workspace_id, agent_id, channel_type, customer_handle, status, handled_by, message_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'agent', 1)`
    ).run(
      convId,
      input.userId,
      input.workspaceId,
      input.agentId || null,
      input.channelType || 'whatsapp',
      input.customerHandle.trim(),
      input.status || 'active'
    );
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, content, status)
       VALUES (?, ?, 'customer', ?, 'delivered')`
    ).run(msgId, convId, input.initialMessage.trim());
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  writeAuditLog({
    actor,
    action: 'conversation.logged',
    entityType: 'conversation',
    entityId: convId,
    summary: `تسجيل محادثة جديدة عبر ${input.channelType} للعميل ${input.customerHandle}.`,
    ipAddress,
  });
  return getConversationMessages(convId);
}

export function sendAuditedConversationIntervention(
  conversationId: string,
  content: string,
  reason: string,
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as
    | Record<string, unknown>
    | undefined;
  if (!conv) throw new Error('المحادثة غير موجودة.');
  if (!content?.trim()) throw new Error('نص الرسالة مطلوب.');
  if (!reason?.trim() || reason.trim().length < 5) {
    throw new Error('يجب إدخال سبب واضح للتدخل الإداري في محادثة العميل (5 أحرف على الأقل).');
  }

  const msgId = generateId('msg');
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, content, status)
       VALUES (?, ?, 'owner_audited', ?, 'delivered')`
    ).run(msgId, conversationId, content.trim());
    db.prepare(
      `UPDATE conversations
       SET message_count = message_count + 1, handled_by = 'mixed', last_message_at = datetime('now')
       WHERE id = ?`
    ).run(conversationId);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  writeAuditLog({
    actor,
    action: 'conversation.owner_intervention',
    entityType: 'conversation',
    entityId: conversationId,
    summary: `تدخل إداري مسجل في المحادثة ${conversationId}. السبب: ${reason.trim()}`,
    after: { msgId, reason: reason.trim() },
    ipAddress,
  });

  return getConversationMessages(conversationId);
}

// ---------- CHANNELS & INTEGRATIONS ----------
export function listChannels() {
  const db = getDb();
  return db
    .prepare(
      `SELECT c.id, c.user_id, c.workspace_id, c.agent_id, c.channel_type, c.display_name,
              c.connection_status, c.webhook_status, c.provider_status, c.secret_masked,
              c.secret_rotated_at, c.connected_at, c.last_connected_at, c.last_activity_at,
              c.messages_received, c.messages_sent, c.error_count, c.last_error, c.created_at,
              u.full_name AS owner_name, w.name AS workspace_name, a.name AS agent_name
       FROM channels c
       JOIN users u ON u.id = c.user_id
       JOIN workspaces w ON w.id = c.workspace_id
       LEFT JOIN agents a ON a.id = c.agent_id
       ORDER BY c.created_at DESC`
    )
    .all();
}

export function createChannel(
  input: {
    userId: string;
    workspaceId: string;
    agentId?: string;
    channelType: 'whatsapp' | 'instagram' | 'telegram' | 'sms' | 'voice_vapi' | 'webchat';
    displayName: string;
    secretToken?: string;
  },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  if (!input.displayName?.trim()) throw new Error('اسم القناة مطلوب.');
  const id = generateId('chn');
  const hasSecret = Boolean(input.secretToken?.trim());
  const encrypted = hasSecret ? encryptSecret(input.secretToken!.trim()) : null;
  const masked = hasSecret ? maskSecret(input.secretToken!.trim()) : 'غير محدد';

  const envKeyByType: Record<string, string> = {
    whatsapp: 'WHATSAPP_ACCESS_TOKEN',
    instagram: 'INSTAGRAM_ACCESS_TOKEN',
    telegram: 'TELEGRAM_BOT_TOKEN',
    sms: 'TWILIO_AUTH_TOKEN',
    voice_vapi: 'VAPI_API_KEY',
    webchat: '',
  };
  const envKey = envKeyByType[input.channelType] || '';
  const platformConfigured = envKey === '' || Boolean(process.env[envKey]?.trim());
  const connectionStatus = hasSecret || input.channelType === 'webchat' ? 'connected' : 'pending_verification';
  const providerStatus = platformConfigured ? 'configured' : `unconfigured (${envKey})`;

  db.prepare(
    `INSERT INTO channels (
       id, user_id, workspace_id, agent_id, channel_type, display_name, connection_status,
       webhook_status, provider_status, secret_encrypted, secret_masked, secret_rotated_at,
       connected_at, last_connected_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.workspaceId,
    input.agentId || null,
    input.channelType,
    input.displayName.trim(),
    connectionStatus,
    input.channelType === 'webchat' ? 'verified' : 'unverified',
    providerStatus,
    encrypted,
    masked,
    hasSecret ? new Date().toISOString() : null,
    connectionStatus === 'connected' ? new Date().toISOString() : null,
    connectionStatus === 'connected' ? new Date().toISOString() : null
  );

  writeAuditLog({
    actor,
    action: 'channel.created',
    entityType: 'channel',
    entityId: id,
    summary: `إضافة قناة "${input.displayName.trim()}" (${input.channelType}) مع تخزين السر مشفراً.`,
    after: { channelType: input.channelType, secretMasked: masked, connectionStatus },
    ipAddress,
  });

  return listChannels();
}

export function rotateChannelSecret(
  channelId: string,
  newSecret: string,
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const ch = db.prepare('SELECT id, display_name, channel_type FROM channels WHERE id = ?').get(channelId) as
    | { id: string; display_name: string; channel_type: string }
    | undefined;
  if (!ch) throw new Error('القناة غير موجودة.');
  if (!newSecret?.trim() || newSecret.trim().length < 8) {
    throw new Error('يجب أن يحتوي السر الجديد على 8 أحرف على الأقل.');
  }

  const encrypted = encryptSecret(newSecret.trim());
  const masked = maskSecret(newSecret.trim());

  db.prepare(
    `UPDATE channels
     SET secret_encrypted = ?, secret_masked = ?, secret_rotated_at = datetime('now'),
         connection_status = 'connected', updated_at = datetime('now')
     WHERE id = ?`
  ).run(encrypted, masked, channelId);

  writeAuditLog({
    actor,
    action: 'channel.secret_rotated',
    entityType: 'channel',
    entityId: channelId,
    summary: `تدوير مفتاح/رمز القناة "${ch.display_name}" (${ch.channel_type}) وتشفيره على الخادم.`,
    after: { secretMasked: masked },
    ipAddress,
  });

  return { id: channelId, secretMasked: masked, rotatedAt: new Date().toISOString() };
}

export function testChannelConnection(channelId: string, actor: AuthenticatedAdmin, ipAddress: string) {
  const db = getDb();
  const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as Record<string, unknown> | undefined;
  if (!ch) throw new Error('القناة غير موجودة.');

  const hasEncryptedSecret = Boolean(ch.secret_encrypted);
  const envMap: Record<string, string> = {
    whatsapp: 'WHATSAPP_ACCESS_TOKEN',
    instagram: 'INSTAGRAM_ACCESS_TOKEN',
    telegram: 'TELEGRAM_BOT_TOKEN',
    sms: 'TWILIO_AUTH_TOKEN',
    voice_vapi: 'VAPI_API_KEY',
  };
  const requiredEnv = envMap[String(ch.channel_type)];
  const envReady = !requiredEnv || Boolean(process.env[requiredEnv]?.trim());

  const ok = String(ch.channel_type) === 'webchat' || (hasEncryptedSecret && envReady);
  const diagnostic = ok
    ? 'التكوين مشفر وصالح والربط جاهز لاستقبال الرسائل.'
    : !hasEncryptedSecret
      ? 'لا يوجد رمز اتصال مشفر محفوظ لهذه القناة.'
      : `متغير البيئة ${requiredEnv} غير مهيأ على الخادم للاتصال الخارجي بمزود القناة.`;

  db.prepare(
    `UPDATE channels
     SET last_connected_at = datetime('now'),
         connection_status = ?,
         last_error = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(ok ? 'connected' : 'pending_verification', ok ? null : diagnostic, channelId);

  writeAuditLog({
    actor,
    action: 'channel.tested',
    entityType: 'channel',
    entityId: channelId,
    summary: `اختبار اتصال القناة "${ch.display_name}": ${ok ? 'ناجح' : 'يتطلب استكمال الإعداد'}`,
    after: { ok, diagnostic },
    ipAddress,
  });

  return { ok, diagnostic, testedAt: new Date().toISOString() };
}

// ---------- AUTOMATIONS & WORKFLOWS ----------
export function listAutomations() {
  const db = getDb();
  return db
    .prepare(
      `SELECT au.*, u.full_name AS owner_name, w.name AS workspace_name
       FROM automations au
       JOIN users u ON u.id = au.user_id
       JOIN workspaces w ON w.id = au.workspace_id
       ORDER BY au.created_at DESC`
    )
    .all();
}

export function getAutomationDetail(automationId: string) {
  const db = getDb();
  const automation = db
    .prepare(
      `SELECT au.*, u.full_name AS owner_name, w.name AS workspace_name
       FROM automations au
       JOIN users u ON u.id = au.user_id
       JOIN workspaces w ON w.id = au.workspace_id
       WHERE au.id = ?`
    )
    .get(automationId);
  if (!automation) return null;
  const runs = db
    .prepare('SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY executed_at DESC LIMIT 50')
    .all(automationId);
  return { automation, runs };
}

export function createAutomation(
  input: {
    userId: string;
    workspaceId: string;
    name: string;
    automationType: 'workflow' | 'campaign' | 'followup' | 'reminder' | 'sla';
  },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  if (!input.name?.trim()) throw new Error('اسم الأتمتة مطلوب.');
  const id = generateId('aut');
  db.prepare(
    `INSERT INTO automations (id, user_id, workspace_id, name, automation_type, status)
     VALUES (?, ?, ?, ?, ?, 'active')`
  ).run(id, input.userId, input.workspaceId, input.name.trim(), input.automationType || 'workflow');

  writeAuditLog({
    actor,
    action: 'automation.created',
    entityType: 'automation',
    entityId: id,
    summary: `إنشاء أتمتة "${input.name.trim()}" (${input.automationType}).`,
    ipAddress,
  });
  return getAutomationDetail(id);
}

export function updateAutomationStatus(
  automationId: string,
  status: 'active' | 'paused' | 'disabled_by_owner',
  reason: string,
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const au = db.prepare('SELECT * FROM automations WHERE id = ?').get(automationId) as
    | Record<string, unknown>
    | undefined;
  if (!au) throw new Error('الأتمتة غير موجودة.');
  db.prepare("UPDATE automations SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, automationId);
  writeAuditLog({
    actor,
    action: 'automation.status_changed',
    entityType: 'automation',
    entityId: automationId,
    summary: `تغيير حالة الأتمتة "${au.name}" إلى ${status}. السبب: ${reason || 'ضبط تشغيلي'}`,
    before: { status: au.status },
    after: { status, reason },
    ipAddress,
  });
  return getAutomationDetail(automationId);
}

// ---------- KNOWLEDGE BASE & FILES ----------
export function listKnowledgeSources() {
  const db = getDb();
  const items = db
    .prepare(
      `SELECT ks.*, u.full_name AS owner_name, w.name AS workspace_name, a.name AS agent_name
       FROM knowledge_sources ks
       JOIN users u ON u.id = ks.user_id
       JOIN workspaces w ON w.id = ks.workspace_id
       LEFT JOIN agents a ON a.id = ks.agent_id
       ORDER BY ks.updated_at DESC`
    )
    .all();

  const summary = db
    .prepare(
      `SELECT COUNT(*) AS total_sources,
              COALESCE(SUM(storage_bytes), 0) AS total_bytes,
              COALESCE(SUM(chunk_count), 0) AS total_chunks,
              SUM(CASE WHEN processing_status = 'indexed' THEN 1 ELSE 0 END) AS indexed_count,
              SUM(CASE WHEN processing_status = 'failed' THEN 1 ELSE 0 END) AS failed_count
       FROM knowledge_sources`
    )
    .get();

  return { items, summary };
}

export function createKnowledgeSource(
  input: {
    userId: string;
    workspaceId: string;
    agentId?: string;
    title: string;
    fileType?: string;
    storageBytes?: number;
    chunkCount?: number;
  },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  if (!input.title?.trim()) throw new Error('عنوان مصدر المعرفة مطلوب.');
  const id = generateId('knw');
  db.prepare(
    `INSERT INTO knowledge_sources (id, user_id, workspace_id, agent_id, title, file_type, storage_bytes, processing_status, chunk_count, search_index_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'indexed', ?, 'ready')`
  ).run(
    id,
    input.userId,
    input.workspaceId,
    input.agentId || null,
    input.title.trim(),
    input.fileType || 'pdf',
    Math.max(0, Number(input.storageBytes) || 0),
    Math.max(0, Number(input.chunkCount) || 0)
  );
  writeAuditLog({
    actor,
    action: 'knowledge_source.registered',
    entityType: 'knowledge_source',
    entityId: id,
    summary: `تسجيل مصدر معرفة "${input.title.trim()}" في الفهرس.`,
    ipAddress,
  });
  return listKnowledgeSources();
}

// ---------- API KEYS & WEBHOOKS ----------
export function listApiAndWebhooks() {
  const db = getDb();
  const apiKeys = db
    .prepare(
      `SELECT k.id, k.user_id, k.workspace_id, k.name, k.key_prefix, k.scope, k.rate_limit_per_min,
              k.requests_count, k.error_count, k.status, k.last_used_at, k.created_at,
              w.name AS workspace_name
       FROM api_keys k
       LEFT JOIN workspaces w ON w.id = k.workspace_id
       ORDER BY k.created_at DESC`
    )
    .all();

  const webhooks = db
    .prepare(
      `SELECT wh.id, wh.workspace_id, wh.name, wh.endpoint_url, wh.event_types_json,
              wh.secret_masked, wh.status, wh.success_count, wh.failure_count,
              wh.avg_latency_ms, wh.last_triggered_at, wh.last_status_code, wh.created_at,
              w.name AS workspace_name
       FROM webhooks wh
       LEFT JOIN workspaces w ON w.id = wh.workspace_id
       ORDER BY wh.created_at DESC`
    )
    .all();

  return { apiKeys, webhooks };
}

export function createApiKey(
  input: { workspaceId?: string; name: string; scope?: string; rateLimitPerMin?: number },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  if (!input.name?.trim()) throw new Error('اسم مفتاح API مطلوب.');
  const id = generateId('key');
  const rawKey = `kyn_live_${crypto.randomBytes(24).toString('hex')}`;
  const keyPrefix = `${rawKey.slice(0, 14)}••••${rawKey.slice(-4)}`;
  const keyHash = sha256Hex(rawKey);

  db.prepare(
    `INSERT INTO api_keys (id, workspace_id, name, key_prefix, key_hash, scope, rate_limit_per_min, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
  ).run(
    id,
    input.workspaceId || null,
    input.name.trim(),
    keyPrefix,
    keyHash,
    input.scope || 'workspace_api',
    Math.max(10, Number(input.rateLimitPerMin) || 60)
  );

  writeAuditLog({
    actor,
    action: 'api_key.created',
    entityType: 'api_key',
    entityId: id,
    summary: `إصدار مفتاح API جديد "${input.name.trim()}" (${keyPrefix}).`,
    after: { keyPrefix, scope: input.scope || 'workspace_api' },
    ipAddress,
  });

  // Raw secret returned ONLY once on creation; DB stores SHA-256 hash only
  return { id, keyPrefix, oneTimeSecret: rawKey };
}

export function revokeApiKey(keyId: string, actor: AuthenticatedAdmin, ipAddress: string) {
  const db = getDb();
  const row = db.prepare('SELECT id, name, key_prefix FROM api_keys WHERE id = ?').get(keyId) as
    | { id: string; name: string; key_prefix: string }
    | undefined;
  if (!row) throw new Error('مفتاح API غير موجود.');
  db.prepare("UPDATE api_keys SET status = 'revoked' WHERE id = ?").run(keyId);
  writeAuditLog({
    actor,
    action: 'api_key.revoked',
    entityType: 'api_key',
    entityId: keyId,
    summary: `إبطال مفتاح API "${row.name}" (${row.key_prefix}).`,
    ipAddress,
  });
  return { ok: true };
}

function isSafeWebhookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host === '169.254.169.254' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function createWebhook(
  input: { workspaceId?: string; name: string; endpointUrl: string; eventTypes?: string[]; secret?: string },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  if (!input.name?.trim()) throw new Error('اسم الـ Webhook مطلوب.');
  if (!isSafeWebhookUrl(input.endpointUrl)) {
    throw new Error('رابط الـ Webhook غير مسموح (يجب أن يكون رابط HTTP/HTTPS خارجياً وغير محلي).');
  }

  const id = generateId('whk');
  const rawSecret = input.secret?.trim() || crypto.randomBytes(24).toString('hex');
  const encrypted = encryptSecret(rawSecret);
  const masked = maskSecret(rawSecret);

  db.prepare(
    `INSERT INTO webhooks (id, workspace_id, name, endpoint_url, event_types_json, secret_encrypted, secret_masked, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
  ).run(
    id,
    input.workspaceId || null,
    input.name.trim(),
    input.endpointUrl.trim(),
    JSON.stringify(input.eventTypes ?? ['message.received', 'subscription.updated']),
    encrypted,
    masked
  );

  writeAuditLog({
    actor,
    action: 'webhook.created',
    entityType: 'webhook',
    entityId: id,
    summary: `إضافة Webhook "${input.name.trim()}" إلى ${input.endpointUrl.trim()}.`,
    after: { endpointUrl: input.endpointUrl.trim(), secretMasked: masked },
    ipAddress,
  });

  return listApiAndWebhooks();
}
