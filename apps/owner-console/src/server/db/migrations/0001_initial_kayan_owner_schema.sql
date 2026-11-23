-- Official Migration 0001: Kayan AI Super Admin & Platform Owner Schema
-- Strictly aligned with Kayan AI domain model (KAYANSTOR/AI migrations 0000-0061)

PRAGMA foreign_keys = ON;

-- 1. Platform Owner & Internal Admin RBAC (isolated from tenant users)
CREATE TABLE IF NOT EXISTS platform_admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('platform_owner', 'super_admin', 'ops_auditor')),
  password_hash TEXT NOT NULL,
  mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0, 1)),
  mfa_secret_encrypted TEXT,
  permissions_json TEXT NOT NULL DEFAULT '["*"]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS owner_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  user_agent TEXT NOT NULL DEFAULT 'unknown',
  mfa_verified INTEGER NOT NULL DEFAULT 0 CHECK (mfa_verified IN (0, 1)),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_owner_sessions_admin ON owner_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_owner_sessions_token ON owner_sessions(token_hash);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  user_agent TEXT NOT NULL DEFAULT 'unknown',
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON admin_login_attempts(created_at DESC);

-- 2. Plans Catalog (Kayan AI canonical plans + custom owner plans)
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_monthly REAL NOT NULL DEFAULT 0 CHECK (price_monthly >= 0),
  price_yearly REAL NOT NULL DEFAULT 0 CHECK (price_yearly >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly', 'custom')),
  trial_days INTEGER NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  max_users INTEGER NOT NULL DEFAULT 1 CHECK (max_users >= 0),
  max_agents INTEGER NOT NULL DEFAULT 1 CHECK (max_agents >= 0),
  max_messages INTEGER NOT NULL DEFAULT 100 CHECK (max_messages >= 0),
  token_quota INTEGER NOT NULL DEFAULT 50000 CHECK (token_quota >= 0),
  max_channels INTEGER NOT NULL DEFAULT 1 CHECK (max_channels >= 0),
  voice_minutes INTEGER NOT NULL DEFAULT 0 CHECK (voice_minutes >= 0),
  automation_runs INTEGER NOT NULL DEFAULT 50 CHECK (automation_runs >= 0),
  campaign_sends INTEGER NOT NULL DEFAULT 50 CHECK (campaign_sends >= 0),
  storage_mb INTEGER NOT NULL DEFAULT 100 CHECK (storage_mb >= 0),
  allowed_models_json TEXT NOT NULL DEFAULT '[]',
  allowed_channels_json TEXT NOT NULL DEFAULT '[]',
  allowed_tools_json TEXT NOT NULL DEFAULT '[]',
  enabled_features_json TEXT NOT NULL DEFAULT '[]',
  blocked_features_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Tenant Users & Workspaces (Organizations)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'workspace_owner', 'workspace_staff')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'trial', 'suspended', 'deleted')),
  activation_status TEXT NOT NULL DEFAULT 'activated' CHECK (activation_status IN ('activated', 'pending', 'deactivated')),
  activation_source TEXT NOT NULL DEFAULT 'owner_console',
  activation_start_at TEXT,
  activation_end_at TEXT,
  deactivation_reason TEXT,
  bonus_token_credit INTEGER NOT NULL DEFAULT 0 CHECK (bonus_token_credit >= 0),
  payment_status TEXT NOT NULL DEFAULT 'none' CHECK (payment_status IN ('paid', 'trial', 'past_due', 'unpaid', 'none')),
  admin_notes TEXT NOT NULL DEFAULT '',
  last_active_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at DESC);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  device TEXT NOT NULL DEFAULT 'Web',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  business_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  member_count INTEGER NOT NULL DEFAULT 1 CHECK (member_count >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_user_id);

-- 4. Subscriptions, Invoices & Payments
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL CHECK (status IN ('trial', 'active', 'past_due', 'expired', 'cancelled', 'suspended')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  auto_renew INTEGER NOT NULL DEFAULT 1 CHECK (auto_renew IN (0, 1)),
  gateway TEXT NOT NULL DEFAULT 'manual' CHECK (gateway IN ('stripe', 'esaalat', 'manual', 'none')),
  external_subscription_id TEXT,
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL CHECK (status IN ('paid', 'unpaid', 'failed', 'refunded', 'void')),
  revenue_classification TEXT NOT NULL DEFAULT 'unpaid' CHECK (revenue_classification IN ('collected', 'unpaid', 'refunded')),
  payment_method TEXT NOT NULL DEFAULT 'manual',
  gateway TEXT NOT NULL DEFAULT 'manual',
  provider_transaction_id TEXT,
  paid_at TEXT,
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  gateway TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'refunded', 'pending')),
  provider_reference TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- 5. Operating Expenses (explicitly recorded, never fabricated)
CREATE TABLE IF NOT EXISTS operating_expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  vendor TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  incurred_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. Feature Flags & User Entitlements
CREATE TABLE IF NOT EXISTS feature_flags (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'core',
  tier_type TEXT NOT NULL DEFAULT 'paid' CHECK (tier_type IN ('free', 'trial', 'paid', 'beta')),
  platform_enabled INTEGER NOT NULL DEFAULT 1 CHECK (platform_enabled IN (0, 1)),
  allowed_plan_codes_json TEXT NOT NULL DEFAULT '[]',
  default_quota INTEGER,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  override_state TEXT NOT NULL CHECK (override_state IN ('granted', 'revoked')),
  custom_limit INTEGER,
  source TEXT NOT NULL DEFAULT 'owner_override',
  reason TEXT NOT NULL DEFAULT '',
  expires_at TEXT,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, feature_key)
);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_user ON user_entitlements(user_id);

CREATE TABLE IF NOT EXISTS entitlement_history (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('platform_flag', 'user_entitlement', 'user_activation')),
  target_id TEXT NOT NULL,
  feature_key TEXT,
  actor_email TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entitlement_history_created ON entitlement_history(created_at DESC);

-- 7. AI Providers, Models, Pricing Catalog, Agents & Usage Ledger
CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  env_key_name TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  base_url TEXT NOT NULL DEFAULT '',
  last_success_at TEXT,
  last_error_at TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_models (
  id TEXT PRIMARY KEY,
  provider_code TEXT NOT NULL REFERENCES ai_providers(code) ON DELETE CASCADE,
  model_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_allowed INTEGER NOT NULL DEFAULT 1 CHECK (is_allowed IN (0, 1)),
  allowed_plan_codes_json TEXT NOT NULL DEFAULT '[]',
  input_price_per_1m REAL NOT NULL CHECK (input_price_per_1m >= 0),
  output_price_per_1m REAL NOT NULL CHECK (output_price_per_1m >= 0),
  cached_input_price_per_1m REAL NOT NULL DEFAULT 0 CHECK (cached_input_price_per_1m >= 0),
  pricing_source TEXT NOT NULL,
  pricing_version TEXT NOT NULL,
  pricing_effective_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  agent_type TEXT NOT NULL DEFAULT 'frontdesk' CHECK (agent_type IN ('frontdesk', 'sales', 'support', 'voice', 'copilot', 'custom')),
  provider_code TEXT NOT NULL REFERENCES ai_providers(code),
  model_id TEXT NOT NULL REFERENCES ai_models(model_id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled', 'error')),
  system_prompt TEXT NOT NULL DEFAULT '',
  prompt_version INTEGER NOT NULL DEFAULT 1,
  tools_json TEXT NOT NULL DEFAULT '[]',
  daily_request_limit INTEGER NOT NULL DEFAULT 500 CHECK (daily_request_limit >= 0),
  max_tokens_per_call INTEGER NOT NULL DEFAULT 2048 CHECK (max_tokens_per_call > 0),
  last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);

CREATE TABLE IF NOT EXISTS agent_config_history (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  actor_email TEXT NOT NULL,
  change_summary TEXT NOT NULL,
  previous_config_json TEXT,
  new_config_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  provider_code TEXT NOT NULL REFERENCES ai_providers(code),
  model_id TEXT NOT NULL REFERENCES ai_models(model_id),
  operation_type TEXT NOT NULL DEFAULT 'chat_completion',
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cached_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
  total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  cost_usd REAL NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  cost_type TEXT NOT NULL DEFAULT 'estimated' CHECK (cost_type IN ('actual', 'estimated')),
  pricing_source TEXT NOT NULL,
  pricing_version TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_agent ON ai_usage_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON ai_usage_events(model_id);

-- 8. Channels, Conversations & Messages
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('whatsapp', 'instagram', 'telegram', 'sms', 'voice_vapi', 'webchat')),
  display_name TEXT NOT NULL,
  connection_status TEXT NOT NULL DEFAULT 'disconnected' CHECK (connection_status IN ('connected', 'disconnected', 'error', 'pending_verification')),
  webhook_status TEXT NOT NULL DEFAULT 'unverified' CHECK (webhook_status IN ('verified', 'unverified', 'failing')),
  provider_status TEXT NOT NULL DEFAULT 'unconfigured',
  secret_encrypted TEXT,
  secret_masked TEXT,
  secret_rotated_at TEXT,
  connected_at TEXT,
  last_connected_at TEXT,
  last_activity_at TEXT,
  messages_received INTEGER NOT NULL DEFAULT 0 CHECK (messages_received >= 0),
  messages_sent INTEGER NOT NULL DEFAULT 0 CHECK (messages_sent >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_channels_workspace ON channels(workspace_id);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
  channel_type TEXT NOT NULL DEFAULT 'whatsapp',
  customer_handle TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('new', 'active', 'needs_human', 'closed', 'failed')),
  handled_by TEXT NOT NULL DEFAULT 'agent' CHECK (handled_by IN ('agent', 'human', 'mixed')),
  avg_response_ms INTEGER NOT NULL DEFAULT 0 CHECK (avg_response_ms >= 0),
  message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent', 'human_staff', 'owner_audited')),
  content TEXT NOT NULL,
  model_id TEXT,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'delivered' CHECK (status IN ('delivered', 'failed', 'pending')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at ASC);

-- 9. Automations / Workflows & Campaigns
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  automation_type TEXT NOT NULL CHECK (automation_type IN ('workflow', 'campaign', 'followup', 'reminder', 'sla')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled_by_owner', 'error')),
  total_runs INTEGER NOT NULL DEFAULT 0 CHECK (total_runs >= 0),
  success_runs INTEGER NOT NULL DEFAULT 0 CHECK (success_runs >= 0),
  failed_runs INTEGER NOT NULL DEFAULT 0 CHECK (failed_runs >= 0),
  avg_duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (avg_duration_ms >= 0),
  last_run_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'stopped')),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 10. Knowledge Base & Files
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'pdf',
  storage_bytes INTEGER NOT NULL DEFAULT 0 CHECK (storage_bytes >= 0),
  processing_status TEXT NOT NULL DEFAULT 'indexed' CHECK (processing_status IN ('pending', 'processing', 'indexed', 'failed')),
  chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  search_index_status TEXT NOT NULL DEFAULT 'ready' CHECK (search_index_status IN ('ready', 'rebuilding', 'error')),
  error_message TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. API Keys, Webhooks & Technical Integrations
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL DEFAULT 'workspace_api',
  rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
  requests_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  event_types_json TEXT NOT NULL DEFAULT '[]',
  secret_encrypted TEXT,
  secret_masked TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'failing')),
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TEXT,
  last_status_code INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 12. System Logs, Alerts, Notifications, Support Tickets, Audit Logs & Platform Settings
CREATE TABLE IF NOT EXISTS system_logs (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('server', 'api', 'database', 'ai_provider', 'agent', 'automation', 'messaging', 'security_unauthorized')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  service_name TEXT NOT NULL,
  message TEXT NOT NULL,
  details_sanitized TEXT NOT NULL DEFAULT '',
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_system_logs_severity ON system_logs(severity, created_at DESC);

CREATE TABLE IF NOT EXISTS owner_alerts (
  id TEXT PRIMARY KEY,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical', 'info')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  metric_value TEXT,
  threshold_value TEXT,
  acknowledged INTEGER NOT NULL DEFAULT 0 CHECK (acknowledged IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('single_user', 'user_group', 'all_users', 'plan_tier', 'trial_users', 'expiring_soon')),
  target_filter TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app',
  delivery_status TEXT NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('scheduled', 'sent', 'partial', 'failed')),
  recipients_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  scheduled_for TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  value_json TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT 'system',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 13. Canonical Kayan AI Reference Catalogs (Real definitions from KAYANSTOR/AI, zero fake tenant data)
INSERT OR IGNORE INTO plans (
  id, code, name, name_en, description, price_monthly, price_yearly, currency, billing_cycle, trial_days,
  max_users, max_agents, max_messages, token_quota, max_channels, voice_minutes, automation_runs, campaign_sends, storage_mb,
  allowed_models_json, allowed_channels_json, allowed_tools_json, enabled_features_json, blocked_features_json, status, is_featured
) VALUES
(
  'plan_trial', 'trial', 'المجانية', 'Free', 'جرّب KAYAN AI وابدأ بتنظيم استقبال عملائك.', 0, 0, 'USD', 'monthly', 14,
  1, 1, 100, 100000, 1, 30, 50, 50, 100,
  '["gemini-2.5-flash"]', '["whatsapp","webchat"]', '["knowledge_search"]',
  '["whatsapp_cloud_api","knowledge_hybrid_rag"]', '["vapi_voice_agent","campaigns_broadcast","custom_webhooks"]', 'active', 0
),
(
  'plan_starter', 'starter', 'البداية', 'Starter', 'للأنشطة الصغيرة التي تريد استقبالاً ذكياً بتكلفة منخفضة.', 9, 90, 'USD', 'monthly', 7,
  3, 2, 1000, 1000000, 2, 100, 200, 200, 500,
  '["gemini-2.5-flash","openai/gpt-oss-120b"]', '["whatsapp","instagram","webchat"]', '["knowledge_search","appointments","leads"]',
  '["whatsapp_cloud_api","instagram_dm","knowledge_hybrid_rag","workflow_automations"]', '["vapi_voice_agent","custom_webhooks"]', 'active', 0
),
(
  'plan_growth', 'growth', 'الاحترافية', 'Pro', 'للشركات التي تدير محادثات وعملاء وحملات بشكل مستمر.', 29, 290, 'USD', 'monthly', 7,
  10, 5, 5000, 5000000, 5, 500, 1000, 2000, 2048,
  '["gemini-2.5-flash","gemini-2.5-pro","openai/gpt-oss-120b"]', '["whatsapp","instagram","sms","telegram","webchat"]', '["knowledge_search","appointments","leads","quotes","orders"]',
  '["whatsapp_cloud_api","instagram_dm","sms_twilio","knowledge_hybrid_rag","workflow_automations","campaigns_broadcast","copilot_assistant"]', '["custom_webhooks"]', 'active', 1
),
(
  'plan_pro', 'pro', 'الأعمال', 'Business', 'للأعمال ذات حجم التشغيل المرتفع والفِرق الأكبر.', 59, 590, 'USD', 'monthly', 14,
  50, 20, 20000, 20000000, 10, 2000, 5000, 10000, 10240,
  '["gemini-2.5-flash","gemini-2.5-pro","openai/gpt-oss-120b","llama-3.3-70b-versatile"]', '["whatsapp","instagram","sms","telegram","voice_vapi","webchat"]', '["knowledge_search","appointments","leads","quotes","orders","webhooks","api_access"]',
  '["whatsapp_cloud_api","instagram_dm","sms_twilio","vapi_voice_agent","knowledge_hybrid_rag","workflow_automations","campaigns_broadcast","copilot_assistant","custom_webhooks"]', '[]', 'active', 0
);

INSERT OR IGNORE INTO ai_providers (id, code, name, env_key_name, is_primary, is_enabled, base_url) VALUES
('prov_gemini', 'gemini', 'Google Gemini', 'GEMINI_API_KEY', 1, 1, 'https://generativelanguage.googleapis.com'),
('prov_groq', 'groq', 'Groq Cloud (Fallback)', 'GROQ_API_KEY', 0, 1, 'https://api.groq.com/openai/v1');

INSERT OR IGNORE INTO ai_models (
  id, provider_code, model_id, display_name, is_allowed, allowed_plan_codes_json,
  input_price_per_1m, output_price_per_1m, cached_input_price_per_1m,
  pricing_source, pricing_version, pricing_effective_date
) VALUES
(
  'mdl_gemini_25_flash', 'gemini', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 1, '["trial","starter","growth","pro"]',
  0.15, 0.60, 0.0375, 'Google AI Official Pricing Schedule', '2026.1', '2026-01-01'
),
(
  'mdl_gemini_25_pro', 'gemini', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 1, '["growth","pro"]',
  1.25, 10.00, 0.3125, 'Google AI Official Pricing Schedule', '2026.1', '2026-01-01'
),
(
  'mdl_groq_gpt_oss_120b', 'groq', 'openai/gpt-oss-120b', 'Groq GPT-OSS 120B (Fallback)', 1, '["starter","growth","pro"]',
  0.15, 0.75, 0.0, 'Groq Cloud Published Rate Card', '2026.1', '2026-01-01'
),
(
  'mdl_groq_llama_33_70b', 'groq', 'llama-3.3-70b-versatile', 'Groq Llama 3.3 70B', 1, '["pro"]',
  0.59, 0.79, 0.0, 'Groq Cloud Published Rate Card', '2026.1', '2026-01-01'
);

INSERT OR IGNORE INTO feature_flags (id, key, name, description, category, tier_type, platform_enabled, allowed_plan_codes_json, default_quota) VALUES
('ff_wa', 'whatsapp_cloud_api', 'ربط WhatsApp Cloud API', 'الربط المباشر والتعايش مع واتساب للأعمال عبر Meta Embedded Signup', 'channels', 'free', 1, '["trial","starter","growth","pro"]', NULL),
('ff_ig', 'instagram_dm', 'رسائل Instagram DM', 'استقبال والرد الذكي على رسائل إنستغرام المباشرة', 'channels', 'paid', 1, '["starter","growth","pro"]', NULL),
('ff_sms', 'sms_twilio', 'رسائل SMS والمشغلون المحليون', 'إرسال واستقبال SMS عبر Twilio وملفات شركات الاتصالات', 'channels', 'paid', 1, '["growth","pro"]', 500),
('ff_voice', 'vapi_voice_agent', 'الوكيل الصوتي Vapi', 'مكالمات صوتية ذكية فورية مع حجز المواعيد', 'ai', 'paid', 1, '["pro"]', 2000),
('ff_rag', 'knowledge_hybrid_rag', 'قاعدة المعرفة والبحث الهجين', 'فهرسة المستندات والبحث الدلالي المحدّث بالإصدارات', 'knowledge', 'free', 1, '["trial","starter","growth","pro"]', 100),
('ff_auto', 'workflow_automations', 'الأتمتة وسير العمل', 'تشغيل مسارات الأتمتة والمتابعة التلقائية وتذكيرات المواعيد', 'automation', 'paid', 1, '["starter","growth","pro"]', 1000),
('ff_camp', 'campaigns_broadcast', 'الحملات التسويقية المستهدفة', 'إرسال حملات مجدولة حسب شرائح الجمهور', 'automation', 'paid', 1, '["growth","pro"]', 2000),
('ff_copilot', 'copilot_assistant', 'مساعد الفريق Copilot', 'مساعدة داخلية لفريق المبيعات وخدمة العملاء داخل مساحة العمل', 'ai', 'beta', 1, '["growth","pro"]', NULL),
('ff_webhooks', 'custom_webhooks', 'واجهات API وWebhooks المخصصة', 'تصدير الأحداث والربط مع أنظمة CRM وERP الخارجية', 'integrations', 'paid', 1, '["pro"]', NULL),
('ff_esaalat', 'esaalat_wallet_billing', 'الدفع بالمحافظ اليمنية وإيصالات', 'تفعيل السداد عبر إيصالات والمحافظ المحلية إلى جانب Stripe', 'billing', 'free', 1, '["trial","starter","growth","pro"]', NULL);

INSERT OR IGNORE INTO platform_settings (key, category, value_json, description) VALUES
('platform_name', 'general', '"Kayan AI"', 'الاسم الرسمي للمنصة'),
('platform_tagline', 'general', '"منصة استقبال العملاء والأتمتة بالذكاء الاصطناعي"', 'الوصف التعريفي للمنصة'),
('brand_primary_color', 'branding', '"#D8E2D0"', 'اللون الأساسي المعتمد للهوية البصرية (أخضر باستيل)'),
('brand_secondary_color', 'branding', '"#1F3B22"', 'اللون الثانوي الداكن للهوية البصرية'),
('registration_open', 'registration', 'true', 'السماح بتسجيل مستخدمين جدد في المنصة'),
('default_trial_days', 'trial', '14', 'مدة الفترة التجريبية الافتراضية بالأيام'),
('monthly_ai_cost_alert_usd', 'alerts', '250', 'حد التنبيه الشهري لتكلفة مزودي الذكاء الاصطناعي بالدولار'),
('daily_error_rate_alert_pct', 'alerts', '5', 'حد التنبيه لنسبة الأخطاء اليومية (%)'),
('require_mfa_for_owner', 'security', 'false', 'إلزام المصادقة الثنائية TOTP لحساب المالك'),
('session_ttl_hours', 'security', '12', 'مدة صلاحية جلسة المالك بالساعات'),
('audit_retention_days', 'retention', '365', 'مدة الاحتفاظ بسجل التدقيق بالأيام'),
('privacy_mask_customer_pii', 'privacy', 'true', 'إخفاء أجزاء من بيانات العملاء الحساسة في السجلات والتقارير غير المصرحة');
