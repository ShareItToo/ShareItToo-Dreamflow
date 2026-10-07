-- A schema rollback is allowed only before any legacy history was imported.
-- Once data exists, the safe feature rollback is to disable the importer and
-- retain the append-only archive until an approved export/retention plan exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_legacy_imports)
    OR EXISTS (SELECT 1 FROM support_legacy_history_entries)
  THEN
    RAISE EXCEPTION 'support legacy import rollback would lose history'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS support_legacy_history_entries_append_only
  ON support_legacy_history_entries;
DROP TRIGGER IF EXISTS support_legacy_imports_append_only
  ON support_legacy_imports;
DROP FUNCTION IF EXISTS sit_reject_support_legacy_history_mutation();
DROP TABLE support_legacy_history_entries;
DROP TABLE support_legacy_imports;
