import React from 'react';
import { Plus, ArrowRight, Play, Cpu, Coins } from 'lucide-react';
import { apiFetch, formatCurrency, formatDateTime, formatNumber } from '../lib/api';
import {
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
// 1. AI AGENTS DIRECTORY + 14-SECTION AGENT DETAIL + SANDBOX TESTER
// =========================================================================
export function AgentsPage({
  selectedAgentId,
  onSelectAgent,
  onNotify,
}: {
  selectedAgentId: string | null;
  onSelectAgent: (id: string | null) => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [agents, setAgents] = React.useState<Array<Record<string, unknown>>>([]);
  const [workspaces, setWorkspaces] = React.useState<Array<{ id: string; name: string; owner_user_id: string }>>([]);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);

  const [form, setForm] = React.useState({
    workspaceId: '',
    name: '',
    agentType: 'frontdesk',
    modelId: 'gemini-2.5-flash',
    dailyRequestLimit: '500',
    systemPrompt: 'أنت وكيل استقبال ذكي يعمل عبر منصة Kayan AI للرد على استفسارات العملاء وحجز المواعيد بدقة.',
  });

  const load = React.useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ status: statusFilter });
    if (search.trim()) q.set('search', search.trim());
    Promise.all([
      apiFetch<{ items: Array<Record<string, unknown>> }>(`/api/owner/agents?${q.toString()}`),
      apiFetch<{ items: Array<{ id: string; name: string; owner_user_id: string }> }>('/api/owner/workspaces'),
    ])
      .then(([aRes, wsRes]) => {
        setAgents(aRes.items);
        setWorkspaces(wsRes.items);
        if (!form.workspaceId && wsRes.items[0]) {
          setForm((prev) => ({ ...prev, workspaceId: wsRes.items[0].id }));
        }
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل الوكلاء.'))
      .finally(() => setLoading(false));
  }, [search, statusFilter, form.workspaceId, onNotify]);

  React.useEffect(() => {
    if (!selectedAgentId) load();
  }, [selectedAgentId, load]);

  if (selectedAgentId) {
    return (
      <AgentDetailView
        agentId={selectedAgentId}
        onBack={() => onSelectAgent(null)}
        onNotify={onNotify}
      />
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const ws = workspaces.find((w) => w.id === form.workspaceId);
    try {
      const created = await apiFetch<{ agent: { id: string } }>('/api/owner/agents', {
        method: 'POST',
        body: {
          userId: ws?.owner_user_id,
          workspaceId: form.workspaceId,
          name: form.name,
          agentType: form.agentType,
          modelId: form.modelId,
          dailyRequestLimit: Number(form.dailyRequestLimit),
          systemPrompt: form.systemPrompt,
        },
      });
      onNotify('success', `تم إنشاء الوكيل "${form.name}".`);
      setCreateOpen(false);
      setForm((prev) => ({ ...prev, name: '' }));
      load();
      if (created?.agent?.id) onSelectAgent(created.agent.id);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر إنشاء الوكيل.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز إدارة الوكلاء الذكيين (AI Agents)"
        subtitle="مراقبة وإدارة جميع الوكلاء المنشئين عبر المنصة مع معدل النجاح والأخطاء واستهلاك Tokens والتكلفة."
        action={
          <button type="button" onClick={() => setCreateOpen(true)} className={primaryBtnClass}>
            <Plus className="w-4 h-4" />
            <span>إنشاء وكيل ذكي</span>
          </button>
        }
      />

      <div className="flex flex-wrap gap-3 p-4 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)]">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث باسم الوكيل، المالك، مساحة العمل، أو النموذج..."
          className={`${inputClass} flex-1 min-w-[220px]`}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)] text-[var(--k-ink)]"
        >
          <option value="all">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="paused">متوقف مؤقتاً</option>
          <option value="disabled">معطل</option>
          <option value="error">خطأ</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : agents.length === 0 ? (
        <EmptyState
          title="لا يوجد وكلاء ذكيون مسجلون بعد"
          description="أنشئ وكيلاً ذكياً مرتبطاً بمساحة عمل لمتابعة تشغيله واستهلاكه واختباره في بيئة آمنة."
          action={
            <button type="button" onClick={() => setCreateOpen(true)} className={primaryBtnClass}>
              إنشاء وكيل ذكي
            </button>
          }
        />
      ) : (
        <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                <th className="px-4 py-3 text-start font-semibold">الوكيل</th>
                <th className="px-4 py-3 text-start font-semibold">المالك / مساحة العمل</th>
                <th className="px-4 py-3 text-start font-semibold">النموذج / المزود</th>
                <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                <th className="px-4 py-3 text-start font-semibold">التنفيذات (نجاح/خطأ)</th>
                <th className="px-4 py-3 text-start font-semibold">Tokens / التكلفة</th>
                <th className="px-4 py-3 text-end font-semibold">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--k-line)]">
              {agents.map((a) => {
                const runs = Number(a.executions_count || 0);
                const okRuns = Number(a.success_count || 0);
                const successRate = runs > 0 ? Math.round((okRuns / runs) * 100) : 100;
                return (
                  <tr key={String(a.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => onSelectAgent(String(a.id))} className="text-start hover:underline">
                        <div className="font-semibold text-[var(--k-ink)]">{String(a.name)}</div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">{String(a.agent_type)}</div>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div>{String(a.owner_name)}</div>
                      <div className="text-[11px] text-[var(--k-ink-muted)]">{String(a.workspace_name)}</div>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      <div>{String(a.model_id)}</div>
                      <div className="text-[11px] text-[var(--k-ink-muted)]">{String(a.provider_name)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusText
                        status={a.status === 'active' ? 'ok' : a.status === 'paused' ? 'warn' : 'error'}
                        label={String(a.status)}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      {runs} ({successRate}% نجاح · {String(a.error_count || 0)} خطأ)
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      <div>{formatNumber(Number(a.total_tokens))} tok</div>
                      <div className="text-[11px] text-[var(--k-ink-muted)]">
                        {a.total_cost_usd == null ? 'غير متاح' : formatCurrency(Number(a.total_cost_usd))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button
                        type="button"
                        onClick={() => onSelectAgent(String(a.id))}
                        className="text-xs font-semibold text-[var(--k-brand-forest)] hover:underline"
                      >
                        فتح التحكم
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ModalDialog open={createOpen} title="إنشاء وكيل ذكي جديد" onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">مساحة العمل *</label>
            <select
              required
              value={form.workspaceId}
              onChange={(e) => setForm({ ...form, workspaceId: e.target.value })}
              className={inputClass}
            >
              {workspaces.length === 0 ? (
                <option value="">أنشئ مستخدماً ومساحة عمل أولاً</option>
              ) : (
                workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">اسم الوكيل *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="مثال: وكيل المبيعات الذكي"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">نوع الوكيل</label>
              <select
                value={form.agentType}
                onChange={(e) => setForm({ ...form, agentType: e.target.value })}
                className={inputClass}
              >
                <option value="frontdesk">استقبال (Frontdesk)</option>
                <option value="sales">مبيعات (Sales)</option>
                <option value="support">دعم فني (Support)</option>
                <option value="voice">صوتي (Voice)</option>
                <option value="copilot">مساعد فريق (Copilot)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">النموذج</label>
              <select
                value={form.modelId}
                onChange={(e) => setForm({ ...form, modelId: e.target.value })}
                className={`${inputClass} font-mono`}
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                <option value="openai/gpt-oss-120b">openai/gpt-oss-120b (Groq)</option>
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Groq)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">الحد اليومي للطلبات</label>
              <input
                type="number"
                min={10}
                value={form.dailyRequestLimit}
                onChange={(e) => setForm({ ...form, dailyRequestLimit: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">التعليمات المعتمدة (System Prompt)</label>
            <textarea
              rows={3}
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" disabled={!form.workspaceId} className={primaryBtnClass}>إنشاء الوكيل</button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}

function AgentDetailView({
  agentId,
  onBack,
  onNotify,
}: {
  agentId: string;
  onBack: () => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [detail, setDetail] = React.useState<{
    agent: Record<string, unknown> & { tools: string[] };
    channels: Array<Record<string, unknown>>;
    knowledgeSources: Array<Record<string, unknown>>;
    executions: Array<Record<string, unknown>>;
    conversations: Array<Record<string, unknown>>;
    errors: Array<Record<string, unknown>>;
    configHistory: Array<Record<string, unknown>>;
    stats: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sandboxPrompt, setSandboxPrompt] = React.useState('مرحباً، ما هي ساعات العمل المتاحة لديكم؟');
  const [sandboxResult, setSandboxResult] = React.useState<{
    executedLive: boolean;
    reply?: string;
    message?: string;
    latencyMs?: number;
  } | null>(null);
  const [testing, setTesting] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    apiFetch<NonNullable<typeof detail>>(`/api/owner/agents/${encodeURIComponent(agentId)}`)
      .then(setDetail)
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل تفاصيل الوكيل.'))
      .finally(() => setLoading(false));
  }, [agentId, onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function changeAgentStatus(status: 'active' | 'paused' | 'disabled') {
    try {
      await apiFetch(`/api/owner/agents/${encodeURIComponent(agentId)}/control`, {
        method: 'PATCH',
        body: { status, reason: `تحديث حالة الوكيل إلى ${status}` },
      });
      onNotify('success', `تم تغيير حالة الوكيل إلى ${status}.`);
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحديث الحالة.');
    }
  }

  async function runSandboxTest() {
    setTesting(true);
    setSandboxResult(null);
    try {
      const res = await apiFetch<NonNullable<typeof sandboxResult>>(
        `/api/owner/agents/${encodeURIComponent(agentId)}/sandbox-test`,
        {
          method: 'POST',
          body: { message: sandboxPrompt },
        }
      );
      setSandboxResult(res);
      if (res.executedLive) {
        onNotify('success', `تم اختبار الوكيل بنجاح وتسجيل الاستهلاك (${res.latencyMs}ms).`);
        load();
      } else {
        onNotify('info', res.message || 'المزود غير مهيأ.');
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'فشل اختبار الوكيل.');
    } finally {
      setTesting(false);
    }
  }

  if (loading || !detail) return <TableSkeleton rows={5} />;
  const a = detail.agent;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--k-line)]">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className={secondaryBtnClass}>
            <ArrowRight className="w-4 h-4" />
            <span>العودة للوكلاء</span>
          </button>
          <div>
            <h1 className="text-xl font-bold text-[var(--k-ink)]">{String(a.name)}</h1>
            <p className="text-xs text-[var(--k-ink-muted)] font-mono">
              {String(a.model_id)} · {String(a.provider_name)} · {String(a.workspace_name)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => changeAgentStatus('active')} className={primaryBtnClass}>
            تفعيل
          </button>
          <button type="button" onClick={() => changeAgentStatus('paused')} className={secondaryBtnClass}>
            إيقاف مؤقت
          </button>
          <button type="button" onClick={() => changeAgentStatus('disabled')} className={secondaryBtnClass}>
            تعطيل
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricTile label="مرات التنفيذ" value={formatNumber(detail.stats?.total_runs)} />
        <MetricTile label="النجاح / الفشل" value={`${detail.stats?.success_runs || 0} / ${detail.stats?.failed_runs || 0}`} />
        <MetricTile label="استهلاك Tokens" value={formatNumber(detail.stats?.total_tokens)} />
        <MetricTile label="التكلفة المسجلة" value={detail.stats?.total_cost_usd == null ? 'غير متاح' : formatCurrency(Number(detail.stats.total_cost_usd))} />
        <MetricTile label="متوسط الاستجابة" value={`${Math.round(detail.stats?.avg_latency_ms || 0)} ms`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 space-y-5">
          <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
            <h2 className="text-sm font-bold">إعدادات وتعليمات الوكيل المعتمدة (النسخة v{String(a.prompt_version)})</h2>
            <p className="text-xs text-[var(--k-ink-secondary)] p-3 rounded-lg bg-[var(--k-surface-subtle)] leading-relaxed whitespace-pre-wrap">
              {String(a.system_prompt)}
            </p>
            <div className="text-xs text-[var(--k-ink-muted)]">
              الأدوات الممنوحة: <span className="font-mono text-[var(--k-ink)]">{a.tools.join(' · ') || '—'}</span> · الحد اليومي:{' '}
              <span className="font-mono text-[var(--k-ink)]">{String(a.daily_request_limit)}</span> طلب
            </div>
          </div>

          <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
            <h2 className="text-sm font-bold">اختبار الوكيل في بيئة آمنة (Owner Sandbox)</h2>
            <div className="flex gap-2">
              <input
                value={sandboxPrompt}
                onChange={(e) => setSandboxPrompt(e.target.value)}
                className={inputClass}
                placeholder="أدخل رسالة اختبار..."
              />
              <button type="button" disabled={testing} onClick={runSandboxTest} className={primaryBtnClass}>
                <Play className="w-3.5 h-3.5" />
                <span>{testing ? 'جاري التشغيل...' : 'اختبار'}</span>
              </button>
            </div>
            {sandboxResult && (
              <div className="p-3 rounded-lg border border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-xs space-y-1">
                <div className="font-semibold">
                  {sandboxResult.executedLive
                    ? `استجابة حية من النموذج (${sandboxResult.latencyMs}ms):`
                    : 'حالة المزود:'}
                </div>
                <p className="text-[var(--k-ink-secondary)] whitespace-pre-wrap">
                  {sandboxResult.reply || sandboxResult.message}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-5">
          <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-2">
            <h2 className="text-sm font-bold">سجل تغييرات الإعدادات ({detail.configHistory.length})</h2>
            <div className="divide-y divide-[var(--k-line)] text-xs max-h-48 overflow-y-auto">
              {detail.configHistory.map((h) => (
                <div key={String(h.id)} className="py-2">
                  <div className="font-medium">{String(h.change_summary)}</div>
                  <div className="text-[11px] text-[var(--k-ink-muted)]">
                    {String(h.actor_email)} · {formatDateTime(String(h.created_at))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-2">
            <h2 className="text-sm font-bold">آخر عمليات التنفيذ ({detail.executions.length})</h2>
            {detail.executions.length === 0 ? (
              <p className="text-xs text-[var(--k-ink-muted)]">لا توجد عمليات تنفيذ مسجلة بعد.</p>
            ) : (
              <div className="divide-y divide-[var(--k-line)] text-xs max-h-56 overflow-y-auto">
                {detail.executions.map((ex) => (
                  <div key={String(ex.id)} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-mono">{String(ex.operation_type)}</div>
                      <div className="text-[11px] text-[var(--k-ink-muted)]">{formatDateTime(String(ex.created_at))}</div>
                    </div>
                    <div className="text-end font-mono tabular-nums">
                      <div>{formatNumber(Number(ex.total_tokens))} tok</div>
                      <div className="text-[11px] text-[var(--k-ink-muted)]">{ex.cost_usd == null ? 'غير متاح' : formatCurrency(Number(ex.cost_usd))}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 2. AI PROVIDERS & MODELS GOVERNANCE PAGE
// =========================================================================
export function AiModelsPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data, setData] = React.useState<{
    providers: Array<Record<string, unknown>>;
    models: Array<Record<string, unknown>>;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    setLoading(true);
    apiFetch<NonNullable<typeof data>>('/api/owner/ai/providers')
      .then(setData)
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل مزودي الذكاء الاصطناعي.'))
      .finally(() => setLoading(false));
  }, [onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function toggleModelAllowed(model: Record<string, unknown>) {
    try {
      await apiFetch(`/api/owner/ai/models/${encodeURIComponent(String(model.model_id))}`, {
        method: 'PATCH',
        body: { isAllowed: Number(model.is_allowed) !== 1 },
      });
      onNotify('success', `تم تحديث حالة السماح للنموذج ${String(model.display_name)}.`);
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحديث النموذج.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الذكاء الاصطناعي ومزودو النماذج"
        subtitle="مراقبة مزودي الذكاء الاصطناعي المعتمدين في Kayan AI (Google Gemini الرئيسي + Groq الاحتياطي) وإدارة جدول التسعير الموثق والنماذج المسموحة."
      />

      {loading || !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.providers.map((p) => {
              const stats = (p.stats || {}) as Record<string, number>;
              return (
                <div key={String(p.id)} className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Cpu className="w-5 h-5 text-[var(--k-brand-forest)]" />
                      <div>
                        <h2 className="text-sm font-bold text-[var(--k-ink)]">{String(p.name)}</h2>
                        <div className="text-xs font-mono text-[var(--k-ink-muted)]" dir="ltr">
                          {String(p.env_key_name)} · {Number(p.is_primary) === 1 ? 'Primary' : 'Fallback'}
                        </div>
                      </div>
                    </div>
                    <StatusText
                      status={p.env_configured ? 'ok' : 'warn'}
                      label={p.env_configured ? 'مفتاح البيئة مهيأ' : 'غير مربوط بالبيئة'}
                    />
                  </div>
                  <dl className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums pt-3 border-t border-[var(--k-line)]">
                    <div>
                      <dt className="font-sans text-[var(--k-ink-muted)]">الطلبات (نجاح/فشل)</dt>
                      <dd className="font-semibold mt-0.5">
                        {formatNumber(stats.total_requests)} ({stats.success_requests || 0}/{stats.failed_requests || 0})
                      </dd>
                    </div>
                    <div>
                      <dt className="font-sans text-[var(--k-ink-muted)]">متوسط الاستجابة</dt>
                      <dd className="font-semibold mt-0.5">{Math.round(stats.avg_latency_ms || 0)} ms</dd>
                    </div>
                    <div>
                      <dt className="font-sans text-[var(--k-ink-muted)]">التكلفة المسجلة</dt>
                      <dd className="font-semibold mt-0.5">{stats.total_cost_usd == null ? 'غير متاح' : formatCurrency(Number(stats.total_cost_usd))}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>

          <section className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                  <th className="px-4 py-3 text-start font-semibold">النموذج</th>
                  <th className="px-4 py-3 text-start font-semibold">تسعير 1M Tokens (إدخال / إخراج / مخزن)</th>
                  <th className="px-4 py-3 text-start font-semibold">مصدر وإصدار التسعير</th>
                  <th className="px-4 py-3 text-start font-semibold">الاستخدام (وكلاء / طلبات)</th>
                  <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                  <th className="px-4 py-3 text-end font-semibold">التحكم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--k-line)]">
                {data.models.map((m) => (
                  <tr key={String(m.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{String(m.display_name)}</div>
                      <div className="text-[11px] font-mono text-[var(--k-ink-muted)]">{String(m.model_id)}</div>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      {String(m.pricing_source).startsWith('غير متاح') ? 'غير متاح' : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div>{String(m.pricing_source)}</div>
                      <div className="text-[11px] font-mono text-[var(--k-ink-muted)]">
                        v{String(m.pricing_version)} ({String(m.pricing_effective_date)})
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      {String(m.agents_using)} وكيل · {formatNumber(Number(m.requests_count))} طلب
                    </td>
                    <td className="px-4 py-3">
                      <StatusText
                        status={Number(m.is_allowed) === 1 ? 'ok' : 'error'}
                        label={Number(m.is_allowed) === 1 ? 'مسموح' : 'محظور'}
                      />
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button type="button" onClick={() => toggleModelAllowed(m)} className={secondaryBtnClass}>
                        {Number(m.is_allowed) === 1 ? 'تعطيل النموذج' : 'السماح بالنموذج'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

// =========================================================================
// 3. AI USAGE & COST LEDGER PAGE (IDEMPOTENT + ACTUAL VS ESTIMATED)
// =========================================================================
export function AiUsagePage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data, setData] = React.useState<{
    items: Array<Record<string, unknown>>;
    summary: Record<string, number>;
    pagination: { page: number; total: number; totalPages: number };
  } | null>(null);
  const [providerFilter, setProviderFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [loading, setLoading] = React.useState(true);
  const [recordModal, setRecordModal] = React.useState(false);

  const [evKey, setEvKey] = React.useState(() => `evt_${Date.now()}`);
  const [evModel, setEvModel] = React.useState('gemini-2.5-flash');
  const [evInputTok, setEvInputTok] = React.useState('2400');
  const [evOutputTok, setEvOutputTok] = React.useState('650');
  const [evCachedTok, setEvCachedTok] = React.useState('400');
  const [evLatency, setEvLatency] = React.useState('480');

  const load = React.useCallback(
    (page = 1) => {
      setLoading(true);
      const q = new URLSearchParams({
        page: String(page),
        providerCode: providerFilter,
        status: statusFilter,
      });
      apiFetch<NonNullable<typeof data>>(`/api/owner/ai/usage?${q.toString()}`)
        .then(setData)
        .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل سجل الاستهلاك.'))
        .finally(() => setLoading(false));
    },
    [providerFilter, statusFilter, onNotify]
  );

  React.useEffect(() => {
    load(1);
  }, [load]);

  async function submitEvent(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch<{ deduplicated: boolean }>('/api/owner/ai/usage', {
        method: 'POST',
        body: {
          idempotencyKey: evKey,
          modelId: evModel,
          inputTokens: Number(evInputTok),
          outputTokens: Number(evOutputTok),
          cachedTokens: Number(evCachedTok),
          latencyMs: Number(evLatency),
          status: 'success',
        },
      });
      onNotify(
        res.deduplicated ? 'info' : 'success',
        res.deduplicated
          ? 'تم تجاهل الحدث المكرر بنجاح بفضل مفتاح منع التكرار (Idempotency Key).'
          : 'تم تسجيل حدث الاستهلاك واحتساب تكلفته وفق جدول التسعير الموثق.'
      );
      setRecordModal(false);
      setEvKey(`evt_${Date.now()}`);
      load(1);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تسجيل الحدث.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل استهلاك الذكاء الاصطناعي والتكاليف"
        subtitle="سجل موثوق ومقاوم للتكرار (Idempotent Usage Ledger) يوثق Tokens والتكلفة الفعلية مقابل التقديرية مع مصدر وإصدار التسعير."
        action={
          <button type="button" onClick={() => setRecordModal(true)} className={primaryBtnClass}>
            <Coins className="w-4 h-4" />
            <span>تسجيل حدث استهلاك (Idempotent)</span>
          </button>
        }
      />

      {loading || !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricTile label="إجمالي الطلبات" value={formatNumber(data.summary?.requests)} />
            <MetricTile label="إجمالي Tokens" value={formatNumber(data.summary?.total_tokens)} subtext={`مخزنة: ${data.summary?.cached_tokens == null ? 'غير متاح' : formatNumber(Number(data.summary.cached_tokens))}`} />
            <MetricTile label="التكلفة الفعلية المسجلة" value={data.summary?.actual_cost_usd == null ? 'غير متاح' : formatCurrency(Number(data.summary.actual_cost_usd))} tone="sage" />
            <MetricTile label="التكلفة التقديرية" value={data.summary?.estimated_cost_usd == null ? 'غير متاح' : formatCurrency(Number(data.summary.estimated_cost_usd))} subtext={`الإجمالي المسجل: ${data.summary?.total_cost_usd == null ? 'غير متاح' : formatCurrency(Number(data.summary.total_cost_usd))}`} />
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]"
            >
              <option value="all">كل المزودين</option>
              <option value="gemini">Google Gemini</option>
              <option value="groq">Groq Cloud</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]"
            >
              <option value="all">كل الحالات</option>
              <option value="success">ناجح</option>
              <option value="failed">فاشل</option>
            </select>
          </div>

          {data.items.length === 0 ? (
            <EmptyState
              title="لا توجد أحداث استهلاك مسجلة حتى الآن"
              description="تُضاف الأحداث تلقائياً عند اختبار الوكلاء أو تنفيذ طلبات الذكاء الاصطناعي، ويمكنك تسجيل حدث اختباري للتحقق من التسعير ومنع التكرار."
              action={
                <button type="button" onClick={() => setRecordModal(true)} className={primaryBtnClass}>
                  تسجيل حدث استهلاك
                </button>
              }
            />
          ) : (
            <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-4 py-3 text-start font-semibold">النموذج / المزود</th>
                    <th className="px-4 py-3 text-start font-semibold">المستخدم / الوكيل</th>
                    <th className="px-4 py-3 text-start font-semibold">Tokens (إدخال/إخراج/مخزن)</th>
                    <th className="px-4 py-3 text-start font-semibold">التكلفة والمصدر</th>
                    <th className="px-4 py-3 text-start font-semibold">الزمن</th>
                    <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                    <th className="px-4 py-3 text-start font-semibold">الوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--k-line)]">
                  {data.items.map((ev) => (
                    <tr key={String(ev.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                      <td className="px-4 py-3 font-mono">
                        <div className="font-semibold">{String(ev.model_id)}</div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">{String(ev.provider_code)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{String(ev.user_name || 'النظام')}</div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">{String(ev.agent_name || ev.operation_type)}</div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {formatNumber(Number(ev.input_tokens))} / {formatNumber(Number(ev.output_tokens))} / {formatNumber(Number(ev.cached_tokens))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono tabular-nums font-semibold">
                          {ev.cost_usd == null ? 'غير متاح' : formatCurrency(Number(ev.cost_usd))} ({ev.cost_type === 'actual' ? 'فعلي' : 'غير مسجل'})
                        </div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">
                          {String(ev.pricing_source)} v{String(ev.pricing_version)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">{String(ev.latency_ms)} ms</td>
                      <td className="px-4 py-3">
                        <StatusText
                          status={ev.status === 'success' ? 'ok' : 'error'}
                          label={ev.status === 'success' ? 'ناجح' : 'فاشل'}
                        />
                      </td>
                      <td className="px-4 py-3 text-[var(--k-ink-muted)] whitespace-nowrap">
                        {formatDateTime(String(ev.created_at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ModalDialog open={recordModal} title="تسجيل حدث استهلاك AI (Idempotent)" onClose={() => setRecordModal(false)}>
        <form onSubmit={submitEvent} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">مفتاح منع التكرار (Idempotency Key) *</label>
            <input required dir="ltr" value={evKey} onChange={(e) => setEvKey(e.target.value)} className={`${inputClass} font-mono text-left`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">النموذج</label>
              <select value={evModel} onChange={(e) => setEvModel(e.target.value)} className={`${inputClass} font-mono`}>
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                <option value="openai/gpt-oss-120b">openai/gpt-oss-120b</option>
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">زمن التنفيذ (ms)</label>
              <input type="number" min={0} value={evLatency} onChange={(e) => setEvLatency(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tokens المدخلة</label>
              <input type="number" min={0} value={evInputTok} onChange={(e) => setEvInputTok(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tokens الناتجة</label>
              <input type="number" min={0} value={evOutputTok} onChange={(e) => setEvOutputTok(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tokens المخزنة / المعاد استخدامها</label>
            <input type="number" min={0} value={evCachedTok} onChange={(e) => setEvCachedTok(e.target.value)} className={`${inputClass} font-mono`} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRecordModal(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" className={primaryBtnClass}>تسجيل الحدث</button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}

// =========================================================================
// 3. AI USAGE & COST LEDGER PAGE (IDEMPOTENT + ACTUAL VS ESTIMATED)
// =========================================================================
export function AiUsagePage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data, setData] = React.useState<{
    items: Array<Record<string, unknown>>;
    summary: Record<string, number>;
    pagination: { page: number; total: number; totalPages: number };
  } | null>(null);
  const [providerFilter, setProviderFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [loading, setLoading] = React.useState(true);
  const [recordModal, setRecordModal] = React.useState(false);

  const [evKey, setEvKey] = React.useState(() => `evt_${Date.now()}`);
  const [evModel, setEvModel] = React.useState('gemini-2.5-flash');
  const [evInputTok, setEvInputTok] = React.useState('2400');
  const [evOutputTok, setEvOutputTok] = React.useState('650');
  const [evCachedTok, setEvCachedTok] = React.useState('400');
  const [evLatency, setEvLatency] = React.useState('480');

  const load = React.useCallback(
    (page = 1) => {
      setLoading(true);
      const q = new URLSearchParams({
        page: String(page),
        providerCode: providerFilter,
        status: statusFilter,
      });
      apiFetch<NonNullable<typeof data>>(`/api/owner/ai/usage?${q.toString()}`)
        .then(setData)
        .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل سجل الاستهلاك.'))
        .finally(() => setLoading(false));
    },
    [providerFilter, statusFilter, onNotify]
  );

  React.useEffect(() => {
    load(1);
  }, [load]);

  async function submitEvent(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch<{ deduplicated: boolean }>('/api/owner/ai/usage', {
        method: 'POST',
        body: {
          idempotencyKey: evKey,
          modelId: evModel,
          inputTokens: Number(evInputTok),
          outputTokens: Number(evOutputTok),
          cachedTokens: Number(evCachedTok),
          latencyMs: Number(evLatency),
          status: 'success',
        },
      });
      onNotify(
        res.deduplicated ? 'info' : 'success',
        res.deduplicated
          ? 'تم تجاهل الحدث المكرر بنجاح بفضل مفتاح منع التكرار (Idempotency Key).'
          : 'تم تسجيل حدث الاستهلاك واحتساب تكلفته وفق جدول التسعير الموثق.'
      );
      setRecordModal(false);
      setEvKey(`evt_${Date.now()}`);
      load(1);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تسجيل الحدث.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل استهلاك الذكاء الاصطناعي والتكاليف"
        subtitle="سجل موثوق ومقاوم للتكرار (Idempotent Usage Ledger) يوثق Tokens والتكلفة الفعلية مقابل التقديرية مع مصدر وإصدار التسعير."
        action={
          <button type="button" onClick={() => setRecordModal(true)} className={primaryBtnClass}>
            <Coins className="w-4 h-4" />
            <span>تسجيل حدث استهلاك (Idempotent)</span>
          </button>
        }
      />

      {loading || !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricTile label="إجمالي الطلبات" value={formatNumber(data.summary?.requests)} />
            <MetricTile label="إجمالي Tokens" value={formatNumber(data.summary?.total_tokens)} subtext={`مخزنة: ${data.summary?.cached_tokens == null ? 'غير متاح' : formatNumber(Number(data.summary.cached_tokens))}`} />
            <MetricTile label="التكلفة الفعلية المسجلة" value={data.summary?.actual_cost_usd == null ? 'غير متاح' : formatCurrency(Number(data.summary.actual_cost_usd))} tone="sage" />
            <MetricTile label="التكلفة التقديرية" value={data.summary?.estimated_cost_usd == null ? 'غير متاح' : formatCurrency(Number(data.summary.estimated_cost_usd))} subtext={`الإجمالي المسجل: ${data.summary?.total_cost_usd == null ? 'غير متاح' : formatCurrency(Number(data.summary.total_cost_usd))}`} />
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]"
            >
              <option value="all">كل المزودين</option>
              <option value="gemini">Google Gemini</option>
              <option value="groq">Groq Cloud</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]"
            >
              <option value="all">كل الحالات</option>
              <option value="success">ناجح</option>
              <option value="failed">فاشل</option>
            </select>
          </div>

          {data.items.length === 0 ? (
            <EmptyState
              title="لا توجد أحداث استهلاك مسجلة حتى الآن"
              description="تُضاف الأحداث تلقائياً عند اختبار الوكلاء أو تنفيذ طلبات الذكاء الاصطناعي، ويمكنك تسجيل حدث اختباري للتحقق من التسعير ومنع التكرار."
              action={
                <button type="button" onClick={() => setRecordModal(true)} className={primaryBtnClass}>
                  تسجيل حدث استهلاك
                </button>
              }
            />
          ) : (
            <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-4 py-3 text-start font-semibold">النموذج / المزود</th>
                    <th className="px-4 py-3 text-start font-semibold">المستخدم / الوكيل</th>
                    <th className="px-4 py-3 text-start font-semibold">Tokens (إدخال/إخراج/مخزن)</th>
                    <th className="px-4 py-3 text-start font-semibold">التكلفة والمصدر</th>
                    <th className="px-4 py-3 text-start font-semibold">الزمن</th>
                    <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                    <th className="px-4 py-3 text-start font-semibold">الوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--k-line)]">
                  {data.items.map((ev) => (
                    <tr key={String(ev.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                      <td className="px-4 py-3 font-mono">
                        <div className="font-semibold">{String(ev.model_id)}</div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">{String(ev.provider_code)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{String(ev.user_name || 'النظام')}</div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">{String(ev.agent_name || ev.operation_type)}</div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {formatNumber(Number(ev.input_tokens))} / {formatNumber(Number(ev.output_tokens))} / {formatNumber(Number(ev.cached_tokens))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono tabular-nums font-semibold">
                          {ev.cost_usd == null ? 'غير متاح' : formatCurrency(Number(ev.cost_usd))} ({ev.cost_type === 'actual' ? 'فعلي' : 'غير مسجل'})
                        </div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">
                          {String(ev.pricing_source)} v{String(ev.pricing_version)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">{String(ev.latency_ms)} ms</td>
                      <td className="px-4 py-3">
                        <StatusText
                          status={ev.status === 'success' ? 'ok' : 'error'}
                          label={ev.status === 'success' ? 'ناجح' : 'فاشل'}
                        />
                      </td>
                      <td className="px-4 py-3 text-[var(--k-ink-muted)] whitespace-nowrap">
                        {formatDateTime(String(ev.created_at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ModalDialog open={recordModal} title="تسجيل حدث استهلاك AI (Idempotent)" onClose={() => setRecordModal(false)}>
        <form onSubmit={submitEvent} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">مفتاح منع التكرار (Idempotency Key) *</label>
            <input required dir="ltr" value={evKey} onChange={(e) => setEvKey(e.target.value)} className={`${inputClass} font-mono text-left`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">النموذج</label>
              <select value={evModel} onChange={(e) => setEvModel(e.target.value)} className={`${inputClass} font-mono`}>
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                <option value="openai/gpt-oss-120b">openai/gpt-oss-120b</option>
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">زمن التنفيذ (ms)</label>
              <input type="number" min={0} value={evLatency} onChange={(e) => setEvLatency(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tokens المدخلة</label>
              <input type="number" min={0} value={evInputTok} onChange={(e) => setEvInputTok(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tokens الناتجة</label>
              <input type="number" min={0} value={evOutputTok} onChange={(e) => setEvOutputTok(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tokens المخزنة / المعاد استخدامها</label>
            <input type="number" min={0} value={evCachedTok} onChange={(e) => setEvCachedTok(e.target.value)} className={`${inputClass} font-mono`} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRecordModal(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" className={primaryBtnClass}>تسجيل الحدث</button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
 + String(m.output_price_per_1m) + ' / 
                    </td>
                    <td className="px-4 py-3">
                      <div>{String(m.pricing_source)}</div>
                      <div className="text-[11px] font-mono text-[var(--k-ink-muted)]">
                        v{String(m.pricing_version)} ({String(m.pricing_effective_date)})
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      {String(m.agents_using)} وكيل · {formatNumber(Number(m.requests_count))} طلب
                    </td>
                    <td className="px-4 py-3">
                      <StatusText
                        status={Number(m.is_allowed) === 1 ? 'ok' : 'error'}
                        label={Number(m.is_allowed) === 1 ? 'مسموح' : 'محظور'}
                      />
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button type="button" onClick={() => toggleModelAllowed(m)} className={secondaryBtnClass}>
                        {Number(m.is_allowed) === 1 ? 'تعطيل النموذج' : 'السماح بالنموذج'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

// =========================================================================
// 3. AI USAGE & COST LEDGER PAGE (IDEMPOTENT + ACTUAL VS ESTIMATED)
// =========================================================================
export function AiUsagePage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data, setData] = React.useState<{
    items: Array<Record<string, unknown>>;
    summary: Record<string, number>;
    pagination: { page: number; total: number; totalPages: number };
  } | null>(null);
  const [providerFilter, setProviderFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [loading, setLoading] = React.useState(true);
  const [recordModal, setRecordModal] = React.useState(false);

  const [evKey, setEvKey] = React.useState(() => `evt_${Date.now()}`);
  const [evModel, setEvModel] = React.useState('gemini-2.5-flash');
  const [evInputTok, setEvInputTok] = React.useState('2400');
  const [evOutputTok, setEvOutputTok] = React.useState('650');
  const [evCachedTok, setEvCachedTok] = React.useState('400');
  const [evLatency, setEvLatency] = React.useState('480');

  const load = React.useCallback(
    (page = 1) => {
      setLoading(true);
      const q = new URLSearchParams({
        page: String(page),
        providerCode: providerFilter,
        status: statusFilter,
      });
      apiFetch<NonNullable<typeof data>>(`/api/owner/ai/usage?${q.toString()}`)
        .then(setData)
        .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل سجل الاستهلاك.'))
        .finally(() => setLoading(false));
    },
    [providerFilter, statusFilter, onNotify]
  );

  React.useEffect(() => {
    load(1);
  }, [load]);

  async function submitEvent(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch<{ deduplicated: boolean }>('/api/owner/ai/usage', {
        method: 'POST',
        body: {
          idempotencyKey: evKey,
          modelId: evModel,
          inputTokens: Number(evInputTok),
          outputTokens: Number(evOutputTok),
          cachedTokens: Number(evCachedTok),
          latencyMs: Number(evLatency),
          status: 'success',
        },
      });
      onNotify(
        res.deduplicated ? 'info' : 'success',
        res.deduplicated
          ? 'تم تجاهل الحدث المكرر بنجاح بفضل مفتاح منع التكرار (Idempotency Key).'
          : 'تم تسجيل حدث الاستهلاك واحتساب تكلفته وفق جدول التسعير الموثق.'
      );
      setRecordModal(false);
      setEvKey(`evt_${Date.now()}`);
      load(1);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تسجيل الحدث.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل استهلاك الذكاء الاصطناعي والتكاليف"
        subtitle="سجل موثوق ومقاوم للتكرار (Idempotent Usage Ledger) يوثق Tokens والتكلفة الفعلية مقابل التقديرية مع مصدر وإصدار التسعير."
        action={
          <button type="button" onClick={() => setRecordModal(true)} className={primaryBtnClass}>
            <Coins className="w-4 h-4" />
            <span>تسجيل حدث استهلاك (Idempotent)</span>
          </button>
        }
      />

      {loading || !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricTile label="إجمالي الطلبات" value={formatNumber(data.summary?.requests)} />
            <MetricTile label="إجمالي Tokens" value={formatNumber(data.summary?.total_tokens)} subtext={`مخزنة: ${data.summary?.cached_tokens == null ? 'غير متاح' : formatNumber(Number(data.summary.cached_tokens))}`} />
            <MetricTile label="التكلفة الفعلية المسجلة" value={data.summary?.actual_cost_usd == null ? 'غير متاح' : formatCurrency(Number(data.summary.actual_cost_usd))} tone="sage" />
            <MetricTile label="التكلفة التقديرية" value={data.summary?.estimated_cost_usd == null ? 'غير متاح' : formatCurrency(Number(data.summary.estimated_cost_usd))} subtext={`الإجمالي المسجل: ${data.summary?.total_cost_usd == null ? 'غير متاح' : formatCurrency(Number(data.summary.total_cost_usd))}`} />
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]"
            >
              <option value="all">كل المزودين</option>
              <option value="gemini">Google Gemini</option>
              <option value="groq">Groq Cloud</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]"
            >
              <option value="all">كل الحالات</option>
              <option value="success">ناجح</option>
              <option value="failed">فاشل</option>
            </select>
          </div>

          {data.items.length === 0 ? (
            <EmptyState
              title="لا توجد أحداث استهلاك مسجلة حتى الآن"
              description="تُضاف الأحداث تلقائياً عند اختبار الوكلاء أو تنفيذ طلبات الذكاء الاصطناعي، ويمكنك تسجيل حدث اختباري للتحقق من التسعير ومنع التكرار."
              action={
                <button type="button" onClick={() => setRecordModal(true)} className={primaryBtnClass}>
                  تسجيل حدث استهلاك
                </button>
              }
            />
          ) : (
            <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-4 py-3 text-start font-semibold">النموذج / المزود</th>
                    <th className="px-4 py-3 text-start font-semibold">المستخدم / الوكيل</th>
                    <th className="px-4 py-3 text-start font-semibold">Tokens (إدخال/إخراج/مخزن)</th>
                    <th className="px-4 py-3 text-start font-semibold">التكلفة والمصدر</th>
                    <th className="px-4 py-3 text-start font-semibold">الزمن</th>
                    <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                    <th className="px-4 py-3 text-start font-semibold">الوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--k-line)]">
                  {data.items.map((ev) => (
                    <tr key={String(ev.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                      <td className="px-4 py-3 font-mono">
                        <div className="font-semibold">{String(ev.model_id)}</div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">{String(ev.provider_code)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{String(ev.user_name || 'النظام')}</div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">{String(ev.agent_name || ev.operation_type)}</div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {formatNumber(Number(ev.input_tokens))} / {formatNumber(Number(ev.output_tokens))} / {formatNumber(Number(ev.cached_tokens))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono tabular-nums font-semibold">
                          {ev.cost_usd == null ? 'غير متاح' : formatCurrency(Number(ev.cost_usd))} ({ev.cost_type === 'actual' ? 'فعلي' : 'غير مسجل'})
                        </div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">
                          {String(ev.pricing_source)} v{String(ev.pricing_version)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">{String(ev.latency_ms)} ms</td>
                      <td className="px-4 py-3">
                        <StatusText
                          status={ev.status === 'success' ? 'ok' : 'error'}
                          label={ev.status === 'success' ? 'ناجح' : 'فاشل'}
                        />
                      </td>
                      <td className="px-4 py-3 text-[var(--k-ink-muted)] whitespace-nowrap">
                        {formatDateTime(String(ev.created_at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ModalDialog open={recordModal} title="تسجيل حدث استهلاك AI (Idempotent)" onClose={() => setRecordModal(false)}>
        <form onSubmit={submitEvent} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">مفتاح منع التكرار (Idempotency Key) *</label>
            <input required dir="ltr" value={evKey} onChange={(e) => setEvKey(e.target.value)} className={`${inputClass} font-mono text-left`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">النموذج</label>
              <select value={evModel} onChange={(e) => setEvModel(e.target.value)} className={`${inputClass} font-mono`}>
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                <option value="openai/gpt-oss-120b">openai/gpt-oss-120b</option>
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">زمن التنفيذ (ms)</label>
              <input type="number" min={0} value={evLatency} onChange={(e) => setEvLatency(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tokens المدخلة</label>
              <input type="number" min={0} value={evInputTok} onChange={(e) => setEvInputTok(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tokens الناتجة</label>
              <input type="number" min={0} value={evOutputTok} onChange={(e) => setEvOutputTok(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tokens المخزنة / المعاد استخدامها</label>
            <input type="number" min={0} value={evCachedTok} onChange={(e) => setEvCachedTok(e.target.value)} className={`${inputClass} font-mono`} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRecordModal(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" className={primaryBtnClass}>تسجيل الحدث</button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
 + String(m.cached_input_price_per_1m)}
                    </td>
                    <td className="px-4 py-3">
                      <div>{String(m.pricing_source)}</div>
                      <div className="text-[11px] font-mono text-[var(--k-ink-muted)]">
                        v{String(m.pricing_version)} ({String(m.pricing_effective_date)})
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      {String(m.agents_using)} وكيل · {formatNumber(Number(m.requests_count))} طلب
                    </td>
                    <td className="px-4 py-3">
                      <StatusText
                        status={Number(m.is_allowed) === 1 ? 'ok' : 'error'}
                        label={Number(m.is_allowed) === 1 ? 'مسموح' : 'محظور'}
                      />
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button type="button" onClick={() => toggleModelAllowed(m)} className={secondaryBtnClass}>
                        {Number(m.is_allowed) === 1 ? 'تعطيل النموذج' : 'السماح بالنموذج'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

// =========================================================================
// 3. AI USAGE & COST LEDGER PAGE (IDEMPOTENT + ACTUAL VS ESTIMATED)
// =========================================================================
export function AiUsagePage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data, setData] = React.useState<{
    items: Array<Record<string, unknown>>;
    summary: Record<string, number>;
    pagination: { page: number; total: number; totalPages: number };
  } | null>(null);
  const [providerFilter, setProviderFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [loading, setLoading] = React.useState(true);
  const [recordModal, setRecordModal] = React.useState(false);

  const [evKey, setEvKey] = React.useState(() => `evt_${Date.now()}`);
  const [evModel, setEvModel] = React.useState('gemini-2.5-flash');
  const [evInputTok, setEvInputTok] = React.useState('2400');
  const [evOutputTok, setEvOutputTok] = React.useState('650');
  const [evCachedTok, setEvCachedTok] = React.useState('400');
  const [evLatency, setEvLatency] = React.useState('480');

  const load = React.useCallback(
    (page = 1) => {
      setLoading(true);
      const q = new URLSearchParams({
        page: String(page),
        providerCode: providerFilter,
        status: statusFilter,
      });
      apiFetch<NonNullable<typeof data>>(`/api/owner/ai/usage?${q.toString()}`)
        .then(setData)
        .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل سجل الاستهلاك.'))
        .finally(() => setLoading(false));
    },
    [providerFilter, statusFilter, onNotify]
  );

  React.useEffect(() => {
    load(1);
  }, [load]);

  async function submitEvent(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch<{ deduplicated: boolean }>('/api/owner/ai/usage', {
        method: 'POST',
        body: {
          idempotencyKey: evKey,
          modelId: evModel,
          inputTokens: Number(evInputTok),
          outputTokens: Number(evOutputTok),
          cachedTokens: Number(evCachedTok),
          latencyMs: Number(evLatency),
          status: 'success',
        },
      });
      onNotify(
        res.deduplicated ? 'info' : 'success',
        res.deduplicated
          ? 'تم تجاهل الحدث المكرر بنجاح بفضل مفتاح منع التكرار (Idempotency Key).'
          : 'تم تسجيل حدث الاستهلاك واحتساب تكلفته وفق جدول التسعير الموثق.'
      );
      setRecordModal(false);
      setEvKey(`evt_${Date.now()}`);
      load(1);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تسجيل الحدث.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل استهلاك الذكاء الاصطناعي والتكاليف"
        subtitle="سجل موثوق ومقاوم للتكرار (Idempotent Usage Ledger) يوثق Tokens والتكلفة الفعلية مقابل التقديرية مع مصدر وإصدار التسعير."
        action={
          <button type="button" onClick={() => setRecordModal(true)} className={primaryBtnClass}>
            <Coins className="w-4 h-4" />
            <span>تسجيل حدث استهلاك (Idempotent)</span>
          </button>
        }
      />

      {loading || !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricTile label="إجمالي الطلبات" value={formatNumber(data.summary?.requests)} />
            <MetricTile label="إجمالي Tokens" value={formatNumber(data.summary?.total_tokens)} subtext={`مخزنة: ${data.summary?.cached_tokens == null ? 'غير متاح' : formatNumber(Number(data.summary.cached_tokens))}`} />
            <MetricTile label="التكلفة الفعلية المسجلة" value={data.summary?.actual_cost_usd == null ? 'غير متاح' : formatCurrency(Number(data.summary.actual_cost_usd))} tone="sage" />
            <MetricTile label="التكلفة التقديرية" value={data.summary?.estimated_cost_usd == null ? 'غير متاح' : formatCurrency(Number(data.summary.estimated_cost_usd))} subtext={`الإجمالي المسجل: ${data.summary?.total_cost_usd == null ? 'غير متاح' : formatCurrency(Number(data.summary.total_cost_usd))}`} />
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]"
            >
              <option value="all">كل المزودين</option>
              <option value="gemini">Google Gemini</option>
              <option value="groq">Groq Cloud</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]"
            >
              <option value="all">كل الحالات</option>
              <option value="success">ناجح</option>
              <option value="failed">فاشل</option>
            </select>
          </div>

          {data.items.length === 0 ? (
            <EmptyState
              title="لا توجد أحداث استهلاك مسجلة حتى الآن"
              description="تُضاف الأحداث تلقائياً عند اختبار الوكلاء أو تنفيذ طلبات الذكاء الاصطناعي، ويمكنك تسجيل حدث اختباري للتحقق من التسعير ومنع التكرار."
              action={
                <button type="button" onClick={() => setRecordModal(true)} className={primaryBtnClass}>
                  تسجيل حدث استهلاك
                </button>
              }
            />
          ) : (
            <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-4 py-3 text-start font-semibold">النموذج / المزود</th>
                    <th className="px-4 py-3 text-start font-semibold">المستخدم / الوكيل</th>
                    <th className="px-4 py-3 text-start font-semibold">Tokens (إدخال/إخراج/مخزن)</th>
                    <th className="px-4 py-3 text-start font-semibold">التكلفة والمصدر</th>
                    <th className="px-4 py-3 text-start font-semibold">الزمن</th>
                    <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                    <th className="px-4 py-3 text-start font-semibold">الوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--k-line)]">
                  {data.items.map((ev) => (
                    <tr key={String(ev.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                      <td className="px-4 py-3 font-mono">
                        <div className="font-semibold">{String(ev.model_id)}</div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">{String(ev.provider_code)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{String(ev.user_name || 'النظام')}</div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">{String(ev.agent_name || ev.operation_type)}</div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {formatNumber(Number(ev.input_tokens))} / {formatNumber(Number(ev.output_tokens))} / {formatNumber(Number(ev.cached_tokens))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono tabular-nums font-semibold">
                          {ev.cost_usd == null ? 'غير متاح' : formatCurrency(Number(ev.cost_usd))} ({ev.cost_type === 'actual' ? 'فعلي' : 'غير مسجل'})
                        </div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">
                          {String(ev.pricing_source)} v{String(ev.pricing_version)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">{String(ev.latency_ms)} ms</td>
                      <td className="px-4 py-3">
                        <StatusText
                          status={ev.status === 'success' ? 'ok' : 'error'}
                          label={ev.status === 'success' ? 'ناجح' : 'فاشل'}
                        />
                      </td>
                      <td className="px-4 py-3 text-[var(--k-ink-muted)] whitespace-nowrap">
                        {formatDateTime(String(ev.created_at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ModalDialog open={recordModal} title="تسجيل حدث استهلاك AI (Idempotent)" onClose={() => setRecordModal(false)}>
        <form onSubmit={submitEvent} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">مفتاح منع التكرار (Idempotency Key) *</label>
            <input required dir="ltr" value={evKey} onChange={(e) => setEvKey(e.target.value)} className={`${inputClass} font-mono text-left`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">النموذج</label>
              <select value={evModel} onChange={(e) => setEvModel(e.target.value)} className={`${inputClass} font-mono`}>
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                <option value="openai/gpt-oss-120b">openai/gpt-oss-120b</option>
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">زمن التنفيذ (ms)</label>
              <input type="number" min={0} value={evLatency} onChange={(e) => setEvLatency(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tokens المدخلة</label>
              <input type="number" min={0} value={evInputTok} onChange={(e) => setEvInputTok(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tokens الناتجة</label>
              <input type="number" min={0} value={evOutputTok} onChange={(e) => setEvOutputTok(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tokens المخزنة / المعاد استخدامها</label>
            <input type="number" min={0} value={evCachedTok} onChange={(e) => setEvCachedTok(e.target.value)} className={`${inputClass} font-mono`} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRecordModal(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" className={primaryBtnClass}>تسجيل الحدث</button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
