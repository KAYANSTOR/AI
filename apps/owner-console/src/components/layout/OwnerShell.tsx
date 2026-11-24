import React from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  Receipt,
  SlidersHorizontal,
  Bot,
  Cpu,
  Coins,
  MessageSquare,
  Radio,
  Workflow,
  BookOpen,
  Plug,
  Activity,
  AlertOctagon,
  Bell,
  FileBarChart2,
  History,
  Settings,
  Search,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  Shield,
  Plus,
} from 'lucide-react';
import {
  NAV_GROUP_LABELS,
  OWNER_NAV_ITEMS,
  type OwnerAdminProfile,
  type OwnerRouteId,
} from '../../types/owner';
import { apiFetch } from '../../lib/api';
import { KayanLogoMark } from '../ui/Primitives';
import { PWAInstallButton } from '../pwa/PWAInstallControls';

const ROUTE_ICONS: Record<OwnerRouteId, React.ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  users: Users,
  workspaces: Building2,
  plans_subscriptions: CreditCard,
  invoices_payments: Receipt,
  entitlements: SlidersHorizontal,
  agents: Bot,
  ai_models: Cpu,
  ai_usage: Coins,
  conversations: MessageSquare,
  channels: Radio,
  automations: Workflow,
  knowledge: BookOpen,
  api_integrations: Plug,
  system_monitoring: Activity,
  errors_logs: AlertOctagon,
  notifications_support: Bell,
  reports: FileBarChart2,
  audit_logs: History,
  settings: Settings,
};

interface SearchResults {
  users: Array<{ id: string; full_name: string; email: string }>;
  workspaces: Array<{ id: string; name: string; slug: string }>;
  agents: Array<{ id: string; name: string; model_id: string }>;
  conversations: Array<{ id: string; customer_handle: string; channel_type: string }>;
  subscriptions: Array<{ id: string; user_name: string; plan_name: string }>;
  invoices: Array<{ id: string; invoice_number: string; amount: number; currency: string }>;
  usageEvents: Array<{ id: string; model_id: string; total_tokens: number }>;
  channels: Array<{ id: string; display_name: string; channel_type: string }>;
  systemLogs: Array<{ id: string; service_name: string; message: string }>;
  auditLogs: Array<{ id: string; action: string; summary: string }>;
}

export function OwnerShell({
  activeRoute,
  onNavigate,
  onSelectUser,
  onSelectAgent,
  admin,
  darkMode,
  onToggleTheme,
  onLogout,
  children,
}: {
  activeRoute: OwnerRouteId;
  onNavigate: (route: OwnerRouteId) => void;
  onSelectUser: (userId: string) => void;
  onSelectAgent: (agentId: string) => void;
  admin: OwnerAdminProfile;
  darkMode: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<SearchResults | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [unacknowledgedAlerts, setUnacknowledgedAlerts] = React.useState(0);
  const searchBoxRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      apiFetch<SearchResults>(`/api/owner/search?q=${encodeURIComponent(q)}`)
        .then(setSearchResults)
        .catch(() => setSearchResults(null))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  React.useEffect(() => {
    let active=true;
    apiFetch<{alerts:Array<{acknowledged?:number|boolean}>}>('/api/owner/monitoring')
      .then((data)=>{if(active)setUnacknowledgedAlerts((data.alerts||[]).filter(a=>!a.acknowledged).length);})
      .catch(()=>{if(active)setUnacknowledgedAlerts(0);});
    return ()=>{active=false;};
  },[activeRoute]);

  React.useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setMobileMenuOpen(false);
        setQuickActionsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const currentNav = OWNER_NAV_ITEMS.find((i) => i.id === activeRoute);
  const groups: Array<'command' | 'customers' | 'ai' | 'operations' | 'governance'> = [
    'command',
    'customers',
    'ai',
    'operations',
    'governance',
  ];

  const totalSearchHits = searchResults
    ? Object.values(searchResults).reduce((acc, arr) => acc + arr.length, 0)
    : 0;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-[var(--k-line)] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            onNavigate('overview');
            setMobileMenuOpen(false);
          }}
          className="flex items-center gap-2.5 text-start min-w-0"
        >
          <KayanLogoMark className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-[var(--k-ink)] truncate">Kayan AI</div>
            <div className="text-[11px] text-[var(--k-ink-muted)] truncate">Owner Console</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="إغلاق القائمة الجانبية"
          className="lg:hidden inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--k-ink-muted)] hover:bg-[var(--k-surface-subtle)]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav aria-label="القائمة الرئيسية لمركز التحكم" className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {groups.map((groupKey) => {
          const items = OWNER_NAV_ITEMS.filter((i) => i.group === groupKey);
          return (
            <div key={groupKey} className="space-y-1">
              <div className="px-2.5 text-[11px] font-semibold text-[var(--k-ink-muted)]">
                {NAV_GROUP_LABELS[groupKey]}
              </div>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = ROUTE_ICONS[item.id];
                  const active = activeRoute === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigate(item.id);
                          setMobileMenuOpen(false);
                        }}
                        aria-current={active ? 'page' : undefined}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-[var(--k-sidebar-active-bg)] text-[var(--k-sidebar-active-ink)] font-semibold'
                            : 'text-[var(--k-ink-secondary)] hover:bg-[var(--k-surface-subtle)] hover:text-[var(--k-ink)]'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[var(--k-line)] space-y-2">
        <PWAInstallButton variant="sidebar" />
        <div className="px-2.5 py-2 rounded-lg bg-[var(--k-surface)] border border-[var(--k-line)]">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-[var(--k-brand-forest)] shrink-0" aria-hidden="true" />
            <span className="text-xs font-semibold text-[var(--k-ink)] truncate">{admin.fullName}</span>
          </div>
          <div className="text-[11px] text-[var(--k-ink-muted)] font-mono truncate mt-0.5" dir="ltr">
            {admin.email}
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[var(--k-ink-secondary)] hover:text-[var(--k-danger)] hover:bg-[var(--k-danger-bg)] transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          <span>تسجيل الخروج وإنهاء الجلسة</span>
        </button>
      </div>
    </div>
  );

  const mobilePrimaryTabs: Array<{ id: OwnerRouteId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'الرئيسية', icon: LayoutDashboard },
    { id: 'users', label: 'المستخدمون', icon: Users },
    { id: 'agents', label: 'الوكلاء', icon: Bot },
    { id: 'system_monitoring', label: 'المراقبة', icon: Activity },
  ];

  const quickActionItems: Array<{
    id: OwnerRouteId;
    title: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'users', title: 'إدارة المستخدمين', desc: 'إضافة عميل أو فتح ملفه', icon: Users },
    { id: 'invoices_payments', title: 'الفواتير والمدفوعات', desc: 'إصدار فاتورة أو مصروف', icon: Receipt },
    { id: 'entitlements', title: 'التفعيلات والمزايا', desc: 'تبديل ميزة أو استثناء', icon: SlidersHorizontal },
    { id: 'ai_usage', title: 'الاستهلاك والتكاليف', desc: 'سجل التوكنات والتكلفة', icon: Coins },
    { id: 'reports', title: 'التقارير والتصدير', desc: 'استخراج CSV أو PDF', icon: FileBarChart2 },
    { id: 'settings', title: 'الأمان والإعدادات', desc: 'MFA والجلسات والمديرون', icon: Settings },
  ];

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip flex bg-[var(--k-canvas)] text-[var(--k-ink)]">
      <a
        href="#owner-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--k-accent)] focus:text-[var(--k-accent-ink)] focus:text-xs focus:font-semibold"
      >
        تخطي إلى المحتوى الرئيسي
      </a>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-e border-[var(--k-line)] bg-[var(--k-sidebar-bg)] sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/45"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full bg-[var(--k-sidebar-bg)] border-e border-[var(--k-line)] shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 max-w-full flex flex-col">
        {/* Top Executive Bar */}
        <header className="sticky top-0 z-30 h-14 px-3 sm:px-4 lg:px-6 border-b border-[var(--k-line)] bg-[var(--k-surface)] flex items-center justify-between gap-2 sm:gap-4">
          {/* Zone 1: Mobile toggle + Breadcrumb */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="فتح القائمة الجانبية"
              aria-expanded={mobileMenuOpen}
              className="lg:hidden min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-[var(--k-line)] text-[var(--k-ink)]"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-[var(--k-ink-muted)] truncate">
              <span>Kayan AI</span>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-[var(--k-ink)] truncate">
                {currentNav?.label || 'الرئيسية'}
              </span>
            </div>
          </div>

          {/* Zone 2: Global Owner Search */}
          <div ref={searchBoxRef} className="relative flex-1 max-w-md min-w-0">
            <div className="relative">
              <Search
                className="w-4 h-4 text-[var(--k-ink-muted)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                placeholder="بحث شامل: مستخدم، وكيل، فاتورة، محادثة، معرف طلب..."
                aria-label="البحث الشامل في لوحة المالك"
                className="w-full h-9 ps-9 pe-3 text-base sm:text-xs rounded-lg border border-[var(--k-line)] bg-[var(--k-canvas)] text-[var(--k-ink)] placeholder:text-[var(--k-ink-muted)] focus:outline-none focus:border-[var(--k-brand-forest)]"
              />
            </div>

            {searchOpen && searchQuery.trim().length > 0 && (
              <div className="absolute top-11 start-0 end-0 z-40 rounded-xl border border-[var(--k-line-strong)] bg-[var(--k-surface)] shadow-xl max-h-96 overflow-y-auto p-3 space-y-3">
                {searching ? (
                  <p className="text-xs text-[var(--k-ink-muted)] py-3 text-center">جاري البحث في جميع السجلات...</p>
                ) : totalSearchHits === 0 ? (
                  <p className="text-xs text-[var(--k-ink-muted)] py-3 text-center">
                    لا توجد نتائج مطابقة لـ "{searchQuery}"
                  </p>
                ) : (
                  <>
                    {searchResults!.users.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--k-ink-muted)] mb-1">المستخدمون</p>
                        {searchResults!.users.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              onSelectUser(u.id);
                            }}
                            className="w-full text-start px-2.5 py-1.5 rounded-lg text-xs hover:bg-[var(--k-surface-subtle)] flex items-center justify-between gap-2"
                          >
                            <span className="font-medium text-[var(--k-ink)]">{u.full_name}</span>
                            <span className="font-mono text-[var(--k-ink-muted)] truncate">{u.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults!.agents.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--k-ink-muted)] mb-1">الوكلاء الذكيون</p>
                        {searchResults!.agents.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              onSelectAgent(a.id);
                            }}
                            className="w-full text-start px-2.5 py-1.5 rounded-lg text-xs hover:bg-[var(--k-surface-subtle)] flex items-center justify-between gap-2"
                          >
                            <span className="font-medium text-[var(--k-ink)]">{a.name}</span>
                            <span className="font-mono text-[var(--k-ink-muted)]">{a.model_id}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults!.invoices.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--k-ink-muted)] mb-1">الفواتير</p>
                        {searchResults!.invoices.map((inv) => (
                          <button
                            key={inv.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              onNavigate('invoices_payments');
                            }}
                            className="w-full text-start px-2.5 py-1.5 rounded-lg text-xs hover:bg-[var(--k-surface-subtle)] flex items-center justify-between gap-2"
                          >
                            <span className="font-mono text-[var(--k-ink)]">{inv.invoice_number}</span>
                            <span className="font-mono text-[var(--k-ink-muted)]">
                              {inv.amount} {inv.currency}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults!.workspaces.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--k-ink-muted)] mb-1">مساحات العمل</p>
                        {searchResults!.workspaces.map((w) => (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              onNavigate('workspaces');
                            }}
                            className="w-full text-start px-2.5 py-1.5 rounded-lg text-xs hover:bg-[var(--k-surface-subtle)] flex items-center justify-between"
                          >
                            <span>{w.name}</span>
                            <span className="font-mono text-[var(--k-ink-muted)]">{w.slug}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults!.auditLogs.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--k-ink-muted)] mb-1">سجل التدقيق</p>
                        {searchResults!.auditLogs.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              onNavigate('audit_logs');
                            }}
                            className="w-full text-start px-2.5 py-1.5 rounded-lg text-xs hover:bg-[var(--k-surface-subtle)] truncate"
                          >
                            {l.summary}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Zone 3: Quick Actions (PWA Install + Notifications + Theme) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="hidden md:flex">
              <PWAInstallButton variant="header" />
            </div>
            <button
              type="button"
              onClick={() => onNavigate('system_monitoring')}
              aria-label={unacknowledgedAlerts>0?`مراقبة النظام، ${unacknowledgedAlerts} تنبيهات غير مقرؤة`:'مراقبة النظام والتنبيهات'}
              className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--k-line)] text-[var(--k-ink-secondary)] hover:bg-[var(--k-surface-subtle)]"
            >
              <Bell className="w-4 h-4" />
              {unacknowledgedAlerts>0&&(
                <span aria-hidden="true" className="absolute -end-1 -top-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-[var(--k-danger)] px-1 text-[10px] font-bold text-white">
                  {unacknowledgedAlerts>99?'99+':unacknowledgedAlerts}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={darkMode ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-[var(--k-line)] text-[var(--k-ink-secondary)] hover:bg-[var(--k-surface-subtle)]"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main
          id="owner-main-content"
          className="flex-1 p-4 pb-24 lg:p-6 lg:pb-8 max-w-[1600px] w-full mx-auto min-w-0"
        >
          {children}
        </main>
      </div>

      {/* Mobile PWA Bottom Navigation Bar (4 primary tabs + centered + Quick Actions FAB) */}
      <nav
        aria-label="التنقل السريع للجوال"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[var(--k-line)] bg-[var(--k-surface)]/95 backdrop-blur-sm pb-safe"
      >
        <div className="grid grid-cols-5 items-center h-14 px-2">
          {mobilePrimaryTabs.slice(0, 2).map((tab) => {
            const Icon = tab.icon;
            const active = activeRoute === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  active ? 'text-[var(--k-brand-forest)] font-semibold' : 'text-[var(--k-ink-muted)]'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}

          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setQuickActionsOpen(true)}
              aria-label="إجراءات المالك السريعة"
              aria-expanded={quickActionsOpen}
              className="-mt-5 w-11 h-11 rounded-full bg-[var(--k-accent)] text-[var(--k-accent-ink)] shadow-md border-2 border-[var(--k-surface)] flex items-center justify-center hover:opacity-95 transition-opacity"
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {mobilePrimaryTabs.slice(2, 4).map((tab) => {
            const Icon = tab.icon;
            const active = activeRoute === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  active ? 'text-[var(--k-brand-forest)] font-semibold' : 'text-[var(--k-ink-muted)]'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile 2x3 Quick Actions Bottom Sheet */}
      {quickActionsOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-actions-sheet-title"
          onClick={() => setQuickActionsOpen(false)}
        >
          <div
            className="w-full rounded-t-2xl border-t border-[var(--k-line-strong)] bg-[var(--k-surface)] p-5 pb-safe shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-[var(--k-line-strong)] mx-auto" aria-hidden="true" />
            <div className="flex items-center justify-between">
              <h2 id="quick-actions-sheet-title" className="text-sm font-bold text-[var(--k-ink)]">
                إجراءات المالك السريعة
              </h2>
              <button
                type="button"
                onClick={() => setQuickActionsOpen(false)}
                aria-label="إغلاق القائمة السريعة"
                className="p-2 rounded-lg text-[var(--k-ink-muted)] hover:bg-[var(--k-surface-subtle)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {quickActionItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(item.id);
                      setQuickActionsOpen(false);
                    }}
                    className="p-3 rounded-xl border border-[var(--k-line)] bg-[var(--k-canvas)] hover:border-[var(--k-brand-forest)] text-start space-y-1.5 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[var(--k-sage-tint)] flex items-center justify-center">
                      <Icon className="w-4 h-4 text-[var(--k-brand-forest)]" aria-hidden="true" />
                    </div>
                    <div className="text-xs font-semibold text-[var(--k-ink)]">{item.title}</div>
                    <div className="text-[11px] text-[var(--k-ink-muted)] truncate">{item.desc}</div>
                  </button>
                );
              })}
            </div>

            <div className="pt-1">
              <PWAInstallButton variant="sidebar" onInstalled={() => setQuickActionsOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
