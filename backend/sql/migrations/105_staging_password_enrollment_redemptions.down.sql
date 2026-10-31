DO $$
BEGIN
  IF to_regclass('public.staging_password_enrollment_redemptions') IS NOT NULL
     AND EXISTS (SELECT 1 FROM staging_password_enrollment_redemptions WHERE expires_at > now()) THEN
    RAISE EXCEPTION 'staging_password_enrollment_active_redemptions';
  END IF;
END
$$;
DROP TABLE IF EXISTS staging_password_enrollment_redemptions;
