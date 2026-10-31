-- WP156 rollback is intentionally non-destructive. The successor schema must
-- not silently broaden a record-scoped hold back into an account-wide hold.
DO $$
BEGIN
  RAISE EXCEPTION 'rollback refused: record-scoped retention legal-hold evidence exists';
END $$;
