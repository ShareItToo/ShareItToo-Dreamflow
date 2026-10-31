#!/usr/bin/env bash
set -euo pipefail

task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$task_root"

for task_command in node flutter; do
  command -v "$task_command" >/dev/null 2>&1 || {
    echo "ERROR: $task_command is not available in PATH." >&2
    exit 1
  }
done

# This focused package is deliberately isolated from real providers and money.
export NODE_ENV=test
export CI=true
export JWT_SECRET='local-p0a-test-secret-longer-than-thirty-two-characters'
export DATABASE_URL='postgresql://local:local@127.0.0.1:5432/sit_local'
export MAIL_TRANSPORT=memory
export PAYMENT_TRANSPORT=memory
export STRIPE_LIVEMODE=false

node --check tool/validate_p0a_closed_pilot_readiness.mjs
node --test test/tool/validate_p0a_closed_pilot_readiness.test.mjs
node tool/validate_p0a_closed_pilot_readiness.mjs

node --test \
  backend/test/account_security.test.js \
  backend/test/account_legal_hold.test.js \
  backend/test/booking_domain.test.js \
  backend/test/v51_booking_quote_binding.test.js \
  backend/test/booking_confirmation_workflow.test.js \
  backend/test/booking_group_domain.test.js \
  backend/test/booking_group_quote_workflow.test.js \
  backend/test/booking_group_handover_workflow.test.js \
  backend/test/planner_core.test.js \
  backend/test/planner_inventory_workflow.test.js \
  backend/test/rental_cart_workflow.test.js \
  backend/test/v51_withdrawal_workflow.test.js \
  backend/test/v52_handover_return_workflow.test.js \
  backend/test/return_lifecycle_workflow.test.js \
  backend/test/c1h_privacy_inventory.test.js \
  backend/test/retention_inventory.test.js \
  backend/test/payment_domain.test.js

node --test \
  test/tool/validate_retention_deletion_readiness.test.mjs \
  test/tool/validate_production_restore_readiness.test.mjs \
  test/tool/verify_restore_readiness_wiring.test.mjs \
  test/tool/deploy_release_automatic_rollback.test.mjs \
  test/tool/v51_withdrawal_and_cancellation_wiring.test.mjs

flutter test --reporter expanded \
  test/secure_booking_confirmation_test.dart \
  test/private_pilot_cancellation_policy_test.dart \
  test/private_pilot_return_policy_test.dart \
  test/review_prompt_sheet_logic_test.dart \
  test/g2b_rental_cart_persistence_test.dart \
  test/g3e_booking_group_technical_ui_test.dart \
  test/g4a_planner_technical_config_test.dart \
  test/payment_provider_truthfulness_test.dart

echo "P0A focused closed-pilot regression: PASS (synthetic/local only)."
