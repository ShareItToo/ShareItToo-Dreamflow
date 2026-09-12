DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM moderation_statements_of_reasons LIMIT 1) THEN
    RAISE EXCEPTION
      'rollback refused: moderation Statement of Reasons evidence exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS moderation_decisions_statement_required
  ON moderation_decisions;
DROP FUNCTION IF EXISTS sit_require_moderation_statement_of_reasons();

DROP TRIGGER IF EXISTS moderation_statements_of_reasons_append_only
  ON moderation_statements_of_reasons;
DROP TRIGGER IF EXISTS moderation_statements_of_reasons_validate
  ON moderation_statements_of_reasons;
DROP FUNCTION IF EXISTS sit_validate_moderation_statement_of_reasons();
DROP TABLE moderation_statements_of_reasons;
