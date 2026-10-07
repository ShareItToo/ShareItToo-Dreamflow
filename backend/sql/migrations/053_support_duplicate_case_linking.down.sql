DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_case_links LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing to drop retained support duplicate-case links';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS support_duplicate_case_closure_guard ON support_cases;
DROP FUNCTION IF EXISTS sit_validate_support_duplicate_case_closure();
DROP TRIGGER IF EXISTS support_case_links_append_only ON support_case_links;
DROP TRIGGER IF EXISTS support_case_links_validate ON support_case_links;
DROP FUNCTION IF EXISTS sit_validate_support_case_link();
DROP TABLE IF EXISTS support_case_links;
