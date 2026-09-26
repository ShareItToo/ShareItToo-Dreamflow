export const r8SyntheticAccountCount = 120;
export const r8MaximumConcurrentWorkers = 24;
export const r8ConcurrentPrivacyExportAccounts = 12;

export const r8ResultClassification =
  'LOCAL_BOUNDED_CONCURRENCY_OBSERVATION_NOT_PRODUCTION_CAPACITY_CLAIM';

export const r8RequiredScenarios = Object.freeze([
  'synthetic_account_cohort',
  'concurrent_cart_actions',
  'concurrent_listing_edits',
  'duplicate_publication_attempts',
  'competing_rental_requests',
  'stale_quote_updates',
  'g3_quote_counteroffer',
  'g4_cart_sync',
  'g5_set_availability_drift',
  'support_case_creation',
  'account_recovery',
  'privacy_export',
  'deletion_preflight',
]);

export const r8ForbiddenFindings = Object.freeze([
  'double_booking',
  'double_publish',
  'duplicate_money_state',
  'lost_update',
  'cross_account_leakage',
  'deadlock',
  'transaction_rollback_defect',
  'incorrect_idempotency',
  'stale_state_acceptance',
]);
