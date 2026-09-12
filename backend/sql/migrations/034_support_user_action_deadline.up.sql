ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_user_action_deadline_state
  CHECK (
    (status = 'waiting_for_user' AND evidence_due_at IS NOT NULL)
    OR (status <> 'waiting_for_user' AND evidence_due_at IS NULL)
  );
