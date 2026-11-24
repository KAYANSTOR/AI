import React, { Suspense } from 'react';
import { apiFetch, registerUnauthorizedHandler, setOwnerToken } from './lib/api';
import type { OwnerAdminProfile, OwnerRouteId, ToastMessage } from './types/owner';
import { OwnerAuthGate } from './components/auth/OwnerAuthGate';
import { OwnerShell } from './components/layout/OwnerShell';
import { TableSkeleton } from './components/ui/Primitives';
import { OfflineIndicator } from './components/pwa/PWAInstallControls';

// Code-split heavy route modules (react-best-practices: bundle-dynamic-imports)
const OverviewPage = React.lazy(() =>
  import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage }))
);
const UsersPage = React.lazy(() =>
  import('./pages/UsersWorkspacesPages').then((m) => ({ default: m.UsersPage }))
);
const WorkspacesPage = React.lazy(() =>
  import('./pages/UsersWorkspacesPages').then((m) => ({ default: m.WorkspacesPage }))
);
const PlansSubscriptionsPage = React.lazy(() =>
  import('./pages/BillingPlansPages').then((m) => ({ default: m.PlansSubscriptionsPage }))
);
const InvoicesPaymentsPage = React.lazy(() =>
  import('./pages/BillingPlansPages').then((m) => ({ default: m.InvoicesPaymentsPage }))
);
const EntitlementsPage = React.lazy(() =>
  import('./pages/EntitlementsPage').then((m) => ({ default: m.EntitlementsPage }))
);
const AgentsPage = React.lazy(() =>
  import('./pages/AiGovernancePages').then((m) => ({ default: m.AgentsPage }))
);
const AiModelsPage = React.lazy(() =>
  import('./pages/AiGovernancePages').then((m) => ({ default: m.AiModelsPage }))
);
const AiUsagePage = React.lazy(() =>
  import('./pages/AiGovernancePages').then((m) => ({ default: m.AiUsagePage }))
);
const ConversationsPage = React.lazy(() =>
  import('./pages/OperationsPages').then((m) => ({ default: m.ConversationsPage }))
);
const ChannelsPage = React.lazy(() =>
  import('./pages/OperationsPages').then((m) => ({ default: m.ChannelsPage }))
);
const AutomationsPage = React.lazy(() =>
  import('./pages/OperationsPages').then((m) => ({ default: m.AutomationsPage }))
);
const KnowledgePage = React.lazy(() =>
  import('./pages/OperationsPages').then((m) => ({ default: m.KnowledgePage }))
);
const ApiIntegrationsPage = React.lazy(() =>
  import('./pages/OperationsPages').then((m) => ({ default: m.ApiIntegrationsPage }))
);
const SystemMonitoringPage = React.lazy(() =>
  import('./pages/MonitoringGovernancePages').then((m) => ({ default: m.SystemMonitoringPage }))
);
const ErrorsLogsPage = React.lazy(() =>
  import('./pages/MonitoringGovernancePages').then((m) => ({ default: m.ErrorsLogsPage }))
);
const NotificationsSupportPage = React.lazy(() =>
  import('./pages/MonitoringGovernancePages').then((m) => ({ default: m.NotificationsSupportPage }))
);
const ReportsPage = React.lazy(() =>
  import('./pages/MonitoringGovernancePages').then((m) => ({ default: m.ReportsPage }))
);
const AuditLogsPage = React.lazy(() =>
  import('./pages/MonitoringGovernancePages').then((m) => ({ default: m.AuditLogsPage }))
);
const SettingsSecurityPage = React.lazy(() =>
  import('./pages/MonitoringGovernancePages').then((m) => ({ default: m.SettingsSecurityPage }))
);

class OwnerErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('owner_console_render_failed', { message: error.message });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--k-canvas)] text-[var(--k-ink)]">
          <div className="max-w-md rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] p-6 text-center space-y-3">
            <h1 className="font-bold">تعذر عرض هذه الشاشة</h1>
            <p className="text-sm text-[var(--k-ink-muted)]">حدث خطأ في واجهة الإدارة. أعد تحميل الصفحة، ولن يتم تسجيل خروجك بسبب خطأ في مسار فرعي.</p>
            <button type="button" className="px-4 py-2 rounded-lg bg-[var(--k-brand-forest)] text-white text-sm" onClick={() => this.setState({ hasError: false })}>إعادة المحاولة</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return <OwnerErrorBoundary><OwnerConsoleApp /></OwnerErrorBoundary>;
}

function OwnerConsoleApp() {
  const [admin, setAdmin] = React.useState<OwnerAdminProfile | null>(null);
  const [activeRoute, setActiveRoute] = React.useState<OwnerRouteId>('overview');
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);
  const [darkMode, setDarkMode] = React.useState(false);
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', darkMode ? '#0D120E' : '#1F3B22');
    }
  }, [darkMode]);

  const notify = React.useCallback((type: 'success' | 'error' | 'info', text: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-2), { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  React.useEffect(() => {
    registerUnauthorizedHandler(() => {
      setAdmin(null);
      notify('info', 'انتهت جلسة المالك أو تم إبطالها. يرجى إعادة تسجيل الدخول.');
    });
  }, [notify]);

  async function handleLogout() {
    try {
      await apiFetch('/api/owner/auth/logout', { method: 'POST' });
    } catch {
      // ignore if session already revoked
    } finally {
      setOwnerToken(null);
      setAdmin(null);
      setActiveRoute('overview');
      setSelectedUserId(null);
      setSelectedAgentId(null);
    }
  }

  function handleNavigate(route: OwnerRouteId) {
    setActiveRoute(route);
    if (route !== 'users') setSelectedUserId(null);
    if (route !== 'agents') setSelectedAgentId(null);
  }

  function handleSelectUser(userId: string) {
    setSelectedUserId(userId);
    setActiveRoute('users');
  }

  function handleSelectAgent(agentId: string) {
    setSelectedAgentId(agentId);
    setActiveRoute('agents');
  }

  if (!admin) {
    return (
      <>
        <OwnerAuthGate
          onAuthenticated={(a) => {
            setAdmin(a);
            notify('success', `مرحباً بك في مركز تحكم Kayan AI (${a.email}).`);
          }}
          darkMode={darkMode}
          onToggleTheme={() => setDarkMode((d) => !d)}
        />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <>
      <OwnerShell
        activeRoute={activeRoute}
        onNavigate={handleNavigate}
        onSelectUser={handleSelectUser}
        onSelectAgent={handleSelectAgent}
        admin={admin}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onLogout={handleLogout}
      >
        <Suspense fallback={<TableSkeleton rows={6} />}>
          {activeRoute === 'overview' && <OverviewPage onNavigate={handleNavigate} />}
          {activeRoute === 'users' && (
            <UsersPage selectedUserId={selectedUserId} onSelectUser={setSelectedUserId} onNotify={notify} />
          )}
          {activeRoute === 'workspaces' && (
            <WorkspacesPage onSelectUser={handleSelectUser} onNotify={notify} />
          )}
          {activeRoute === 'plans_subscriptions' && <PlansSubscriptionsPage onNotify={notify} />}
          {activeRoute === 'invoices_payments' && <InvoicesPaymentsPage onNotify={notify} />}
          {activeRoute === 'entitlements' && <EntitlementsPage onNotify={notify} />}
          {activeRoute === 'agents' && (
            <AgentsPage selectedAgentId={selectedAgentId} onSelectAgent={setSelectedAgentId} onNotify={notify} />
          )}
          {activeRoute === 'ai_models' && <AiModelsPage onNotify={notify} />}
          {activeRoute === 'ai_usage' && <AiUsagePage onNotify={notify} />}
          {activeRoute === 'conversations' && <ConversationsPage onNotify={notify} />}
          {activeRoute === 'channels' && <ChannelsPage onNotify={notify} />}
          {activeRoute === 'automations' && <AutomationsPage onNotify={notify} />}
          {activeRoute === 'knowledge' && <KnowledgePage onNotify={notify} />}
          {activeRoute === 'api_integrations' && <ApiIntegrationsPage onNotify={notify} />}
          {activeRoute === 'system_monitoring' && <SystemMonitoringPage onNotify={notify} />}
          {activeRoute === 'errors_logs' && <ErrorsLogsPage onNotify={notify} />}
          {activeRoute === 'notifications_support' && <NotificationsSupportPage onNotify={notify} />}
          {activeRoute === 'reports' && <ReportsPage onNotify={notify} />}
          {activeRoute === 'audit_logs' && <AuditLogsPage onNotify={notify} />}
          {activeRoute === 'settings' && <SettingsSecurityPage onNotify={notify} />}
        </Suspense>
      </OwnerShell>

      <OfflineIndicator />

      {/* Accessible Live Toast Container */}
      <div
        aria-live="polite"
        className="fixed bottom-20 lg:bottom-5 end-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-3 rounded-xl border text-xs font-medium shadow-lg ${
              t.type === 'error'
                ? 'bg-[var(--k-danger-bg)] border-[var(--k-danger)]/40 text-[var(--k-danger)]'
                : t.type === 'success'
                  ? 'bg-[var(--k-surface)] border-[var(--k-success)]/50 text-[var(--k-ink)]'
                  : 'bg-[var(--k-surface)] border-[var(--k-line-strong)] text-[var(--k-ink)]'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}
