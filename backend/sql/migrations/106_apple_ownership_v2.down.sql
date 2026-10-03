DO $$
BEGIN
  IF to_regclass('public.apple_ownership_enrollments') IS NOT NULL
     AND (EXISTS (SELECT 1 FROM apple_ownership_enrollments)
       OR EXISTS (SELECT 1 FROM apple_ownership_attempts)
       OR EXISTS (SELECT 1 FROM apple_ownership_materials)
       OR EXISTS (SELECT 1 FROM apple_ownership_deliveries)) THEN
    RAISE EXCEPTION 'apple_ownership_v2_obligations_present';
  END IF;
END
$$;
DROP TRIGGER IF EXISTS apple_ownership_user_delete_guard ON users;
DROP TABLE IF EXISTS apple_ownership_deliveries;
DROP TABLE IF EXISTS apple_ownership_materials;
DROP TABLE IF EXISTS apple_ownership_attempts;
DROP TABLE IF EXISTS apple_ownership_enrollments;
DROP FUNCTION IF EXISTS guard_apple_ownership_material_binding();
DROP FUNCTION IF EXISTS guard_apple_ownership_attempt_binding();
DROP FUNCTION IF EXISTS guard_apple_ownership_enrollment_immutable();
DROP FUNCTION IF EXISTS guard_apple_ownership_user_delete();
