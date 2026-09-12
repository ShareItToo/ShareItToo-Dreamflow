const CATEGORY_DECISIONS = Object.freeze({
  accounts: 'inactiveAccountPeriod',
  userIntent: 'inactiveAccountPeriod',
  transactions: 'transactionalRecordPeriod',
  communications: 'communicationPeriod',
  privacyRights: 'privacyRightsPeriod',
  handoverEvidence: 'transactionalRecordPeriod',
  moderation: 'moderationEvidencePeriod',
  securityAudit: 'auditSecurityLogPeriod',
  legalHold: 'legalHoldProcess',
});

export class RetentionInventoryError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function iso(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function count(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function shapeRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const category = String(row.category ?? '');
    const decisionKey = CATEGORY_DECISIONS[category];
    if (!decisionKey) throw new RetentionInventoryError(500, 'unexpected_retention_category');
    const entry = grouped.get(category) ?? {
      category,
      decisionKey,
      policyStatus: 'open',
      cutoffApplied: false,
      eligibleRows: null,
      totalRows: 0,
      datasets: [],
    };
    const rowCount = count(row.row_count);
    entry.totalRows += rowCount;
    entry.datasets.push({
      dataset: String(row.dataset ?? ''),
      totalRows: rowCount,
      oldestAt: iso(row.oldest_at),
      newestAt: iso(row.newest_at),
    });
    grouped.set(category, entry);
  }
  return [...grouped.values()].sort((left, right) => left.category.localeCompare(right.category));
}

export async function inspectRetentionInventory(client, { actor }) {
  if (actor?.role !== 'admin') throw new RetentionInventoryError(403, 'admin_role_required');
  const result = await client.query(
    `WITH inventory(category, dataset, row_count, oldest_at, newest_at) AS (
       SELECT 'accounts', 'user_accounts', count(*)::bigint, min(created_at), max(updated_at) FROM users
       UNION ALL SELECT 'userIntent', 'rental_carts', count(*)::bigint, min(created_at), max(updated_at) FROM rental_carts
       UNION ALL SELECT 'userIntent', 'rental_cart_projects', count(*)::bigint, min(created_at), max(updated_at) FROM rental_cart_projects
       UNION ALL SELECT 'userIntent', 'rental_cart_items', count(*)::bigint, min(created_at), max(updated_at) FROM rental_cart_items
       UNION ALL SELECT 'userIntent', 'listing_supply_enrichment', count(*)::bigint, min(created_at), max(updated_at)
         FROM listings WHERE payload ? 'supplyEnrichment'
       UNION ALL SELECT 'userIntent', 'listing_sets', count(*)::bigint, min(created_at), max(created_at) FROM listing_sets
       UNION ALL SELECT 'userIntent', 'listing_set_versions', count(*)::bigint, min(created_at), max(created_at) FROM listing_set_versions
       UNION ALL SELECT 'userIntent', 'listing_set_version_members', count(*)::bigint, min(created_at), max(created_at) FROM listing_set_version_members
       UNION ALL SELECT 'transactions', 'bookings', count(*)::bigint, min(created_at), max(updated_at) FROM bookings
       UNION ALL SELECT 'transactions', 'booking_quotes', count(*)::bigint, min(issued_at), max(issued_at) FROM booking_quotes
       UNION ALL SELECT 'transactions', 'booking_groups', count(*)::bigint, min(created_at), max(created_at) FROM booking_groups
       UNION ALL SELECT 'transactions', 'booking_group_positions', count(*)::bigint, min(created_at), max(created_at) FROM booking_group_positions
       UNION ALL SELECT 'transactions', 'booking_group_quotes', count(*)::bigint, min(issued_at), max(issued_at) FROM booking_group_quotes
       UNION ALL SELECT 'transactions', 'booking_group_quote_positions', count(*)::bigint, min(created_at), max(created_at) FROM booking_group_quote_positions
       UNION ALL SELECT 'transactions', 'booking_group_position_booking_bindings', count(*)::bigint, min(created_at), max(created_at) FROM booking_group_position_booking_bindings
       UNION ALL SELECT 'transactions', 'booking_group_appointments', count(*)::bigint, min(created_at), max(created_at) FROM booking_group_appointments
       UNION ALL SELECT 'transactions', 'legal_document_snapshots', count(*)::bigint, min(created_at), max(created_at) FROM legal_document_snapshots
       UNION ALL SELECT 'transactions', 'platform_contracts', count(*)::bigint, min(created_at), max(created_at) FROM platform_contracts
       UNION ALL SELECT 'transactions', 'platform_contract_declarations', count(*)::bigint, min(created_at), max(created_at) FROM platform_contract_declarations
       UNION ALL SELECT 'transactions', 'platform_contract_receipts', count(*)::bigint, min(generated_at), max(generated_at) FROM platform_contract_receipts
       UNION ALL SELECT 'transactions', 'platform_contract_receipt_events', count(*)::bigint, min(occurred_at), max(occurred_at) FROM platform_contract_receipt_events
       UNION ALL SELECT 'transactions', 'v51_withdrawals', count(*)::bigint, min(submitted_at), max(created_at) FROM v51_withdrawals
       UNION ALL SELECT 'transactions', 'v51_refund_obligations', count(*)::bigint, min(created_at), max(created_at) FROM v51_refund_obligations
       UNION ALL SELECT 'transactions', 'v51_refund_obligation_events', count(*)::bigint, min(occurred_at), max(occurred_at) FROM v51_refund_obligation_events
       UNION ALL SELECT 'transactions', 'v51_cancellation_refund_obligations', count(*)::bigint, min(created_at), max(created_at) FROM v51_cancellation_refund_obligations
       UNION ALL SELECT 'transactions', 'v52_actual_loss_cases', count(*)::bigint, min(opened_at), max(created_at) FROM v52_actual_loss_cases
       UNION ALL SELECT 'transactions', 'v52_actual_loss_statements', count(*)::bigint, min(submitted_at), max(created_at) FROM v52_actual_loss_statements
       UNION ALL SELECT 'transactions', 'v52_actual_loss_resolutions', count(*)::bigint, min(resolved_at), max(created_at) FROM v52_actual_loss_resolutions
       UNION ALL SELECT 'transactions', 'v52_cancellation_refund_resolution_events', count(*)::bigint, min(occurred_at), max(occurred_at) FROM v52_cancellation_refund_resolution_events
       UNION ALL SELECT 'transactions', 'v52_actual_loss_receipts', count(*)::bigint, min(generated_at), max(created_at) FROM v52_actual_loss_receipts
       UNION ALL SELECT 'transactions', 'v52_actual_loss_receipt_events', count(*)::bigint, min(occurred_at), max(occurred_at) FROM v52_actual_loss_receipt_events
       UNION ALL SELECT 'transactions', 'v51_withdrawal_receipts', count(*)::bigint, min(generated_at), max(created_at) FROM v51_withdrawal_receipts
       UNION ALL SELECT 'transactions', 'v51_withdrawal_receipt_events', count(*)::bigint, min(occurred_at), max(occurred_at) FROM v51_withdrawal_receipt_events
       UNION ALL SELECT 'transactions', 'payments', count(*)::bigint, min(created_at), max(updated_at) FROM payments
       UNION ALL SELECT 'transactions', 'refunds', count(*)::bigint, min(created_at), max(updated_at) FROM refunds
       UNION ALL SELECT 'transactions', 'payouts', count(*)::bigint, min(created_at), max(updated_at) FROM payouts
       UNION ALL SELECT 'transactions', 'financial_documents', count(*)::bigint, min(issued_at), max(created_at) FROM financial_documents
       UNION ALL SELECT 'transactions', 'financial_document_events', count(*)::bigint, min(occurred_at), max(occurred_at) FROM financial_document_events
       UNION ALL SELECT 'transactions', 'disputes', count(*)::bigint, min(created_at), max(updated_at) FROM disputes
       UNION ALL SELECT 'transactions', 'dispute_transfer_recoveries', count(*)::bigint, min(created_at), max(updated_at) FROM dispute_transfer_recoveries
       UNION ALL SELECT 'communications', 'messages', count(*)::bigint, min(created_at), max(created_at) FROM messages
       UNION ALL SELECT 'communications', 'notifications', count(*)::bigint, min(created_at), max(created_at) FROM notifications
       UNION ALL SELECT 'communications', 'notification_outbox', count(*)::bigint, min(created_at), max(updated_at) FROM notification_outbox
       UNION ALL SELECT 'communications', 'support_cases', count(*)::bigint, min(created_at), max(updated_at) FROM support_cases
       UNION ALL SELECT 'communications', 'support_case_links', count(*)::bigint, min(created_at), max(created_at) FROM support_case_links
       UNION ALL SELECT 'communications', 'support_messages', count(*)::bigint, min(created_at), max(COALESCE(sent_at, created_at)) FROM support_messages
       UNION ALL SELECT 'communications', 'support_case_progress_updates', count(*)::bigint, min(created_at), max(COALESCE(published_at, reviewed_at, created_at)) FROM support_case_progress_updates
       UNION ALL SELECT 'communications', 'support_legacy_imports', count(*)::bigint, min(imported_at), max(imported_at) FROM support_legacy_imports
       UNION ALL SELECT 'communications', 'support_legacy_history_entries', count(*)::bigint, min(archived_at), max(archived_at) FROM support_legacy_history_entries
       UNION ALL SELECT 'privacyRights', 'support_privacy_rights_requests', count(*)::bigint, min(received_at), max(updated_at) FROM support_privacy_rights_requests
       UNION ALL SELECT 'privacyRights', 'support_privacy_identity_verifications', count(*)::bigint, min(verified_at), max(verified_at) FROM support_privacy_identity_verifications
       UNION ALL SELECT 'privacyRights', 'support_privacy_deadline_extensions', count(*)::bigint, min(recorded_at), max(recorded_at) FROM support_privacy_deadline_extensions
       UNION ALL SELECT 'privacyRights', 'support_privacy_incidents', count(*)::bigint, min(breach_awareness_at), max(updated_at) FROM support_privacy_incidents
       UNION ALL SELECT 'privacyRights', 'support_privacy_incident_containment_actions', count(*)::bigint, min(recorded_at), max(recorded_at) FROM support_privacy_incident_containment_actions
       UNION ALL SELECT 'communications', 'message_attachments', count(*)::bigint, min(created_at), max(created_at)
         FROM uploads WHERE purpose = 'message_attachment'
       UNION ALL SELECT 'handoverEvidence', 'handover_return_evidence', count(*)::bigint, min(created_at), max(created_at)
         FROM uploads WHERE purpose IN ('handover_evidence', 'return_evidence')
       UNION ALL SELECT 'handoverEvidence', 'booking_condition_evidence', count(*)::bigint, min(created_at), max(created_at)
         FROM booking_condition_evidence
       UNION ALL SELECT 'handoverEvidence', 'booking_condition_confirmations', count(*)::bigint, min(created_at), max(created_at)
         FROM booking_condition_confirmations
       UNION ALL SELECT 'handoverEvidence', 'v52_condition_evidence_bindings', count(*)::bigint, min(observed_at), max(created_at)
         FROM v52_condition_evidence_bindings
       UNION ALL SELECT 'handoverEvidence', 'v52_condition_confirmation_bindings', count(*)::bigint, min(confirmed_at), max(created_at)
         FROM v52_condition_confirmation_bindings
       UNION ALL SELECT 'handoverEvidence', 'v52_confirmation_challenge_bindings', count(*)::bigint, min(issued_at), max(created_at)
         FROM v52_confirmation_challenge_bindings
       UNION ALL SELECT 'handoverEvidence', 'v52_confirmation_verification_events', count(*)::bigint, min(verified_at), max(created_at)
         FROM v52_confirmation_verification_events
       UNION ALL SELECT 'handoverEvidence', 'v52_actual_loss_statement_evidence', count(*)::bigint, min(created_at), max(created_at)
         FROM v52_actual_loss_statement_evidence
       UNION ALL SELECT 'moderation', 'reports', count(*)::bigint, min(created_at), max(updated_at) FROM reports
       UNION ALL SELECT 'moderation', 'report_evidence', count(*)::bigint, min(created_at), max(created_at) FROM report_evidence
       UNION ALL SELECT 'moderation', 'moderation_case_events', count(*)::bigint, min(created_at), max(created_at) FROM moderation_case_events
       UNION ALL SELECT 'moderation', 'moderation_actions', count(*)::bigint, min(created_at), max(created_at) FROM moderation_actions
       UNION ALL SELECT 'moderation', 'user_suspensions', count(*)::bigint, min(created_at), max(created_at) FROM user_suspensions
       UNION ALL SELECT 'moderation', 'moderation_account_suspension_proposals', count(*)::bigint, min(created_at), max(updated_at) FROM moderation_account_suspension_proposals
       UNION ALL SELECT 'moderation', 'private_marketplace_review_events', count(*)::bigint, min(created_at), max(created_at) FROM private_marketplace_review_events
       UNION ALL SELECT 'moderation', 'moderation_decisions', count(*)::bigint, min(created_at), max(created_at) FROM moderation_decisions
       UNION ALL SELECT 'moderation', 'moderation_statements_of_reasons', count(*)::bigint, min(created_at), max(published_at) FROM moderation_statements_of_reasons
       UNION ALL SELECT 'moderation', 'moderation_review_requests', count(*)::bigint, min(submitted_at), max(updated_at) FROM moderation_review_requests
       UNION ALL SELECT 'moderation', 'moderation_review_events', count(*)::bigint, min(created_at), max(created_at) FROM moderation_review_events
       UNION ALL SELECT 'moderation', 'moderation_review_resolutions', count(*)::bigint, min(created_at), max(communicated_at) FROM moderation_review_resolutions
       UNION ALL SELECT 'moderation', 'v52_return_cases', count(*)::bigint, min(t1), max(created_at) FROM v52_return_cases
       UNION ALL SELECT 'moderation', 'v52_return_case_evidence', count(*)::bigint, min(created_at), max(created_at) FROM v52_return_case_evidence
       UNION ALL SELECT 'moderation', 'v52_return_case_events', count(*)::bigint, min(occurred_at), max(created_at) FROM v52_return_case_events
       UNION ALL SELECT 'moderation', 'support_decisions', count(*)::bigint, min(decided_at), max(COALESCE(communicated_at, decided_at)) FROM support_decisions
       UNION ALL SELECT 'moderation', 'support_evidence', count(*)::bigint, min(received_at), max(received_at) FROM support_evidence
       UNION ALL SELECT 'moderation', 'support_evidence_files', count(*)::bigint, min(created_at), max(COALESCE(scanned_at, created_at)) FROM support_evidence_files
       UNION ALL SELECT 'moderation', 'support_appeals', count(*)::bigint, min(submitted_at), max(COALESCE(communicated_at, submitted_at)) FROM support_appeals
       UNION ALL SELECT 'securityAudit', 'audit_log', count(*)::bigint, min(created_at), max(created_at) FROM audit_log
       UNION ALL SELECT 'securityAudit', 'support_case_events', count(*)::bigint, min(created_at), max(created_at) FROM support_case_events
       UNION ALL SELECT 'securityAudit', 'support_policy_snapshots', count(*)::bigint, min(created_at), max(created_at) FROM support_policy_snapshots
       UNION ALL SELECT 'securityAudit', 'support_break_glass_grants', count(*)::bigint, min(created_at), max(COALESCE(reviewed_at, last_used_at, created_at)) FROM support_break_glass_grants
       UNION ALL SELECT 'securityAudit', 'support_evidence_access_grants', count(*)::bigint, min(created_at), max(COALESCE(last_used_at, expires_at)) FROM support_evidence_access_grants
       UNION ALL SELECT 'securityAudit', 'support_safety_impact_reviews', count(*)::bigint, min(created_at), max(created_at) FROM support_safety_impact_reviews
       UNION ALL SELECT 'securityAudit', 'support_article18_assessments', count(*)::bigint, min(created_at), max(created_at) FROM support_article18_assessments
       UNION ALL SELECT 'securityAudit', 'support_deadline_watchdog_state', count(*)::bigint, min(last_started_at), max(updated_at) FROM support_deadline_watchdog_state
       UNION ALL SELECT 'securityAudit', 'booking_events', count(*)::bigint, min(created_at), max(created_at) FROM booking_events
       UNION ALL SELECT 'securityAudit', 'booking_group_state_events', count(*)::bigint, min(created_at), max(created_at) FROM booking_group_state_events
       UNION ALL SELECT 'securityAudit', 'booking_group_commands', count(*)::bigint, min(created_at), max(COALESCE(completed_at, created_at)) FROM booking_group_commands
       UNION ALL SELECT 'securityAudit', 'booking_group_appointment_commands', count(*)::bigint, min(created_at), max(COALESCE(completed_at, created_at)) FROM booking_group_appointment_commands
       UNION ALL SELECT 'securityAudit', 'notification_delivery_attempts', count(*)::bigint, min(created_at), max(created_at)
         FROM notification_delivery_attempts
       UNION ALL SELECT 'securityAudit', 'auth_action_tokens', count(*)::bigint, min(created_at), max(COALESCE(consumed_at, expires_at, created_at)) FROM auth_action_tokens
       UNION ALL SELECT 'securityAudit', 'auth_sessions', count(*)::bigint, min(created_at), max(last_seen_at) FROM auth_sessions
       UNION ALL SELECT 'securityAudit', 'compliance_reserve_attestations', count(*)::bigint, min(recorded_at), max(recorded_at) FROM compliance_reserve_attestations
       UNION ALL SELECT 'securityAudit', 'compliance_professional_review_incidents', count(*)::bigint, min(recorded_at), max(recorded_at) FROM compliance_professional_review_incidents
       UNION ALL SELECT 'legalHold', 'account_legal_holds', count(*)::bigint, min(created_at), max(COALESCE(released_at, created_at))
         FROM account_legal_holds
     )
     SELECT category, dataset, row_count, oldest_at, newest_at
     FROM inventory ORDER BY category, dataset`,
  );
  const categories = shapeRows(result.rows);
  const totalRows = categories.reduce((sum, category) => sum + category.totalRows, 0);
  await client.query(
    `INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, 'privacy.retention_inventory_viewed', 'privacy', 'retention-inventory', $3::jsonb)`,
    [actor.id, actor.role, JSON.stringify({
      categoryCount: categories.length,
      datasetCount: categories.reduce((sum, category) => sum + category.datasets.length, 0),
      totalRows,
      executionEnabled: false,
    })],
  );
  return {
    status: 'policy-open-inventory-only',
    generatedAt: new Date().toISOString(),
    containsIdentifiers: false,
    executionEnabled: false,
    retentionPeriodsApplied: false,
    eligibleRowsCalculated: false,
    categories,
  };
}
