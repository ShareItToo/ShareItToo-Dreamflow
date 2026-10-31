-- WP156: legal holds are record-scoped and time-bounded by operator-supplied
-- review/end timestamps. No legal duration is inferred or activated here.
ALTER TABLE account_legal_holds
  ADD COLUMN IF NOT EXISTS dataset_key TEXT,
  ADD COLUMN IF NOT EXISTS record_key TEXT,
  ADD COLUMN IF NOT EXISTS review_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hold_ends_at TIMESTAMPTZ;

-- Existing rows must be explicitly migrated by an operator. Never invent a
-- scope or legal window, and fail with the package-specific error before
-- tightening NOT NULL constraints.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM account_legal_holds
    WHERE dataset_key IS NULL OR record_key IS NULL
      OR review_due_at IS NULL OR hold_ends_at IS NULL
  ) THEN
    RAISE EXCEPTION 'retention legal-hold migration requires explicit scope and review/end values';
  END IF;
END $$;

ALTER TABLE account_legal_holds
  ALTER COLUMN dataset_key SET NOT NULL,
  ALTER COLUMN record_key SET NOT NULL,
  ALTER COLUMN review_due_at SET NOT NULL,
  ALTER COLUMN hold_ends_at SET NOT NULL;

ALTER TABLE account_legal_holds
  DROP CONSTRAINT IF EXISTS account_legal_holds_dataset_key_check,
  ADD CONSTRAINT account_legal_holds_dataset_key_check CHECK (
    char_length(dataset_key) BETWEEN 1 AND 120
    AND dataset_key ~ '^[a-z0-9_.:-]+$'
  ),
  DROP CONSTRAINT IF EXISTS account_legal_holds_record_key_check,
  ADD CONSTRAINT account_legal_holds_record_key_check CHECK (
    char_length(record_key) BETWEEN 1 AND 240
    AND record_key ~ '^[A-Za-z0-9_.:-]+$'
  ),
  DROP CONSTRAINT IF EXISTS account_legal_holds_review_window_check,
  ADD CONSTRAINT account_legal_holds_review_window_check CHECK (
    review_due_at >= created_at AND hold_ends_at >= review_due_at
  );

DROP INDEX IF EXISTS account_legal_holds_one_active_per_user_idx;
CREATE UNIQUE INDEX IF NOT EXISTS account_legal_holds_one_active_per_record_idx
  ON account_legal_holds(user_id, dataset_key, record_key)
  WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS account_legal_holds_review_due_idx
  ON account_legal_holds(review_due_at, hold_ends_at, id);
