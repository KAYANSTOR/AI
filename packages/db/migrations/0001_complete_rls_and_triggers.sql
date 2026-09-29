-- FRONTDESK AI - Complete RLS + Signup Trigger (Phase 1)
-- Run in Supabase SQL Editor after 0000_initial.sql

CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid();
$$;

-- Shared updated_at trigger used by later domain migrations (quotes, orders, reports).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS 'BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;';

-- Drop incomplete example policies
DROP POLICY IF EXISTS "Users can view contacts in their organization" ON contacts;
DROP POLICY IF EXISTS "Users can insert contacts in their organization" ON contacts;
DROP POLICY IF EXISTS "Users can update contacts in their organization" ON contacts;
DROP POLICY IF EXISTS "Users can delete contacts in their organization" ON contacts;

-- organizations
DROP POLICY IF EXISTS "org_select" ON organizations;
DROP POLICY IF EXISTS "org_insert" ON organizations;
DROP POLICY IF EXISTS "org_update" ON organizations;
CREATE POLICY "org_select" ON organizations FOR SELECT USING (id IN (SELECT get_user_organizations()));
CREATE POLICY "org_insert" ON organizations FOR INSERT WITH CHECK (true);
CREATE POLICY "org_update" ON organizations FOR UPDATE USING (is_org_admin(id));

-- organization_members
DROP POLICY IF EXISTS "members_select" ON organization_members;
DROP POLICY IF EXISTS "members_insert" ON organization_members;
DROP POLICY IF EXISTS "members_update" ON organization_members;
DROP POLICY IF EXISTS "members_delete" ON organization_members;
CREATE POLICY "members_select" ON organization_members FOR SELECT USING (organization_id IN (SELECT get_user_organizations()));
CREATE POLICY "members_insert" ON organization_members FOR INSERT WITH CHECK (is_org_admin(organization_id) OR user_id = auth.uid());
CREATE POLICY "members_update" ON organization_members FOR UPDATE USING (is_org_admin(organization_id));
CREATE POLICY "members_delete" ON organization_members FOR DELETE USING (is_org_admin(organization_id));

-- Helper macro applied per table: select/insert/update/delete with is_org_member / is_org_admin

-- business_profiles
DROP POLICY IF EXISTS "bp_select" ON business_profiles; DROP POLICY IF EXISTS "bp_insert" ON business_profiles; DROP POLICY IF EXISTS "bp_update" ON business_profiles; DROP POLICY IF EXISTS "bp_delete" ON business_profiles;
CREATE POLICY "bp_select" ON business_profiles FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "bp_insert" ON business_profiles FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "bp_update" ON business_profiles FOR UPDATE USING (is_org_admin(organization_id));
CREATE POLICY "bp_delete" ON business_profiles FOR DELETE USING (is_org_admin(organization_id));

-- services
DROP POLICY IF EXISTS "svc_select" ON services; DROP POLICY IF EXISTS "svc_insert" ON services; DROP POLICY IF EXISTS "svc_update" ON services; DROP POLICY IF EXISTS "svc_delete" ON services;
CREATE POLICY "svc_select" ON services FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "svc_insert" ON services FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "svc_update" ON services FOR UPDATE USING (is_org_admin(organization_id));
CREATE POLICY "svc_delete" ON services FOR DELETE USING (is_org_admin(organization_id));

-- business_hours
DROP POLICY IF EXISTS "bh_select" ON business_hours; DROP POLICY IF EXISTS "bh_insert" ON business_hours; DROP POLICY IF EXISTS "bh_update" ON business_hours; DROP POLICY IF EXISTS "bh_delete" ON business_hours;
CREATE POLICY "bh_select" ON business_hours FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "bh_insert" ON business_hours FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "bh_update" ON business_hours FOR UPDATE USING (is_org_admin(organization_id));
CREATE POLICY "bh_delete" ON business_hours FOR DELETE USING (is_org_admin(organization_id));

-- phone_connections
DROP POLICY IF EXISTS "pc_select" ON phone_connections; DROP POLICY IF EXISTS "pc_insert" ON phone_connections; DROP POLICY IF EXISTS "pc_update" ON phone_connections; DROP POLICY IF EXISTS "pc_delete" ON phone_connections;
CREATE POLICY "pc_select" ON phone_connections FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "pc_insert" ON phone_connections FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "pc_update" ON phone_connections FOR UPDATE USING (is_org_admin(organization_id));
CREATE POLICY "pc_delete" ON phone_connections FOR DELETE USING (is_org_admin(organization_id));

-- channels
DROP POLICY IF EXISTS "ch_select" ON channels; DROP POLICY IF EXISTS "ch_insert" ON channels; DROP POLICY IF EXISTS "ch_update" ON channels; DROP POLICY IF EXISTS "ch_delete" ON channels;
CREATE POLICY "ch_select" ON channels FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "ch_insert" ON channels FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "ch_update" ON channels FOR UPDATE USING (is_org_admin(organization_id));
CREATE POLICY "ch_delete" ON channels FOR DELETE USING (is_org_admin(organization_id));

-- provider_credentials (admin only)
DROP POLICY IF EXISTS "cred_select" ON provider_credentials; DROP POLICY IF EXISTS "cred_insert" ON provider_credentials; DROP POLICY IF EXISTS "cred_update" ON provider_credentials; DROP POLICY IF EXISTS "cred_delete" ON provider_credentials;
CREATE POLICY "cred_select" ON provider_credentials FOR SELECT USING (is_org_admin(organization_id));
CREATE POLICY "cred_insert" ON provider_credentials FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "cred_update" ON provider_credentials FOR UPDATE USING (is_org_admin(organization_id));
CREATE POLICY "cred_delete" ON provider_credentials FOR DELETE USING (is_org_admin(organization_id));

-- contacts
DROP POLICY IF EXISTS "ct_select" ON contacts; DROP POLICY IF EXISTS "ct_insert" ON contacts; DROP POLICY IF EXISTS "ct_update" ON contacts; DROP POLICY IF EXISTS "ct_delete" ON contacts;
CREATE POLICY "ct_select" ON contacts FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "ct_insert" ON contacts FOR INSERT WITH CHECK (is_org_member(organization_id));
CREATE POLICY "ct_update" ON contacts FOR UPDATE USING (is_org_member(organization_id));
CREATE POLICY "ct_delete" ON contacts FOR DELETE USING (is_org_admin(organization_id));

-- contact_identities
DROP POLICY IF EXISTS "ci_select" ON contact_identities; DROP POLICY IF EXISTS "ci_insert" ON contact_identities; DROP POLICY IF EXISTS "ci_update" ON contact_identities; DROP POLICY IF EXISTS "ci_delete" ON contact_identities;
CREATE POLICY "ci_select" ON contact_identities FOR SELECT USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_identities.contact_id AND is_org_member(c.organization_id)));
CREATE POLICY "ci_insert" ON contact_identities FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_identities.contact_id AND is_org_member(c.organization_id)));
CREATE POLICY "ci_update" ON contact_identities FOR UPDATE USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_identities.contact_id AND is_org_member(c.organization_id)));
CREATE POLICY "ci_delete" ON contact_identities FOR DELETE USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_identities.contact_id AND is_org_admin(c.organization_id)));

-- conversations
DROP POLICY IF EXISTS "conv_select" ON conversations; DROP POLICY IF EXISTS "conv_insert" ON conversations; DROP POLICY IF EXISTS "conv_update" ON conversations; DROP POLICY IF EXISTS "conv_delete" ON conversations;
CREATE POLICY "conv_select" ON conversations FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "conv_insert" ON conversations FOR INSERT WITH CHECK (is_org_member(organization_id));
CREATE POLICY "conv_update" ON conversations FOR UPDATE USING (is_org_member(organization_id));
CREATE POLICY "conv_delete" ON conversations FOR DELETE USING (is_org_admin(organization_id));

-- messages
DROP POLICY IF EXISTS "msg_select" ON messages; DROP POLICY IF EXISTS "msg_insert" ON messages; DROP POLICY IF EXISTS "msg_update" ON messages; DROP POLICY IF EXISTS "msg_delete" ON messages;
CREATE POLICY "msg_select" ON messages FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "msg_insert" ON messages FOR INSERT WITH CHECK (is_org_member(organization_id));
CREATE POLICY "msg_update" ON messages FOR UPDATE USING (is_org_member(organization_id));
CREATE POLICY "msg_delete" ON messages FOR DELETE USING (is_org_admin(organization_id));

-- leads
DROP POLICY IF EXISTS "lead_select" ON leads; DROP POLICY IF EXISTS "lead_insert" ON leads; DROP POLICY IF EXISTS "lead_update" ON leads; DROP POLICY IF EXISTS "lead_delete" ON leads;
CREATE POLICY "lead_select" ON leads FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "lead_insert" ON leads FOR INSERT WITH CHECK (is_org_member(organization_id));
CREATE POLICY "lead_update" ON leads FOR UPDATE USING (is_org_member(organization_id));
CREATE POLICY "lead_delete" ON leads FOR DELETE USING (is_org_admin(organization_id));

-- lead_events
DROP POLICY IF EXISTS "le_select" ON lead_events; DROP POLICY IF EXISTS "le_insert" ON lead_events;
CREATE POLICY "le_select" ON lead_events FOR SELECT USING (EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_events.lead_id AND is_org_member(l.organization_id)));
CREATE POLICY "le_insert" ON lead_events FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_events.lead_id AND is_org_member(l.organization_id)));

-- appointments
DROP POLICY IF EXISTS "appt_select" ON appointments; DROP POLICY IF EXISTS "appt_insert" ON appointments; DROP POLICY IF EXISTS "appt_update" ON appointments; DROP POLICY IF EXISTS "appt_delete" ON appointments;
CREATE POLICY "appt_select" ON appointments FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "appt_insert" ON appointments FOR INSERT WITH CHECK (is_org_member(organization_id));
CREATE POLICY "appt_update" ON appointments FOR UPDATE USING (is_org_member(organization_id));
CREATE POLICY "appt_delete" ON appointments FOR DELETE USING (is_org_admin(organization_id));

-- followup_sequences
DROP POLICY IF EXISTS "fs_select" ON followup_sequences; DROP POLICY IF EXISTS "fs_insert" ON followup_sequences; DROP POLICY IF EXISTS "fs_update" ON followup_sequences; DROP POLICY IF EXISTS "fs_delete" ON followup_sequences;
CREATE POLICY "fs_select" ON followup_sequences FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "fs_insert" ON followup_sequences FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "fs_update" ON followup_sequences FOR UPDATE USING (is_org_admin(organization_id));
CREATE POLICY "fs_delete" ON followup_sequences FOR DELETE USING (is_org_admin(organization_id));

-- followup_steps
DROP POLICY IF EXISTS "fstep_select" ON followup_steps; DROP POLICY IF EXISTS "fstep_insert" ON followup_steps; DROP POLICY IF EXISTS "fstep_update" ON followup_steps; DROP POLICY IF EXISTS "fstep_delete" ON followup_steps;
CREATE POLICY "fstep_select" ON followup_steps FOR SELECT USING (EXISTS (SELECT 1 FROM followup_sequences s WHERE s.id = followup_steps.sequence_id AND is_org_member(s.organization_id)));
CREATE POLICY "fstep_insert" ON followup_steps FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM followup_sequences s WHERE s.id = followup_steps.sequence_id AND is_org_admin(s.organization_id)));
CREATE POLICY "fstep_update" ON followup_steps FOR UPDATE USING (EXISTS (SELECT 1 FROM followup_sequences s WHERE s.id = followup_steps.sequence_id AND is_org_admin(s.organization_id)));
CREATE POLICY "fstep_delete" ON followup_steps FOR DELETE USING (EXISTS (SELECT 1 FROM followup_sequences s WHERE s.id = followup_steps.sequence_id AND is_org_admin(s.organization_id)));

-- followup_enrollments
DROP POLICY IF EXISTS "fe_select" ON followup_enrollments; DROP POLICY IF EXISTS "fe_insert" ON followup_enrollments; DROP POLICY IF EXISTS "fe_update" ON followup_enrollments; DROP POLICY IF EXISTS "fe_delete" ON followup_enrollments;
CREATE POLICY "fe_select" ON followup_enrollments FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "fe_insert" ON followup_enrollments FOR INSERT WITH CHECK (is_org_member(organization_id));
CREATE POLICY "fe_update" ON followup_enrollments FOR UPDATE USING (is_org_member(organization_id));
CREATE POLICY "fe_delete" ON followup_enrollments FOR DELETE USING (is_org_admin(organization_id));

-- knowledge_base
DROP POLICY IF EXISTS "kb_select" ON knowledge_base; DROP POLICY IF EXISTS "kb_insert" ON knowledge_base; DROP POLICY IF EXISTS "kb_update" ON knowledge_base; DROP POLICY IF EXISTS "kb_delete" ON knowledge_base;
CREATE POLICY "kb_select" ON knowledge_base FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "kb_insert" ON knowledge_base FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "kb_update" ON knowledge_base FOR UPDATE USING (is_org_admin(organization_id));
CREATE POLICY "kb_delete" ON knowledge_base FOR DELETE USING (is_org_admin(organization_id));

-- ai_agents
DROP POLICY IF EXISTS "aa_select" ON ai_agents; DROP POLICY IF EXISTS "aa_insert" ON ai_agents; DROP POLICY IF EXISTS "aa_update" ON ai_agents; DROP POLICY IF EXISTS "aa_delete" ON ai_agents;
CREATE POLICY "aa_select" ON ai_agents FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "aa_insert" ON ai_agents FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "aa_update" ON ai_agents FOR UPDATE USING (is_org_admin(organization_id));
CREATE POLICY "aa_delete" ON ai_agents FOR DELETE USING (is_org_admin(organization_id));

-- subscriptions
DROP POLICY IF EXISTS "sub_select" ON subscriptions; DROP POLICY IF EXISTS "sub_insert" ON subscriptions; DROP POLICY IF EXISTS "sub_update" ON subscriptions;
CREATE POLICY "sub_select" ON subscriptions FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "sub_insert" ON subscriptions FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "sub_update" ON subscriptions FOR UPDATE USING (is_org_admin(organization_id));

-- usage_logs
DROP POLICY IF EXISTS "ul_select" ON usage_logs; DROP POLICY IF EXISTS "ul_insert" ON usage_logs;
CREATE POLICY "ul_select" ON usage_logs FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "ul_insert" ON usage_logs FOR INSERT WITH CHECK (is_org_member(organization_id));

-- carrier_profiles (global read)
ALTER TABLE carrier_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "carrier_read" ON carrier_profiles;
CREATE POLICY "carrier_read" ON carrier_profiles FOR SELECT TO authenticated USING (true);

-- Signup trigger: org + owner + profile + default hours
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
BEGIN
  org_name := COALESCE(NEW.raw_user_meta_data->>'organization_name', split_part(NEW.email, '@', 1) || '''s Business');
  INSERT INTO organizations (name) VALUES (org_name) RETURNING id INTO new_org_id;
  INSERT INTO organization_members (organization_id, user_id, role) VALUES (new_org_id, NEW.id, 'owner');
  INSERT INTO business_profiles (organization_id, industry, timezone) VALUES (new_org_id, 'beauty_wellness', 'UTC');
  INSERT INTO business_hours (organization_id, day_of_week, open_time, close_time, is_closed) VALUES
    (new_org_id, 0, '09:00', '18:00', true),
    (new_org_id, 1, '09:00', '18:00', false),
    (new_org_id, 2, '09:00', '18:00', false),
    (new_org_id, 3, '09:00', '18:00', false),
    (new_org_id, 4, '09:00', '18:00', false),
    (new_org_id, 5, '09:00', '18:00', false),
    (new_org_id, 6, '10:00', '16:00', false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
