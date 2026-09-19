DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_evidence_files)
      OR EXISTS (SELECT 1 FROM support_evidence_access_grants) THEN
    RAISE EXCEPTION 'support evidence security rollback would lose retained evidence';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS support_evidence_files_guard ON support_evidence_files;
DROP FUNCTION IF EXISTS sit_guard_support_evidence_file_mutation();
DROP TABLE support_evidence_access_grants;
DROP TABLE support_evidence_files;
