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
  const [data,setData]=React.useState<{
    invoices:Array<Record<string,unknown>>;
    expenses:Array<Record<string,unknown>>;
    paymentIntents:Array<Record<string,unknown>>;
    manualWalletRequests:Array<Record<string,unknown>>;
    wallets:Array<Record<string,unknown>>;
    ledgerEntries:Array<Record<string,unknown>>;
    dataLimitations?:{invoices?:string;expenses?:string;refunds?:string};
    gateways:Array<{code:string;name:string;configured:boolean;webhookConfigured:boolean;supportsRefund:boolean}>;
    summary:{
      collectedRevenueUsd:number;unpaidInvoicesUsd:number;refundedUsd:number;estimatedMrrUsd:number;
      recordedExpensesUsd:number;verifiedPayments?:number;pendingPayments?:number;wrongAmountPayments?:number;
      manualPendingPayments?:number;manualApprovedPayments?:number;closedPaymentIntents?:number;
    };
  }|null>(null);
  const [loading,setLoading]=React.useState(true);
  const [reviewTarget,setReviewTarget]=React.useState<{id:string;action:'approve'|'reject'}|null>(null);
  const [reviewNote,setReviewNote]=React.useState('');
  const [reviewBusy,setReviewBusy]=React.useState(false);

  const load=React.useCallback(()=>{
    setLoading(true);
    apiFetch<NonNullable<typeof data>>('/api/owner/billing')
      .then(setData)
      .catch(err=>onNotify('error',err instanceof Error?err.message:'تعذر تحميل سجل الفوترة الحقيقي.'))
      .finally(()=>setLoading(false));
  },[onNotify]);

  React.useEffect(()=>{load();},[load]);

  async function submitReview(e:React.FormEvent) {
    e.preventDefault();
    if(!reviewTarget)return;
    if(reviewTarget.action==='reject'&&reviewNote.trim().length<5){
      onNotify('error','سبب رفض التحويل مطلوب (5 أحرف على الأقل).');
      return;
    }
    setReviewBusy(true);
    try{
      const result=await apiFetch<{id:string;status:string}>(`/api/owner/billing/manual-wallet-requests/${encodeURIComponent(reviewTarget.id)}/review`,{
        method:'POST',body:{action:reviewTarget.action,note:reviewNote}
      });
      onNotify('success',result.status==='approved'?'تم اعتماد التحويل وتفعيل الاشتراك وتسجيل القيد المالي.':'تم رفض طلب الدفع وإشعار المؤسسة.');
      setReviewTarget(null);
      setReviewNote('');
      load();
    }catch(err){
      onNotify('error',err instanceof Error?err.message:'تعذرت مراجعة طلب الدفع.');
    }finally{setReviewBusy(false);}
  }

  const statusLabel=(value:unknown)=>{
    const v=String(value??'');
    if(v==='approved'||v==='verified'||v==='paid')return 'معتمد';
    if(v==='rejected'||v==='failed'||v==='expired'||v==='cancelled')return 'مرفوض / متوقف';
    if(v==='pending'||v==='wrong_amount')return v==='wrong_amount'?'مبلغ غير مطابق':'قيد المراجعة';
    return v||'غير محدد';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="الفوترة والمحافظ ودفتر القيود"
        subtitle="إدارة طلبات التحويل الفعلية للمحافظ اليمنية، إيصالاتها، واعتماد الاشتراكات مع سجل مالي من PostgreSQL. لا تُنشأ فواتير أو مصروفات وهمية."
        action={<button type="button" onClick={load} disabled={loading} className={secondaryBtnClass}>تحديث البيانات</button>}
      />
      {loading||!data?(
        <TableSkeleton rows={6}/>
      ):(
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MetricTile label="الإيرادات المحصلة" value={formatCurrency(Number(data.summary?.collectedRevenueUsd??0))} subtext={`طلبات موثقة: ${Number(data.summary?.verifiedPayments??0)+Number(data.summary?.manualApprovedPayments??0)}`} tone="sage"/>
            <MetricTile label="طلبات الدفع المعلقة" value={formatCurrency(Number(data.summary?.unpaidInvoicesUsd??0))} subtext={`محافظ: ${Number(data.summary?.manualPendingPayments??0)} · بوابات: ${Number(data.summary?.pendingPayments??0)}`} tone={Number(data.summary?.unpaidInvoicesUsd??0)>0?'warning':'default'}/>
            <MetricTile label="MRR شهري" value={formatCurrency(Number(data.summary?.estimatedMrrUsd??0))} subtext="الاشتراكات الشهرية النشطة"/>
            <MetricTile label="دفتر القيود" value={formatNumber(data.ledgerEntries?.length??0)} subtext="التحويلات المعتمدة"/>
            <MetricTile label="المصروفات" value="غير متاح" subtext="لا يوجد جدول مصروفات في قاعدة المنصة"/>
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[var(--k-ink)]">طلبات تحويل المحافظ اليمنية ({data.manualWalletRequests?.length??0})</h2>
              <span className="text-xs text-[var(--k-ink-muted)]">الاعتماد يحدّث الاشتراك والقيود المالية عبر معاملة PostgreSQL ذرّية</span>
            </div>
            {!data.manualWalletRequests?.length?(
              <EmptyState title="لا توجد طلبات تحويل للمراجعة" description="ستظهر هنا طلبات الدفع المرسلة من المؤسسات مع المحفظة والمبلغ والإيصال."/>
            ):(
              <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-3 py-3 text-start">المستخدم / المؤسسة</th>
                    <th className="px-3 py-3 text-start">المحفظة والتحويل</th>
                    <th className="px-3 py-3 text-start">الباقة</th>
                    <th className="px-3 py-3 text-start">المبلغ</th>
                    <th className="px-3 py-3 text-start">الحالة</th>
                    <th className="px-3 py-3 text-start">الإيصال</th>
                    <th className="px-3 py-3 text-end">الإجراء</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--k-line)]">
                    {data.manualWalletRequests.map(r=>(
                      <tr key={String(r.id)} className="align-top hover:bg-[var(--k-surface-subtle)]/60">
                        <td className="px-3 py-3 min-w-40">
                          <div className="font-semibold">{String(r.user_name??'—')}</div>
                          <div className="text-[11px] text-[var(--k-ink-muted)]">{String(r.user_email??r.workspace_name??'—')}</div>
                          <div className="text-[11px] text-[var(--k-ink-muted)]">{String(r.workspace_name??'')}</div>
                        </td>
                        <td className="px-3 py-3 min-w-36">
                          <div className="font-semibold">{String(r.wallet_name??r.provider_code??'—')}</div>
                          <div className="font-mono text-[11px] text-[var(--k-ink-muted)]" dir="ltr">{String(r.transfer_reference??'—')}</div>
                          <div className="text-[11px] text-[var(--k-ink-muted)]">{String(r.sender_name??'—')}</div>
                        </td>
                        <td className="px-3 py-3">{String(r.plan_name??r.plan_code??'—')}<div className="text-[11px] text-[var(--k-ink-muted)]">{String(r.billing_cycle??'')}</div></td>
                        <td className="px-3 py-3 font-mono whitespace-nowrap">
                          <div>{formatNumber(Number(r.amount_yer??0))} ر.ي</div>
                          <div className="text-[11px] text-[var(--k-ink-muted)]">{formatCurrency(Number(r.amount_usd??0),'USD')}</div>
                        </td>
                        <td className="px-3 py-3">
                          <StatusText status={r.status==='approved'?'ok':r.status==='rejected'?'error':'warn'} label={statusLabel(r.status)}/>
                          {r.review_note? <div className="mt-1 max-w-40 break-words text-[11px] text-[var(--k-ink-muted)]">{String(r.review_note)}</div>:null}
                        </td>
                        <td className="px-3 py-3">
                          {r.has_receipt?(
                            <a className="inline-flex min-h-[44px] items-center text-[var(--k-info)] underline" href={`/api/owner/billing/manual-wallet-requests/${encodeURIComponent(String(r.id))}/receipt`} target="_blank" rel="noreferrer">فتح الإيصال</a>
                          ):'—'}
                        </td>
                        <td className="px-3 py-3 text-end">
                          {r.status==='pending'?(
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <button type="button" onClick={()=>{setReviewTarget({id:String(r.id),action:'approve'});setReviewNote('');}} className={primaryBtnClass}>اعتماد</button>
                              <button type="button" onClick={()=>{setReviewTarget({id:String(r.id),action:'reject'});setReviewNote('');}} className={dangerBtnClass}>رفض</button>
                            </div>
                          ):<span className="text-[11px] text-[var(--k-ink-muted)]">{String(r.reviewed_by??'')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-[var(--k-ink)]">المحافظ المعرفة ({data.wallets?.length??0})</h2>
            {!data.wallets?.length?(
              <EmptyState title="لا توجد محافظ معرفة" description="تُدار حسابات المحافظ من لوحة الإدارة المركزية؛ هذه القائمة للقراءة والتحقق فقط."/>
            ):(
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {data.wallets.map(w=>(
                  <div key={String(w.id)} className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] p-4 space-y-1">
                    <div className="flex justify-between gap-2"><strong className="text-sm">{String(w.display_name??'—')}</strong><StatusText status={w.is_active?'ok':'muted'} label={w.is_active?'نشطة':'متوقفة'}/></div>
                    <div className="text-xs text-[var(--k-ink-muted)]">{String(w.account_name??'—')}</div>
                    <div className="font-mono text-sm" dir="ltr">{String(w.account_number??'—')}</div>
                    <div className="text-[11px] text-[var(--k-ink-muted)]">{String(w.provider_code??'')}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-[var(--k-ink)]">دفتر القيود المالية ({data.ledgerEntries?.length??0})</h2>
            {!data.ledgerEntries?.length?(
              <EmptyState title="لا توجد قيود مالية معتمدة" description="يُضاف القيد تلقائياً عند اعتماد طلب تحويل محفظة."/>
            ):(
              <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-3 py-3 text-start">التاريخ</th><th className="px-3 py-3 text-start">المؤسسة</th>
                    <th className="px-3 py-3 text-start">المحفظة</th><th className="px-3 py-3 text-start">المرجع</th>
                    <th className="px-3 py-3 text-start">المبلغ (YER)</th><th className="px-3 py-3 text-start">المبلغ (USD)</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--k-line)]">
                    {data.ledgerEntries.map(l=>(
                      <tr key={String(l.id)}>
                        <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(String(l.recorded_at??''))}</td>
                        <td className="px-3 py-3">{String(l.workspace_name??'—')}</td>
                        <td className="px-3 py-3">{String(l.provider_code??'—')}</td>
                        <td className="px-3 py-3 font-mono">{String(l.transfer_reference??'—')}</td>
                        <td className="px-3 py-3 font-mono">{formatNumber(Number(l.amount_yer??0))}</td>
                        <td className="px-3 py-3 font-mono">{formatCurrency(Number(l.amount_usd??0),'USD')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-[var(--k-ink)]">طلبات الدفع من البوابات ({data.paymentIntents?.length??0})</h2>
            {!data.paymentIntents?.length?(
              <EmptyState title="لا توجد طلبات بوابات دفع" description="سجلات الدفع الرقمية والتحقق منها تظهر هنا من قاعدة المنصة."/>
            ):(
              <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-3 py-3 text-start">رقم الطلب</th><th className="px-3 py-3 text-start">المستخدم / المؤسسة</th>
                    <th className="px-3 py-3 text-start">الباقة</th><th className="px-3 py-3 text-start">المبلغ</th>
                    <th className="px-3 py-3 text-start">المرجع</th><th className="px-3 py-3 text-start">الحالة</th><th className="px-3 py-3 text-start">التاريخ</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--k-line)]">
                    {data.paymentIntents.map(p=>(
                      <tr key={String(p.id)}>
                        <td className="px-3 py-3 font-mono">{String(p.external_order_id??p.id)}</td>
                        <td className="px-3 py-3">{String(p.user_name??'—')}<div className="text-[11px] text-[var(--k-ink-muted)]">{String(p.workspace_name??'')}</div></td>
                        <td className="px-3 py-3">{String(p.plan_name??p.plan_code??'—')}</td>
                        <td className="px-3 py-3 font-mono">{formatCurrency(Number(p.amount_usd??0),'USD')}<div className="text-[11px] text-[var(--k-ink-muted)]">{formatNumber(Number(p.amount_yer??0))} ر.ي</div></td>
                        <td className="px-3 py-3 font-mono">{String(p.payment_reference??p.provider_payment_id??'—')}</td>
                        <td className="px-3 py-3"><StatusText status={p.status==='verified'?'ok':p.status==='failed'?'error':'warn'} label={statusLabel(p.status)}/></td>
                        <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(String(p.created_at??''))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div role="note" className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface-subtle)] px-4 py-3 text-xs leading-6 text-[var(--k-ink-secondary)]">
            <strong className="text-[var(--k-ink)]">حدود المخطط المالي:</strong>
            {' '}{data.dataLimitations?.invoices??'لا يوجد دفتر فواتير منفصل.'} {' '}
            {data.dataLimitations?.expenses??'لا يوجد دفتر مصروفات تشغيلية.'} {' '}
            {data.dataLimitations?.refunds??'لا يدعم التدفق الحالي الاسترداد البرمجي.'}
          </div>
        </>
      )}

      <ModalDialog open={Boolean(reviewTarget)} title={reviewTarget?.action==='approve'?'اعتماد تحويل المحفظة':'رفض طلب تحويل المحفظة'} onClose={()=>!reviewBusy&&setReviewTarget(null)}>
        <form onSubmit={submitReview} className="space-y-4">
          <p className="text-sm text-[var(--k-ink-secondary)]">
            {reviewTarget?.action==='approve'
              ?'سيؤدي الاعتماد إلى تفعيل الاشتراك وتسجيل القيد المالي وإشعار المؤسسة.'
              :'سيُرفض الطلب مع حفظ السبب وإشعار المؤسسة.'}
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium">ملاحظة المراجعة {reviewTarget?.action==='reject'?'(مطلوبة)':'(اختيارية)'}</label>
            <textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} rows={3} className={inputClass}
              placeholder="اكتب ملاحظة المراجعة أو سبب الرفض..."/>
          </div>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--k-line)] bg-[var(--k-surface)] pt-3">
            <button type="button" disabled={reviewBusy} onClick={()=>setReviewTarget(null)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" disabled={reviewBusy||(reviewTarget?.action==='reject'&&reviewNote.trim().length<5)}
              className={reviewTarget?.action==='approve'?primaryBtnClass:dangerBtnClass}>
              {reviewBusy?'جارٍ التنفيذ...':reviewTarget?.action==='approve'?'اعتماد وتفعيل الاشتراك':'تأكيد الرفض'}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
