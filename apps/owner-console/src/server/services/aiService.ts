import { GoogleGenAI } from '@google/genai';
import { getDb } from '../db/connection';
import { calculateUsageCost } from '../domain/pricing';
import { generateId, sanitizeLogText } from '../security/crypto';
import { writeAuditLog, type AuthenticatedAdmin } from '../security/auth';

export function listAgents(filters?: { search?: string; status?: string; provider?: string }) {
  const db = getDb();
  const where: string[] = [];
  const params: string[] = [];
  if (filters?.status && filters.status !== 'all') {
    where.push('a.status = ?');
    params.push(filters.status);
  }
  if (filters?.provider && filters.provider !== 'all') {
    where.push('a.provider_code = ?');
    params.push(filters.provider);
  }
  if (filters?.search?.trim()) {
    const like = `%${filters.search.trim()}%`;
    where.push('(a.name LIKE ? OR u.full_name LIKE ? OR w.name LIKE ? OR a.model_id LIKE ?)');
    params.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  return db
    .prepare(
      `SELECT a.*, u.full_name AS owner_name, u.email AS owner_email,
              w.name AS workspace_name, p.name AS provider_name,
              (SELECT COUNT(*) FROM conversations c WHERE c.agent_id = a.id) AS conversations_count,
              (SELECT COUNT(*) FROM ai_usage_events e WHERE e.agent_id = a.id) AS executions_count,
              (SELECT COUNT(*) FROM ai_usage_events e WHERE e.agent_id = a.id AND e.status = 'success') AS success_count,
              (SELECT COUNT(*) FROM ai_usage_events e WHERE e.agent_id = a.id AND e.status = 'failed') AS error_count,
              (SELECT COALESCE(SUM(e.total_tokens), 0) FROM ai_usage_events e WHERE e.agent_id = a.id) AS total_tokens,
              (SELECT COALESCE(SUM(e.cost_usd), 0) FROM ai_usage_events e WHERE e.agent_id = a.id) AS total_cost_usd,
              (SELECT COALESCE(AVG(e.latency_ms), 0) FROM ai_usage_events e WHERE e.agent_id = a.id) AS avg_latency_ms
       FROM agents a
       JOIN users u ON u.id = a.user_id
       JOIN workspaces w ON w.id = a.workspace_id
       JOIN ai_providers p ON p.code = a.provider_code
       ${whereSql}
       ORDER BY a.created_at DESC`
    )
    .all(...params);
}

export function getAgentDetail(agentId: string) {
  const db = getDb();
  const agent = db
    .prepare(
      `SELECT a.*, u.full_name AS owner_name, u.email AS owner_email,
              w.name AS workspace_name, p.name AS provider_name, m.display_name AS model_display_name
       FROM agents a
       JOIN users u ON u.id = a.user_id
       JOIN workspaces w ON w.id = a.workspace_id
       JOIN ai_providers p ON p.code = a.provider_code
       JOIN ai_models m ON m.model_id = a.model_id
       WHERE a.id = ?`
    )
    .get(agentId) as Record<string, unknown> | undefined;
  if (!agent) return null;

  const channels = db
    .prepare(
      `SELECT id, channel_type, display_name, connection_status, webhook_status, last_activity_at
       FROM channels WHERE agent_id = ?`
    )
    .all(agentId);
  const knowledgeSources = db.prepare('SELECT * FROM knowledge_sources WHERE agent_id = ?').all(agentId);
  const executions = db
    .prepare('SELECT * FROM ai_usage_events WHERE agent_id = ? ORDER BY created_at DESC LIMIT 40')
    .all(agentId);
  const conversations = db
    .prepare('SELECT * FROM conversations WHERE agent_id = ? ORDER BY last_message_at DESC LIMIT 30')
    .all(agentId);
  const errors = db
    .prepare("SELECT * FROM ai_usage_events WHERE agent_id = ? AND status = 'failed' ORDER BY created_at DESC LIMIT 20")
    .all(agentId);
  const configHistory = db
    .prepare('SELECT * FROM agent_config_history WHERE agent_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(agentId);

  const stats = db
    .prepare(
      `SELECT COUNT(*) AS total_runs,
              SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_runs,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_runs,
              COALESCE(SUM(total_tokens), 0) AS total_tokens,
              COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
              COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
       FROM ai_usage_events WHERE agent_id = ?`
    )
    .get(agentId);

  return {
    agent: { ...agent, tools: JSON.parse(String(agent.tools_json || '[]')) },
    channels,
    knowledgeSources,
    executions,
    conversations,
    errors,
    configHistory,
    stats,
  };
}

export function createAgent(
  input: {
    userId: string;
    workspaceId: string;
    name: string;
    agentType?: string;
    providerCode?: string;
    modelId?: string;
    systemPrompt?: string;
    tools?: string[];
    dailyRequestLimit?: number;
  },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const ws = db.prepare('SELECT id, owner_user_id FROM workspaces WHERE id = ?').get(input.workspaceId) as
    | { id: string; owner_user_id: string }
    | undefined;
  if (!ws) throw new Error('مساحة العمل غير موجودة.');
  if (!input.name?.trim()) throw new Error('اسم الوكيل مطلوب.');

  const providerCode = input.providerCode || 'gemini';
  const modelId = input.modelId || 'gemini-2.5-flash';
  const model = db.prepare('SELECT model_id, provider_code FROM ai_models WHERE model_id = ?').get(modelId) as
    | { model_id: string; provider_code: string }
    | undefined;
  if (!model) throw new Error('النموذج المختار غير مسجل في كتالوج المنصة.');

  const id = generateId('agt');
  const systemPrompt = input.systemPrompt?.trim() || 'أنت وكيل استقبال ذكي يعمل عبر منصة Kayan AI لخدمة العملاء باللغة العربية.';
  const tools = input.tools ?? ['knowledge_search'];

  db.prepare(
    `INSERT INTO agents (
       id, user_id, workspace_id, name, agent_type, provider_code, model_id, status,
       system_prompt, prompt_version, tools_json, daily_request_limit
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 1, ?, ?)`
  ).run(
    id,
    input.userId || ws.owner_user_id,
    ws.id,
    input.name.trim(),
    input.agentType || 'frontdesk',
    model.provider_code || providerCode,
    model.model_id,
    systemPrompt,
    JSON.stringify(tools),
    Math.max(10, Number(input.dailyRequestLimit) || 500)
  );

  db.prepare(
    `INSERT INTO agent_config_history (id, agent_id, actor_email, change_summary, new_config_json)
     VALUES (?, ?, ?, 'إنشاء الوكيل الذكي', ?)`
  ).run(generateId('ach'), id, actor.email, JSON.stringify({ modelId: model.model_id, tools }));

  writeAuditLog({
    actor,
    action: 'agent.created',
    entityType: 'agent',
    entityId: id,
    summary: `إنشاء الوكيل الذكي "${input.name.trim()}" على النموذج ${model.model_id}.`,
    after: { id, name: input.name.trim(), modelId: model.model_id },
    ipAddress,
  });

  return getAgentDetail(id);
}

export function updateAgentControl(
  agentId: string,
  patch: { status?: 'active' | 'paused' | 'disabled'; dailyRequestLimit?: number; reason?: string },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Record<string, unknown> | undefined;
  if (!agent) throw new Error('الوكيل غير موجود.');

  const nextStatus = patch.status ?? String(agent.status);
  const nextLimit =
    patch.dailyRequestLimit !== undefined
      ? Math.max(0, Math.floor(Number(patch.dailyRequestLimit)))
      : Number(agent.daily_request_limit);

  db.prepare(
    "UPDATE agents SET status = ?, daily_request_limit = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(nextStatus, nextLimit, agentId);

  db.prepare(
    `INSERT INTO agent_config_history (id, agent_id, actor_email, change_summary, previous_config_json, new_config_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    generateId('ach'),
    agentId,
    actor.email,
    patch.reason?.trim() || `تحديث حالة/حدود الوكيل إلى ${nextStatus}`,
    JSON.stringify({ status: agent.status, daily_request_limit: agent.daily_request_limit }),
    JSON.stringify({ status: nextStatus, daily_request_limit: nextLimit })
  );

  writeAuditLog({
    actor,
    action: 'agent.control_updated',
    entityType: 'agent',
    entityId: agentId,
    summary: `تعديل تحكم الوكيل "${agent.name}" (الحالة: ${nextStatus}، الحد اليومي: ${nextLimit}).`,
    before: { status: agent.status, daily_request_limit: agent.daily_request_limit },
    after: { status: nextStatus, daily_request_limit: nextLimit, reason: patch.reason },
    ipAddress,
  });

  return getAgentDetail(agentId);
}

export function recordIdempotentAiUsage(input: {
  idempotencyKey: string;
  userId?: string | null;
  workspaceId?: string | null;
  agentId?: string | null;
  modelId: string;
  operationType?: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  actualProviderCostUsd?: number | null;
  latencyMs?: number;
  status: 'success' | 'failed';
  errorMessage?: string | null;
}) {
  const db = getDb();
  if (!input.idempotencyKey?.trim()) {
    throw new Error('مفتاح منع التكرار (idempotencyKey) مطلوب لكل حدث استهلاك.');
  }

  const existing = db
    .prepare('SELECT * FROM ai_usage_events WHERE idempotency_key = ?')
    .get(input.idempotencyKey.trim());
  if (existing) {
    return { deduplicated: true, event: existing };
  }

  const model = db
    .prepare('SELECT * FROM ai_models WHERE model_id = ?')
    .get(input.modelId) as
    | {
        model_id: string;
        provider_code: string;
        input_price_per_1m: number;
        output_price_per_1m: number;
        cached_input_price_per_1m: number;
        pricing_source: string;
        pricing_version: string;
        pricing_effective_date: string;
      }
    | undefined;
  if (!model) {
    throw new Error(`النموذج ${input.modelId} غير معرف في جدول التسعير المعتمد.`);
  }

  const calc = calculateUsageCost(
    {
      modelId: model.model_id,
      providerCode: model.provider_code,
      inputPricePer1M: model.input_price_per_1m,
      outputPricePer1M: model.output_price_per_1m,
      cachedInputPricePer1M: model.cached_input_price_per_1m,
      pricingSource: model.pricing_source,
      pricingVersion: model.pricing_version,
      pricingEffectiveDate: model.pricing_effective_date,
    },
    {
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cachedTokens: input.cachedTokens ?? 0,
      actualProviderCostUsd: input.actualProviderCostUsd,
    }
  );

  const id = generateId('usg');
  const sanitizedError = input.errorMessage ? sanitizeLogText(input.errorMessage) : null;

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO ai_usage_events (
         id, idempotency_key, user_id, workspace_id, agent_id, provider_code, model_id,
         operation_type, input_tokens, output_tokens, cached_tokens, total_tokens,
         cost_usd, cost_type, pricing_source, pricing_version, latency_ms, status, error_message
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.idempotencyKey.trim(),
      input.userId ?? null,
      input.workspaceId ?? null,
      input.agentId ?? null,
      model.provider_code,
      model.model_id,
      input.operationType || 'chat_completion',
      calc.inputTokens,
      calc.outputTokens,
      calc.cachedTokens,
      calc.totalTokens,
      calc.costUsd,
      calc.costType,
      calc.pricingSource,
      calc.pricingVersion,
      Math.max(0, Math.floor(Number(input.latencyMs ?? 0))),
      input.status,
      sanitizedError
    );

    if (input.status === 'success') {
      db.prepare("UPDATE ai_providers SET last_success_at = datetime('now') WHERE code = ?").run(model.provider_code);
    } else {
      db.prepare(
        "UPDATE ai_providers SET last_error_at = datetime('now'), last_error_message = ? WHERE code = ?"
      ).run(sanitizedError || 'Provider error', model.provider_code);
    }

    if (input.agentId) {
      db.prepare("UPDATE agents SET last_run_at = datetime('now') WHERE id = ?").run(input.agentId);
    }

    // Cost threshold alert check
    const alertThresholdRow = db
      .prepare("SELECT value_json FROM platform_settings WHERE key = 'monthly_ai_cost_alert_usd'")
      .get() as { value_json: string } | undefined;
    const thresholdUsd = alertThresholdRow ? Number(JSON.parse(alertThresholdRow.value_json)) : 250;
    const monthCostRow = db
      .prepare(
        "SELECT COALESCE(SUM(cost_usd), 0) AS s FROM ai_usage_events WHERE created_at >= date('now', 'start of month')"
      )
      .get() as { s: number };

    if (Number(monthCostRow.s) >= thresholdUsd && thresholdUsd > 0) {
      const existingAlert = db
        .prepare(
          "SELECT id FROM owner_alerts WHERE alert_type = 'ai_cost_threshold' AND acknowledged = 0 AND created_at >= date('now', 'start of month')"
        )
        .get();
      if (!existingAlert) {
        db.prepare(
          `INSERT INTO owner_alerts (id, alert_type, severity, title, description, metric_value, threshold_value)
           VALUES (?, 'ai_cost_threshold', 'critical', ?, ?, ?, ?)`
        ).run(
          generateId('alr'),
          'تجاوز حد تكلفة الذكاء الاصطناعي الشهري',
          'بلغ إجمالي تكلفة مزودي الذكاء الاصطناعي هذا الشهر الحد التنبيهي المحدد في إعدادات المنصة.',
          `$${Number(monthCostRow.s).toFixed(4)}`,
          `$${thresholdUsd}`
        );
      }
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return { deduplicated: false, event: db.prepare('SELECT * FROM ai_usage_events WHERE id = ?').get(id) };
}

export async function runAgentSandboxTest(
  agentId: string,
  testMessage: string,
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Record<string, unknown> | undefined;
  if (!agent) throw new Error('الوكيل غير موجود.');
  if (!testMessage?.trim()) throw new Error('يرجى إدخال رسالة اختبار للوكيل.');

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      executedLive: false,
      providerStatus: 'unconfigured',
      message: 'مفتاح GEMINI_API_KEY غير مهيأ في بيئة الخادم. أضف المفتاح في الإعدادات لتشغيل اختبار حي للوكيل.',
    };
  }

  const startedAt = Date.now();
  const idempotencyKey = `sandbox_${agentId}_${startedAt}`;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const targetModel = String(agent.provider_code) === 'gemini' ? String(agent.model_id) : 'gemini-2.5-flash';
    const response = await ai.models.generateContent({
      model: targetModel,
      contents: testMessage.trim(),
      config: {
        systemInstruction: String(agent.system_prompt || ''),
        maxOutputTokens: Math.min(512, Number(agent.max_tokens_per_call) || 512),
      },
    });
    const latencyMs = Date.now() - startedAt;
    const usageMeta = response.usageMetadata;
    const inputTokens = Number(usageMeta?.promptTokenCount ?? 0);
    const outputTokens = Number(usageMeta?.candidatesTokenCount ?? 0);
    const cachedTokens = Number(usageMeta?.cachedContentTokenCount ?? 0);

    const recorded = recordIdempotentAiUsage({
      idempotencyKey,
      userId: String(agent.user_id),
      workspaceId: String(agent.workspace_id),
      agentId,
      modelId: targetModel,
      operationType: 'owner_sandbox_test',
      inputTokens,
      outputTokens,
      cachedTokens,
      latencyMs,
      status: 'success',
    });

    writeAuditLog({
      actor,
      action: 'agent.sandbox_tested',
      entityType: 'agent',
      entityId: agentId,
      summary: `تشغيل اختبار آمن للوكيل "${agent.name}" عبر ${targetModel} (${latencyMs}ms).`,
      after: { model: targetModel, inputTokens, outputTokens, latencyMs },
      ipAddress,
    });

    return {
      executedLive: true,
      reply: response.text || '',
      latencyMs,
      usage: recorded.event,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const cleanErr = sanitizeLogText((err as Error).message || 'Unknown Gemini error');
    recordIdempotentAiUsage({
      idempotencyKey,
      userId: String(agent.user_id),
      workspaceId: String(agent.workspace_id),
      agentId,
      modelId: 'gemini-2.5-flash',
      operationType: 'owner_sandbox_test',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: 'failed',
      errorMessage: cleanErr,
    });
    throw new Error(`فشل اختبار الوكيل: ${cleanErr}`);
  }
}

export function getAiProvidersAndModels() {
  const db = getDb();
  const providers = db.prepare('SELECT * FROM ai_providers ORDER BY is_primary DESC, name ASC').all() as Array<
    Record<string, unknown>
  >;

  const enrichedProviders = providers.map((p) => {
    const code = String(p.code);
    const envVar = String(p.env_key_name);
    const envConfigured = Boolean(process.env[envVar]?.trim());
    const stats = db
      .prepare(
        `SELECT COUNT(*) AS total_requests,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_requests,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_requests,
                COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(cost_usd), 0) AS total_cost_usd
         FROM ai_usage_events WHERE provider_code = ?`
      )
      .get(code) as Record<string, unknown>;

    return {
      ...p,
      env_configured: envConfigured,
      connection_status: envConfigured ? 'configured' : 'unconfigured',
      stats,
    };
  });

  const models = db
    .prepare(
      `SELECT m.*,
              (SELECT COUNT(*) FROM agents a WHERE a.model_id = m.model_id) AS agents_using,
              (SELECT COUNT(DISTINCT a.user_id) FROM agents a WHERE a.model_id = m.model_id) AS users_using,
              (SELECT COUNT(*) FROM ai_usage_events e WHERE e.model_id = m.model_id) AS requests_count,
              (SELECT COALESCE(SUM(e.total_tokens), 0) FROM ai_usage_events e WHERE e.model_id = m.model_id) AS total_tokens,
              (SELECT COALESCE(SUM(e.cost_usd), 0) FROM ai_usage_events e WHERE e.model_id = m.model_id) AS total_cost_usd,
              (SELECT COALESCE(AVG(e.latency_ms), 0) FROM ai_usage_events e WHERE e.model_id = m.model_id) AS avg_latency_ms
       FROM ai_models m
       ORDER BY m.provider_code, m.display_name`
    )
    .all() as Array<Record<string, unknown>>;

  return {
    providers: enrichedProviders,
    models: models.map((m) => ({
      ...m,
      allowed_plan_codes: JSON.parse(String(m.allowed_plan_codes_json || '[]')),
    })),
  };
}

export function updateAiModelGovernance(
  modelId: string,
  patch: {
    isAllowed?: boolean;
    allowedPlanCodes?: string[];
    inputPricePer1M?: number;
    outputPricePer1M?: number;
    cachedInputPricePer1M?: number;
    pricingSource?: string;
    pricingVersion?: string;
  },
  actor: AuthenticatedAdmin,
  ipAddress: string
) {
  const db = getDb();
  const model = db.prepare('SELECT * FROM ai_models WHERE model_id = ?').get(modelId) as
    | Record<string, unknown>
    | undefined;
  if (!model) throw new Error('النموذج غير موجود.');

  const isAllowed = patch.isAllowed !== undefined ? (patch.isAllowed ? 1 : 0) : Number(model.is_allowed);
  const allowedPlans =
    patch.allowedPlanCodes !== undefined ? patch.allowedPlanCodes : JSON.parse(String(model.allowed_plan_codes_json));
  const inputPrice =
    patch.inputPricePer1M !== undefined ? Number(patch.inputPricePer1M) : Number(model.input_price_per_1m);
  const outputPrice =
    patch.outputPricePer1M !== undefined ? Number(patch.outputPricePer1M) : Number(model.output_price_per_1m);
  const cachedPrice =
    patch.cachedInputPricePer1M !== undefined
      ? Number(patch.cachedInputPricePer1M)
      : Number(model.cached_input_price_per_1m);
  const pricingSource = patch.pricingSource?.trim() || String(model.pricing_source);
  const pricingVersion = patch.pricingVersion?.trim() || String(model.pricing_version);

  db.prepare(
    `UPDATE ai_models
     SET is_allowed = ?, allowed_plan_codes_json = ?, input_price_per_1m = ?, output_price_per_1m = ?,
         cached_input_price_per_1m = ?, pricing_source = ?, pricing_version = ?, updated_at = datetime('now')
     WHERE model_id = ?`
  ).run(isAllowed, JSON.stringify(allowedPlans), inputPrice, outputPrice, cachedPrice, pricingSource, pricingVersion, modelId);

  writeAuditLog({
    actor,
    action: 'ai_model.updated',
    entityType: 'ai_model',
    entityId: modelId,
    summary: `تحديث حوكمة وتسعير النموذج ${modelId} (مصدر التسعير: ${pricingSource} v${pricingVersion}).`,
    before: {
      is_allowed: model.is_allowed === 1,
      input_price_per_1m: model.input_price_per_1m,
      output_price_per_1m: model.output_price_per_1m,
      pricing_version: model.pricing_version,
    },
    after: { is_allowed: isAllowed === 1, inputPrice, outputPrice, pricingSource, pricingVersion },
    ipAddress,
  });

  return db.prepare('SELECT * FROM ai_models WHERE model_id = ?').get(modelId);
}

export function listAiUsageEvents(filters: {
  userId?: string;
  agentId?: string;
  modelId?: string;
  providerCode?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = getDb();
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(filters.pageSize) || 25));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.userId) {
    where.push('e.user_id = ?');
    params.push(filters.userId);
  }
  if (filters.agentId) {
    where.push('e.agent_id = ?');
    params.push(filters.agentId);
  }
  if (filters.modelId && filters.modelId !== 'all') {
    where.push('e.model_id = ?');
    params.push(filters.modelId);
  }
  if (filters.providerCode && filters.providerCode !== 'all') {
    where.push('e.provider_code = ?');
    params.push(filters.providerCode);
  }
  if (filters.status && filters.status !== 'all') {
    where.push('e.status = ?');
    params.push(filters.status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS c FROM ai_usage_events e ${whereSql}`).get(...params) as { c: number }).c
  );
  const items = db
    .prepare(
      `SELECT e.*, u.full_name AS user_name, w.name AS workspace_name, a.name AS agent_name
       FROM ai_usage_events e
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN workspaces w ON w.id = e.workspace_id
       LEFT JOIN agents a ON a.id = e.agent_id
       ${whereSql}
       ORDER BY e.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  const summary = db
    .prepare(
      `SELECT COUNT(*) AS requests,
              COALESCE(SUM(input_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens,
              COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
              COALESCE(SUM(total_tokens), 0) AS total_tokens,
              COALESCE(SUM(CASE WHEN cost_type = 'actual' THEN cost_usd ELSE 0 END), 0) AS actual_cost_usd,
              COALESCE(SUM(CASE WHEN cost_type = 'estimated' THEN cost_usd ELSE 0 END), 0) AS estimated_cost_usd,
              COALESCE(SUM(cost_usd), 0) AS total_cost_usd
       FROM ai_usage_events e ${whereSql}`
    )
    .get(...params);

  return {
    items,
    summary,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
