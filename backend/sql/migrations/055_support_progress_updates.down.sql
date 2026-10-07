DO $$
BEGIN
  IF to_regclass('public.support_case_progress_updates') IS NOT NULL
    AND EXISTS (SELECT 1 FROM support_case_progress_updates LIMIT 1)
  THEN
    RAISE EXCEPTION
      'Cannot roll back support progress updates while retained update evidence exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS support_progress_update_delete_guard
  ON support_case_progress_updates;
DROP FUNCTION IF EXISTS sit_block_support_progress_update_delete();

DROP TRIGGER IF EXISTS support_progress_update_change_guard
  ON support_case_progress_updates;
DROP FUNCTION IF EXISTS sit_validate_support_progress_update_change();

DROP TRIGGER IF EXISTS support_progress_update_insert_guard
  ON support_case_progress_updates;
DROP FUNCTION IF EXISTS sit_validate_support_progress_update_insert();

DROP TABLE IF EXISTS support_case_progress_updates;
