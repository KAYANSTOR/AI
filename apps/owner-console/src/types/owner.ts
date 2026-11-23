export type OwnerRouteId =
  | 'overview'
  | 'users'
  | 'workspaces'
  | 'plans_subscriptions'
  | 'invoices_payments'
  | 'entitlements'
  | 'agents'
  | 'ai_models'
  | 'ai_usage'
  | 'conversations'
  | 'channels'
  | 'automations'
  | 'knowledge'
  | 'api_integrations'
  | 'system_monitoring'
  | 'errors_logs'
  | 'notifications_support'
  | 'reports'
  | 'audit_logs'
  | 'settings';

export interface OwnerAdminProfile {
  id: string;
  email: string;
  fullName: string;
  role: 'platform_owner' | 'super_admin' | 'ops_auditor';
  permissions: string[];
  sessionId: string;
  mfaEnabled: boolean;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export interface NavItemConfig {
  id: OwnerRouteId;
  label: string;
  group: 'command' | 'customers' | 'ai' | 'operations' | 'governance';
}

export const OWNER_NAV_ITEMS: NavItemConfig[] = [
  { id: 'overview', label: 'الرئيسية', group: 'command' },
  { id: 'users', label: 'المستخدمون', group: 'customers' },
  { id: 'workspaces', label: 'مساحات العمل', group: 'customers' },
  { id: 'plans_subscriptions', label: 'الاشتراكات والباقات', group: 'customers' },
  { id: 'invoices_payments', label: 'الفواتير والمدفوعات', group: 'customers' },
  { id: 'entitlements', label: 'التفعيلات والمزايا', group: 'customers' },
  { id: 'agents', label: 'الوكلاء الذكيون', group: 'ai' },
  { id: 'ai_models', label: 'الذكاء الاصطناعي والنماذج', group: 'ai' },
  { id: 'ai_usage', label: 'الاستهلاك والتكاليف', group: 'ai' },
  { id: 'conversations', label: 'المحادثات والرسائل', group: 'operations' },
  { id: 'channels', label: 'قنوات الاتصال', group: 'operations' },
  { id: 'automations', label: 'الأتمتة والحملات', group: 'operations' },
  { id: 'knowledge', label: 'قاعدة المعرفة', group: 'operations' },
  { id: 'api_integrations', label: 'API والتكاملات', group: 'operations' },
  { id: 'system_monitoring', label: 'مراقبة النظام', group: 'governance' },
  { id: 'errors_logs', label: 'الأخطاء والسجلات', group: 'governance' },
  { id: 'notifications_support', label: 'الإشعارات والدعم', group: 'governance' },
  { id: 'reports', label: 'التقارير', group: 'governance' },
  { id: 'audit_logs', label: 'سجل التدقيق', group: 'governance' },
  { id: 'settings', label: 'إعدادات المنصة', group: 'governance' },
];

export const NAV_GROUP_LABELS: Record<NavItemConfig['group'], string> = {
  command: 'مركز القيادة',
  customers: 'العملاء والإيرادات',
  ai: 'منظومة الذكاء الاصطناعي',
  operations: 'التشغيل والقنوات',
  governance: 'المراقبة والحوكمة',
};
