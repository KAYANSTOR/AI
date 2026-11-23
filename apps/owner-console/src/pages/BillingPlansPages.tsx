import React from 'react';
import { Plus, Edit3, Archive, Receipt } from 'lucide-react';
import { apiFetch, formatCurrency, formatDateTime, formatNumber } from '../lib/api';
import {
  ConfirmActionModal,
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

interface PlanRow {
  id: string;
  code: string;
  name: string;
  name_en: string;
  description: string;
  price_monthly: number;
  price_yearly: number | null;
  currency: string;
  billing_cycle: string;
  trial_days: number | null;
  max_users: number | null;
  max_agents: number | null;
  max_messages: number | null;
  token_quota: number | null;
  max_channels: number | null;
  voice_minutes: number | null;
  automation_runs: number | null;
  campaign_sends: number | null;
  storage_mb: number | null;
  allowed_models: string[];
  allowed_channels: string[];
  enabled_features: string[];
  status: string;
  active_subscribers: number;
  editable?: boolean;
}

export function PlansSubscriptionsPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [tab, setTab] = React.useState<'plans' | 'subscriptions'>('subscriptions');
  const [plans, setPlans] = React.useState<PlanRow[]>([]);
  const [subs, setSubs] = React.useState<Array<Record<string, unknown>>>([]);
  const [subSummary, setSubSummary] = React.useState<Record<string, number>>({});
  const [subFilter, setSubFilter] = React.useState('all');
  const [loading, setLoading] = React.useState(true);

  const [editPlanOpen, setEditPlanOpen] = React.useState(false);
  const [editingPlanId, setEditingPlanId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    code: '',
    name: '',
    nameEn: '',
    description: '',
    priceMonthly: '29',
    priceYearly: '290',
    currency: 'USD',
    trialDays: '7',
    maxUsers: '10',
    maxAgents: '5',
    maxMessages: '5000',
    tokenQuota: '5000000',
    maxChannels: '5',
    storageMb: '2048',
    status: 'active' as 'active' | 'archived' | 'draft',
  });

  const loadAll = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ items: PlanRow[] }>('/api/owner/plans'),
      apiFetch<{ items: Array<Record<string, unknown>>; summary: Record<string, number> }>(
        `/api/owner/subscriptions?status=${encodeURIComponent(subFilter)}`
      ),
    ])
      .then(([pRes, sRes]) => {
        setPlans(pRes.items);
        setSubs(sRes.items);
        setSubSummary(sRes.summary || {});
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل الباقات والاشتراكات.'))
      .finally(() => setLoading(false));
  }, [subFilter, onNotify]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  function openNewPlan() {
    setEditingPlanId(null);
    setForm({
      code: '',
      name: '',
      nameEn: '',
      description: '',
      priceMonthly: '49',
      priceYearly: '490',
      currency: 'USD',
      trialDays: '7',
      maxUsers: '15',
      maxAgents: '8',
      maxMessages: '10000',
      tokenQuota: '10000000',
      maxChannels: '6',
      storageMb: '4096',
      status: 'active',
    });
    setEditPlanOpen(true);
  }

  function openEditPlan(p: PlanRow) {
    setEditingPlanId(p.id);
    setForm({
      code: p.code,
      name: p.name,
      nameEn: p.name_en,
      description: p.description,
      priceMonthly: String(p.price_monthly),
      priceYearly: String(p.price_yearly),
      currency: p.currency,
      trialDays: String(p.trial_days),
      maxUsers: String(p.max_users),
      maxAgents: String(p.max_agents),
      maxMessages: String(p.max_messages),
      tokenQuota: String(p.token_quota),
      maxChannels: String(p.max_channels),
      storageMb: String(p.storage_mb),
      status: (p.status as 'active' | 'archived' | 'draft') || 'active',
    });
    setEditPlanOpen(true);
  }

  async function savePlanSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const endpoint = editingPlanId ? `/api/owner/plans/${encodeURIComponent(editingPlanId)}` : '/api/owner/plans';
      await apiFetch(endpoint, {
        method: editingPlanId ? 'PUT' : 'POST',
        body: {
          code: form.code,
          name: form.name,
          nameEn: form.nameEn,
          description: form.description,
          priceMonthly: Number(form.priceMonthly),
          priceYearly: Number(form.priceYearly),
          currency: form.currency,
          trialDays: Number(form.trialDays),
          maxUsers: Number(form.maxUsers),
          maxAgents: Number(form.maxAgents),
          maxMessages: Number(form.maxMessages),
          tokenQuota: Number(form.tokenQuota),
          maxChannels: Number(form.maxChannels),
          storageMb: Number(form.storageMb),
          status: form.status,
        },
      });
      onNotify('success', editingPlanId ? 'تم تحديث الباقة وتوثيق التغيير.' : 'تم إنشاء الباقة الجديدة.');
      setEditPlanOpen(false);
      loadAll();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر حفظ الباقة.');
    }
  }

  async function runSubAction(subId: string, action: string, extra: Record<string, unknown> = {}) {
    try {
      await apiFetch(`/api/owner/subscriptions/${encodeURIComponent(subId)}/actions`, {
        method: 'POST',
        body: { action, ...extra },
      });
      onNotify('success', 'تم تحديث حالة الاشتراك بنجاح.');
      loadAll();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تنفيذ إجراء الاشتراك.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة الاشتراكات والباقات"
        subtitle="عرض كتالوج الباقات المسجل فعلياً في PostgreSQL ومتابعة الاشتراكات وحالاتها."
      />

      <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--k-surface-subtle)] border border-[var(--k-line)] w-fit">
        <button
          type="button"
          onClick={() => setTab('plans')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md ${
            tab === 'plans' ? 'bg-[var(--k-surface)] text-[var(--k-ink)] font-semibold' : 'text-[var(--k-ink-muted)]'
          }`}
        >
          كتالوج الباقات ({plans.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('subscriptions')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md ${
            tab === 'subscriptions' ? 'bg-[var(--k-surface)] text-[var(--k-ink)] font-semibold' : 'text-[var(--k-ink-muted)]'
          }`}
        >
          الاشتراكات ({subSummary.total || 0})
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : tab === 'plans' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.length === 0 && (
            <div className="md:col-span-2 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] p-5 text-sm text-[var(--k-ink-secondary)]">
              لا توجد باقات مسجلة في جدول plans بقاعدة المنصة.
            </div>
          )}
          {plans.map((p) => (
            <div
              key={p.id}
              className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-[var(--k-ink)]">{p.name}</h2>
                      <span className="text-xs font-mono text-[var(--k-ink-muted)]">({p.code})</span>
                    </div>
                    <p className="text-xs text-[var(--k-ink-muted)] mt-1">{p.description}</p>
                  </div>
                  <StatusText
                    status={p.status === 'active' ? 'ok' : p.status === 'archived' ? 'muted' : 'warn'}
                    label={p.status === 'active' ? 'نشطة' : p.status === 'archived' ? 'مؤرشفة' : 'مسودة'}
                  />
                </div>

                <div className="flex items-baseline gap-4 py-2 border-y border-[var(--k-line)]">
                  <div>
                    <span className="text-2xl font-bold font-mono tabular-nums text-[var(--k-ink)]">
                      {formatCurrency(p.price_monthly, p.currency)}
                    </span>
                    <span className="text-xs text-[var(--k-ink-muted)]"> / شهرياً</span>
                  </div>
                  <span className="text-xs font-mono text-[var(--k-ink-muted)]">
                    السنوي: {p.price_yearly === null ? 'غير محدد' : formatCurrency(p.price_yearly, p.currency)} · التجربة: {p.trial_days === null ? 'غير محددة' : `${p.trial_days} يوم`}
                  </span>
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <dt className="text-[var(--k-ink-muted)]">المستخدمون</dt>
                    <dd className="font-mono tabular-nums font-semibold">{p.max_users === null ? 'غير محدد' : formatNumber(p.max_users)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--k-ink-muted)]">الوكلاء</dt>
                    <dd className="font-mono tabular-nums font-semibold">{p.max_agents === null ? 'غير محدد' : formatNumber(p.max_agents)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--k-ink-muted)]">القنوات</dt>
                    <dd className="font-mono tabular-nums font-semibold">{p.max_channels === null ? 'غير محدد' : formatNumber(p.max_channels)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--k-ink-muted)]">الرسائل</dt>
                    <dd className="font-mono tabular-nums font-semibold">{p.max_messages === null ? 'غير محدد' : formatNumber(p.max_messages)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--k-ink-muted)]">حصة Tokens</dt>
                    <dd className="font-mono tabular-nums font-semibold">{p.token_quota === null ? 'غير محدد' : formatNumber(p.token_quota)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--k-ink-muted)]">التخزين</dt>
                    <dd className="font-mono tabular-nums font-semibold">{p.storage_mb === null ? 'غير محدد' : `${formatNumber(p.storage_mb)} MB`}</dd>
                  </div>
                </dl>

                <div className="text-[11px] text-[var(--k-ink-muted)] space-y-1">
                  <div>
                    <span className="font-semibold text-[var(--k-ink-secondary)]">النماذج المتاحة: </span>
                    <span className="font-mono">{p.allowed_models.join(' · ') || '—'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--k-ink-secondary)]">المشتركون النشطون: </span>
                    <span className="font-mono tabular-nums font-semibold text-[var(--k-ink)]">
                      {formatNumber(p.active_subscribers)}
                    </span>
                  </div>
                </div>
              </div>

           </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <MetricTile label="النشطة" value={formatNumber(subSummary.active)} tone="success" />
            <MetricTile label="التجريبية" value={formatNumber(subSummary.trial)} />
            <MetricTile label="متأخرة الدفع" value={formatNumber(subSummary.past_due)} tone="danger" />
            <MetricTile label="المنتهية" value={formatNumber(subSummary.expired)} />
            <MetricTile label="الملغاة" value={formatNumber(subSummary.cancelled)} />
          </div>

          <div className="flex items-center gap-2">
            {(['all', 'active', 'trial', 'past_due', 'expired', 'cancelled'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSubFilter(st)}
                className={`px-3 py-1.5 text-xs rounded-lg border ${
                  subFilter === st
                    ? 'border-[var(--k-brand-forest)] bg-[var(--k-sage-tint)] font-semibold'
                    : 'border-[var(--k-line)] bg-[var(--k-surface)] text-[var(--k-ink-muted)]'
                }`}
              >
                {st === 'all'
                  ? 'الكل'
                  : st === 'active'
                    ? 'نشط'
                    : st === 'trial'
                      ? 'تجريبي'
                      : st === 'past_due'
                        ? 'متأخر'
                        : st === 'expired'
                          ? 'منتهي'
                          : 'ملغى'}
              </button>
            ))}
          </div>

          {subs.length === 0 ? (
            <EmptyState
              title="لا توجد اشتراكات مطابقة"
              description="تظهر هنا اشتراكات العملاء بمجرد إنشاء مستخدمين أو ربط اشتراكات جديدة."
            />
          ) : (
            <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-4 py-3 text-start font-semibold">المستخدم</th>
                    <th className="px-4 py-3 text-start font-semibold">الباقة</th>
                    <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                    <th className="px-4 py-3 text-start font-semibold">التجديد</th>
                    <th className="px-4 py-3 text-start font-semibold">تاريخ الانتهاء</th>
                    <th className="px-4 py-3 text-end font-semibold">التحكم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--k-line)]">
                  {subs.map((s) => (
                    <tr key={String(s.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{String(s.user_name)}</div>
                        <div className="text-[11px] font-mono text-[var(--k-ink-muted)]">{String(s.user_email)}</div>
                      </td>
                      <td className="px-4 py-3 font-medium">{String(s.plan_name)}</td>
                      <td className="px-4 py-3">
                        <StatusText
                          status={s.status === 'active' ? 'ok' : s.status === 'past_due' ? 'error' : 'info'}
                          label={String(s.status)}
                        />
                      </td>
                      <td className="px-4 py-3">{Number(s.auto_renew) === 1 ? 'تلقائي' : 'متوقف'}</td>
                      <td className="px-4 py-3 font-mono tabular-nums">{String(s.current_period_end).slice(0, 10)}</td>
                      <td className="px-4 py-3 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => runSubAction(String(s.id), 'extend', { days: 30 })}
                            className={secondaryBtnClass}
                          >
                            +30 يوم
                          </button>
                          <button
                            type="button"
                            onClick={() => runSubAction(String(s.id), 'toggle_renew')}
                            className={secondaryBtnClass}
                          >
                            {Number(s.auto_renew) === 1 ? 'إيقاف التجديد' : 'تفعيل التجديد'}
                          </button>
                          {s.status === 'cancelled' ? (
                            <button
                              type="button"
                              onClick={() => runSubAction(String(s.id), 'reactivate')}
                              className={primaryBtnClass}
                            >
                              إعادة تفعيل
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => runSubAction(String(s.id), 'cancel')}
                              className={secondaryBtnClass}
                            >
                              إلغاء
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ModalDialog
        open={editPlanOpen}
        title={editingPlanId ? 'تعديل تفاصيل الباقة' : 'إنشاء باقة جديدة'}
        onClose={() => setEditPlanOpen(false)}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={savePlanSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">الرمز البرمجي للباقة (Code) *</label>
              <input
                required
                disabled={Boolean(editingPlanId)}
                dir="ltr"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className={`${inputClass} text-left font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">اسم الباقة بالعربية *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">السعر الشهري ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.priceMonthly}
                onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">السعر السنوي ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.priceYearly}
                onChange={(e) => setForm({ ...form, priceYearly: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">أيام التجربة</label>
              <input
                type="number"
                min={0}
                value={form.trialDays}
                onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">حالة الباقة</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'archived' | 'draft' })}
                className={inputClass}
              >
                <option value="active">نشطة</option>
                <option value="draft">مسودة</option>
                <option value="archived">مؤرشفة</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">المستخدمون المسموحون</label>
              <input
                type="number"
                min={1}
                value={form.maxUsers}
                onChange={(e) => setForm({ ...form, maxUsers: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">عدد الوكلاء</label>
              <input
                type="number"
                min={1}
                value={form.maxAgents}
                onChange={(e) => setForm({ ...form, maxAgents: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">حصة الرسائل الشهرية</label>
              <input
                type="number"
                min={0}
                value={form.maxMessages}
                onChange={(e) => setForm({ ...form, maxMessages: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">حصة Tokens</label>
              <input
                type="number"
                min={0}
                value={form.tokenQuota}
                onChange={(e) => setForm({ ...form, tokenQuota: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">وصف الباقة</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditPlanOpen(false)} className={secondaryBtnClass}>
              إلغاء
            </button>
            <button type="submit" className={primaryBtnClass}>
              حفظ الباقة
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}

// =========================================================================
// INVOICES, PAYMENTS & OPERATING EXPENSES PAGE
// =========================================================================
export function InvoicesPaymentsPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data, setData] = React.useState<{
    invoices: Array<Record<string, unknown>>;
    expenses: Array<Record<string, unknown>>;
    paymentIntents?: Array<Record<string, unknown>>;
    dataLimitations?: { invoices?: string; expenses?: string; refunds?: string };
    gateways: Array<{ code: string; name: string; configured: boolean; webhookConfigured: boolean; supportsRefund: boolean }>;
    summary: {
      collectedRevenueUsd: number;
      unpaidInvoicesUsd: number;
      refundedUsd: number;
      estimatedMrrUsd: number;
      recordedExpensesUsd: number;
      verifiedPayments?: number;
      pendingPayments?: number;
      wrongAmountPayments?: number;
    };
  } | null>(null);
  const [users, setUsers] = React.useState<Array<{ id: string; full_name: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [invoiceModal, setInvoiceModal] = React.useState(false);
  const [expenseModal, setExpenseModal] = React.useState(false);
  const [refundTarget, setRefundTarget] = React.useState<string | null>(null);

  const [invUserId, setInvUserId] = React.useState('');
  const [invPlanCode, setInvPlanCode] = React.useState('growth');
  const [invAmount, setInvAmount] = React.useState('29');
  const [invStatus, setInvStatus] = React.useState<'paid' | 'unpaid' | 'failed'>('paid');
  const [invGateway, setInvGateway] = React.useState<'manual' | 'stripe' | 'esaalat'>('manual');
  const [invRef, setInvRef] = React.useState('');

  const [expCategory, setExpCategory] = React.useState('استضافة وخوادم');
  const [expVendor, setExpVendor] = React.useState('Railway / Cloud');
  const [expAmount, setExpAmount] = React.useState('25');
  const [expDesc, setExpDesc] = React.useState('');

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<NonNullable<typeof data>>('/api/owner/billing'),
      apiFetch<{ items: Array<{ id: string; full_name: string }> }>('/api/owner/users?pageSize=100'),
    ])
      .then(([b, u]) => {
        setData(b);
        setUsers(u.items);
        if (!invUserId && u.items[0]) setInvUserId(u.items[0].id);
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل سجل الفوترة.'))
      .finally(() => setLoading(false));
  }, [invUserId, onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function submitInvoice(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/owner/invoices', {
        method: 'POST',
        body: {
          userId: invUserId,
          planCode: invPlanCode,
          amount: Number(invAmount),
          status: invStatus,
          gateway: invGateway,
          providerTransactionId: invRef,
        },
      });
      onNotify('success', 'تم تسجيل الفاتورة وتحديث المؤشرات المالية.');
      setInvoiceModal(false);
      setInvRef('');
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تسجيل الفاتورة.');
    }
  }

  async function submitExpense(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/owner/expenses', {
        method: 'POST',
        body: { category: expCategory, vendor: expVendor, amount: Number(expAmount), description: expDesc },
      });
      onNotify('success', 'تم تسجيل المصروف التشغيلي في السجل المالي.');
      setExpenseModal(false);
      setExpDesc('');
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تسجيل المصروف.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الفواتير والمدفوعات والمصروفات التشغيلية"
        subtitle="متابعة طلبات الدفع المؤكدة والمعلقة من قاعدة المنصة. الفواتير والمصروفات المنفصلة غير متاحة في مخطط البيانات الحالي."
      />

      {loading || !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <MetricTile
              label="المبالغ المؤكدة"
              value={formatCurrency(data.summary.collectedRevenueUsd)}
              subtext={`طلبات دفع مؤكدة: ${data.summary.verifiedPayments ?? 0}`}
              tone="sage"
            />
            <MetricTile
              label="طلبات الدفع المعلقة"
              value={formatCurrency(data.summary.unpaidInvoicesUsd)}
              subtext={`معلقة: ${data.summary.pendingPayments ?? 0} · مبلغ غير مطابق: ${data.summary.wrongAmountPayments ?? 0}`}
              tone={data.summary.unpaidInvoicesUsd > 0 ? 'warning' : 'default'}
            />
            <MetricTile
              label="MRR للاشتراكات الشهرية"
              value={formatCurrency(data.summary.estimatedMrrUsd)}
              subtext="الاشتراكات الشهرية النشطة فقط"
            />
            <MetricTile
              label="الاستردادات"
              value="غير متاح"
              subtext="لا يوجد تدفق استرداد مسجل في قاعدة المنصة"
            />
            <MetricTile
              label="المصروفات التشغيلية"
              value="غير متاح"
              subtext="لا يوجد دفتر مصروفات في قاعدة المنصة"
            />
          </div>

          {/* Payment Gateways Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.gateways.map((gw) => (
              <div
                key={gw.code}
                className="p-4 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-bold text-[var(--k-ink)]">{gw.name}</div>
                  <div className="text-xs text-[var(--k-ink-muted)] mt-0.5">
                    Webhook: {gw.webhookConfigured ? 'مهيأ' : 'غير مهيأ'} · الاسترداد البرمجي:{' '}
                    {gw.supportsRefund ? 'مدعوم' : 'تسجيل يدوي'}
                  </div>
                </div>
                <StatusText
                  status={gw.configured ? 'ok' : 'warn'}
                  label={gw.configured ? 'مربوط ومهيأ' : 'غير مربوط بالبيئة'}
                />
              </div>
            ))}
          </div>

          {data.dataLimitations && (
            <div role="note" className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface-subtle)] px-4 py-3 text-xs leading-6 text-[var(--k-ink-secondary)]">
              <strong className="text-[var(--k-ink)]">حدود السجل المالي:</strong>
              {' '}{data.dataLimitations.invoices} {' '}{data.dataLimitations.expenses} {' '}{data.dataLimitations.refunds}
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-sm font-bold text-[var(--k-ink)]">طلبات الدفع الفعلية ({data.paymentIntents?.length ?? 0})</h2>
            {!data.paymentIntents?.length ? (
              <EmptyState title="لا توجد طلبات دفع مسجلة" description="ستظهر هنا طلبات المحافظ اليمنية المسجلة والتحقق منها في قاعدة المنصة." />
            ) : (
              <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-4 py-3 text-start">رقم الطلب</th><th className="px-4 py-3 text-start">المالك / المؤسسة</th>
                    <th className="px-4 py-3 text-start">الباقة</th><th className="px-4 py-3 text-start">المبلغ</th>
                    <th className="px-4 py-3 text-start">مرجع الدفع</th><th className="px-4 py-3 text-start">الحالة</th><th className="px-4 py-3 text-start">التاريخ</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--k-line)]">
                    {data.paymentIntents.map((p) => (
                      <tr key={String(p.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                        <td className="px-4 py-3 font-mono">{String(p.external_order_id || p.id)}</td>
                        <td className="px-4 py-3"><div>{String(p.user_name || '—')}</div><div className="text-[10px] text-[var(--k-ink-muted)]">{String(p.workspace_name || '')}</div></td>
                        <td className="px-4 py-3">{String(p.plan_name || p.plan_code || '—')}</td>
                        <td className="px-4 py-3 font-mono"><div>{formatCurrency(Number(p.amount_usd), 'USD')}</div><div className="text-[10px] text-[var(--k-ink-muted)]">{formatNumber(Number(p.amount_yer))} ر.ي</div></td>
                        <td className="px-4 py-3 font-mono">{String(p.payment_reference || p.provider_payment_id || '—')}</td>
                        <td className="px-4 py-3"><StatusText status={p.status === 'verified' ? 'ok' : p.status === 'failed' || p.status === 'expired' || p.status === 'cancelled' ? 'error' : 'warn'} label={String(p.status)} /></td>
                        <td className="px-4 py-3 text-[var(--k-ink-muted)]">{formatDateTime(String(p.created_at))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Invoices Table */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-[var(--k-ink)]">سجل الفواتير ({data.invoices.length})</h2>
            {data.invoices.length === 0 ? (
              <EmptyState
                title="لا يوجد دفتر فواتير منفصل"
                description="طلبات الدفع الفعلية معروضة أعلاه؛ لا ننشئ فواتير محلية غير مرتبطة بقاعدة المنصة."
              />
            ) : (
              <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                      <th className="px-4 py-3 text-start font-semibold">رقم الفاتورة</th>
                      <th className="px-4 py-3 text-start font-semibold">المستخدم</th>
                      <th className="px-4 py-3 text-start font-semibold">الباقة</th>
                      <th className="px-4 py-3 text-start font-semibold">المبلغ</th>
                      <th className="px-4 py-3 text-start font-semibold">البوابة / المعاملة</th>
                      <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                      <th className="px-4 py-3 text-start font-semibold">التاريخ</th>
                      <th className="px-4 py-3 text-end font-semibold">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--k-line)]">
                    {data.invoices.map((inv) => (
                      <tr key={String(inv.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                        <td className="px-4 py-3 font-mono font-semibold">{String(inv.invoice_number)}</td>
                        <td className="px-4 py-3">{String(inv.user_name)}</td>
                        <td className="px-4 py-3">{String(inv.plan_name || '—')}</td>
                        <td className="px-4 py-3 font-mono tabular-nums font-semibold">
                          {formatCurrency(Number(inv.amount), String(inv.currency))}
                        </td>
                        <td className="px-4 py-3 font-mono text-[var(--k-ink-muted)]">
                          {String(inv.gateway)} {inv.provider_transaction_id ? `· ${String(inv.provider_transaction_id)}` : ''}
                        </td>
                        <td className="px-4 py-3">
                          <StatusText
                            status={
                              inv.status === 'paid' ? 'ok' : inv.status === 'refunded' ? 'info' : 'warn'
                            }
                            label={
                              inv.status === 'paid'
                                ? 'مدفوعة (محصّلة)'
                                : inv.status === 'refunded'
                                  ? 'مستردة'
                                  : inv.status === 'failed'
                                    ? 'فاشلة'
                                    : 'غير مدفوعة'
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-[var(--k-ink-muted)]">
                          {formatDateTime(String(inv.paid_at || inv.created_at))}
                        </td>
                        <td className="px-4 py-3 text-end">
                          {inv.status === 'paid' && (
                            <button
                              type="button"
                              onClick={() => setRefundTarget(String(inv.id))}
                              className={secondaryBtnClass}
                            >
                              تسجيل استرداد
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <ModalDialog open={invoiceModal} title="إصدار / تسجيل فاتورة" onClose={() => setInvoiceModal(false)}>
        <form onSubmit={submitInvoice} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">المستخدم *</label>
            <select required value={invUserId} onChange={(e) => setInvUserId(e.target.value)} className={inputClass}>
              {users.length === 0 ? (
                <option value="">أنشئ مستخدماً أولاً</option>
              ) : (
                users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">الباقة</label>
              <select value={invPlanCode} onChange={(e) => setInvPlanCode(e.target.value)} className={inputClass}>
                <option value="starter">البداية ($9)</option>
                <option value="growth">الاحترافية ($29)</option>
                <option value="pro">الأعمال ($59)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">المبلغ (USD) *</label>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={invAmount}
                onChange={(e) => setInvAmount(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">حالة الدفع</label>
              <select
                value={invStatus}
                onChange={(e) => setInvStatus(e.target.value as 'paid' | 'unpaid' | 'failed')}
                className={inputClass}
              >
                <option value="paid">مدفوعة (إيراد محصل)</option>
                <option value="unpaid">غير مدفوعة</option>
                <option value="failed">فشل الدفع</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">البوابة</label>
              <select
                value={invGateway}
                onChange={(e) => setInvGateway(e.target.value as 'manual' | 'stripe' | 'esaalat')}
                className={inputClass}
              >
                <option value="manual">يدوي / تحويل</option>
                <option value="stripe">Stripe</option>
                <option value="esaalat">إيصالات / المحافظ اليمنية</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">رقم المعاملة لدى المزود (اختياري)</label>
            <input dir="ltr" value={invRef} onChange={(e) => setInvRef(e.target.value)} className={`${inputClass} font-mono text-left`} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setInvoiceModal(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" disabled={!invUserId} className={primaryBtnClass}>حفظ الفاتورة</button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog open={expenseModal} title="تسجيل مصروف تشغيلي" onClose={() => setExpenseModal(false)}>
        <form onSubmit={submitExpense} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">الفئة *</label>
              <input required value={expCategory} onChange={(e) => setExpCategory(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">المورد *</label>
              <input required value={expVendor} onChange={(e) => setExpVendor(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">المبلغ (USD) *</label>
            <input type="number" min={0} step="0.01" required value={expAmount} onChange={(e) => setExpAmount(e.target.value)} className={`${inputClass} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">الوصف</label>
            <input value={expDesc} onChange={(e) => setExpDesc(e.target.value)} className={inputClass} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setExpenseModal(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" className={primaryBtnClass}>تسجيل المصروف</button>
          </div>
        </form>
      </ModalDialog>

      <ConfirmActionModal
        open={Boolean(refundTarget)}
        title="تأكيد تسجيل استرداد مالي"
        description="سيتم تغيير حالة الفاتورة إلى مستردة واستبعادها من الإيرادات المحصلة."
        requireReason
        danger
        onCancel={() => setRefundTarget(null)}
        onConfirm={async (reason) => {
          if (!refundTarget) return;
          try {
            await apiFetch(`/api/owner/invoices/${encodeURIComponent(refundTarget)}/refund`, {
              method: 'POST',
              body: { reason },
            });
            onNotify('success', 'تم تسجيل الاسترداد وتحديث السجل المالي.');
            setRefundTarget(null);
            load();
          } catch (err) {
            onNotify('error', err instanceof Error ? err.message : 'تعذر تسجيل الاسترداد.');
          }
        }}
      />
    </div>
  );
}
