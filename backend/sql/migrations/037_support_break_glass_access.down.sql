DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_break_glass_grants) THEN
    RAISE EXCEPTION 'Support break-glass rollback blocked: grant or review truth exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS support_break_glass_delete_guard ON support_break_glass_grants;
DROP TRIGGER IF EXISTS support_break_glass_update_guard ON support_break_glass_grants;
DROP FUNCTION IF EXISTS sit_validate_support_break_glass_update();
DROP TRIGGER IF EXISTS support_break_glass_insert_guard ON support_break_glass_grants;
DROP FUNCTION IF EXISTS sit_validate_support_break_glass_insert();
DROP TABLE support_break_glass_grants;
