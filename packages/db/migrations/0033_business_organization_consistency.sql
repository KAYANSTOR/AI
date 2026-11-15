-- Enforce that business references stay within the dependent row's organization.
-- Refuse to change existing data; mismatches must be reconciled explicitly.
DO $$
DECLARE
  business_profiles_mismatches BIGINT;
  channels_mismatches BIGINT;
  phone_connections_mismatches BIGINT;
  ai_agents_mismatches BIGINT;
BEGIN
  SELECT count(*) INTO business_profiles_mismatches
  FROM public.business_profiles bp
  WHERE bp.business_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = bp.business_id AND b.organization_id = bp.organization_id
    );

  SELECT count(*) INTO channels_mismatches
  FROM public.channels c
  WHERE c.business_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = c.business_id AND b.organization_id = c.organization_id
    );

  SELECT count(*) INTO phone_connections_mismatches
  FROM public.phone_connections pc
  WHERE pc.business_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = pc.business_id AND b.organization_id = pc.organization_id
    );

  SELECT count(*) INTO ai_agents_mismatches
  FROM public.ai_agents a
  WHERE a.business_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = a.business_id AND b.organization_id = a.organization_id
    );

  IF business_profiles_mismatches > 0
    OR channels_mismatches > 0
    OR phone_connections_mismatches > 0
    OR ai_agents_mismatches > 0 THEN
    RAISE EXCEPTION
      '0033 business/organization consistency preflight failed: business_profiles=%, channels=%, phone_connections=%, ai_agents=%',
      business_profiles_mismatches,
      channels_mismatches,
      phone_connections_mismatches,
      ai_agents_mismatches
      USING ERRCODE = '23503',
        HINT = 'Reconcile mismatched business references explicitly, then rerun this migration. No rows were changed.';
  END IF;
END;
$$;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_id_organization_id_key UNIQUE (id, organization_id);

ALTER TABLE public.business_profiles
  DROP CONSTRAINT IF EXISTS business_profiles_business_id_fkey,
  ADD CONSTRAINT business_profiles_business_id_fkey
    FOREIGN KEY (business_id, organization_id)
    REFERENCES public.businesses (id, organization_id)
    ON DELETE CASCADE;

ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_business_id_fkey,
  ADD CONSTRAINT channels_business_id_fkey
    FOREIGN KEY (business_id, organization_id)
    REFERENCES public.businesses (id, organization_id)
    ON DELETE CASCADE;

ALTER TABLE public.phone_connections
  DROP CONSTRAINT IF EXISTS phone_connections_business_id_fkey,
  ADD CONSTRAINT phone_connections_business_id_fkey
    FOREIGN KEY (business_id, organization_id)
    REFERENCES public.businesses (id, organization_id)
    ON DELETE CASCADE;

ALTER TABLE public.ai_agents
  DROP CONSTRAINT IF EXISTS ai_agents_business_id_fkey,
  ADD CONSTRAINT ai_agents_business_id_fkey
    FOREIGN KEY (business_id, organization_id)
    REFERENCES public.businesses (id, organization_id)
    ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_business_profiles_business_org
  ON public.business_profiles (business_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_phone_connections_business_org
  ON public.phone_connections (business_id, organization_id);
