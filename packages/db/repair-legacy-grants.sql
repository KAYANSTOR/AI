-- Restore the explicit grants from numbered migrations whose table privileges
-- were overwritten by earlier versions of bootstrap.sql. Keep their checksums.
DO $$
DECLARE
  table_name text;
BEGIN
  -- RLS applies to row-level operations. Remove the older grants for operations
  -- outside RLS from existing tables, while preserving normal data access.
  FOR table_name IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND (has_table_privilege('anon', c.oid, 'TRUNCATE, REFERENCES, TRIGGER')
        OR has_table_privilege('authenticated', c.oid, 'TRUNCATE, REFERENCES, TRIGGER'))
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon, authenticated', table_name);
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY['whatsapp_gateway_sessions', 'whatsapp_gateway_auth_keys'] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name
        AND policyname = 'gateway_service_access'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('CREATE POLICY gateway_service_access ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', table_name);
    END IF;
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'schema_migrations', 'provider_credentials', 'meta_embedded_signup_state_nonces', 'whatsapp_coexistence_sync_requests',
    'auth_password_reset_tokens', 'manual_wallet_payment_requests', 'billing_ledger_entries',
    'personal_assistant_extraction_jobs', 'inbound_jobs', 'platform_admins', 'platform_admin_sessions',
    'platform_admin_login_attempts', 'platform_settings', 'platform_audit_logs', 'billing_payment_providers',
    'platform_support_tickets', 'platform_announcements', 'platform_alert_acknowledgements',
    'platform_log_resolutions', 'ai_rate_limit_buckets', 'free_tier_usage',
    'free_tier_fingerprint_exemptions', 'blocked_email_domains', 'auth_email_tokens', 'auth_security_events'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I FROM anon, authenticated', table_name);
    END IF;
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'personal_assistant_links', 'personal_assistant_messages', 'agent_tasks', 'agent_task_steps',
    'agent_approvals', 'agent_receipts', 'whatsapp_trainer_links', 'whatsapp_training_submissions',
    'manual_yemen_wallets', 'user_oauth_identities', 'whatsapp_message_templates'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I FROM anon', table_name);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM authenticated', table_name);
    END IF;
  END LOOP;

  IF to_regclass('public.plan_prices') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.plan_prices FROM anon, authenticated;
  END IF;
  IF to_regclass('public.billing_ledger_entries') IS NOT NULL THEN
    REVOKE UPDATE, DELETE ON TABLE public.billing_ledger_entries FROM service_role;
  END IF;
  IF to_regclass('public.agent_receipts') IS NOT NULL THEN
    REVOKE UPDATE, DELETE ON TABLE public.agent_receipts FROM service_role;
  END IF;
  IF to_regclass('public.agent_approvals') IS NOT NULL THEN
    REVOKE DELETE ON TABLE public.agent_approvals FROM service_role;
  END IF;
  IF to_regclass('public.free_tier_fingerprint_exemptions') IS NOT NULL THEN
    REVOKE UPDATE ON TABLE public.free_tier_fingerprint_exemptions FROM service_role;
  END IF;
  IF to_regclass('public.blocked_email_domains') IS NOT NULL THEN
    REVOKE UPDATE ON TABLE public.blocked_email_domains FROM service_role;
  END IF;

  IF to_regclass('public.user_tool_connections') IS NOT NULL THEN
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_tool_connections FROM anon, authenticated;
    GRANT SELECT (id, org_id, user_id, provider, account_email, scopes, token_expires_at,
      status, last_error, connected_at, updated_at) ON TABLE public.user_tool_connections TO authenticated;
  END IF;
  IF to_regclass('public.user_secret_vault') IS NOT NULL THEN
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_secret_vault FROM anon, authenticated;
    GRANT SELECT (id, org_id, user_id, secret_ref, label, secret_kind, fingerprint, status,
      last_used_at, created_at, updated_at) ON TABLE public.user_secret_vault TO authenticated;
  END IF;

  -- PostgreSQL regex repetition bounds cannot exceed 255. Preserve the 512-character
  -- contract by checking length independently, without editing the applied 0086 file.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.whatsapp_message_templates')
      AND conname = 'whatsapp_message_templates_template_name_check'
      AND strpos(pg_get_constraintdef(oid), '{0,511}') > 0
  ) THEN
    ALTER TABLE public.whatsapp_message_templates
      DROP CONSTRAINT whatsapp_message_templates_template_name_check,
      ADD CONSTRAINT whatsapp_message_templates_template_name_check
        CHECK (length(template_name) <= 512 AND template_name ~ '^[a-z0-9][a-z0-9_]*$');
  END IF;
END $$;
