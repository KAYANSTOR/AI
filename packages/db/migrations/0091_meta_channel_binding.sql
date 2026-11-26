-- Keep the existing WhatsApp adapter modes and record the public Meta mode in metadata.
UPDATE public.channels
SET metadata = metadata || jsonb_build_object(
  'meta_connection_mode', CASE connection_mode WHEN 'coexistence' THEN 'coexistence' ELSE 'cloud_only' END
)
WHERE channel_type = 'whatsapp' AND connection_mode IN ('cloud_api', 'coexistence');

CREATE FUNCTION public.bind_meta_channel(
  p_organization_id uuid,
  p_business_id uuid,
  p_channel_type varchar,
  p_asset_id varchar,
  p_display_number varchar,
  p_waba_id text,
  p_connection_mode text,
  p_primary_waac_ids text[],
  p_credentials jsonb
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  bound public.channels%ROWTYPE;
  mode text;
  ready boolean;
  public_mode jsonb := '{}'::jsonb;
  credential record;
BEGIN
  IF p_channel_type IS NULL OR p_channel_type NOT IN ('whatsapp', 'instagram', 'messenger')
    OR p_asset_id IS NULL OR p_asset_id !~ '^[0-9]{1,40}$'
    OR NOT EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = p_business_id AND organization_id = p_organization_id
    )
  THEN
    RAISE EXCEPTION 'invalid_meta_channel_binding' USING ERRCODE = '42501';
  END IF;

  mode := CASE WHEN p_connection_mode = 'coexistence' AND p_channel_type = 'whatsapp'
    THEN 'coexistence' ELSE 'cloud_api' END;
  ready := p_channel_type <> 'whatsapp' OR mode = 'coexistence';
  IF p_channel_type = 'whatsapp' THEN
    public_mode := jsonb_build_object('meta_connection_mode',
      CASE mode WHEN 'coexistence' THEN 'coexistence' ELSE 'cloud_only' END);
  END IF;

  -- Serialize both tenant-slot updates and competing claims for the same Meta asset.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':meta-binding:' || p_channel_type, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('meta-asset:' || p_channel_type || ':' || p_asset_id, 0));
  IF EXISTS (
    SELECT 1 FROM public.channels
    WHERE channel_type = p_channel_type AND provider_account_id = p_asset_id
      AND organization_id <> p_organization_id
  ) THEN
    RAISE EXCEPTION 'meta_asset_owned_by_another_organization' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO bound FROM public.channels
  WHERE organization_id = p_organization_id AND channel_type = p_channel_type
    AND (p_channel_type <> 'whatsapp' OR COALESCE(connection_mode, 'cloud_api') = mode)
  ORDER BY (provider_account_id = p_asset_id) DESC NULLS LAST, is_active DESC NULLS LAST, created_at
  LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    UPDATE public.channels SET
      business_id = p_business_id,
      provider_account_id = p_asset_id,
      external_identifier = p_display_number,
      waba_id = p_waba_id,
      primary_waac_ids = p_primary_waac_ids,
      metadata = metadata || public_mode,
      verification_status = CASE WHEN bound.provider_account_id = p_asset_id
        AND bound.verification_status = 'verified' THEN 'verified'
        WHEN ready THEN 'verified' ELSE 'pending' END,
      is_active = CASE WHEN bound.provider_account_id = p_asset_id
        AND bound.verification_status = 'verified' THEN bound.is_active ELSE ready END,
      updated_at = now()
    WHERE id = bound.id AND organization_id = p_organization_id;
  ELSE
    INSERT INTO public.channels (
      organization_id, business_id, channel_type, provider_account_id, external_identifier,
      connection_mode, waba_id, primary_waac_ids, metadata, verification_status, is_active
    ) VALUES (
      p_organization_id, p_business_id, p_channel_type, p_asset_id, p_display_number,
      mode, p_waba_id, p_primary_waac_ids, public_mode, CASE WHEN ready THEN 'verified' ELSE 'pending' END, ready
    ) RETURNING * INTO bound;
  END IF;

  FOR credential IN SELECT key, value FROM jsonb_each_text(p_credentials)
  LOOP
    PERFORM public.put_channel_credential(
      p_organization_id, bound.id, 'meta', credential.key::varchar, credential.value, 'active'
    );
  END LOOP;
  RETURN bound.id;
END;
$$;

REVOKE ALL ON FUNCTION public.bind_meta_channel(uuid, uuid, varchar, varchar, varchar, text, text, text[], jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_meta_channel(uuid, uuid, varchar, varchar, varchar, text, text, text[], jsonb)
  TO service_role;
