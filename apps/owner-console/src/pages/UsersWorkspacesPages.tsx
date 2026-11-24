import React from 'react';
import { Plus, Search, ArrowRight, Download, Building2 } from 'lucide-react';
import { apiFetch, formatCurrency, formatDateTime, formatNumber } from '../lib/api';
import {
  ConfirmActionModal,
  dangerBtnClass,
  EmptyState,
  inputClass,
  ModalDialog,
  PageHeader,
  ComingSoonBadge,
  primaryBtnClass,
  secondaryBtnClass,
  StatusText,
  TableSkeleton,
} from '../components/ui/Primitives';

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  account_status: string;
  activation_status: string;
  payment_status: string;
  plan_name: string | null;
  subscription_end_at: string | null;
  workspaces_count: number;
  agents_count: number;
  total_tokens: number;
  total_ai_cost_usd: number | null;
  conversations_count: number;
  last_active_at: string | null;
  created_at: string;
}

interface UserDetailPayload {
  user: Record<string, unknown>;
  workspaces: Array<Record<string, unknown>>;
  subscriptions: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  agents: Array<Record<string, unknown>>;
  channels: Array<Record<string, unknown>>;
  knowledgeSources: Array<Record<string, unknown>>;
  conversations: Array<Record<string, unknown>>;
  aiUsage: {
    summary: Record<string, unknown>;
    recentEvents: Array<Record<string, unknown>>;
  };
  auditActivity: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
  entitlements: Array<{
    key: string;
    name: string;
    enabled: boolean;
    source: string;
    effectiveLimit: number | null;
  }>;
}

export function UsersPage({
  selectedUserId,
  onSelectUser,
  onNotify,
}: {
  selectedUserId: string | null;
  onSelectUser: (id: string | null) => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [pagination, setPagination] = React.useState({ page: 1, total: 0, totalPages: 1 });
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [paymentFilter, setPaymentFilter] = React.useState('all');
  const [sortBy, setSortBy] = React.useState('created_at');
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);

  // Create form state
  const [newFullName, setNewFullName] = React.useState('');
  const [newEmail, setNewEmail] = React.useState('');
  const [newPhone, setNewPhone] = React.useState('');
  const [newWorkspaceName, setNewWorkspaceName] = React.useState('');
  const [newPlanCode, setNewPlanCode] = React.useState('trial');
  const [newAccountStatus, setNewAccountStatus] = React.useState<'active' | 'trial'>('active');
  const [creating, setCreating] = React.useState(false);

  const loadUsers = React.useCallback(
    (page = 1) => {
      setLoading(true);
      const q = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        status: statusFilter,
        paymentStatus: paymentFilter,
        sortBy,
      });
      if (search.trim()) q.set('search', search.trim());
      apiFetch<{ items: UserRow[]; pagination: { page: number; total: number; totalPages: number } }>(
        `/api/owner/users?${q.toString()}`
      )
        .then((res) => {
          setUsers(res.items);
          setPagination(res.pagination);
        })
        .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل المستخدمين.'))
        .finally(() => setLoading(false));
    },
    [search, statusFilter, paymentFilter, sortBy, onNotify]
  );

  React.useEffect(() => {
    if (!selectedUserId) {
      loadUsers(1);
    }
  }, [selectedUserId, loadUsers]);

  if (selectedUserId) {
    return (
      <UserDetailView
        userId={selectedUserId}
        onBack={() => onSelectUser(null)}
        onNotify={onNotify}
      />
    );
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await apiFetch<UserDetailPayload>('/api/owner/users', {
        method: 'POST',
        body: {
          fullName: newFullName,
          email: newEmail,
          phone: newPhone,
          workspaceName: newWorkspaceName,
          planCode: newPlanCode,
          accountStatus: newAccountStatus,
        },
      });
      onNotify('success', `تم إنشاء حساب المستخدم ${newFullName} ومساحة العمل الخاصة به.`);
      setCreateOpen(false);
      setNewFullName('');
      setNewEmail('');
      setNewPhone('');
      setNewWorkspaceName('');
      loadUsers(1);
      if (created?.user?.id) {
        onSelectUser(String(created.user.id));
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر إنشاء المستخدم.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة المستخدمين والعملاء"
        subtitle="سجل كامل لجميع مستخدمي منصة Kayan AI مع اشتراكاتهم، استهلاك الذكاء الاصطناعي، وحالات التفعيل والدفع."
        action={
          <button type="button" disabled title="إنشاء حساب Auth يتطلب ربط دعوات Auth Admin؛ لم يتم إنشاء حسابات تجريبية من لوحة المالك." aria-disabled="true" className={`${primaryBtnClass} cursor-not-allowed opacity-70`}>
            <Plus className="w-4 h-4" />
            <span>إنشاء مستخدم</span><ComingSoonBadge />
</button>
        }
      />

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)]">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[var(--k-ink-muted)] absolute top-1/2 -translate-y-1/2 start-3" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم، البريد، الهاتف، أو المعرّف..."
            aria-label="بحث في قائمة المستخدمين"
            className={`${inputClass} ps-9`}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="تصفية حسب حالة الحساب"
          className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)] text-[var(--k-ink)]"
        >
          <option value="all">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="trial">تجريبي</option>
          <option value="suspended">معلق</option>
          <option value="deleted">محذوف</option>
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          aria-label="تصفية حسب حالة الدفع"
          className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)] text-[var(--k-ink)]"
        >
          <option value="all">كل حالات الدفع</option>
          <option value="paid">مدفوع</option>
          <option value="trial">تجريبي</option>
          <option value="past_due">متأخر</option>
          <option value="unpaid">غير مدفوع</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="ترتيب النتائج"
          className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)] text-[var(--k-ink)]"
        >
          <option value="created_at">الأحدث تسجيلاً</option>
          <option value="full_name">الاسم</option>
          <option value="last_active_at">آخر نشاط</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : users.length === 0 ? (
        <EmptyState
          title="لا يوجد مستخدمون مسجلون حالياً"
          description="تظهر هنا جميع حسابات العملاء الحقيقية من قاعدة البيانات. يمكنك إنشاء أول مستخدم ومساحة عمل مباشرة عبر المسار الرسمي للنظام."
          action={
            <button type="button" disabled title="اربط خدمة دعوات Auth Admin لإنشاء حساب دخول حقيقي." aria-disabled="true" className={`${primaryBtnClass} cursor-not-allowed opacity-70`}>
              <Plus className="w-4 h-4" />
              <span>إنشاء أول مستخدم</span><ComingSoonBadge />
</button>
          }
        />
      ) : (
        <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                  <th className="px-4 py-3 text-start font-semibold">المستخدم</th>
                  <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                  <th className="px-4 py-3 text-start font-semibold">الباقة والانتهاء</th>
                  <th className="px-4 py-3 text-start font-semibold">مساحات / وكلاء</th>
                  <th className="px-4 py-3 text-start font-semibold">استهلاك AI</th>
                  <th className="px-4 py-3 text-start font-semibold">المحادثات</th>
                  <th className="px-4 py-3 text-start font-semibold">الدفع</th>
                  <th className="px-4 py-3 text-start font-semibold">التسجيل</th>
                  <th className="px-4 py-3 text-end font-semibold">التحكم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--k-line)]">
                {users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => onSelectUser(u.id)}
                    className="hover:bg-[var(--k-surface-subtle)]/60 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSelectUser(u.id)}
                        className="text-start hover:underline"
                      >
                        <div className="font-semibold text-[var(--k-ink)]">{u.full_name}</div>
                        <div className="text-[11px] text-[var(--k-ink-muted)] font-mono" dir="ltr">
                          {u.email} {u.phone ? `· ${u.phone}` : ''}
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <StatusText
                        status={
                          u.account_status === 'active'
                            ? 'ok'
                            : u.account_status === 'trial'
                              ? 'info'
                              : u.account_status === 'suspended'
                                ? 'error'
                                : 'muted'
                        }
                        label={
                          u.account_status === 'active'
                            ? 'نشط'
                            : u.account_status === 'trial'
                              ? 'تجريبي'
                              : u.account_status === 'suspended'
                                ? 'معلق'
                                : 'محذوف'
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--k-ink)]">{u.plan_name || 'بدون باقة'}</div>
                      <div className="text-[11px] text-[var(--k-ink-muted)] font-mono tabular-nums">
                        {u.subscription_end_at ? u.subscription_end_at.slice(0, 10) : '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      {u.workspaces_count} / {u.agents_count}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      <div>{formatNumber(u.total_tokens)} tok</div>
                      <div className="text-[11px] text-[var(--k-ink-muted)]">
                        {u.total_ai_cost_usd == null ? 'غير متاح' : formatCurrency(u.total_ai_cost_usd)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">{formatNumber(u.conversations_count)}</td>
                    <td className="px-4 py-3">
                      <StatusText
                        status={
                          u.payment_status === 'paid'
                            ? 'ok'
                            : u.payment_status === 'past_due'
                              ? 'error'
                              : u.payment_status === 'trial'
                                ? 'info'
                                : 'muted'
                        }
                        label={
                          u.payment_status === 'paid'
                            ? 'مدفوع'
                            : u.payment_status === 'past_due'
                              ? 'متأخر'
                              : u.payment_status === 'trial'
                                ? 'تجريبي'
                                : 'غير مدفوع'
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-[var(--k-ink-muted)] whitespace-nowrap">
                      {formatDateTime(u.created_at)}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button
                        type="button"
                        onClick={() => onSelectUser(u.id)}
                        className="text-xs font-semibold text-[var(--k-brand-forest)] hover:underline whitespace-nowrap"
                      >
                        فتح الملف الإداري
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-[var(--k-line)] flex items-center justify-between text-xs">
              <span className="text-[var(--k-ink-muted)]">
                إجمالي النتائج: <strong className="font-mono tabular-nums">{pagination.total}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => loadUsers(pagination.page - 1)}
                  className={secondaryBtnClass}
                >
                  السابق
                </button>
                <span className="font-mono tabular-nums">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadUsers(pagination.page + 1)}
                  className={secondaryBtnClass}
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create User Modal */}
      <ModalDialog
        open={createOpen}
        title="إنشاء مستخدم ومساحة عمل جديدة"
        subtitle="يُسجل الحساب في قاعدة البيانات مع اشتراكه ومساحة عمله ويوثّق في سجل التدقيق."
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1">الاسم الكامل *</label>
              <input
                required
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="مثال: سارة العتيبي"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1">البريد الإلكتروني *</label>
              <input
                type="email"
                dir="ltr"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="sara@company.com"
                className={`${inputClass} text-left font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1">رقم الهاتف</label>
              <input
                dir="ltr"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+966500000000"
                className={`${inputClass} text-left font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1">اسم مساحة العمل</label>
              <input
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="مثال: عيادات النخبة"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1">الباقة المبدئية</label>
              <select
                value={newPlanCode}
                onChange={(e) => setNewPlanCode(e.target.value)}
                className={inputClass}
              >
                <option value="trial">المجانية (Trial)</option>
                <option value="starter">البداية (Starter - $9)</option>
                <option value="growth">الاحترافية (Pro - $29)</option>
                <option value="pro">الأعمال (Business - $59)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1">حالة الحساب</label>
              <select
                value={newAccountStatus}
                onChange={(e) => setNewAccountStatus(e.target.value as 'active' | 'trial')}
                className={inputClass}
              >
                <option value="active">نشط</option>
                <option value="trial">تجريبي</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className={secondaryBtnClass}>
              إلغاء
            </button>
            <button type="submit" disabled={creating} className={primaryBtnClass}>
              {creating ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}

// =========================================================================
// 15-SECTION FULL USER DETAIL PROFILE + ALL 12 ADMIN ACTIONS
// =========================================================================
function UserDetailView({
  userId,
  onBack,
  onNotify,
}: {
  userId: string;
  onBack: () => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [detail, setDetail] = React.useState<UserDetailPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<
    'profile' | 'billing' | 'ai_agents' | 'ops' | 'security_entitlements'
  >('profile');
  const [notesDraft, setNotesDraft] = React.useState('');
  const [planToSwitch, setPlanToSwitch] = React.useState('growth');
  const [creditTokens, setCreditTokens] = React.useState('50000');
  const [creditReason, setCreditReason] = React.useState('');
  const [extendDays, setExtendDays] = React.useState('30');
  const [notifTitle, setNotifTitle] = React.useState('');
  const [notifBody, setNotifBody] = React.useState('');
  const [confirmState, setConfirmState] = React.useState<{
    action: string;
    title: string;
    description: string;
    previewLines: string[];
    danger?: boolean;
    requireReason?: boolean;
    extraPayload?: Record<string, unknown>;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const loadDetail = React.useCallback(() => {
    setLoading(true);
    apiFetch<UserDetailPayload>(`/api/owner/users/${encodeURIComponent(userId)}`)
      .then((res) => {
        setDetail(res);
        setNotesDraft(String(res.user.admin_notes || ''));
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل ملف المستخدم.'))
      .finally(() => setLoading(false));
  }, [userId, onNotify]);

  React.useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function executeAction(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const updated = await apiFetch<UserDetailPayload>(`/api/owner/users/${encodeURIComponent(userId)}/actions`, {
        method: 'POST',
        body: { action, ...payload },
      });
      setDetail(updated);
      setConfirmState(null);
      onNotify('success', 'تم تنفيذ الإجراء الإداري وتوثيقه في سجل التدقيق.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'فشل تنفيذ الإجراء.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAdminNotes() {
    setBusy(true);
    try {
      const updated = await apiFetch<UserDetailPayload>(`/api/owner/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: { adminNotes: notesDraft },
      });
      setDetail(updated);
      onNotify('success', 'تم حفظ ملاحظات الإدارة.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر حفظ الملاحظات.');
    } finally {
      setBusy(false);
    }
  }

  async function handleExportUser() {
    try {
      const data = await apiFetch<unknown>(`/api/owner/users/${encodeURIComponent(userId)}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kayan-user-${userId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify('success', 'تم تصدير ملف بيانات المستخدم وتسجيل العملية في سجل التدقيق.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر التصدير.');
    }
  }

  if (loading || !detail) {
    return <TableSkeleton rows={6} />;
  }

  const u = detail.user;
  const isSuspended = u.account_status === 'suspended';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--k-line)]">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className={secondaryBtnClass}>
            <ArrowRight className="w-4 h-4" />
            <span>العودة للمستخدمين</span>
          </button>
          <div>
            <h1 className="text-xl font-bold text-[var(--k-ink)]">{String(u.full_name)}</h1>
            <p className="text-xs text-[var(--k-ink-muted)] font-mono" dir="ltr">
              {String(u.email)} · {String(u.id)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleExportUser} className={secondaryBtnClass}>
            <Download className="w-3.5 h-3.5" />
            <span>تصدير بيانات المستخدم</span>
          </button>
          {isSuspended ? (
            <button
              type="button"
              onClick={() =>
                setConfirmState({
                  action: 'reactivate',
                  title: 'إعادة تفعيل حساب المستخدم',
                  description: `هل تريد إعادة تفعيل حساب ${String(u.full_name)} والسماح له بالدخول مجدداً؟`,
                  previewLines: ['حالة الحساب: معلق → نشط', 'حالة التفعيل: معطل → مفعل'],
                })
              }
              className={primaryBtnClass}
            >
              إعادة تفعيل الحساب
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                setConfirmState({
                  action: 'suspend',
                  title: 'تعليق حساب المستخدم',
                  description: `سيتم تعليق حساب ${String(u.full_name)} وإنهاء جميع جلساته النشطة فوراً.`,
                  previewLines: ['حالة الحساب: نشط → معلق', 'إنهاء جميع جلسات المستخدم الفورية'],
                  danger: true,
                  requireReason: true,
                })
              }
              className={dangerBtnClass}
            >
              تعليق الحساب
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              setConfirmState({
                action: 'delete',
                title: 'حذف الحساب وفق سياسة الاحتفاظ',
                description: 'سيتم وضع علامة حذف على الحساب مع حفظ السجلات المالية والتدقيقية وفق سياسة الاحتفاظ بالبيانات.',
                previewLines: ['تعطيل الحساب نهائياً', 'الاحتفاظ بسجل الفواتير والتدقيق لأغراض الامتثال'],
                danger: true,
                requireReason: true,
              })
            }
            className={dangerBtnClass}
          >
            حذف الحساب
          </button>
        </div>
      </div>

      {/* Section Tabs covering all 15 detail dimensions */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[var(--k-surface-subtle)] border border-[var(--k-line)]">
        {(
          [
            { id: 'profile', label: '1-3. المعلومات ومساحات العمل والملاحظات' },
            { id: 'billing', label: '4-5. الاشتراكات والفواتير والرصيد' },
            { id: 'ai_agents', label: '6-10. الوكلاء واستهلاك الذكاء الاصطناعي' },
            { id: 'ops', label: '7-9. القنوات والمعرفة والمحادثات' },
            { id: 'security_entitlements', label: '11-14. التفعيلات والجلسات والأخطاء والنشاط' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-[var(--k-surface)] text-[var(--k-ink)] shadow-xs font-semibold'
                : 'text-[var(--k-ink-muted)] hover:text-[var(--k-ink)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
            <h2 className="text-sm font-bold text-[var(--k-ink)]">المعلومات الشخصية وبيانات الحساب</h2>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-[var(--k-ink-muted)]">الاسم الكامل</dt>
                <dd className="font-semibold mt-0.5">{String(u.full_name)}</dd>
              </div>
              <div>
                <dt className="text-[var(--k-ink-muted)]">البريد الإلكتروني</dt>
                <dd className="font-mono mt-0.5" dir="ltr">{String(u.email)}</dd>
              </div>
              <div>
                <dt className="text-[var(--k-ink-muted)]">رقم الهاتف</dt>
                <dd className="font-mono mt-0.5" dir="ltr">{String(u.phone || 'غير مسجل')}</dd>
              </div>
              <div>
                <dt className="text-[var(--k-ink-muted)]">حالة الحساب / التفعيل</dt>
                <dd className="mt-0.5">
                  <StatusText
                    status={u.account_status === 'active' ? 'ok' : u.account_status === 'suspended' ? 'error' : 'info'}
                    label={`${String(u.account_status)} · ${String(u.activation_status)}`}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-[var(--k-ink-muted)]">رصيد Tokens الإضافي</dt>
                <dd className="font-mono tabular-nums font-semibold mt-0.5">
                  {formatNumber(Number(u.bonus_token_credit || 0))} Token
                </dd>
              </div>
              <div>
                <dt className="text-[var(--k-ink-muted)]">تاريخ التسجيل</dt>
                <dd className="mt-0.5">{formatDateTime(String(u.created_at))}</dd>
              </div>
            </dl>

            <div className="pt-4 border-t border-[var(--k-line)] space-y-2">
              <h3 className="text-xs font-bold text-[var(--k-ink)]">مساحات العمل التابعة ({detail.workspaces.length})</h3>
              {detail.workspaces.length === 0 ? (
                <p className="text-xs text-[var(--k-ink-muted)]">لا توجد مساحات عمل مرتبطة.</p>
              ) : (
                <ul className="divide-y divide-[var(--k-line)] text-xs">
                  {detail.workspaces.map((w) => (
                    <li key={String(w.id)} className="py-2 flex items-center justify-between">
                      <span>{String(w.name)} ({String(w.business_type)})</span>
                      <span className="font-mono text-[var(--k-ink-muted)]">{String(w.status)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="lg:col-span-6 space-y-5">
            <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
              <h2 className="text-sm font-bold text-[var(--k-ink)]">15. ملاحظات الإدارة الخاصة</h2>
              <textarea
                rows={4}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="أضف ملاحظات إدارية داخلية حول هذا العميل..."
                className={inputClass}
              />
              <div className="flex justify-end">
                <button type="button" disabled={busy} onClick={saveAdminNotes} className={primaryBtnClass}>
                  حفظ الملاحظات
                </button>
              </div>
            </div>

            <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
              <h2 className="text-sm font-bold text-[var(--k-ink)]">إرسال إشعار مباشر للمستخدم</h2>
              <input
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
                placeholder="عنوان الإشعار..."
                className={inputClass}
              />
              <textarea
                rows={2}
                value={notifBody}
                onChange={(e) => setNotifBody(e.target.value)}
                placeholder="نص الرسالة..."
                className={inputClass}
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() =>
                    setConfirmState({
                      action: 'reset_settings',
                      title: 'إعادة تعيين جلسات وإعدادات الأمان',
                      description: 'سيتم إبطال جلسات المستخدم النشطة وإعادة تهيئة إعدادات الأمان.',
                      previewLines: ['إبطال كافة الجلسات النشطة للمستخدم'],
                    })
                  }
                  className={secondaryBtnClass}
                >
                  إعادة تعيين جلسات الحساب
                </button>
                <button
                  type="button"
                  disabled={busy || !notifTitle.trim() || !notifBody.trim()}
                  onClick={() => {
                    executeAction('send_notification', { title: notifTitle, body: notifBody });
                    setNotifTitle('');
                    setNotifBody('');
                  }}
                  className={primaryBtnClass}
                >
                  إرسال الإشعار
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-4">
            <h2 className="text-sm font-bold text-[var(--k-ink)]">إجراءات الاشتراك والرصيد</h2>
            <div className="space-y-2 pb-4 border-b border-[var(--k-line)]">
              <label className="block text-xs font-medium text-[var(--k-ink-secondary)]">تغيير الباقة</label>
              <div className="flex gap-2">
                <select value={planToSwitch} onChange={(e) => setPlanToSwitch(e.target.value)} className={inputClass}>
                  <option value="trial">المجانية (Trial)</option>
                  <option value="starter">البداية (Starter)</option>
                  <option value="growth">الاحترافية (Pro)</option>
                  <option value="pro">الأعمال (Business)</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setConfirmState({
                      action: 'change_plan',
                      title: 'تأكيد تغيير الباقة',
                      description: `تغيير باقة ${String(u.full_name)} إلى ${planToSwitch}.`,
                      previewLines: [`الباقة الجديدة: ${planToSwitch}`],
                      extraPayload: { planCode: planToSwitch },
                    })
                  }
                  className={primaryBtnClass}
                >
                  تطبيق
                </button>
              </div>
            </div>

            <div className="space-y-2 pb-4 border-b border-[var(--k-line)]">
              <label className="block text-xs font-medium text-[var(--k-ink-secondary)]">تمديد الاشتراك (أيام)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={730}
                  value={extendDays}
                  onChange={(e) => setExtendDays(e.target.value)}
                  className={`${inputClass} font-mono`}
                />
                <button
                  type="button"
                  onClick={() =>
                    setConfirmState({
                      action: 'extend_subscription',
                      title: 'تأكيد تمديد الاشتراك',
                      description: `تمديد الاشتراك الحالي لمدة ${extendDays} يوماً.`,
                      previewLines: [`إضافة ${extendDays} يوماً لتاريخ الانتهاء`],
                      extraPayload: { days: Number(extendDays) },
                    })
                  }
                  className={secondaryBtnClass}
                >
                  تمديد
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setConfirmState({
                      action: 'cancel_subscription',
                      title: 'إلغاء اشتراك المستخدم',
                      description: 'سيتم إيقاف التجديد التلقائي وتغيير حالة الاشتراك إلى ملغى.',
                      previewLines: ['حالة الاشتراك → cancelled', 'إيقاف التجديد التلقائي'],
                      danger: true,
                      requireReason: true,
                    })
                  }
                  className={dangerBtnClass}
                >
                  إلغاء الاشتراك
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--k-ink-secondary)]">
                إضافة رصيد Tokens (مع تسجيل السبب)
              </label>
              <input
                type="number"
                min={1000}
                value={creditTokens}
                onChange={(e) => setCreditTokens(e.target.value)}
                className={`${inputClass} font-mono`}
                placeholder="عدد Tokens"
              />
              <input
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                className={inputClass}
                placeholder="سبب إضافة الرصيد (إلزامي)..."
              />
              <button
                type="button"
                disabled={busy || !creditReason.trim()}
                onClick={() => {
                  executeAction('add_credit', { tokens: Number(creditTokens), reason: creditReason });
                  setCreditReason('');
                }}
                className={primaryBtnClass}
              >
                إضافة الرصيد
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
              <h2 className="text-sm font-bold text-[var(--k-ink)]">سجل الاشتراكات ({detail.subscriptions.length})</h2>
              {detail.subscriptions.length === 0 ? (
                <p className="text-xs text-[var(--k-ink-muted)]">لا توجد اشتراكات مسجلة.</p>
              ) : (
                <div className="divide-y divide-[var(--k-line)] text-xs">
                  {detail.subscriptions.map((s) => (
                    <div key={String(s.id)} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold">{String(s.plan_name)}</span>
                        <span className="text-[var(--k-ink-muted)]"> · {String(s.billing_cycle)}</span>
                      </div>
                      <span className="font-mono text-[var(--k-ink-muted)]">
                        {String(s.status)} · ينتهي {String(s.current_period_end).slice(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
              <h2 className="text-sm font-bold text-[var(--k-ink)]">الفواتير والمدفوعات ({detail.invoices.length})</h2>
              {detail.invoices.length === 0 ? (
                <p className="text-xs text-[var(--k-ink-muted)]">لا توجد فواتير مسجلة لهذا المستخدم.</p>
              ) : (
                <div className="divide-y divide-[var(--k-line)] text-xs">
                  {detail.invoices.map((inv) => (
                    <div key={String(inv.id)} className="py-2.5 flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold">{String(inv.invoice_number)}</span>
                      <span className="font-mono tabular-nums">
                        {formatCurrency(Number(inv.amount), String(inv.currency))}
                      </span>
                      <span>{String(inv.status)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ai_agents' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
            <h2 className="text-sm font-bold text-[var(--k-ink)]">الوكلاء التابعون ({detail.agents.length})</h2>
            {detail.agents.length === 0 ? (
              <p className="text-xs text-[var(--k-ink-muted)]">لم ينشئ هذا المستخدم وكلاء بعد.</p>
            ) : (
              <div className="divide-y divide-[var(--k-line)] text-xs">
                {detail.agents.map((a) => (
                  <div key={String(a.id)} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold">{String(a.name)}</div>
                      <div className="text-[var(--k-ink-muted)] font-mono">{String(a.model_id)}</div>
                    </div>
                    <div className="text-end font-mono tabular-nums">
                      <div>{formatNumber(Number(a.tokens_used))} tok</div>
                      <div className="text-[var(--k-ink-muted)]">{formatCurrency(Number(a.cost_usd))}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="lg:col-span-6 p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
            <h2 className="text-sm font-bold text-[var(--k-ink)]">ملخص استهلاك الذكاء الاصطناعي</h2>
            <dl className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
              <div>
                <dt className="font-sans text-[var(--k-ink-muted)]">الطلبات</dt>
                <dd className="text-base font-bold mt-0.5">{formatNumber(Number(detail.aiUsage.summary?.requests || 0))}</dd>
              </div>
              <div>
                <dt className="font-sans text-[var(--k-ink-muted)]">إجمالي Tokens</dt>
                <dd className="text-base font-bold mt-0.5">{formatNumber(Number(detail.aiUsage.summary?.total_tokens || 0))}</dd>
              </div>
              <div>
                <dt className="font-sans text-[var(--k-ink-muted)]">التكلفة المسجلة</dt>
                <dd className="text-base font-bold mt-0.5">{formatCurrency(Number(detail.aiUsage.summary?.cost_usd || 0))}</dd>
              </div>
              <div>
                <dt className="font-sans text-[var(--k-ink-muted)]">Tokens المخزنة</dt>
                <dd className="text-base font-bold mt-0.5">{formatNumber(Number(detail.aiUsage.summary?.cached_tokens || 0))}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {activeTab === 'ops' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-2">
            <h2 className="text-sm font-bold">7. القنوات المرتبطة ({detail.channels.length})</h2>
            {detail.channels.length === 0 ? (
              <p className="text-xs text-[var(--k-ink-muted)]">لا توجد قنوات مرتبطة.</p>
            ) : (
              detail.channels.map((c) => (
                <div key={String(c.id)} className="text-xs py-1.5 border-b border-[var(--k-line)] flex justify-between">
                  <span>{String(c.display_name)} ({String(c.channel_type)})</span>
                  <span className="font-mono">{String(c.connection_status)}</span>
                </div>
              ))
            )}
          </div>
          <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-2">
            <h2 className="text-sm font-bold">8. قاعدة المعرفة ({detail.knowledgeSources.length})</h2>
            {detail.knowledgeSources.length === 0 ? (
              <p className="text-xs text-[var(--k-ink-muted)]">لا توجد مصادر معرفة.</p>
            ) : (
              detail.knowledgeSources.map((k) => (
                <div key={String(k.id)} className="text-xs py-1.5 border-b border-[var(--k-line)] flex justify-between">
                  <span>{String(k.title)}</span>
                  <span className="font-mono">{String(k.processing_status)}</span>
                </div>
              ))
            )}
          </div>
          <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-2">
            <h2 className="text-sm font-bold">9. المحادثات ({detail.conversations.length})</h2>
            {detail.conversations.length === 0 ? (
              <p className="text-xs text-[var(--k-ink-muted)]">لا توجد محادثات.</p>
            ) : (
              detail.conversations.map((cv) => (
                <div key={String(cv.id)} className="text-xs py-1.5 border-b border-[var(--k-line)] flex justify-between">
                  <span>{String(cv.customer_handle)}</span>
                  <span className="font-mono">{String(cv.status)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'security_entitlements' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
            <h2 className="text-sm font-bold text-[var(--k-ink)]">14. التفعيلات والصلاحيات الفعالة</h2>
            <div className="divide-y divide-[var(--k-line)] text-xs">
              {detail.entitlements.map((e) => (
                <div key={e.key} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{e.name}</div>
                    <div className="text-[11px] text-[var(--k-ink-muted)] font-mono">{e.source}</div>
                  </div>
                  <StatusText status={e.enabled ? 'ok' : 'muted'} label={e.enabled ? 'مفعلة' : 'غير مفعلة'} />
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 space-y-4">
            <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-2">
              <h2 className="text-sm font-bold">11. سجل العمليات والتدقيق ({detail.auditActivity.length})</h2>
              <div className="max-h-48 overflow-y-auto divide-y divide-[var(--k-line)] text-xs">
                {detail.auditActivity.map((a) => (
                  <div key={String(a.id)} className="py-2">
                    <div className="font-medium text-[var(--k-ink)]">{String(a.summary)}</div>
                    <div className="text-[11px] text-[var(--k-ink-muted)]">
                      {String(a.actor_email)} · {formatDateTime(String(a.created_at))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-2">
              <h2 className="text-sm font-bold">12-13. الجلسات ({detail.sessions.length}) والأخطاء ({detail.errors.length})</h2>
              {detail.sessions.length === 0 && detail.errors.length === 0 ? (
                <p className="text-xs text-[var(--k-ink-muted)]">لا توجد جلسات نشطة أو أخطاء مسجلة لهذا المستخدم.</p>
              ) : (
                <div className="text-xs space-y-1.5">
                  {detail.errors.map((er) => (
                    <div key={String(er.id)} className="text-[var(--k-danger)]">
                      · {String(er.message)} ({formatDateTime(String(er.created_at))})
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmActionModal
        open={Boolean(confirmState)}
        title={confirmState?.title || ''}
        description={confirmState?.description || ''}
        previewLines={confirmState?.previewLines}
        danger={confirmState?.danger}
        requireReason={confirmState?.requireReason}
        busy={busy}
        onCancel={() => setConfirmState(null)}
        onConfirm={(reason) => {
          if (confirmState) {
            executeAction(confirmState.action, { ...(confirmState.extraPayload || {}), reason });
          }
        }}
      />
    </div>
  );
}

// =========================================================================
// WORKSPACES DIRECTORY PAGE
// =========================================================================
export function WorkspacesPage({
  onSelectUser,
  onNotify,
}: {
  onSelectUser: (id: string) => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [items, setItems] = React.useState<Array<Record<string, unknown>>>([]);
  const [users, setUsers] = React.useState<Array<{ id: string; full_name: string }>>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [ownerUserId, setOwnerUserId] = React.useState('');
  const [name, setName] = React.useState('');
  const [businessType, setBusinessType] = React.useState('ecommerce');
  const [addonBusyId, setAddonBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ items: Array<Record<string, unknown>> }>(
        `/api/owner/workspaces${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`
      ),
      apiFetch<{ items: Array<{ id: string; full_name: string }> }>('/api/owner/users?pageSize=100'),
    ])
      .then(([wsRes, uRes]) => {
        setItems(wsRes.items);
        setUsers(uRes.items);
        if (!ownerUserId && uRes.items[0]) setOwnerUserId(uRes.items[0].id);
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل مساحات العمل.'))
      .finally(() => setLoading(false));
  }, [search, ownerUserId, onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/owner/workspaces', {
        method: 'POST',
        body: { ownerUserId, name, businessType },
      });
      onNotify('success', `تم إنشاء مساحة العمل "${name}".`);
      setCreateOpen(false);
      setName('');
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر إنشاء مساحة العمل.');
    }
  }

  async function toggleStatus(id: string, current: string) {
    const next = current === 'active' ? 'suspended' : 'active';
    try {
      await apiFetch(`/api/owner/workspaces/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: { status: next },
      });
      onNotify('success', `تم تحديث حالة مساحة العمل إلى ${next === 'active' ? 'نشطة' : 'معلقة'}.`);
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحديث الحالة.');
    }
  }

  async function togglePersonalAssistant(id:string,enabled:boolean) {
    setAddonBusyId(id);
    try {
      await apiFetch(`/api/owner/workspaces/${encodeURIComponent(id)}/personal-assistant-addon`,{method:'PATCH',body:{enabled:!enabled}});
      onNotify('success',!enabled?'تم تفعيل إضافة المساعد الشخصي للمؤسسة.':'تم إيقاف إضافة المساعد الشخصي للمؤسسة.');
      load();
    } catch(err) {
      onNotify('error',err instanceof Error?err.message:'تعذر تحديث إضافة المساعد الشخصي.');
    } finally { setAddonBusyId(null); }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="مساحات العمل (Workspaces)"
        subtitle="إدارة ومراقبة جميع مساحات العمل المعزولة في Kayan AI مع استهلاكها ووكلائها وقنواتها."
        action={
          <button type="button" onClick={() => setCreateOpen(true)} className={primaryBtnClass}>
            <Building2 className="w-4 h-4" />
            <span>إنشاء مساحة عمل</span>
          </button>
        }
      />

      <div className="p-4 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)]">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث باسم مساحة العمل أو المالك..."
          className={inputClass}
        />
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد مساحات عمل مسجلة"
          description="تُنشأ مساحة العمل تلقائياً عند تسجيل مستخدم جديد أو يمكنك إنشاؤها مباشرة من هنا."
          action={
            <button type="button" onClick={() => setCreateOpen(true)} className={primaryBtnClass}>
              إنشاء مساحة عمل
            </button>
          }
        />
      ) : (
        <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                <th className="px-4 py-3 text-start font-semibold">مساحة العمل</th>
                <th className="px-4 py-3 text-start font-semibold">المالك</th>
                <th className="px-4 py-3 text-start font-semibold">القطاع</th>
                <th className="px-4 py-3 text-start font-semibold">الوكلاء / القنوات</th>
                <th className="px-4 py-3 text-start font-semibold">استهلاك AI</th>
                <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                <th className="px-4 py-3 text-start font-semibold">المساعد الشخصي</th>
                <th className="px-4 py-3 text-end font-semibold">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--k-line)]">
              {items.map((w) => (
                <tr key={String(w.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[var(--k-ink)]">{String(w.name)}</div>
                    <div className="text-[11px] font-mono text-[var(--k-ink-muted)]">{String(w.slug ?? w.business_name ?? "—")}</div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={!w.owner_user_id}
                      onClick={() => w.owner_user_id && onSelectUser(String(w.owner_user_id))}
                      className="text-start hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="font-medium">{String(w.owner_name)}</div>
                      <div className="text-[11px] font-mono text-[var(--k-ink-muted)]">{String(w.owner_email)}</div>
                    </button>
                  </td>
                  <td className="px-4 py-3">{String(w.business_type)}</td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    {String(w.agents_count)} / {String(w.channels_count)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    {formatNumber(Number(w.tokens_used ?? 0))} tok · {w.ai_cost_usd==null?'—':formatCurrency(Number(w.ai_cost_usd))}
                  </td>
                  <td className="px-4 py-3">
                    <StatusText
                      status={w.status === 'active' ? 'ok' : 'error'}
                      label={w.status === 'active' ? 'نشطة' : 'معلقة'}
                    />
                  </td>
                  <td className="px-4 py-3 text-end">
                    <StatusText
                      status={w.personal_assistant_addon_enabled ? 'ok' : 'muted'}
                      label={w.personal_assistant_addon_enabled ? 'مفعل' : 'غير مفعل'}
                    />
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button type="button" disabled={addonBusyId===String(w.id)}
                        onClick={() => togglePersonalAssistant(String(w.id),Boolean(w.personal_assistant_addon_enabled))}
                        className={secondaryBtnClass}>
                        {addonBusyId===String(w.id)?'جارٍ الحفظ...':w.personal_assistant_addon_enabled?'إيقاف المساعد':'تفعيل المساعد'}
                      </button>
                      <button type="button" onClick={() => toggleStatus(String(w.id), String(w.status))} className={secondaryBtnClass}>
                        {w.status === 'active' ? 'تعليق' : 'تفعيل'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalDialog open={createOpen} title="إنشاء مساحة عمل جديدة" onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1">المستخدم المالك *</label>
            <select required value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} className={inputClass}>
              {users.length === 0 ? (
                <option value="">أنشئ مستخدماً أولاً من قسم المستخدمين</option>
              ) : (
                users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1">اسم مساحة العمل *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1">نوع النشاط</label>
            <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} className={inputClass}>
              <option value="ecommerce">تجارة إلكترونية</option>
              <option value="clinic">عيادات ومراكز طبية</option>
              <option value="real_estate">عقارات</option>
              <option value="it_technology">تقنية ومعلومات</option>
              <option value="general">نشاط عام</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className={secondaryBtnClass}>
              إلغاء
            </button>
            <button type="submit" disabled={!ownerUserId} className={primaryBtnClass}>
              إنشاء
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
