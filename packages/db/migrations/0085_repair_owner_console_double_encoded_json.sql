-- 0085: Repair JSONB values that the owner console double-encoded.
--
-- The owner console passed JSON.stringify(...) into `$n::jsonb` parameters. postgres.js
-- types such parameters as jsonb and serializes the JS string again, so PostgreSQL stored
-- a JSON *string* ("{\"a\":1}") instead of an object. Consequences in production:
--   * plans.limits became an array ([old_object, "json-string"]) after `limits || $n`,
--     so apps/web ignored owner-edited free-plan limits;
--   * platform_settings.value (e.g. billing.yer_per_usd) became a string the web
--     billing page could not parse; owner MFA pending secrets could not be confirmed;
--   * auth.users.raw_user_meta_data became an array after owner profile edits;
--   * platform_admins.permissions, outbox/audit payloads were stored as strings.
-- The application now casts `$n::text::jsonb`. This migration normalizes existing rows.
-- Idempotent: only string/array shapes produced by the bug are touched.

CREATE OR REPLACE FUNCTION pg_temp.kayan_try_jsonb(raw TEXT)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN raw::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- A JSON string whose content is itself a JSON object/array → the decoded value.
CREATE OR REPLACE FUNCTION pg_temp.kayan_unwrap(value JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE decoded JSONB;
BEGIN
  IF value IS NULL OR jsonb_typeof(value) <> 'string' THEN RETURN value; END IF;
  decoded := pg_temp.kayan_try_jsonb(value #>> '{}');
  IF decoded IS NOT NULL AND jsonb_typeof(decoded) IN ('object', 'array') THEN RETURN decoded; END IF;
  RETURN value;
END;
$$;

-- `object || "string"` produced [object, "string", ...]: merge every element left→right.
CREATE OR REPLACE FUNCTION pg_temp.kayan_merge_objects(value JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE merged JSONB := '{}'::jsonb; item JSONB; decoded JSONB;
BEGIN
  IF value IS NULL THEN RETURN value; END IF;
  IF jsonb_typeof(value) = 'string' THEN
    decoded := pg_temp.kayan_unwrap(value);
    RETURN CASE WHEN jsonb_typeof(decoded) = 'object' THEN decoded ELSE value END;
  END IF;
  IF jsonb_typeof(value) <> 'array' THEN RETURN value; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
    decoded := pg_temp.kayan_unwrap(item);
    IF jsonb_typeof(decoded) = 'object' THEN
      merged := merged || decoded;
    ELSIF jsonb_typeof(decoded) = 'array' THEN
      merged := merged || pg_temp.kayan_merge_objects(decoded);
    ELSE
      RETURN value; -- not a shape this bug produces; leave untouched
    END IF;
  END LOOP;
  RETURN merged;
END;
$$;

UPDATE public.plans
   SET limits = pg_temp.kayan_merge_objects(limits), updated_at = now()
 WHERE jsonb_typeof(limits) IN ('string', 'array')
   AND jsonb_typeof(pg_temp.kayan_merge_objects(limits)) = 'object';

UPDATE public.platform_settings
   SET value = pg_temp.kayan_unwrap(value)
 WHERE jsonb_typeof(value) = 'string'
   AND jsonb_typeof(pg_temp.kayan_unwrap(value)) IN ('object', 'array');

UPDATE public.platform_admins
   SET permissions = pg_temp.kayan_unwrap(permissions)
 WHERE jsonb_typeof(permissions) = 'string'
   AND jsonb_typeof(pg_temp.kayan_unwrap(permissions)) = 'array';

UPDATE auth.users
   SET raw_user_meta_data = pg_temp.kayan_merge_objects(raw_user_meta_data)
 WHERE jsonb_typeof(raw_user_meta_data) IN ('string', 'array')
   AND jsonb_typeof(pg_temp.kayan_merge_objects(raw_user_meta_data)) = 'object';

UPDATE public.outbox_events
   SET payload = pg_temp.kayan_unwrap(payload)
 WHERE jsonb_typeof(payload) = 'string'
   AND jsonb_typeof(pg_temp.kayan_unwrap(payload)) = 'object';

UPDATE public.audit_events
   SET metadata = pg_temp.kayan_unwrap(metadata)
 WHERE jsonb_typeof(metadata) = 'string'
   AND jsonb_typeof(pg_temp.kayan_unwrap(metadata)) = 'object';

UPDATE public.platform_audit_logs
   SET before_json = pg_temp.kayan_unwrap(before_json)
 WHERE jsonb_typeof(before_json) = 'string';

UPDATE public.platform_audit_logs
   SET after_json = pg_temp.kayan_unwrap(after_json)
 WHERE jsonb_typeof(after_json) = 'string';
