import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCw, Calendar, AlertTriangle, Database } from 'lucide-react';
import { apiFetch, formatCurrency, formatNumber } from '../lib/api';
import type { OwnerRouteId } from '../types/owner';
import { MetricTile, PageHeader, secondaryBtnClass, StatusText, TableSkeleton } from '../components/ui/Primitives';

interface OverviewResponse {
  window: { startIso: string; endIso: string; days: number };
  database: { engine: string; mode: string; externalPostgresConfigured: boolean; pathLabel: string };
  integrations: Array<{
    id: string;
    name: string;
    category: string;
    envVar: string;
    configured: boolean;
    status: string;
    note: string;
  }>;
  metrics: {
    totalUsers: number;
    activeUsers: number;
    newUsersInPeriod: number;
    suspendedUsers: number;
    trialAccounts: number;
    activeSubscriptions: number;
    expiredSubscriptions: number;
    cancelledSubscriptions: number;
    pastDueSubscriptions: number;
    trialSubscriptions: number;
    totalWorkspaces: number;
    totalAgents: number;
    activeAgents: number;
    failingAgents: number;
    totalConversations: number;
    totalMessages: number;
    totalAiRequests: number;
    successfulAgentRuns: number;
    failedAgentRuns: number;
    totalTokens: number;
    aiProviderCostsUsd: number;
    collectedRevenueUsd: number;
    unpaidInvoicesUsd: number;
    recordedExpensesUsd: number;
    totalOperatingCostsUsd: number;
    netMarginUsd: number;
    netMarginPercent: number | null;
    connectedChannels: number;
    disconnectedChannels: number;
    currentSystemErrors: number;
  };
  comparisons: {
    newUsersDeltaPct: number | null;
    subscriptionsDeltaPct: number | null;
    revenueDeltaPct: number | null;
    aiRequestsDeltaPct: number | null;
    aiCostDeltaPct: number | null;
  };
  charts: {
    timeSeries: Array<{
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
    }>;
    channelUsage: Array<{ channel: string; total: number; connected: number; messages: number }>;
    planDistribution: Array<{ code: string; name: string; subscribers: number }>;
    modelUsage: Array<{ modelId: string; displayName: string; requests: number; tokens: number; costUsd: number | null }>;
  };
  dataLimitations?: { revenue?: string; expenses?: string; aiCost?: string; systemErrors?: string };
  attentionItems: {
    pastDueSubscriptions: number;
    failingAgents: number;
    disconnectedChannels: number;
    unresolvedErrors: number;
    unacknowledgedAlerts: number;
    openTickets: number;
  };
}

export function OverviewPage({ onNavigate }: { onNavigate: (route: OwnerRouteId) => void }) {
  const [period, setPeriod] = React.useState<'day' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [customStart, setCustomStart] = React.useState('');
  const [customEnd, setCustomEnd] = React.useState('');
  const [chartTab, setChartTab] = React.useState<'growth' | 'finance' | 'ai' | 'operations'>('growth');
  const [data, setData] = React.useState<OverviewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ period });
    if (period === 'custom' && customStart && customEnd) {
      params.set('startDate', customStart);
      params.set('endDate', customEnd);
    }
    apiFetch<OverviewResponse>(`/api/owner/overview?${params.toString()}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل نظرة عامة على المنصة.'))
      .finally(() => setLoading(false));
  }, [period, customStart, customEnd]);

  React.useEffect(() => {
    if (period !== 'custom' || (customStart && customEnd)) {
      loadData();
    }
  }, [loadData, period, customStart, customEnd]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="نظرة عامة على منصة Kayan AI"
        subtitle="الوضع التشغيلي والمالي الفعلي للمنصة من قاعدة البيانات الحقيقية. جميع المؤشرات قابلة للنقر للانتقال مباشرة إلى التفاصيل."
        action={
          <div className="flex flex-wrap items-center gap-2 max-w-full">
            <div className="flex flex-wrap items-center p-1 rounded-lg bg-[var(--k-surface-subtle)] border border-[var(--k-line)] max-w-full">
              {(
                [
                  { id: 'day', label: 'يوم' },
                  { id: 'week', label: 'أسبوع' },
                  { id: 'month', label: 'شهر' },
                  { id: 'year', label: 'سنة' },
                  { id: 'custom', label: 'مخصص' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    period === p.id
                      ? 'bg-[var(--k-surface)] text-[var(--k-ink)] shadow-xs'
                      : 'text-[var(--k-ink-muted)] hover:text-[var(--k-ink)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={loadData} className={secondaryBtnClass}>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث</span>
            </button>
          </div>
        }
      />

      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)]">
          <Calendar className="w-4 h-4 text-[var(--k-ink-muted)] mb-2" />
          <div>
            <label className="block text-xs text-[var(--k-ink-muted)] mb-1">من تاريخ</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)] text-[var(--k-ink)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--k-ink-muted)] mb-1">إلى تاريخ</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)] text-[var(--k-ink)]"
            />
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="p-4 rounded-xl border border-[var(--k-danger)]/40 bg-[var(--k-danger-bg)] text-sm text-[var(--k-danger)]">
          {error}
        </div>
      )}

      {loading || !data ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          {/* Honest Data Source & Governance Banner */}
          <div className="p-4 rounded-xl border border-[var(--k-line)] bg-[var(--k-sage-tint)] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Database className="w-4 h-4 text-[var(--k-brand-forest)] mt-0.5 shrink-0" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold text-[var(--k-ink)]">مصدر البيانات الحالي: </span>
                <span className="text-[var(--k-ink-secondary)]">
                  {data.database.engine} ({data.database.mode}). لا تُعرض أي أرقام تقديرية مخترعة؛ جميع المؤشرات محسوبة مباشرة من السجلات الفعلية.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('system_monitoring')}
              className={secondaryBtnClass}
            >
              فحص حالة الربط والخدمات
            </button>
          </div>
          {data.dataLimitations && (
            <div role="note" className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface-subtle)] px-4 py-3 text-xs leading-6 text-[var(--k-ink-secondary)]">
              <strong className="text-[var(--k-ink)]">شفافية مصدر البيانات:</strong>
              {' '}{data.dataLimitations.revenue} {' '}{data.dataLimitations.expenses} {' '}{data.dataLimitations.aiCost} {' '}{data.dataLimitations.systemErrors}
              <div className="mt-1">لن تُعرض القيم غير المتوفرة على أنها أصفار أو إيرادات محصلة.</div>
            </div>
          )}

          {/* Primary Financial & Executive KPI Strip */}
          <section aria-label="المؤشرات المالية والتشغيلية الرئيسية" className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--k-ink-secondary)]">الإيرادات والتكاليف وصافي التشغيل</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricTile
                label="الإيرادات المحصلة فعلياً"
                value={formatCurrency(data.metrics.collectedRevenueUsd)}
                deltaPct={data.comparisons.revenueDeltaPct}
                subtext={data.dataLimitations?.revenue || 'بانتظار التحقق أو تصحيح مبلغ الدفع'}
                tone="sage"
                onClick={() => onNavigate('invoices_payments')}
              />
              <MetricTile
                label="تكاليف مزودي الذكاء الاصطناعي"
                value={data.dataLimitations?.aiCost ? 'غير متاح' : formatCurrency(data.metrics.aiProviderCostsUsd)}
                deltaPct={data.comparisons.aiCostDeltaPct}
                subtext={data.dataLimitations?.aiCost || `${formatNumber(data.metrics.totalTokens)} Token`}
                onClick={() => onNavigate('ai_usage')}
              />
              <MetricTile
                label="المصروفات التشغيلية المسجلة"
                value={data.dataLimitations?.expenses ? 'غير متاح' : formatCurrency(data.metrics.recordedExpensesUsd)}
                subtext={data.dataLimitations?.expenses || `الإجمالي التشغيلي: ${formatCurrency(data.metrics.totalOperatingCostsUsd)}`}
                onClick={() => onNavigate('invoices_payments')}
              />
              <MetricTile
                label="صافي الربح مقابل التكاليف"
                value={data.dataLimitations?.revenue || data.dataLimitations?.expenses || data.dataLimitations?.aiCost ? 'غير متاح' : formatCurrency(data.metrics.netMarginUsd)}
                subtext={
                  data.dataLimitations?.revenue || data.dataLimitations?.expenses || data.dataLimitations?.aiCost ? 'يتطلب ربط دفتر الفوترة والتكاليف' : data.metrics.netMarginPercent !== null
                    ? `هامش التشغيل: ${data.metrics.netMarginPercent}%`
                    : 'بانتظار فواتير محصلة'
                }
                tone={data.metrics.netMarginUsd < 0 ? 'warning' : 'success'}
                onClick={() => onNavigate('reports')}
              />
            </div>
          </section>

          {/* Complete 22-Metric Platform Grid (Every tile clickable!) */}
          <section aria-label="إحصائيات المنصة الشاملة" className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--k-ink-secondary)]">المستخدمون والاشتراكات والوكلاء والقنوات</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricTile
                label="إجمالي المستخدمين"
                value={formatNumber(data.metrics.totalUsers)}
                subtext={`جدد بالفترة: ${formatNumber(data.metrics.newUsersInPeriod)}`}
                deltaPct={data.comparisons.newUsersDeltaPct}
                onClick={() => onNavigate('users')}
              />
              <MetricTile
                label="المستخدمون النشطون"
                value={formatNumber(data.metrics.activeUsers)}
                subtext={`تجريبيون: ${formatNumber(data.metrics.trialAccounts)}`}
                onClick={() => onNavigate('users')}
              />
              <MetricTile
                label="المستخدمون المتوقفون"
                value={formatNumber(data.metrics.suspendedUsers)}
                tone={data.metrics.suspendedUsers > 0 ? 'warning' : 'default'}
                onClick={() => onNavigate('users')}
              />
              <MetricTile
                label="الاشتراكات النشطة"
                value={formatNumber(data.metrics.activeSubscriptions)}
                deltaPct={data.comparisons.subscriptionsDeltaPct}
                subtext={`تجريبية: ${formatNumber(data.metrics.trialSubscriptions)}`}
                onClick={() => onNavigate('plans_subscriptions')}
              />
              <MetricTile
                label="منتهية / ملغاة"
                value={`${formatNumber(data.metrics.expiredSubscriptions)} / ${formatNumber(data.metrics.cancelledSubscriptions)}`}
                subtext={`متأخرة الدفع: ${formatNumber(data.metrics.pastDueSubscriptions)}`}
                tone={data.metrics.pastDueSubscriptions > 0 ? 'danger' : 'default'}
                onClick={() => onNavigate('plans_subscriptions')}
              />
              <MetricTile
                label="مساحات العمل"
                value={formatNumber(data.metrics.totalWorkspaces)}
                onClick={() => onNavigate('workspaces')}
              />
              <MetricTile
                label="إجمالي الوكلاء"
                value={formatNumber(data.metrics.totalAgents)}
                subtext={`نشطون: ${formatNumber(data.metrics.activeAgents)}`}
                onClick={() => onNavigate('agents')}
              />
              <MetricTile
                label="تنفيذ الوكلاء (نجاح/فشل)"
                value={`${formatNumber(data.metrics.successfulAgentRuns)} / ${formatNumber(data.metrics.failedAgentRuns)}`}
                tone={data.metrics.failedAgentRuns > 0 ? 'warning' : 'default'}
                onClick={() => onNavigate('agents')}
              />
              <MetricTile
                label="طلبات الذكاء الاصطناعي"
                value={formatNumber(data.metrics.totalAiRequests)}
                deltaPct={data.comparisons.aiRequestsDeltaPct}
                onClick={() => onNavigate('ai_usage')}
              />
              <MetricTile
                label="المحادثات / الرسائل"
                value={`${formatNumber(data.metrics.totalConversations)} / ${formatNumber(data.metrics.totalMessages)}`}
                onClick={() => onNavigate('conversations')}
              />
              <MetricTile
                label="القنوات (متصلة/متوقفة)"
                value={`${formatNumber(data.metrics.connectedChannels)} / ${formatNumber(data.metrics.disconnectedChannels)}`}
                onClick={() => onNavigate('channels')}
              />
              <MetricTile
                label="أخطاء النظام الحالية"
                value={formatNumber(data.metrics.currentSystemErrors)}
                tone={data.metrics.currentSystemErrors > 0 ? 'danger' : 'success'}
                onClick={() => onNavigate('errors_logs')}
              />
            </div>
          </section>

          {/* Interactive Charts Workspace */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[var(--k-ink)]">الرسوم البيانية التفاعلية</h2>
                  <p className="text-xs text-[var(--k-ink-muted)]">
                    توزيع النشاط الفعلي خلال {data.window.days} يوماً ({data.window.startIso.slice(0, 10)} — {data.window.endIso.slice(0, 10)})
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[var(--k-surface-subtle)] max-w-full">
                  {(
                    [
                      { id: 'growth', label: 'المستخدمون والاشتراكات' },
                      { id: 'finance', label: 'الإيرادات وتكلفة AI' },
                      { id: 'ai', label: 'الاستهلاك والأداء' },
                      { id: 'operations', label: 'المحادثات والرسائل' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setChartTab(t.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                        chartTab === t.id
                          ? 'bg-[var(--k-surface)] text-[var(--k-ink)] shadow-xs'
                          : 'text-[var(--k-ink-muted)] hover:text-[var(--k-ink)]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-72 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  {chartTab === 'growth' ? (
                    <AreaChart data={data.charts.timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--k-ink-muted)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--k-ink-muted)' }} allowDecimals={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="users" name="مستخدمون جدد" stroke="#1F3B22" fill="#D8E2D0" strokeWidth={2} />
                      <Area type="monotone" dataKey="subscriptions" name="اشتراكات جديدة" stroke="#15803D" fill="#15803D" fillOpacity={0.18} strokeWidth={2} />
                    </AreaChart>
                  ) : chartTab === 'finance' ? (
                    <BarChart data={data.charts.timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--k-ink-muted)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--k-ink-muted)' }} />
                      <Tooltip />
                      <Bar dataKey="revenueUsd" name="الإيراد المحصل ($)" fill="#1F3B22" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="aiCostUsd" name="تكلفة AI ($)" fill="#B45309" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : chartTab === 'ai' ? (
                    <BarChart data={data.charts.timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--k-ink-muted)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--k-ink-muted)' }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="successRuns" name="تنفيذ ناجح" fill="#15803D" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="failedRuns" name="تنفيذ فاشل" fill="#B91C1C" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : (
                    <AreaChart data={data.charts.timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--k-ink-muted)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--k-ink-muted)' }} allowDecimals={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="conversations" name="المحادثات" stroke="#1F3B22" fill="#D8E2D0" strokeWidth={2} />
                      <Area type="monotone" dataKey="messages" name="الرسائل" stroke="#1D4ED8" fill="#1D4ED8" fillOpacity={0.14} strokeWidth={2} />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right Column: Needs Owner Intervention + Plan Distribution */}
            <div className="lg:col-span-4 space-y-5">
              <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[var(--k-warning)]" />
                  <h2 className="text-sm font-bold text-[var(--k-ink)]">ما الذي يحتاج تدخلاً إدارياً؟</h2>
                </div>
                <ul className="divide-y divide-[var(--k-line)] text-xs">
                  <li className="py-2 flex items-center justify-between">
                    <button type="button" onClick={() => onNavigate('plans_subscriptions')} className="hover:underline text-[var(--k-ink-secondary)]">
                      اشتراكات متأخرة الدفع
                    </button>
                    <span className="font-mono tabular-nums font-semibold">{data.attentionItems.pastDueSubscriptions}</span>
                  </li>
                  <li className="py-2 flex items-center justify-between">
                    <button type="button" onClick={() => onNavigate('agents')} className="hover:underline text-[var(--k-ink-secondary)]">
                      وكلاء في حالة خطأ
                    </button>
                    <span className="font-mono tabular-nums font-semibold">{data.attentionItems.failingAgents}</span>
                  </li>
                  <li className="py-2 flex items-center justify-between">
                    <button type="button" onClick={() => onNavigate('channels')} className="hover:underline text-[var(--k-ink-secondary)]">
                      قنوات غير متصلة
                    </button>
                    <span className="font-mono tabular-nums font-semibold">{data.attentionItems.disconnectedChannels}</span>
                  </li>
                  <li className="py-2 flex items-center justify-between">
                    <button type="button" onClick={() => onNavigate('errors_logs')} className="hover:underline text-[var(--k-ink-secondary)]">
                      أخطاء نظام غير محلولة
                    </button>
                    <span className="font-mono tabular-nums font-semibold">{data.attentionItems.unresolvedErrors}</span>
                  </li>
                  <li className="py-2 flex items-center justify-between">
                    <button type="button" onClick={() => onNavigate('notifications_support')} className="hover:underline text-[var(--k-ink-secondary)]">
                      تذاكر دعم مفتوحة
                    </button>
                    <span className="font-mono tabular-nums font-semibold">{data.attentionItems.openTickets}</span>
                  </li>
                </ul>
              </div>

              <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
                <h2 className="text-sm font-bold text-[var(--k-ink)]">توزيع الباقات المعتمدة</h2>
                <div className="space-y-2.5">
                  {data.charts.planDistribution.map((p) => (
                    <div key={p.code} className="flex items-center justify-between text-xs">
                      <span className="text-[var(--k-ink-secondary)]">{p.name}</span>
                      <span className="font-mono tabular-nums font-semibold text-[var(--k-ink)]">
                        {formatNumber(p.subscribers)} مشترك
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Honest External Integrations Readiness Matrix */}
          <section className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[var(--k-ink)]">حالة ربط الخدمات والمزودين الخارجيين</h2>
                <p className="text-xs text-[var(--k-ink-muted)]">
                  فحص حي لمتغيرات البيئة على الخادم — أي خدمة بدون مفتاح مهيأ تُعرض بوضوح دون ادعاء الاتصال.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--k-line)] text-[var(--k-ink-muted)]">
                    <th className="py-2.5 text-start font-semibold">الخدمة / التكامل</th>
                    <th className="py-2.5 text-start font-semibold">المتغير المطلوب</th>
                    <th className="py-2.5 text-start font-semibold">الحالة الفعلية</th>
                    <th className="py-2.5 text-start font-semibold">التوضيح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--k-line)]">
                  {data.integrations.map((item) => (
                    <tr key={item.id} className="hover:bg-[var(--k-surface-subtle)]/60">
                      <td className="py-2.5 font-medium text-[var(--k-ink)] whitespace-nowrap">{item.name}</td>
                      <td className="py-2.5 font-mono text-[var(--k-ink-secondary)]" dir="ltr">
                        {item.envVar}
                      </td>
                      <td className="py-2.5">
                        <StatusText
                          status={item.configured ? 'ok' : item.status === 'local_fallback' ? 'info' : 'warn'}
                          label={
                            item.configured
                              ? 'مهيأ على الخادم'
                              : item.status === 'local_fallback'
                                ? 'قاعدة محلية نشطة'
                                : 'غير مربوط'
                          }
                        />
                      </td>
                      <td className="py-2.5 text-[var(--k-ink-muted)]">{item.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
