DO $$
BEGIN
  IF to_regclass('public.staging_google_registration_replays') IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM staging_google_registration_replays
        WHERE expires_at > now()
     ) THEN
    RAISE EXCEPTION 'staging_google_registration_replays_active_rows';
  END IF;
END
$$;

DROP TABLE IF EXISTS staging_google_registration_replays;
