DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM moderation_account_suspension_proposals)
    OR EXISTS (SELECT 1 FROM user_suspensions WHERE measure_status <> 'legacy')
    OR EXISTS (SELECT 1 FROM moderation_decisions WHERE measure_status <> 'standard')
  THEN
    RAISE EXCEPTION 'Account suspension approval evidence exists; rollback refused';
  END IF;
END;
$$;

DROP TRIGGER moderation_decisions_account_measure_guard ON moderation_decisions;
DROP FUNCTION sit_validate_new_moderation_account_decision();
DROP TRIGGER user_suspensions_measure_guard ON user_suspensions;
DROP FUNCTION sit_validate_new_user_suspension_measure();
DROP TRIGGER moderation_account_suspension_proposals_update_guard
  ON moderation_account_suspension_proposals;
DROP FUNCTION sit_validate_account_suspension_proposal_update();
DROP TRIGGER moderation_account_suspension_proposals_insert_guard
  ON moderation_account_suspension_proposals;
DROP FUNCTION sit_validate_account_suspension_proposal_insert();

ALTER TABLE moderation_account_suspension_proposals
  DROP CONSTRAINT moderation_account_suspension_proposals_applied_fk;

ALTER TABLE user_suspensions
  DROP CONSTRAINT user_suspensions_measure_context_check,
  DROP COLUMN moderation_decision_id,
  DROP COLUMN account_suspension_proposal_id,
  DROP COLUMN user_facing_notice,
  DROP COLUMN no_guilt_determination,
  DROP COLUMN measure_status;

ALTER TABLE moderation_decisions
  DROP CONSTRAINT moderation_decisions_account_measure_context_check,
  DROP COLUMN account_suspension_proposal_id,
  DROP COLUMN user_facing_measure_notice,
  DROP COLUMN no_guilt_determination,
  DROP COLUMN measure_status;

DROP TABLE moderation_account_suspension_proposals;
