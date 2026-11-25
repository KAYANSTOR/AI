import React from 'react';
import { Download, Printer, Shield, Send, Check, UserPlus, Lock } from 'lucide-react';
import { apiFetch, downloadOwnerCsv, formatDateTime } from '../lib/api';
import {
  dangerBtnClass,
  EmptyState,
  inputClass,
  MetricTile,
  ModalDialog,
  PageHeader,
  primaryBtnClass,
  secondaryBtnClass,
  StatusText,
  TableSkeleton,
} from '../components/ui/Primitives';

// =========================================================================
// 15. SYSTEM MONITORING & ALERTS
// =========================================================================
export function SystemMonitoringPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data, setData] = React.useState<{
    runtime: Record<string, string | number>;
    services: Array<{ id: string; name: string; status: string; latencyMs: number | null; detail: string }>;
    alerts: Array<Record<string, unknown>>;
    migrations: Array<{ version: string; applied_at: string }>;
    agentStats?: {
      windowDays: number;
      tasks: { total: number; active: number; awaitingApproval: number; done: number; failed: number; costUsd: number; activeOrganizations: number };
      approvals: { pending: number; approved: number; rejected: number; expired: number };
      training: { total: number; pending: number; indexed: number; failed: number; flagged: number };
    };
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    setLoading(true);
    apiFetch<NonNullable<typeof data>>('/api/owner/monitoring')
      .then(setData)
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل حالة النظام.'))
      .finally(() => setLoading(false));
  }, [onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز مراقبة النظام والبنية التشغيلية"
        subtitle="فحص حي للخدمات الحقيقية على الخادم (Express، قاعدة البيانات، المصادقة، مزودو AI، القنوات، Webhooks، وبوابات الدفع) والتنبيهات."
        action={
          <button type="button" onClick={load} className={secondaryBtnClass}>
            إعادة الفحص الآن
          </button>
        }
      />

      {loading || !data ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MetricTile label="إصدار Node.js" value={String(data.runtime.nodeVersion)} />
            <MetricTile label="زمن التشغيل" value={`${String(data.runtime.uptimeSec)} ث`} />
            <MetricTile label="استهلاك الذاكرة" value={`${String(data.runtime.memoryMb)} MB`} />
            <MetricTile label="أخطاء غير محلولة" value={String(data.runtime.unresolvedErrors)} tone={Number(data.runtime.unresolvedErrors) > 0 ? 'danger' : 'success'} />
            <MetricTile label="محاولات دخول مرفوضة (24س)" value={String(data.runtime.unauthorizedAttempts24h)} tone={Number(data.runtime.unauthorizedAttempts24h) > 0 ? 'warning' : 'default'} />
          </div>

          {data.agentStats ? (
            <section aria-labelledby="agent-stats-title" className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-4">
              <div>
                <h2 id="agent-stats-title" className="text-sm font-bold">المساعد التنفيذي وبوت التدريب</h2>
                <p className="mt-0.5 text-xs text-[var(--k-ink-muted)]">بيانات حية من agent_tasks وagent_approvals وwhatsapp_training_submissions (آخر {data.agentStats.windowDays} يوماً).</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricTile label="مهام الوكيل" value={String(data.agentStats.tasks.total)} />
                <MetricTile label="مهام قيد التنفيذ" value={String(data.agentStats.tasks.active)} />
                <MetricTile label="بانتظار الموافقة" value={String(data.agentStats.tasks.awaitingApproval)} tone={data.agentStats.tasks.awaitingApproval > 0 ? 'warning' : 'default'} />
                <MetricTile label="مهام فاشلة" value={String(data.agentStats.tasks.failed)} tone={data.agentStats.tasks.failed > 0 ? 'danger' : 'success'} />
                <MetricTile label="موافقات معلقة" value={String(data.agentStats.approvals.pending)} />
                <MetricTile label="موافقات مقبولة / مرفوضة" value={`${data.agentStats.approvals.approved} / ${data.agentStats.approvals.rejected}`} />
                <MetricTile label="تدريب مُفهرس" value={`${data.agentStats.training.indexed} / ${data.agentStats.training.total}`} />
                <MetricTile label="تدريب معلّق / مُبلّغ عنه" value={`${data.agentStats.training.pending} / ${data.agentStats.training.flagged}`} tone={data.agentStats.training.flagged > 0 ? 'warning' : 'default'} />
              </div>
              <p className="text-xs text-[var(--k-ink-muted)]">
                تكلفة مهام الوكيل: <span className="font-mono tabular-nums">${data.agentStats.tasks.costUsd.toFixed(4)}</span> · مؤسسات نشطة: {data.agentStats.tasks.activeOrganizations} · موافقات منتهية: {data.agentStats.approvals.expired} · تدريب فاشل: {data.agentStats.training.failed}
              </p>
            </section>
          ) : null}

          <section className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                  <th className="px-4 py-3 text-start font-semibold">الخدمة</th>
                  <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                  <th className="px-4 py-3 text-start font-semibold">الاستجابة</th>
                  <th className="px-4 py-3 text-start font-semibold">التفاصيل الفنية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--k-line)]">
                {data.services.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--k-surface-subtle)]/60">
                    <td className="px-4 py-3 font-semibold">{s.name}</td>
                    <td className="px-4 py-3">
                      <StatusText
                        status={s.status === 'operational' ? 'ok' : 'warn'}
                        label={s.status === 'operational' ? 'تعمل بكفاءة' : 'غير مربوطة بعد'}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      {s.latencyMs !== null ? `${s.latencyMs} ms` : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--k-ink-muted)]">{s.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
              <h2 className="text-sm font-bold">التنبيهات الإدارية ({data.alerts.length})</h2>
              {data.alerts.length === 0 ? (
                <p className="text-xs text-[var(--k-ink-muted)]">لا توجد تنبيهات نشطة حالياً.</p>
              ) : (
                <div className="divide-y divide-[var(--k-line)] text-xs">
                  {data.alerts.map((al) => (
                    <div key={String(al.id)} className="py-2.5 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{String(al.title)}</div>
                        <p className="text-[var(--k-ink-muted)] mt-0.5">{String(al.description)}</p>
                      </div>
                      {Number(al.acknowledged) === 0 ? (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await apiFetch(`/api/owner/alerts/${encodeURIComponent(String(al.id))}/ack`, { method: 'POST' });
                              onNotify('success', 'تم تأكيد متابعة التنبيه.');
                              load();
                            } catch (err) {
                              onNotify('error', err instanceof Error ? err.message : 'تعذر إقرار التنبيه.');
                            }
                          }}
                          className={secondaryBtnClass}
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>إقرار</span>
                        </button>
                      ) : (
                        <span className="shrink-0 text-[10px] text-[var(--k-ink-muted)]">تنبيه آلي من بيانات التشغيل</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
              <h2 className="text-sm font-bold">سجل الترحيلات الرسمية لقاعدة البيانات (Schema Migrations)</h2>
              <div className="divide-y divide-[var(--k-line)] text-xs font-mono">
                {data.migrations.map((m) => (
                  <div key={m.version} className="py-2 flex items-center justify-between">
                    <span>{m.version}</span>
                    <span className="text-[var(--k-ink-muted)]">{formatDateTime(m.applied_at)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

// =========================================================================
// 16. ERRORS & SYSTEM LOGS CENTER
// =========================================================================
export function ErrorsLogsPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [logs, setLogs] = React.useState<Array<Record<string, unknown>>>([]);
  const [category, setCategory] = React.useState('all');
  const [severity, setSeverity] = React.useState('all');
  const [resolved, setResolved] = React.useState('all');
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ category, severity, resolved });
    apiFetch<{ items: Array<Record<string, unknown>> }>(`/api/owner/logs?${q.toString()}`)
      .then((res) => setLogs(res.items))
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل السجلات.'))
      .finally(() => setLoading(false));
  }, [category, severity, resolved, onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز الأخطاء وسجلات النظام"
        subtitle="عرض أخطاء التشغيل الفعلية من سجلات الذكاء الاصطناعي والرسائل الواردة والصادرة وWhatsApp وWebhooks وسجل تدقيق المالك، مع تنقيح الأسرار."
      />

      <div className="flex flex-wrap gap-3 p-4 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)]">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]">
          <option value="all">كل التصنيفات</option>
          <option value="ai">أخطاء الذكاء الاصطناعي</option>
          <option value="webhook">Webhooks</option>
          <option value="inbound">الرسائل الواردة</option>
          <option value="outbox">الرسائل الصادرة</option>
          <option value="whatsapp_gateway">جلسات WhatsApp</option>
          <option value="admin_audit">سجل تدقيق المالك</option>
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]">
          <option value="all">كل مستويات الخطورة</option>
          <option value="error">خطأ (Error)</option>
          <option value="warning">تحذير (Warning)</option>
          <option value="info">معلوماتي</option>
        </select>
        <select value={resolved} onChange={(e) => setResolved(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]">
          <option value="all">الكل</option>
          <option value="open">مفتوح</option>
          <option value="resolved">محلول</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : logs.length === 0 ? (
        <EmptyState
          title="السجل نظيف — لا توجد أخطاء مطابقة"
          description="جميع خدمات الخادم تعمل بسلاسة ولم تُسجل أخطاء ضمن نطاق التصفية الحالي."
        />
      ) : (
        <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                <th className="px-4 py-3 text-start font-semibold">الخطورة / التصنيف</th>
                <th className="px-4 py-3 text-start font-semibold">الخدمة</th>
                <th className="px-4 py-3 text-start font-semibold">الرسالة والتفاصيل المنقّحة</th>
                <th className="px-4 py-3 text-start font-semibold">الوقت</th>
                <th className="px-4 py-3 text-end font-semibold">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--k-line)]">
              {logs.map((l) => (
                <tr key={String(l.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                  <td className="px-4 py-3">
                    <StatusText
                      status={l.severity === 'critical' || l.severity === 'error' ? 'error' : l.severity === 'warning' ? 'warn' : 'info'}
                      label={`${String(l.severity)} · ${String(l.category)}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono">{String(l.service_name)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--k-ink)]">{String(l.message)}</div>
                    {Boolean(l.details_sanitized) && (
                      <div className="text-[11px] font-mono text-[var(--k-ink-muted)] mt-0.5 truncate max-w-md" dir="ltr">
                        {String(l.details_sanitized)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--k-ink-muted)] whitespace-nowrap">
                    {formatDateTime(String(l.created_at))}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {Number(l.resolved) === 0 ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/owner/logs/${encodeURIComponent(String(l.id))}/resolve`, {
                            method: 'POST', body: { source: String(l.source) },
                          });
                          onNotify('success', 'تم تحديد الخطأ كمحلول.');
                          load();
                        }}
                        className={secondaryBtnClass}
                      >
                        تحديد كمحلول
                      </button>
                    ) : (
                      <StatusText status="ok" label="محلول" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 17. NOTIFICATIONS, SUPPORT TICKETS & UNIFIED ACTIVITY FEED
// =========================================================================
export function NotificationsSupportPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data, setData] = React.useState<{
    notifications: Array<Record<string, unknown>>;
    tickets: Array<Record<string, unknown>>;
    activityFeed: Array<Record<string, unknown>>;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [ticketOpen, setTicketOpen] = React.useState(false);

  const [targetType, setTargetType] = React.useState<'all_users' | 'plan_tier' | 'trial_users' | 'expiring_soon'>('all_users');
  const [targetFilter, setTargetFilter] = React.useState('growth');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [scheduledFor, setScheduledFor] = React.useState('');

  const [tSubject, setTSubject] = React.useState('');
  const [tDesc, setTDesc] = React.useState('');
  const [tPriority, setTPriority] = React.useState('medium');

  const load = React.useCallback(() => {
    setLoading(true);
    apiFetch<NonNullable<typeof data>>('/api/owner/notifications-support')
      .then(setData)
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل الإشعارات والدعم.'))
      .finally(() => setLoading(false));
  }, [onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الإشعارات والتواصل والدعم الفني"
        subtitle="إرسال الإعلانات المستهدفة داخل المنصة (In-App)، إدارة تذاكر الدعم، ومتابعة سجل نشاط المنصة الموحد."
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => setTicketOpen(true)} className={secondaryBtnClass}>
              فتح تذكرة دعم
            </button>
            <button type="button" onClick={() => setNotifOpen(true)} className={primaryBtnClass}>
              <Send className="w-4 h-4" />
              <span>إرسال إشعار / إعلان</span>
            </button>
          </div>
        }
      />

      {loading || !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <section className="lg:col-span-6 p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
            <h2 className="text-sm font-bold">سجل الإشعارات والإعلانات ({data.notifications.length})</h2>
            {data.notifications.length === 0 ? (
              <p className="text-xs text-[var(--k-ink-muted)]">لم تُرسل إشعارات بعد.</p>
            ) : (
              <div className="divide-y divide-[var(--k-line)] text-xs">
                {data.notifications.map((n) => (
                  <div key={String(n.id)} className="py-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{String(n.title)}</span>
                      <StatusText status={n.delivery_status === 'sent' ? 'ok' : 'info'} label={String(n.delivery_status)} />
                    </div>
                    <p className="text-[var(--k-ink-secondary)]">{String(n.body)}</p>
                    <div className="text-[11px] text-[var(--k-ink-muted)]">
                      الاستهداف: {String(n.target_type)} · المستلمون: {String(n.recipients_count)} · {formatDateTime(String(n.created_at))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="lg:col-span-6 p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
            <h2 className="text-sm font-bold">تذاكر الدعم الفني والشكاوى ({data.tickets.length})</h2>
            {data.tickets.length === 0 ? (
              <p className="text-xs text-[var(--k-ink-muted)]">لا توجد تذاكر دعم مفتوحة حالياً.</p>
            ) : (
              <div className="divide-y divide-[var(--k-line)] text-xs">
                {data.tickets.map((t) => (
                  <div key={String(t.id)} className="py-2.5 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">
                        <span className="font-mono text-[var(--k-ink-muted)]">{String(t.ticket_number)}</span> · {String(t.subject)}
                      </div>
                      <p className="text-[var(--k-ink-muted)] mt-0.5">{String(t.description)}</p>
                    </div>
                    <select
                      value={String(t.status)}
                      onChange={async (e) => {
                        await apiFetch(`/api/owner/tickets/${encodeURIComponent(String(t.id))}/status`, {
                          method: 'PATCH',
                          body: { status: e.target.value },
                        });
                        onNotify('success', 'تم تحديث حالة التذكرة.');
                        load();
                      }}
                      className="px-2 py-1 text-xs rounded border border-[var(--k-line-strong)] bg-[var(--k-surface)]"
                    >
                      <option value="open">مفتوحة</option>
                      <option value="in_progress">قيد المعالجة</option>
                      <option value="resolved">تم الحل</option>
                      <option value="closed">مغلقة</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="lg:col-span-12 p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
            <h2 className="text-sm font-bold">سجل نشاط المنصة الموحد ({data.activityFeed.length})</h2>
            <div className="divide-y divide-[var(--k-line)] text-xs max-h-80 overflow-y-auto">
              {data.activityFeed.map((a) => (
                <div key={`${String(a.source)}_${String(a.id)}`} className="py-2 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="font-mono text-[11px] text-[var(--k-ink-muted)]">[{String(a.event_type)}] </span>
                    <span className="text-[var(--k-ink)]">{String(a.summary)}</span>
                  </div>
                  <span className="text-[11px] text-[var(--k-ink-muted)] whitespace-nowrap">
                    {String(a.actor)} · {formatDateTime(String(a.created_at))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <ModalDialog open={notifOpen} title="إرسال إشعار أو إعلان عام" onClose={() => setNotifOpen(false)}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/owner/notifications', {
                method: 'POST',
                body: { targetType, targetFilter, title, body, scheduledFor: scheduledFor || null },
              });
              onNotify('success', 'تم إرسال/جدولة الإشعار بنجاح.');
              setNotifOpen(false);
              setTitle('');
              setBody('');
              load();
            } catch (err) {
              onNotify('error', err instanceof Error ? err.message : 'تعذر الإرسال.');
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">الشريحة المستهدفة</label>
            <select value={targetType} onChange={(e) => setTargetType(e.target.value as typeof targetType)} className={inputClass}>
              <option value="all_users">إعلان عام لجميع المستخدمين</option>
              <option value="plan_tier">مستخدمو باقة محددة</option>
              <option value="trial_users">المستخدمون التجريبيون</option>
              <option value="expiring_soon">الحسابات القريبة من انتهاء الاشتراك</option>
            </select>
          </div>
          {targetType === 'plan_tier' && (
            <div>
              <label className="block text-xs font-medium mb-1">اختر الباقة</label>
              <select value={targetFilter} onChange={(e) => setTargetFilter(e.target.value)} className={inputClass}>
                <option value="trial">المجانية</option>
                <option value="starter">البداية</option>
                <option value="growth">الاحترافية</option>
                <option value="pro">الأعمال</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1">العنوان *</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">المحتوى *</label>
            <textarea required rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">جدولة الإرسال (اختياري)</label>
            <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className={inputClass} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNotifOpen(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" className={primaryBtnClass}>إرسال الإشعار</button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog open={ticketOpen} title="فتح تذكرة دعم فني" onClose={() => setTicketOpen(false)}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/owner/tickets', {
                method: 'POST',
                body: { subject: tSubject, description: tDesc, priority: tPriority },
              });
              onNotify('success', 'تم فتح تذكرة الدعم الفني.');
              setTicketOpen(false);
              setTSubject('');
              setTDesc('');
              load();
            } catch (err) {
              onNotify('error', err instanceof Error ? err.message : 'تعذر فتح التذكرة.');
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">الموضوع *</label>
            <input required value={tSubject} onChange={(e) => setTSubject(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">الأولوية</label>
            <select value={tPriority} onChange={(e) => setTPriority(e.target.value)} className={inputClass}>
              <option value="low">منخفضة</option>
              <option value="medium">متوسطة</option>
              <option value="high">عالية</option>
              <option value="urgent">عاجلة</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">التفاصيل *</label>
            <textarea required rows={3} value={tDesc} onChange={(e) => setTDesc(e.target.value)} className={inputClass} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setTicketOpen(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" className={primaryBtnClass}>حفظ التذكرة</button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}

// =========================================================================
// 18. REPORTS & CSV / PRINT-PDF EXPORT CENTER (ALL 10 REPORTS)
// =========================================================================
const REPORT_CATALOG = [
  { id: 'users', label: 'تقرير المستخدمين' },
  { id: 'subscriptions', label: 'تقرير الاشتراكات' },
  { id: 'revenue', label: 'تقرير الإيرادات الفعلية' },
  { id: 'invoices', label: 'تقرير الفواتير' },
  { id: 'ai_usage', label: 'تقرير استهلاك AI' },
  { id: 'model_costs', label: 'تقرير تكلفة النماذج' },
  { id: 'agents', label: 'تقرير أداء الوكلاء' },
  { id: 'agent_quality', label: 'جودة الوكلاء ورضا العملاء' },
  { id: 'channels', label: 'تقرير استخدام القنوات' },
  { id: 'errors', label: 'تقرير الأخطاء' },
  { id: 'activity', label: 'تقرير النشاط والتدقيق' },
];

export function ReportsPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [selected, setSelected] = React.useState('users');
  const [report, setReport] = React.useState<{
    title: string;
    headers: Array<{ key: string; label: string }>;
    rows: Array<Record<string, unknown>>;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    apiFetch<NonNullable<typeof report>>(`/api/owner/reports/${encodeURIComponent(selected)}`)
      .then(setReport)
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر بناء التقرير.'))
      .finally(() => setLoading(false));
  }, [selected, onNotify]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز التقارير والتصدير"
        subtitle="استخراج تقارير تشغيلية ومالية فورية قابلة للتصدير بصيغة CSV (متوافق مع Excel العربي UTF-8) والطباعة كـ PDF."
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className={secondaryBtnClass}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة / PDF</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await downloadOwnerCsv(selected, `kayan-${selected}-report.csv`);
                  onNotify('success', 'تم تصدير ملف CSV وتوثيق العملية في سجل التدقيق.');
                } catch (err) {
                  onNotify('error', err instanceof Error ? err.message : 'تعذر التصدير.');
                }
              }}
              className={primaryBtnClass}
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير CSV / Excel</span>
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {REPORT_CATALOG.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelected(r.id)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              selected === r.id
                ? 'border-[var(--k-brand-forest)] bg-[var(--k-sage-tint)] font-semibold text-[var(--k-ink)]'
                : 'border-[var(--k-line)] bg-[var(--k-surface)] text-[var(--k-ink-secondary)]'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading || !report ? (
        <TableSkeleton rows={5} />
      ) : report.rows.length === 0 ? (
        <EmptyState
          title={`${report.title} — لا توجد سجلات حتى الآن`}
          description="يمكنك تصدير التقرير بصيغة CSV أو إضافته فور تسجيل بيانات حقيقية في المنصة."
        />
      ) : (
        <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                {report.headers.map((h) => (
                  <th key={h.key} className="px-4 py-3 text-start font-semibold whitespace-nowrap">
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--k-line)]">
              {report.rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-[var(--k-surface-subtle)]/60">
                  {report.headers.map((h) => (
                    <td key={h.key} className="px-4 py-2.5 font-mono tabular-nums whitespace-nowrap">
                      {row[h.key] === null || row[h.key] === undefined ? '—' : String(row[h.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 19. IMMUTABLE AUDIT LOGS VIEWER
// =========================================================================
export function AuditLogsPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data, setData] = React.useState<{
    items: Array<Record<string, unknown>>;
    pagination: { page: number; total: number; totalPages: number };
  } | null>(null);
  const [search, setSearch] = React.useState('');
  const [entityType, setEntityType] = React.useState('all');
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(
    (page = 1) => {
      setLoading(true);
      const q = new URLSearchParams({ page: String(page), entityType });
      if (search.trim()) q.set('search', search.trim());
      apiFetch<NonNullable<typeof data>>(`/api/owner/audit-logs?${q.toString()}`)
        .then(setData)
        .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل سجل التدقيق.'))
        .finally(() => setLoading(false));
    },
    [search, entityType, onNotify]
  );

  React.useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل التدقيق الإداري غير القابل للتعديل"
        subtitle="يوثّق كل عملية حساسة نُفذت داخل مركز التحكم (المنفّذ، الوقت، القيمة السابقة والجديدة، وعنوان IP)."
      />

      <div className="flex flex-wrap gap-3 p-4 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)]">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث في ملخص العملية، المنفذ، الإجراء، أو المعرف..."
          className={`${inputClass} flex-1 min-w-[220px]`}
        />
        <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]">
          <option value="all">كل الكيانات</option>
          <option value="user">المستخدمون</option>
          <option value="plan">الباقات</option>
          <option value="subscription">الاشتراكات</option>
          <option value="invoice">الفواتير</option>
          <option value="feature_flag">المزايا</option>
          <option value="agent">الوكلاء</option>
          <option value="channel">القنوات</option>
          <option value="platform_setting">الإعدادات</option>
        </select>
      </div>

      {loading || !data ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                <th className="px-3 py-3 text-start font-semibold whitespace-nowrap">الإجراء</th>
                <th className="px-3 py-3 text-start font-semibold whitespace-nowrap">المنفذ</th>
                <th className="px-3 py-3 text-start font-semibold">ملخص العملية</th>
                <th className="px-3 py-3 text-start font-semibold whitespace-nowrap">IP</th>
                <th className="px-3 py-3 text-start font-semibold whitespace-nowrap">التوقيت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--k-line)]">
              {data.items.map((l) => (
                <tr key={String(l.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                  <td className="px-3 py-3 font-mono font-semibold text-[var(--k-ink)] whitespace-nowrap">{String(l.action)}</td>
                  <td className="px-3 py-3 font-mono text-[var(--k-ink-muted)] whitespace-nowrap" dir="ltr">{String(l.actor_email)}</td>
                  <td className="px-3 py-3 min-w-[240px]">
                    <div>{String(l.summary)}</div>
                    {(Boolean(l.before_json) || Boolean(l.after_json)) && (
                      <div className="text-[11px] font-mono text-[var(--k-ink-muted)] truncate max-w-sm mt-0.5" dir="ltr">
                        {l.before_json ? `before: ${String(l.before_json)} ` : ''}
                        {l.after_json ? `after: ${String(l.after_json)}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-[var(--k-ink-muted)] whitespace-nowrap" dir="ltr">{String(l.ip_address)}</td>
                  <td className="px-3 py-3 text-[var(--k-ink-muted)] whitespace-nowrap">{formatDateTime(String(l.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 20. PLATFORM SETTINGS & OWNER SECURITY / MFA / SESSIONS / RBAC
// =========================================================================
export function SettingsSecurityPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [settings, setSettings] = React.useState<
    Array<{ key: string; category: string; value: unknown; description: string; updated_by: string; updated_at: string }>
  >([]);
  const [security, setSecurity] = React.useState<{
    currentAdmin: { id: string; email: string; role: string; mfaEnabled: boolean; sessionId: string };
    sessions: Array<Record<string, unknown>>;
    loginAttempts: Array<Record<string, unknown>>;
    admins: Array<Record<string, unknown>>;
    encryptionKeyConfigured: boolean;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [mfaSetup, setMfaSetup] = React.useState<{ secret: string; otpauthUri: string } | null>(null);
  const [mfaCode, setMfaCode] = React.useState('');
  const [adminModal, setAdminModal] = React.useState(false);
  const [admName, setAdmName] = React.useState('');
  const [admEmail, setAdmEmail] = React.useState('');
  const [admRole, setAdmRole] = React.useState<'super_admin' | 'ops_auditor'>('ops_auditor');
  const [admPassword, setAdmPassword] = React.useState('');

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ items: typeof settings }>('/api/owner/settings'),
      apiFetch<NonNullable<typeof security>>('/api/owner/security'),
    ])
      .then(([st, sec]) => {
        setSettings(st.items);
        setSecurity(sec);
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل الإعدادات والأمان.'))
      .finally(() => setLoading(false));
  }, [onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function saveSetting(key: string, value: unknown) {
    try {
      await apiFetch(`/api/owner/settings/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        body: { value },
      });
      onNotify('success', `تم حفظ الإعداد "${key}" وتوثيق التغيير.`);
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر حفظ الإعداد.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="إعدادات المنصة العامة وأمن مالك المشروع"
        subtitle="إعدادات Kayan AI المرتبطة بقاعدة البيانات مع سجل تدقيق كامل، وإدارة المصادقة الثنائية TOTP MFA والجلسات النشطة وصلاحيات المديرين."
        action={
          security?.currentAdmin.role === 'platform_owner' && (
            <button type="button" onClick={() => setAdminModal(true)} className={primaryBtnClass}>
              <UserPlus className="w-4 h-4" />
              <span>إضافة مدير داخلي (RBAC)</span>
            </button>
          )
        }
      />

      {loading || !security ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="space-y-6">
          {/* Platform Settings Grid */}
          <section className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-4">
            <h2 className="text-sm font-bold">إعدادات المنصة العامة (مخزنة في قاعدة البيانات)</h2>
            <div className="divide-y divide-[var(--k-line)]">
              {settings.map((s) => (
                <div key={s.key} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-[var(--k-ink)]">{s.description || s.key}</div>
                    <div className="text-[11px] font-mono text-[var(--k-ink-muted)]">
                      {s.key} · {s.category} · آخر تحديث بواسطة {s.updated_by}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {typeof s.value === 'boolean' ? (
                      <button
                        type="button"
                        onClick={() => saveSetting(s.key, !s.value)}
                        className={secondaryBtnClass}
                      >
                        {s.value ? 'مفعل — انقر للتعطيل' : 'معطل — انقر للتفعيل'}
                      </button>
                    ) : (
                      <SettingInlineEditor
                        initialValue={String(s.value)}
                        isNumber={typeof s.value === 'number'}
                        onSave={(v) => saveSetting(s.key, v)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* MFA & Sessions Security */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-5 p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-4">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[var(--k-brand-forest)]" />
                <h2 className="text-sm font-bold">المصادقة متعددة العوامل (TOTP MFA)</h2>
              </div>
              <p className="text-xs text-[var(--k-ink-muted)] leading-relaxed">
                الحالة الحالية:{' '}
                <strong className="text-[var(--k-ink)]">
                  {security.currentAdmin.mfaEnabled ? 'مفعلة لحسابك' : 'غير مفعلة بعد'}
                </strong>
                . يمكنك ربط تطبيق Google Authenticator أو Authy لطبقة حماية إضافية.
              </p>

              {!mfaSetup ? (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await apiFetch<{ secret: string; otpauthUri: string }>('/api/owner/auth/mfa/setup', {
                      method: 'POST',
                    });
                    setMfaSetup(res);
                  }}
                  className={primaryBtnClass}
                >
                  <Shield className="w-4 h-4" />
                  <span>{security.currentAdmin.mfaEnabled ? 'إعادة تهيئة TOTP MFA' : 'تفعيل المصادقة الثنائية TOTP'}</span>
                </button>
              ) : (
                <div className="space-y-3 p-3 rounded-lg bg-[var(--k-surface-subtle)] border border-[var(--k-line)]">
                  <div className="text-xs font-semibold">أضف هذا السر إلى تطبيق المصادقة:</div>
                  <div className="font-mono text-xs p-2 rounded bg-[var(--k-surface)] border border-[var(--k-line)] break-all" dir="ltr">
                    {mfaSetup.secret}
                  </div>
                  <div className="flex gap-2">
                    <input
                      dir="ltr"
                      maxLength={6}
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      placeholder="رمز 6 أرقام"
                      className={`${inputClass} font-mono text-left`}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiFetch('/api/owner/auth/mfa/confirm', {
                            method: 'POST',
                            body: { code: mfaCode },
                          });
                          onNotify('success', 'تم تفعيل المصادقة الثنائية بنجاح.');
                          setMfaSetup(null);
                          setMfaCode('');
                          load();
                        } catch (err) {
                          onNotify('error', err instanceof Error ? err.message : 'رمز غير صحيح.');
                        }
                      }}
                      className={primaryBtnClass}
                    >
                      تأكيد
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-[var(--k-line)] space-y-2">
                <h3 className="text-xs font-bold">المديرون المصرح لهم ({security.admins.length})</h3>
                {security.admins.map((a) => (
                  <div key={String(a.id)} className="text-xs flex items-center justify-between py-1">
                    <div>
                      <div className="font-medium">{String(a.full_name)}</div>
                      <div className="text-[11px] font-mono text-[var(--k-ink-muted)]" dir="ltr">{String(a.email)}</div>
                    </div>
                    <span className="font-mono text-[11px]">{String(a.role)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="lg:col-span-7 p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
              <h2 className="text-sm font-bold">الجلسات الإدارية النشطة وسجل محاولات الدخول</h2>
              <div className="divide-y divide-[var(--k-line)] text-xs max-h-64 overflow-y-auto">
                {security.sessions.map((s) => (
                  <div key={String(s.id)} className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono">{String(s.email)} · IP {String(s.ip_address)}</div>
                      <div className="text-[11px] text-[var(--k-ink-muted)]">
                        ينتهي: {formatDateTime(String(s.expires_at))}
                        {String(s.id) === security.currentAdmin.sessionId ? ' · الجلسة الحالية' : ''}
                      </div>
                    </div>
                    {s.revoked_at ? (
                      <StatusText status="muted" label="مبطلة" />
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/owner/security/sessions/${encodeURIComponent(String(s.id))}/revoke`, {
                            method: 'POST',
                          });
                          onNotify('info', 'تم إبطال الجلسة الإدارية.');
                          load();
                        }}
                        className={dangerBtnClass}
                      >
                        إبطال الجلسة
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      <ModalDialog open={adminModal} title="إضافة مدير داخلي (RBAC)" onClose={() => setAdminModal(false)}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/owner/security/admins', {
                method: 'POST',
                body: { fullName: admName, email: admEmail, role: admRole, password: admPassword },
              });
              onNotify('success', 'تم إضافة المدير الداخلي بصلاحيات محددة.');
              setAdminModal(false);
              setAdmName('');
              setAdmEmail('');
              setAdmPassword('');
              load();
            } catch (err) {
              onNotify('error', err instanceof Error ? err.message : 'تعذر إضافة المدير.');
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">الاسم *</label>
            <input required value={admName} onChange={(e) => setAdmName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">البريد الإلكتروني *</label>
            <input required type="email" dir="ltr" value={admEmail} onChange={(e) => setAdmEmail(e.target.value)} className={`${inputClass} font-mono text-left`} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">الدور الإداري</label>
            <select value={admRole} onChange={(e) => setAdmRole(e.target.value as 'super_admin' | 'ops_auditor')} className={inputClass}>
              <option value="ops_auditor">مدقق عمليات (قراءة ومراقبة فقط)</option>
              <option value="super_admin">مدير تشغيلي (صلاحيات إدارة العملاء والوكلاء)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">كلمة المرور (10 أحرف على الأقل) *</label>
            <input required minLength={10} type="password" dir="ltr" value={admPassword} onChange={(e) => setAdmPassword(e.target.value)} className={`${inputClass} font-mono text-left`} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdminModal(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" className={primaryBtnClass}>إضافة المدير</button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}

function SettingInlineEditor({
  initialValue,
  isNumber,
  onSave,
}: {
  initialValue: string;
  isNumber: boolean;
  onSave: (val: string | number) => void;
}) {
  const [val, setVal] = React.useState(initialValue);
  return (
    <div className="flex items-center gap-2">
      <input
        type={isNumber ? 'number' : 'text'}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)] text-[var(--k-ink)] font-mono w-44"
      />
      <button
        type="button"
        disabled={val === initialValue}
        onClick={() => onSave(isNumber ? Number(val) : val)}
        className={secondaryBtnClass}
      >
        حفظ
      </button>
    </div>
  );
}
