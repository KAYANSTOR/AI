import { getDb, getDatabaseMetadata } from '../db/connection';
import {
  computeDeltaPercent,
  computeNetOperatingPosition,
  resolvePeriodWindow,
  type PeriodGranularity,
} from '../domain/analytics';

export function getExternalIntegrationStatuses() {
  const checkEnv = (key: string) => Boolean(process.env[key]?.trim());
  return [
    {
      id: 'db_postgres',
      name: 'قاعدة بيانات PostgreSQL الخارجية (Kayan AI)',
      category: 'database',
      envVar: 'DATABASE_URL',
      configured: checkEnv('DATABASE_URL'),
      status: checkEnv('DATABASE_URL') ? 'configured' : 'local_fallback',
      note: checkEnv('DATABASE_URL')
        ? 'متغير DATABASE_URL مهيأ في البيئة.'
        : 'يعمل حالياً على قاعدة البيانات المحلية المدمجة (SQLite WAL). أضف DATABASE_URL للربط بقاعدة Railway الإنتاجية.',
    },
    {
      id: 'ai_gemini',
      name: 'Google Gemini (المزود الرئيسي)',
      category: 'ai',
      envVar: 'GEMINI_API_KEY',
      configured: checkEnv('GEMINI_API_KEY'),
      status: checkEnv('GEMINI_API_KEY') ? 'configured' : 'unconfigured',
      note: checkEnv('GEMINI_API_KEY')
        ? 'مفتاح GEMINI_API_KEY متوفر في الخادم وجاهز للاختبار الفعلي.'
        : 'غير مربوط — يتطلب إضافة GEMINI_API_KEY في متغيرات البيئة.',
    },
    {
      id: 'ai_groq',
      name: 'Groq Cloud (المزود الاحتياطي)',
      category: 'ai',
      envVar: 'GROQ_API_KEY',
      configured: checkEnv('GROQ_API_KEY'),
      status: checkEnv('GROQ_API_KEY') ? 'configured' : 'unconfigured',
      note: checkEnv('GROQ_API_KEY')
        ? 'مفتاح GROQ_API_KEY مهيأ للتحويل التلقائي عند الأعطال.'
        : 'غير مربوط — يتطلب إضافة GROQ_API_KEY لتفعيل الاحتياط التلقائي.',
    },
    {
      id: 'ch_whatsapp',
      name: 'WhatsApp Cloud API (Meta)',
      category: 'channel',
      envVar: 'WHATSAPP_ACCESS_TOKEN',
      configured: checkEnv('WHATSAPP_ACCESS_TOKEN'),
      status: checkEnv('WHATSAPP_ACCESS_TOKEN') ? 'configured' : 'unconfigured',
      note: checkEnv('WHATSAPP_ACCESS_TOKEN')
        ? 'بيانات WhatsApp Cloud API مهيأة على مستوى المنصة.'
        : 'غير مربوط — يتطلب WHATSAPP_ACCESS_TOKEN وWHATSAPP_APP_SECRET.',
    },
    {
      id: 'ch_instagram',
      name: 'Instagram DM (Meta Graph)',
      category: 'channel',
      envVar: 'INSTAGRAM_ACCESS_TOKEN',
      configured: checkEnv('INSTAGRAM_ACCESS_TOKEN'),
      status: checkEnv('INSTAGRAM_ACCESS_TOKEN') ? 'configured' : 'unconfigured',
      note: checkEnv('INSTAGRAM_ACCESS_TOKEN')
        ? 'رمز Instagram Graph مهيأ.'
        : 'غير مربوط — يتطلب INSTAGRAM_ACCESS_TOKEN وINSTAGRAM_VERIFY_TOKEN.',
    },
    {
      id: 'ch_telegram',
      name: 'Telegram Bot API',
      category: 'channel',
      envVar: 'TELEGRAM_BOT_TOKEN',
      configured: checkEnv('TELEGRAM_BOT_TOKEN'),
      status: checkEnv('TELEGRAM_BOT_TOKEN') ? 'configured' : 'unconfigured',
      note: checkEnv('TELEGRAM_BOT_TOKEN')
        ? 'رمز Telegram Bot مهيأ.'
        : 'غير مربوط — يتطلب TELEGRAM_BOT_TOKEN.',
    },
    {
      id: 'ch_twilio',
      name: 'Twilio SMS',
      category: 'channel',
      envVar: 'TWILIO_AUTH_TOKEN',
      configured: checkEnv('TWILIO_AUTH_TOKEN'),
      status: checkEnv('TWILIO_AUTH_TOKEN') ? 'configured' : 'unconfigured',
      note: checkEnv('TWILIO_AUTH_TOKEN')
        ? 'بيانات Twilio SMS مهيأة.'
        : 'غير مربوط — يتطلب TWILIO_AUTH_TOKEN.',
    },
    {
      id: 'ch_vapi',
      name: 'Vapi Voice AI',
      category: 'channel',
      envVar: 'VAPI_API_KEY',
      configured: checkEnv('VAPI_API_KEY'),
      status: checkEnv('VAPI_API_KEY') ? 'configured' : 'unconfigured',
      note: checkEnv('VAPI_API_KEY')
        ? 'مفتاح Vapi الصوتي مهيأ.'
        : 'غير مربوط — يتطلب VAPI_API_KEY وVAPI_WEBHOOK_SECRET.',
    },
    {
      id: 'bill_stripe',
      name: 'بوابة الدفع Stripe',
      category: 'billing',
      envVar: 'STRIPE_SECRET_KEY',
      configured: checkEnv('STRIPE_SECRET_KEY'),
      status: checkEnv('STRIPE_SECRET_KEY') ? 'configured' : 'unconfigured',
      note: checkEnv('STRIPE_SECRET_KEY')
        ? 'مفتاح Stripe مهيأ لمعالجة البطاقات والاشتراكات.'
        : 'غير مربوط — يتطلب STRIPE_SECRET_KEY وSTRIPE_WEBHOOK_SECRET.',
    },
    {
      id: 'bill_esaalat',
      name: 'بوابة إيصالات والمحافظ اليمنية',
      category: 'billing',
      envVar: 'ESAALAT_API_KEY',
      configured: checkEnv('ESAALAT_API_KEY'),
      status: checkEnv('ESAALAT_API_KEY') ? 'configured' : 'unconfigured',
      note: checkEnv('ESAALAT_API_KEY')
        ? 'ربط إيصالات والمحافظ المحلية مهيأ.'
        : 'غير مربوط — يتطلب ESAALAT_API_KEY وESAALAT_WEBHOOK_SECRET.',
    },
  ];
}

export function getOverviewDashboard(params: {
  period: PeriodGranularity;
  startDate?: string;
  endDate?: string;
}) {
  const db = getDb();
  const window = resolvePeriodWindow(params.period, params.startDate, params.endDate);

  const count = (sql: string, ...args: (string | number)[]) => {
    const row = db.prepare(sql).get(...args) as { c: number } | undefined;
    return Number(row?.c ?? 0);
  };
  const sum = (sql: string, ...args: (string | number)[]) => {
    const row = db.prepare(sql).get(...args) as { s: number } | undefined;
    return Number(row?.s ?? 0);
  };

  // All 22 requested platform metrics calculated directly from real DB tables
  const totalUsers = count("SELECT COUNT(*) AS c FROM users WHERE account_status != 'deleted'");
  const activeUsers = count("SELECT COUNT(*) AS c FROM users WHERE account_status = 'active'");
  const newUsersInPeriod = count(
    "SELECT COUNT(*) AS c FROM users WHERE created_at >= ? AND created_at <= ? AND account_status != 'deleted'",
    window.startIso,
    window.endIso
  );
  const newUsersPrevPeriod = count(
    "SELECT COUNT(*) AS c FROM users WHERE created_at >= ? AND created_at <= ? AND account_status != 'deleted'",
    window.prevStartIso,
    window.prevEndIso
  );
  const suspendedUsers = count("SELECT COUNT(*) AS c FROM users WHERE account_status = 'suspended'");
  const trialAccounts = count("SELECT COUNT(*) AS c FROM users WHERE account_status = 'trial'");

  const activeSubscriptions = count("SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'active'");
  const expiredSubscriptions = count("SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'expired'");
  const cancelledSubscriptions = count("SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'cancelled'");
  const pastDueSubscriptions = count("SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'past_due'");
  const trialSubscriptions = count("SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'trial'");
  const newSubsInPeriod = count(
    'SELECT COUNT(*) AS c FROM subscriptions WHERE created_at >= ? AND created_at <= ?',
    window.startIso,
    window.endIso
  );
  const newSubsPrevPeriod = count(
    'SELECT COUNT(*) AS c FROM subscriptions WHERE created_at >= ? AND created_at <= ?',
    window.prevStartIso,
    window.prevEndIso
  );

  const totalWorkspaces = count("SELECT COUNT(*) AS c FROM workspaces WHERE status != 'archived'");
  const totalAgents = count('SELECT COUNT(*) AS c FROM agents');
  const activeAgents = count("SELECT COUNT(*) AS c FROM agents WHERE status = 'active'");
  const failingAgents = count("SELECT COUNT(*) AS c FROM agents WHERE status = 'error'");

  const totalConversations = count('SELECT COUNT(*) AS c FROM conversations');
  const totalMessages = count('SELECT COUNT(*) AS c FROM messages');

  const totalAiRequests = count(
    'SELECT COUNT(*) AS c FROM ai_usage_events WHERE created_at >= ? AND created_at <= ?',
    window.startIso,
    window.endIso
  );
  const prevAiRequests = count(
    'SELECT COUNT(*) AS c FROM ai_usage_events WHERE created_at >= ? AND created_at <= ?',
    window.prevStartIso,
    window.prevEndIso
  );
  const successfulAgentRuns = count(
    "SELECT COUNT(*) AS c FROM ai_usage_events WHERE status = 'success' AND created_at >= ? AND created_at <= ?",
    window.startIso,
    window.endIso
  );
  const failedAgentRuns = count(
    "SELECT COUNT(*) AS c FROM ai_usage_events WHERE status = 'failed' AND created_at >= ? AND created_at <= ?",
    window.startIso,
    window.endIso
  );
  const totalTokens = sum(
    'SELECT COALESCE(SUM(total_tokens), 0) AS s FROM ai_usage_events WHERE created_at >= ? AND created_at <= ?',
    window.startIso,
    window.endIso
  );
  const aiProviderCostsUsd = Number(
    sum(
      'SELECT COALESCE(SUM(cost_usd), 0) AS s FROM ai_usage_events WHERE created_at >= ? AND created_at <= ?',
      window.startIso,
      window.endIso
    ).toFixed(6)
  );
  const prevAiCostsUsd = sum(
    'SELECT COALESCE(SUM(cost_usd), 0) AS s FROM ai_usage_events WHERE created_at >= ? AND created_at <= ?',
    window.prevStartIso,
    window.prevEndIso
  );

  const collectedRevenueUsd = Number(
    sum(
      "SELECT COALESCE(SUM(amount), 0) AS s FROM invoices WHERE status = 'paid' AND revenue_classification = 'collected' AND COALESCE(paid_at, created_at) >= ? AND COALESCE(paid_at, created_at) <= ?",
      window.startIso,
      window.endIso
    ).toFixed(2)
  );
  const prevCollectedRevenueUsd = sum(
    "SELECT COALESCE(SUM(amount), 0) AS s FROM invoices WHERE status = 'paid' AND revenue_classification = 'collected' AND COALESCE(paid_at, created_at) >= ? AND COALESCE(paid_at, created_at) <= ?",
    window.prevStartIso,
    window.prevEndIso
  );
  const unpaidInvoicesUsd = Number(
    sum("SELECT COALESCE(SUM(amount), 0) AS s FROM invoices WHERE status IN ('unpaid', 'failed')").toFixed(2)
  );
  const recordedExpensesUsd = Number(
    sum(
      'SELECT COALESCE(SUM(amount), 0) AS s FROM operating_expenses WHERE incurred_at >= ? AND incurred_at <= ?',
      window.startIso,
      window.endIso
    ).toFixed(2)
  );

  const connectedChannels = count("SELECT COUNT(*) AS c FROM channels WHERE connection_status = 'connected'");
  const disconnectedChannels = count("SELECT COUNT(*) AS c FROM channels WHERE connection_status != 'connected'");
  const currentSystemErrors = count(
    "SELECT COUNT(*) AS c FROM system_logs WHERE severity IN ('error', 'critical') AND resolved = 0"
  );
  const unacknowledgedAlerts = count('SELECT COUNT(*) AS c FROM owner_alerts WHERE acknowledged = 0');

  const netPosition = computeNetOperatingPosition({
    collectedRevenueUsd,
    aiCostUsd: aiProviderCostsUsd,
    recordedExpensesUsd,
  });

  // Daily time series for charts (real DB buckets over window, capped to max 31 buckets for readability)
  const bucketCount = Math.min(Math.max(window.days, 7), 30);
  const endDate = new Date(window.endIso);
  const series: Array<{
    date: string;
    users: number;
    subscriptions: number;
    revenueUsd: number;
    tokens: number;
    aiCostUsd: number;
    conversations: number;
    messages: number;
    successRuns: number;
    failedRuns: number;
  }> = [];

  for (let i = bucketCount - 1; i >= 0; i--) {
    const day = new Date(endDate);
    day.setUTCDate(day.getUTCDate() - i);
    const dayStr = day.toISOString().slice(0, 10);
    const dayStart = `${dayStr}T00:00:00.000Z`;
    const dayEnd = `${dayStr}T23:59:59.999Z`;

    series.push({
      date: dayStr,
      users: count('SELECT COUNT(*) AS c FROM users WHERE created_at >= ? AND created_at <= ?', dayStart, dayEnd),
      subscriptions: count(
        'SELECT COUNT(*) AS c FROM subscriptions WHERE created_at >= ? AND created_at <= ?',
        dayStart,
        dayEnd
      ),
      revenueUsd: Number(
        sum(
          "SELECT COALESCE(SUM(amount), 0) AS s FROM invoices WHERE status = 'paid' AND COALESCE(paid_at, created_at) >= ? AND COALESCE(paid_at, created_at) <= ?",
          dayStart,
          dayEnd
        ).toFixed(2)
      ),
      tokens: sum(
        'SELECT COALESCE(SUM(total_tokens), 0) AS s FROM ai_usage_events WHERE created_at >= ? AND created_at <= ?',
        dayStart,
        dayEnd
      ),
      aiCostUsd: Number(
        sum(
          'SELECT COALESCE(SUM(cost_usd), 0) AS s FROM ai_usage_events WHERE created_at >= ? AND created_at <= ?',
          dayStart,
          dayEnd
        ).toFixed(5)
      ),
      conversations: count(
        'SELECT COUNT(*) AS c FROM conversations WHERE created_at >= ? AND created_at <= ?',
        dayStart,
        dayEnd
      ),
      messages: count('SELECT COUNT(*) AS c FROM messages WHERE created_at >= ? AND created_at <= ?', dayStart, dayEnd),
      successRuns: count(
        "SELECT COUNT(*) AS c FROM ai_usage_events WHERE status = 'success' AND created_at >= ? AND created_at <= ?",
        dayStart,
        dayEnd
      ),
      failedRuns: count(
        "SELECT COUNT(*) AS c FROM ai_usage_events WHERE status = 'failed' AND created_at >= ? AND created_at <= ?",
        dayStart,
        dayEnd
      ),
    });
  }

  // Channel distribution chart
  const channelUsage = db
    .prepare(
      `SELECT channel_type AS channel, COUNT(*) AS total,
              SUM(CASE WHEN connection_status = 'connected' THEN 1 ELSE 0 END) AS connected,
              COALESCE(SUM(messages_received + messages_sent), 0) AS messages
       FROM channels
       GROUP BY channel_type`
    )
    .all();

  // Plan distribution chart
  const planDistribution = db
    .prepare(
      `SELECT p.code, p.name, COUNT(s.id) AS subscribers
       FROM plans p
       LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status IN ('active', 'trial')
       WHERE p.status = 'active'
       GROUP BY p.id
       ORDER BY p.price_monthly ASC`
    )
    .all();

  // Model cost breakdown
  const modelUsage = db
    .prepare(
      `SELECT m.model_id AS modelId, m.display_name AS displayName, m.provider_code AS providerCode,
              COUNT(e.id) AS requests,
              COALESCE(SUM(e.total_tokens), 0) AS tokens,
              COALESCE(SUM(e.cost_usd), 0) AS costUsd
       FROM ai_models m
       LEFT JOIN ai_usage_events e ON e.model_id = m.model_id AND e.created_at >= ? AND e.created_at <= ?
       GROUP BY m.id
       ORDER BY costUsd DESC, requests DESC`
    )
    .all(window.startIso, window.endIso);

  // Action items needing owner attention
  const attentionItems = {
    pastDueSubscriptions,
    failingAgents,
    disconnectedChannels,
    unresolvedErrors: currentSystemErrors,
    unacknowledgedAlerts,
    openTickets: count("SELECT COUNT(*) AS c FROM support_tickets WHERE status IN ('open', 'in_progress')"),
  };

  return {
    window,
    database: getDatabaseMetadata(),
    integrations: getExternalIntegrationStatuses(),
    metrics: {
      totalUsers,
      activeUsers,
      newUsersInPeriod,
      suspendedUsers,
      trialAccounts,
      activeSubscriptions,
      expiredSubscriptions,
      cancelledSubscriptions,
      pastDueSubscriptions,
      trialSubscriptions,
      totalWorkspaces,
      totalAgents,
      activeAgents,
      failingAgents,
      totalConversations,
      totalMessages,
      totalAiRequests,
      successfulAgentRuns,
      failedAgentRuns,
      totalTokens,
      aiProviderCostsUsd,
      collectedRevenueUsd,
      unpaidInvoicesUsd,
      recordedExpensesUsd,
      totalOperatingCostsUsd: netPosition.totalCostsUsd,
      netMarginUsd: netPosition.netMarginUsd,
      netMarginPercent: netPosition.marginPercent,
      connectedChannels,
      disconnectedChannels,
      currentSystemErrors,
    },
    comparisons: {
      newUsersDeltaPct: computeDeltaPercent(newUsersInPeriod, newUsersPrevPeriod),
      subscriptionsDeltaPct: computeDeltaPercent(newSubsInPeriod, newSubsPrevPeriod),
      revenueDeltaPct: computeDeltaPercent(collectedRevenueUsd, prevCollectedRevenueUsd),
      aiRequestsDeltaPct: computeDeltaPercent(totalAiRequests, prevAiRequests),
      aiCostDeltaPct: computeDeltaPercent(aiProviderCostsUsd, prevAiCostsUsd),
    },
    charts: {
      timeSeries: series,
      channelUsage,
      planDistribution,
      modelUsage,
    },
    attentionItems,
  };
}
