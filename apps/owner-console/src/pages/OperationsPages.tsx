import React from 'react';
import { Plus, Key, RefreshCw, MessageSquare, ShieldAlert } from 'lucide-react';
import { apiFetch, formatDateTime, formatNumber } from '../lib/api';
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
// 10. CONVERSATIONS & MESSAGES EXPLORER (WITH AUDITED INTERVENTION LOCK)
// =========================================================================
export function ConversationsPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data, setData] = React.useState<{
    items: Array<Record<string, unknown>>;
    summary: Record<string, number>;
  } | null>(null);
  const [workspaces, setWorkspaces] = React.useState<Array<{ id: string; name: string; owner_user_id: string }>>([]);
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [channelFilter, setChannelFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [thread, setThread] = React.useState<{
    conversation: Record<string, unknown>;
    messages: Array<Record<string, unknown>>;
  } | null>(null);
  const [interveneOpen, setInterveneOpen] = React.useState(false);
  const [interveneContent, setInterveneContent] = React.useState('');
  const [interveneReason, setInterveneReason] = React.useState('');

  const [newConvOpen, setNewConvOpen] = React.useState(false);
  const [convWsId, setConvWsId] = React.useState('');
  const [convChannel, setConvChannel] = React.useState('whatsapp');
  const [convHandle, setConvHandle] = React.useState('');
  const [convMsg, setConvMsg] = React.useState('');

  const load = React.useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ status: statusFilter, channelType: channelFilter });
    if (search.trim()) q.set('search', search.trim());
    Promise.all([
      apiFetch<NonNullable<typeof data>>(`/api/owner/conversations?${q.toString()}`),
      apiFetch<{ items: Array<{ id: string; name: string; owner_user_id: string }> }>('/api/owner/workspaces'),
    ])
      .then(([cRes, wRes]) => {
        setData(cRes);
        setWorkspaces(wRes.items);
        if (!convWsId && wRes.items[0]) setConvWsId(wRes.items[0].id);
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل المحادثات.'))
      .finally(() => setLoading(false));
  }, [statusFilter, channelFilter, search, convWsId, onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function openThread(id: string) {
    setSelectedId(id);
    try {
      const res = await apiFetch<NonNullable<typeof thread>>(`/api/owner/conversations/${encodeURIComponent(id)}`);
      setThread(res);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل رسائل المحادثة.');
    }
  }

  async function submitIntervention(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    try {
      const updated = await apiFetch<NonNullable<typeof thread>>(
        `/api/owner/conversations/${encodeURIComponent(selectedId)}/intervene`,
        {
          method: 'POST',
          body: { content: interveneContent, reason: interveneReason },
        }
      );
      setThread(updated);
      setInterveneOpen(false);
      setInterveneContent('');
      setInterveneReason('');
      onNotify('success', 'تم إرسال رسالة التدخل الإداري وتوثيقها في سجل التدقيق.');
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تنفيذ التدخل.');
    }
  }

  async function submitNewConv(e: React.FormEvent) {
    e.preventDefault();
    const ws = workspaces.find((w) => w.id === convWsId);
    try {
      await apiFetch('/api/owner/conversations', {
        method: 'POST',
        body: {
          userId: ws?.owner_user_id,
          workspaceId: convWsId,
          channelType: convChannel,
          customerHandle: convHandle,
          initialMessage: convMsg,
        },
      });
      onNotify('success', 'تم تسجيل المحادثة بنجاح.');
      setNewConvOpen(false);
      setConvHandle('');
      setConvMsg('');
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر إنشاء المحادثة.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز المحادثات والرسائل"
        subtitle="متابعة شاملة لجميع محادثات المنصة مع معلومات التنفيذ والأخطاء، دون السماح بالتدخل في محادثة عميل إلا بإجراء صريح ومسجل."
        action={
          <button type="button" onClick={() => setNewConvOpen(true)} className={primaryBtnClass}>
            <MessageSquare className="w-4 h-4" />
            <span>تسجيل محادثة</span>
          </button>
        }
      />

      {loading || !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <MetricTile label="إجمالي المحادثات" value={formatNumber(data.summary?.total)} />
            <MetricTile label="النشطة" value={formatNumber(data.summary?.active)} tone="success" />
            <MetricTile label="الجديدة" value={formatNumber(data.summary?.new_count)} />
            <MetricTile label="المغلقة" value={formatNumber(data.summary?.closed)} />
            <MetricTile label="عالجها الوكيل" value={formatNumber(data.summary?.agent_handled)} />
            <MetricTile label="تحتاج تدخلاً بشرياً" value={formatNumber(data.summary?.needs_human)} tone="warning" />
            <MetricTile label="إجمالي الرسائل" value={formatNumber(data.summary?.total_messages)} subtext={`متوسط الرد: ${Math.round(data.summary?.avg_response_ms || 0)}ms`} />
          </div>

          <div className="flex flex-wrap gap-3 p-4 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)]">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث برقم العميل، اسم المستخدم، أو معرف المحادثة..."
              className={`${inputClass} flex-1 min-w-[200px]`}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]">
              <option value="all">كل الحالات</option>
              <option value="active">نشطة</option>
              <option value="new">جديدة</option>
              <option value="needs_human">تحتاج تدخلاً بشرياً</option>
              <option value="closed">مغلقة</option>
              <option value="failed">فاشلة</option>
            </select>
            <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)]">
              <option value="all">كل القنوات</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="telegram">Telegram</option>
              <option value="sms">SMS</option>
              <option value="voice_vapi">Voice Vapi</option>
              <option value="webchat">Webchat</option>
            </select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-6">
              {data.items.length === 0 ? (
                <EmptyState
                  title="لا توجد محادثات مطابقة"
                  description="تظهر هنا جميع المحادثات الواردة من قنوات العملاء عبر مساحات العمل."
                />
              ) : (
                <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] divide-y divide-[var(--k-line)]">
                  {data.items.map((cv) => (
                    <button
                      key={String(cv.id)}
                      type="button"
                      onClick={() => openThread(String(cv.id))}
                      className={`w-full p-4 text-start hover:bg-[var(--k-surface-subtle)]/70 transition-colors flex items-center justify-between gap-3 ${
                        selectedId === String(cv.id) ? 'bg-[var(--k-sage-tint)]' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-[var(--k-ink)] truncate">
                          {String(cv.customer_handle)} · <span className="font-mono text-[var(--k-ink-muted)]">{String(cv.channel_type)}</span>
                        </div>
                        <div className="text-[11px] text-[var(--k-ink-muted)] mt-0.5 truncate">
                          {String(cv.workspace_name)} · {String(cv.agent_name || 'بدون وكيل')}
                        </div>
                      </div>
                      <div className="text-end shrink-0">
                        <StatusText
                          status={cv.status === 'active' ? 'ok' : cv.status === 'needs_human' ? 'warn' : cv.status === 'failed' ? 'error' : 'muted'}
                          label={String(cv.status)}
                        />
                        <div className="text-[11px] font-mono text-[var(--k-ink-muted)] mt-0.5">
                          {String(cv.message_count)} رسالة
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-6 p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-4">
              {!thread ? (
                <div className="py-12 text-center text-xs text-[var(--k-ink-muted)]">
                  اختر محادثة من القائمة لاستعراض الرسائل والمعلومات الفنية.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--k-line)]">
                    <div>
                      <h2 className="text-sm font-bold">{String(thread.conversation.customer_handle)}</h2>
                      <p className="text-[11px] text-[var(--k-ink-muted)]">
                        {String(thread.conversation.workspace_name)} · القناة: {String(thread.conversation.channel_type)}
                      </p>
                    </div>
                    <button type="button" onClick={() => setInterveneOpen(true)} className={secondaryBtnClass}>
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>تدخل إداري مسجل</span>
                    </button>
                  </div>
                  <div className="space-y-2.5 max-h-96 overflow-y-auto">
                    {thread.messages.map((m) => (
                      <div
                        key={String(m.id)}
                        className={`p-3 rounded-lg border text-xs space-y-1 ${
                          m.sender_type === 'owner_audited'
                            ? 'border-[var(--k-warning)]/40 bg-[var(--k-warning-bg)]'
                            : 'border-[var(--k-line)] bg-[var(--k-surface-subtle)]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] text-[var(--k-ink-muted)]">
                          <span className="font-semibold text-[var(--k-ink)]">{String(m.sender_type)}</span>
                          <span>{formatDateTime(String(m.created_at))}</span>
                        </div>
                        <p className="text-[var(--k-ink)] leading-relaxed">{String(m.content)}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <ModalDialog open={interveneOpen} title="تدخل إداري صريح ومسجل" onClose={() => setInterveneOpen(false)}>
        <form onSubmit={submitIntervention} className="space-y-4">
          <p className="text-xs text-[var(--k-ink-muted)]">
            وفق سياسة الخصوصية، لا يُسمح بإرسال رسالة داخل محادثة عميل إلا بعد توثيق السبب الإداري في سجل التدقيق.
          </p>
          <div>
            <label className="block text-xs font-medium mb-1">سبب التدخل الإداري (إلزامي) *</label>
            <input required minLength={5} value={interveneReason} onChange={(e) => setInterveneReason(e.target.value)} className={inputClass} placeholder="مثال: تصعيد دعم فني بطلب مالك مساحة العمل" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">نص الرسالة *</label>
            <textarea required rows={3} value={interveneContent} onChange={(e) => setInterveneContent(e.target.value)} className={inputClass} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setInterveneOpen(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" className={primaryBtnClass}>إرسال وتوثيق</button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog open={newConvOpen} title="تسجيل محادثة جديدة" onClose={() => setNewConvOpen(false)}>
        <form onSubmit={submitNewConv} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">مساحة العمل *</label>
            <select required value={convWsId} onChange={(e) => setConvWsId(e.target.value)} className={inputClass}>
              {workspaces.length === 0 ? <option value="">أنشئ مساحة عمل أولاً</option> : workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">القناة</label>
              <select value={convChannel} onChange={(e) => setConvChannel(e.target.value)} className={inputClass}>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="telegram">Telegram</option>
                <option value="sms">SMS</option>
                <option value="webchat">Webchat</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">معرف/رقم العميل *</label>
              <input required dir="ltr" value={convHandle} onChange={(e) => setConvHandle(e.target.value)} placeholder="+966550123456" className={`${inputClass} font-mono text-left`} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">الرسالة الأولى *</label>
            <textarea required rows={2} value={convMsg} onChange={(e) => setConvMsg(e.target.value)} className={inputClass} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNewConvOpen(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" disabled={!convWsId} className={primaryBtnClass}>تسجيل</button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}

// =========================================================================
// 11. CHANNELS & SECRET ROTATION PAGE
// =========================================================================
export function ChannelsPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [channels, setChannels] = React.useState<Array<Record<string, unknown>>>([]);
  const [workspaces, setWorkspaces] = React.useState<Array<{ id: string; name: string; owner_user_id: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [rotateTarget, setRotateTarget] = React.useState<string | null>(null);
  const [newSecret, setNewSecret] = React.useState('');

  const [wsId, setWsId] = React.useState('');
  const [channelType, setChannelType] = React.useState<'whatsapp' | 'instagram' | 'telegram' | 'sms' | 'voice_vapi' | 'webchat'>('whatsapp');
  const [displayName, setDisplayName] = React.useState('');
  const [secretToken, setSecretToken] = React.useState('');

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ items: Array<Record<string, unknown>> }>('/api/owner/channels'),
      apiFetch<{ items: Array<{ id: string; name: string; owner_user_id: string }> }>('/api/owner/workspaces'),
    ])
      .then(([c, w]) => {
        setChannels(c.items);
        setWorkspaces(w.items);
        if (!wsId && w.items[0]) setWsId(w.items[0].id);
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل القنوات.'))
      .finally(() => setLoading(false));
  }, [wsId, onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function submitChannel(e: React.FormEvent) {
    e.preventDefault();
    const ws = workspaces.find((w) => w.id === wsId);
    try {
      await apiFetch('/api/owner/channels', {
        method: 'POST',
        body: { userId: ws?.owner_user_id, workspaceId: wsId, channelType, displayName, secretToken },
      });
      onNotify('success', 'تم ربط القناة وتخزين بياناتها السرية مشفرة على الخادم.');
      setAddOpen(false);
      setDisplayName('');
      setSecretToken('');
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر إضافة القناة.');
    }
  }

  async function runConnectionTest(id: string) {
    try {
      const res = await apiFetch<{ ok: boolean; diagnostic: string }>(`/api/owner/channels/${encodeURIComponent(id)}/test`, {
        method: 'POST',
      });
      onNotify(res.ok ? 'success' : 'info', res.diagnostic);
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'فشل اختبار الاتصال.');
    }
  }

  async function submitRotate(e: React.FormEvent) {
    e.preventDefault();
    if (!rotateTarget) return;
    try {
      await apiFetch(`/api/owner/channels/${encodeURIComponent(rotateTarget)}/rotate-secret`, {
        method: 'POST',
        body: { newSecret },
      });
      onNotify('success', 'تم تدوير السر وتشفيره بنجاح دون كشف قيمته في الواجهة.');
      setRotateTarget(null);
      setNewSecret('');
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تدوير السر.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="قنوات الاتصال والتكاملات"
        subtitle="إدارة قنوات WhatsApp وInstagram وTelegram وSMS وVapi Voice مع عرض حالة السر مشفرة فقط وإمكانية التدوير الآمن واختبار الاتصال."
        action={
          <button type="button" onClick={() => setAddOpen(true)} className={primaryBtnClass}>
            <Plus className="w-4 h-4" />
            <span>إضافة قناة</span>
          </button>
        }
      />

      {loading ? (
        <TableSkeleton rows={5} />
      ) : channels.length === 0 ? (
        <EmptyState
          title="لا توجد قنوات اتصال مرتبطة بعد"
          description="أضف قناة WhatsApp أو Telegram أو Instagram لمساحة عمل واختبر حالة الربط والـ Webhook."
          action={
            <button type="button" onClick={() => setAddOpen(true)} className={primaryBtnClass}>
              إضافة أول قناة
            </button>
          }
        />
      ) : (
        <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                <th className="px-4 py-3 text-start font-semibold">القناة والنوع</th>
                <th className="px-4 py-3 text-start font-semibold">مساحة العمل</th>
                <th className="px-4 py-3 text-start font-semibold">حالة الربط / Webhook</th>
                <th className="px-4 py-3 text-start font-semibold">حالة السر (مشفّر)</th>
                <th className="px-4 py-3 text-start font-semibold">مستلمة / مرسلة / أخطاء</th>
                <th className="px-4 py-3 text-end font-semibold">التحكم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--k-line)]">
              {channels.map((ch) => (
                <tr key={String(ch.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{String(ch.display_name)}</div>
                    <div className="text-[11px] font-mono text-[var(--k-ink-muted)]">{String(ch.channel_type)}</div>
                  </td>
                  <td className="px-4 py-3">{String(ch.workspace_name)}</td>
                  <td className="px-4 py-3 space-y-0.5">
                    <StatusText
                      status={ch.connection_status === 'connected' ? 'ok' : ch.connection_status === 'error' ? 'error' : 'warn'}
                      label={String(ch.connection_status)}
                    />
                    <div className="text-[11px] text-[var(--k-ink-muted)]">
                      Webhook: {String(ch.webhook_status)} · {String(ch.provider_status)}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[var(--k-ink-secondary)]">
                    {String(ch.secret_masked || 'غير محدد')}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    {String(ch.messages_received)} / {String(ch.messages_sent)} / {String(ch.error_count)}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="inline-flex gap-1.5">
                      <button type="button" onClick={() => runConnectionTest(String(ch.id))} className={secondaryBtnClass}>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>اختبار</span>
                      </button>
                      <button type="button" onClick={() => setRotateTarget(String(ch.id))} className={secondaryBtnClass}>
                        <Key className="w-3.5 h-3.5" />
                        <span>تدوير السر</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalDialog open={addOpen} title="ربط قناة اتصال جديدة" onClose={() => setAddOpen(false)}>
        <form onSubmit={submitChannel} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">مساحة العمل *</label>
            <select required value={wsId} onChange={(e) => setWsId(e.target.value)} className={inputClass}>
              {workspaces.length === 0 ? <option value="">أنشئ مساحة عمل أولاً</option> : workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">نوع القناة</label>
              <select value={channelType} onChange={(e) => setChannelType(e.target.value as typeof channelType)} className={inputClass}>
                <option value="whatsapp">WhatsApp Cloud API</option>
                <option value="telegram">Telegram Bot</option>
                <option value="instagram">Instagram DM</option>
                <option value="sms">SMS (Twilio)</option>
                <option value="voice_vapi">Voice AI (Vapi)</option>
                <option value="webchat">Webchat</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">اسم القناة *</label>
              <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="مثال: واتساب المبيعات" className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">رمز البوت / المفتاح السري (يُشفر AES-256-GCM ولا يُعرض مجدداً)</label>
            <input type="password" dir="ltr" value={secretToken} onChange={(e) => setSecretToken(e.target.value)} className={`${inputClass} font-mono text-left`} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" disabled={!wsId} className={primaryBtnClass}>حفظ وتشفير</button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog open={Boolean(rotateTarget)} title="تدوير سر القناة بشكل آمن" onClose={() => setRotateTarget(null)}>
        <form onSubmit={submitRotate} className="space-y-4">
          <p className="text-xs text-[var(--k-ink-muted)]">سيتم استبدال السر المشفر على الخادم وتسجيل وقت التدوير في سجل التدقيق.</p>
          <input required minLength={8} type="password" dir="ltr" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} placeholder="أدخل الرمز الجديد..." className={`${inputClass} font-mono text-left`} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRotateTarget(null)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" className={primaryBtnClass}>تحديث السر</button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}

// =========================================================================
// 12. AUTOMATIONS & CAMPAIGNS PAGE
// =========================================================================
export function AutomationsPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [items, setItems] = React.useState<Array<Record<string, unknown>>>([]);
  const [workspaces, setWorkspaces] = React.useState<Array<{ id: string; name: string; owner_user_id: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [wsId, setWsId] = React.useState('');
  const [name, setName] = React.useState('');
  const [autoType, setAutoType] = React.useState<'workflow' | 'campaign' | 'followup' | 'reminder' | 'sla'>('workflow');

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ items: Array<Record<string, unknown>> }>('/api/owner/automations'),
      apiFetch<{ items: Array<{ id: string; name: string; owner_user_id: string }> }>('/api/owner/workspaces'),
    ])
      .then(([a, w]) => {
        setItems(a.items);
        setWorkspaces(w.items);
        if (!wsId && w.items[0]) setWsId(w.items[0].id);
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل الأتمتة.'))
      .finally(() => setLoading(false));
  }, [wsId, onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function toggleAuto(id: string, nextStatus: 'active' | 'disabled_by_owner') {
    try {
      await apiFetch(`/api/owner/automations/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: { status: nextStatus, reason: nextStatus === 'active' ? 'إعادة تفعيل من المالك' : 'إيقاف وقائي من المالك' },
      });
      onNotify('success', 'تم تحديث حالة الأتمتة.');
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر التحديث.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة الأتمتة وسير العمل والحملات"
        subtitle="مراقبة مسارات الأتمتة والحملات وتذكيرات المواعيد مع صلاحية التعطيل الفوري للمهام المتسببة في أخطاء متكررة."
        action={
          <button type="button" onClick={() => setAddOpen(true)} className={primaryBtnClass}>
            <Plus className="w-4 h-4" />
            <span>تسجيل أتمتة / حملة</span>
          </button>
        }
      />

      {loading ? (
        <TableSkeleton rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد عمليات أتمتة مسجلة"
          description="تظهر هنا جميع مسارات سير العمل والحملات التسويقية المجدولة ومعدلات نجاحها."
          action={
            <button type="button" onClick={() => setAddOpen(true)} className={primaryBtnClass}>
              إضافة أتمتة
            </button>
          }
        />
      ) : (
        <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                <th className="px-4 py-3 text-start font-semibold">الأتمتة والنوع</th>
                <th className="px-4 py-3 text-start font-semibold">المالك / مساحة العمل</th>
                <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                <th className="px-4 py-3 text-start font-semibold">التنفيذات (نجاح/فشل)</th>
                <th className="px-4 py-3 text-start font-semibold">متوسط الزمن</th>
                <th className="px-4 py-3 text-end font-semibold">التحكم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--k-line)]">
              {items.map((au) => (
                <tr key={String(au.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{String(au.name)}</div>
                    <div className="text-[11px] font-mono text-[var(--k-ink-muted)]">{String(au.automation_type)}</div>
                  </td>
                  <td className="px-4 py-3">{String(au.owner_name)} · {String(au.workspace_name)}</td>
                  <td className="px-4 py-3">
                    <StatusText status={au.status === 'active' ? 'ok' : 'warn'} label={String(au.status)} />
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    {String(au.total_runs)} ({String(au.success_runs)} / {String(au.failed_runs)})
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">{String(au.avg_duration_ms)} ms</td>
                  <td className="px-4 py-3 text-end">
                    <button
                      type="button"
                      onClick={() => toggleAuto(String(au.id), au.status === 'active' ? 'disabled_by_owner' : 'active')}
                      className={secondaryBtnClass}
                    >
                      {au.status === 'active' ? 'تعطيل إداري' : 'إعادة تفعيل'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalDialog open={addOpen} title="إضافة أتمتة أو حملة" onClose={() => setAddOpen(false)}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ws = workspaces.find((w) => w.id === wsId);
            try {
              await apiFetch('/api/owner/automations', {
                method: 'POST',
                body: { userId: ws?.owner_user_id, workspaceId: wsId, name, automationType: autoType },
              });
              onNotify('success', 'تم إنشاء الأتمتة بنجاح.');
              setAddOpen(false);
              setName('');
              load();
            } catch (err) {
              onNotify('error', err instanceof Error ? err.message : 'تعذر الإنشاء.');
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">مساحة العمل *</label>
            <select required value={wsId} onChange={(e) => setWsId(e.target.value)} className={inputClass}>
              {workspaces.length === 0 ? <option value="">أنشئ مساحة عمل أولاً</option> : workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">الاسم *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">النوع</label>
            <select value={autoType} onChange={(e) => setAutoType(e.target.value as typeof autoType)} className={inputClass}>
              <option value="workflow">سير عمل (Workflow)</option>
              <option value="campaign">حملة تسويقية (Campaign)</option>
              <option value="followup">متابعة تلقائية (Follow-up)</option>
              <option value="reminder">تذكير مواعيد (Reminder)</option>
              <option value="sla">مراقبة SLA</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" disabled={!wsId} className={primaryBtnClass}>حفظ</button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}

// =========================================================================
// 13. KNOWLEDGE BASE & FILES MONITOR
// =========================================================================
export function KnowledgePage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data, setData] = React.useState<{
    items: Array<Record<string, unknown>>;
    summary: Record<string, number>;
  } | null>(null);
  const [workspaces, setWorkspaces] = React.useState<Array<{ id: string; name: string; owner_user_id: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [wsId, setWsId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [fileType, setFileType] = React.useState('pdf');
  const [storageKb, setStorageKb] = React.useState('512');
  const [chunks, setChunks] = React.useState('24');

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<NonNullable<typeof data>>('/api/owner/knowledge'),
      apiFetch<{ items: Array<{ id: string; name: string; owner_user_id: string }> }>('/api/owner/workspaces'),
    ])
      .then(([k, w]) => {
        setData(k);
        setWorkspaces(w.items);
        if (!wsId && w.items[0]) setWsId(w.items[0].id);
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل مصادر المعرفة.'))
      .finally(() => setLoading(false));
  }, [wsId, onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="مراقبة قاعدة المعرفة والملفات"
        subtitle="متابعة حجم التخزين، عدد المقاطع المفهرسة (Chunks)، وأخطاء المعالجة مع حماية خصوصية محتوى ملفات العملاء."
        action={
          <button type="button" onClick={() => setAddOpen(true)} className={primaryBtnClass}>
            <Plus className="w-4 h-4" />
            <span>تسجيل مصدر معرفة</span>
          </button>
        }
      />

      {loading || !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricTile label="إجمالي المصادر" value={formatNumber(data.summary?.total_sources)} />
            <MetricTile label="حجم التخزين" value={`${((data.summary?.total_bytes || 0) / 1024 / 1024).toFixed(2)} MB`} />
            <MetricTile label="المقاطع المفهرسة" value={formatNumber(data.summary?.total_chunks)} />
            <MetricTile label="أخطاء المعالجة" value={formatNumber(data.summary?.failed_count)} tone={data.summary?.failed_count ? 'danger' : 'success'} />
          </div>

          {data.items.length === 0 ? (
            <EmptyState
              title="لا توجد مصادر معرفة مسجلة"
              description="تظهر هنا ملفات ومصادر قواعد المعرفة المرتبطة بمساحات العمل وحالة فهرستها الدلالية."
            />
          ) : (
            <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-4 py-3 text-start font-semibold">المصدر والنوع</th>
                    <th className="px-4 py-3 text-start font-semibold">المالك / مساحة العمل</th>
                    <th className="px-4 py-3 text-start font-semibold">الحجم / المقاطع</th>
                    <th className="px-4 py-3 text-start font-semibold">المعالجة والفهرسة</th>
                    <th className="px-4 py-3 text-start font-semibold">آخر تحديث</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--k-line)]">
                  {data.items.map((k) => (
                    <tr key={String(k.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{String(k.title)}</div>
                        <div className="text-[11px] font-mono text-[var(--k-ink-muted)]">{String(k.file_type)}</div>
                      </td>
                      <td className="px-4 py-3">{String(k.owner_name)} · {String(k.workspace_name)}</td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {(Number(k.storage_bytes || 0) / 1024).toFixed(1)} KB · {String(k.chunk_count)} مقطع
                      </td>
                      <td className="px-4 py-3">
                        <StatusText status={k.processing_status === 'indexed' ? 'ok' : 'warn'} label={`${String(k.processing_status)} · ${String(k.search_index_status)}`} />
                      </td>
                      <td className="px-4 py-3 text-[var(--k-ink-muted)]">{formatDateTime(String(k.updated_at))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ModalDialog open={addOpen} title="تسجيل مصدر معرفة جديد" onClose={() => setAddOpen(false)}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ws = workspaces.find((w) => w.id === wsId);
            try {
              await apiFetch('/api/owner/knowledge', {
                method: 'POST',
                body: {
                  userId: ws?.owner_user_id,
                  workspaceId: wsId,
                  title,
                  fileType,
                  storageBytes: Number(storageKb) * 1024,
                  chunkCount: Number(chunks),
                },
              });
              onNotify('success', 'تم تسجيل مصدر المعرفة في الفهرس.');
              setAddOpen(false);
              setTitle('');
              load();
            } catch (err) {
              onNotify('error', err instanceof Error ? err.message : 'تعذر التسجيل.');
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">مساحة العمل *</label>
            <select required value={wsId} onChange={(e) => setWsId(e.target.value)} className={inputClass}>
              {workspaces.length === 0 ? <option value="">أنشئ مساحة عمل أولاً</option> : workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">عنوان المصدر *</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: دليل الأسئلة الشائعة 2026" className={inputClass} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">النوع</label>
              <select value={fileType} onChange={(e) => setFileType(e.target.value)} className={inputClass}>
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
                <option value="md">Markdown</option>
                <option value="url">Web URL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">الحجم (KB)</label>
              <input type="number" min={1} value={storageKb} onChange={(e) => setStorageKb(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">المقاطع</label>
              <input type="number" min={1} value={chunks} onChange={(e) => setChunks(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" disabled={!wsId} className={primaryBtnClass}>حفظ</button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}

// =========================================================================
// 14. API KEYS & WEBHOOKS INTEGRATIONS PAGE
// =========================================================================
export function ApiIntegrationsPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data, setData] = React.useState<{
    apiKeys: Array<Record<string, unknown>>;
    webhooks: Array<Record<string, unknown>>;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [keyModal, setKeyModal] = React.useState(false);
  const [whModal, setWhModal] = React.useState(false);
  const [keyName, setKeyName] = React.useState('');
  const [oneTimeKey, setOneTimeKey] = React.useState<string | null>(null);
  const [whName, setWhName] = React.useState('');
  const [whUrl, setWhUrl] = React.useState('');

  const load = React.useCallback(() => {
    setLoading(true);
    apiFetch<NonNullable<typeof data>>('/api/owner/integrations/api')
      .then(setData)
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل API والتكاملات.'))
      .finally(() => setLoading(false));
  }, [onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة API وWebhooks والتكاملات التقنية"
        subtitle="إصدار وإبطال مفاتيح التكامل (تُخزن قيمها مجزأة SHA-256 فقط) وإدارة Webhooks مع حماية SSRF وتشفير الأسرار."
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => setWhModal(true)} className={secondaryBtnClass}>
              إضافة Webhook
            </button>
            <button type="button" onClick={() => { setOneTimeKey(null); setKeyModal(true); }} className={primaryBtnClass}>
              <Key className="w-4 h-4" />
              <span>إصدار مفتاح API</span>
            </button>
          </div>
        }
      />

      {loading || !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
            <h2 className="text-sm font-bold">مفاتيح التكامل (API Keys — {data.apiKeys.length})</h2>
            {data.apiKeys.length === 0 ? (
              <p className="text-xs text-[var(--k-ink-muted)]">لا توجد مفاتيح API صادرة حالياً.</p>
            ) : (
              <div className="divide-y divide-[var(--k-line)] text-xs">
                {data.apiKeys.map((k) => (
                  <div key={String(k.id)} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold">{String(k.name)}</div>
                      <div className="font-mono text-[11px] text-[var(--k-ink-muted)]" dir="ltr">
                        {String(k.key_prefix)} · {String(k.rate_limit_per_min)} req/min
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusText status={k.status === 'active' ? 'ok' : 'error'} label={k.status === 'active' ? 'نشط' : 'مبطل'} />
                      {k.status === 'active' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/owner/integrations/api-keys/${encodeURIComponent(String(k.id))}/revoke`, { method: 'POST' });
                            onNotify('info', 'تم إبطال المفتاح فوراً.');
                            load();
                          }}
                          className={dangerBtnClass}
                        >
                          إبطال
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
            <h2 className="text-sm font-bold">نقاط Webhooks الصادرة ({data.webhooks.length})</h2>
            {data.webhooks.length === 0 ? (
              <p className="text-xs text-[var(--k-ink-muted)]">لا توجد نقاط Webhook مسجلة.</p>
            ) : (
              <div className="divide-y divide-[var(--k-line)] text-xs">
                {data.webhooks.map((wh) => (
                  <div key={String(wh.id)} className="py-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{String(wh.name)}</span>
                      <StatusText status={wh.status === 'active' ? 'ok' : 'warn'} label={String(wh.status)} />
                    </div>
                    <div className="font-mono text-[11px] text-[var(--k-ink-muted)] truncate" dir="ltr">
                      {String(wh.endpoint_url)}
                    </div>
                    <div className="text-[11px] text-[var(--k-ink-muted)]">
                      السر: <span className="font-mono">{String(wh.secret_masked)}</span> · نجاح {String(wh.success_count)} / فشل {String(wh.failure_count)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <ModalDialog open={keyModal} title="إصدار مفتاح API جديد" onClose={() => setKeyModal(false)}>
        {oneTimeKey ? (
          <div className="space-y-4">
            <p className="text-xs text-[var(--k-warning)] font-semibold">
              انسخ المفتاح الآن — لن يُعرض مرة أخرى لأن الخادم يخزن التجزئة المشفرة فقط:
            </p>
            <div className="p-3 rounded-lg bg-[var(--k-surface-subtle)] border border-[var(--k-line)] font-mono text-xs break-all" dir="ltr">
              {oneTimeKey}
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setKeyModal(false)} className={primaryBtnClass}>تم الحفظ</button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const res = await apiFetch<{ oneTimeSecret: string }>('/api/owner/integrations/api-keys', {
                  method: 'POST',
                  body: { name: keyName },
                });
                setOneTimeKey(res.oneTimeSecret);
                setKeyName('');
                load();
              } catch (err) {
                onNotify('error', err instanceof Error ? err.message : 'تعذر إصدار المفتاح.');
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-medium mb-1">اسم المفتاح *</label>
              <input required value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="مثال: تكامل ERP الخارجي" className={inputClass} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setKeyModal(false)} className={secondaryBtnClass}>إلغاء</button>
              <button type="submit" className={primaryBtnClass}>إصدار المفتاح</button>
            </div>
          </form>
        )}
      </ModalDialog>

      <ModalDialog open={whModal} title="إضافة نقطة Webhook خارجية" onClose={() => setWhModal(false)}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/owner/integrations/webhooks', {
                method: 'POST',
                body: { name: whName, endpointUrl: whUrl },
              });
              onNotify('success', 'تمت إضافة Webhook وتشفير سر التوقيع.');
              setWhModal(false);
              setWhName('');
              setWhUrl('');
              load();
            } catch (err) {
              onNotify('error', err instanceof Error ? err.message : 'تعذر إضافة Webhook.');
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">الاسم *</label>
            <input required value={whName} onChange={(e) => setWhName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">رابط الاستقبال HTTPS *</label>
            <input required type="url" dir="ltr" value={whUrl} onChange={(e) => setWhUrl(e.target.value)} placeholder="https://api.example.com/webhooks/kayan" className={`${inputClass} font-mono text-left`} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setWhModal(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" className={primaryBtnClass}>إضافة</button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
