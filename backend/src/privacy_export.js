function rows(client, sql, userId) {
  return async () => {
    const result = await client.query(sql, [userId]);
    return result.rows;
  };
}

async function runInOrder(operations) {
  const results = [];
  for (const operation of operations) {
    results.push(await operation());
  }
  return results;
}

const locationShareMarker = 'LOCATION_SHARE|';
const thirdPartyLocationPlaceholder =
  'LOCATION_SHARE|THIRD_PARTY_EXACT_LOCATION_OMITTED';

export function minimizeThirdPartyStructuredLocations(messages) {
  let omittedCount = 0;
  const minimized = messages.map((message) => {
    if (message.sent_by_me === true || typeof message.body !== 'string') return message;
    const markerIndex = message.body.indexOf(locationShareMarker);
    if (markerIndex < 0) return message;
    omittedCount += 1;
    const prefix = message.body.slice(0, markerIndex).trimEnd();
    return {
      ...message,
      body: `${prefix ? `${prefix}\n` : ''}${thirdPartyLocationPlaceholder}`,
    };
  });
  return Object.freeze({ messages: minimized, omittedCount });
}

export async function buildAccountExport(client, userId) {
  const accountResult = await client.query(
    `SELECT id, email, profile, role, account_status, phone_e164,
            email_verified_at, phone_verified_at, terms_accepted_at,
            privacy_accepted_at, minimum_age_confirmed_at,
            private_use_confirmed_at, private_marketplace_review_status,
            created_at, updated_at, password_changed_at
     FROM users WHERE id = $1`,
    [userId],
  );

  const account = accountResult.rows[0];
  if (!account) return null;

  const [
    sessions,
    identities,
    pushDevices,
    listings,
    listingSets,
    listingSetVersions,
    listingSetVersionMembers,
    bookings,
    bookingQuotes,
    bookingGroups,
    bookingGroupPositions,
    bookingGroupQuotes,
    bookingGroupQuotePositions,
    bookingGroupStateEvents,
    bookingGroupCommands,
    bookingGroupPositionBindings,
    bookingGroupAppointments,
    bookingGroupAppointmentCommands,
    rentalCarts,
    rentalCartProjects,
    rentalCartItems,
    platformContracts,
    platformContractDeclarations,
    platformContractReceipts,
    platformContractReceiptEvents,
    withdrawals,
    withdrawalRefundObligations,
    withdrawalRefundObligationEvents,
    cancellationRefundObligations,
    actualLossCases,
    actualLossStatements,
    actualLossResolutions,
    actualLossRefundResolutionEvents,
    actualLossReceipts,
    actualLossReceiptEvents,
    withdrawalReceipts,
    withdrawalReceiptEvents,
    messageThreads,
    messages,
    uploads,
    bookingConditionEvidence,
    bookingConditionConfirmations,
    v52ConditionEvidenceBindings,
    v52ConditionConfirmationBindings,
    v52ConfirmationChallengeBindings,
    v52ConfirmationVerificationEvents,
    v52ReturnCases,
    v52ReturnCaseEvidence,
    v52ReturnCaseEvents,
    supportCases,
    supportDuplicateCaseLinks,
    supportPrivacyRightsRequests,
    supportPrivacyIdentityVerifications,
    supportPrivacyDeadlineExtensions,
    supportPrivacyIncidents,
    supportDsaNoticeLocatorAmendments,
    supportCaseEvents,
    supportBreakGlassAccess,
    supportMessages,
    supportProgressUpdates,
    supportLegacyImports,
    supportLegacyHistory,
    supportDecisions,
    supportAppeals,
    supportEvidence,
    supportEvidenceFiles,
    notificationPreferences,
    notifications,
    reviews,
    reports,
    privateMarketplaceReviewEvents,
    accountSuspensionProposals,
    moderationDecisions,
    moderationReviewRequests,
    blocks,
    payments,
    refunds,
    payouts,
    financialDocuments,
    financialDocumentEvents,
    depositMandates,
    depositCharges,
    disputes,
    disputeTransferRecoveries,
    auditEvents,
  ] = await runInOrder([
    rows(client,
      `SELECT id, device_label, user_agent, host(ip_address) AS ip_address,
              created_at, last_seen_at, revoked_at, revoked_reason
       FROM auth_sessions WHERE user_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT provider, provider_subject, firebase_user_id, email_at_link, email_verified,
              created_at, last_login_at
       FROM auth_identities WHERE user_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT id, platform, locale, enabled, created_at, last_seen_at
       FROM push_devices WHERE user_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT id, payload, status, is_active, currency, price_per_day_minor,
              security_deposit_minor, moderation_status,
              moderation_reason_code, private_status_confirmed_at,
              private_pilot_region_code, created_at, updated_at
       FROM listings WHERE owner_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT id, schema_version, created_at
         FROM listing_sets WHERE owner_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT version.id, version.listing_set_id, version.revision,
              version.set_kind, version.title, version.status,
              version.currency, version.country_code, version.member_count,
              version.required_member_count, version.membership_hash,
              version.created_at
         FROM listing_set_versions AS version
         JOIN listing_sets AS listing_set ON listing_set.id = version.listing_set_id
        WHERE listing_set.owner_id = $1
        ORDER BY version.listing_set_id, version.revision`, userId),
    rows(client,
      `SELECT member.id, member.listing_set_id,
              member.listing_set_version_id, member.listing_id,
              member.member_role, member.sort_order, member.category_id,
              member.subcategory, member.currency, member.country_code,
              member.handover_location_key, member.created_at
         FROM listing_set_version_members AS member
         JOIN listing_sets AS listing_set ON listing_set.id = member.listing_set_id
        WHERE listing_set.owner_id = $1
        ORDER BY member.listing_set_id, member.listing_set_version_id,
                 member.sort_order`, userId),
    rows(client,
      `SELECT id, listing_id,
              CASE WHEN owner_id = $1 THEN 'owner' ELSE 'renter' END AS my_role,
              status, starts_at, ends_at, currency, rental_subtotal_minor,
              platform_fee_minor, owner_payout_minor, quoted_total_minor,
              security_deposit_minor, created_at, updated_at
       FROM bookings WHERE owner_id = $1 OR renter_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT id, listing_id, rental_start_date, rental_end_date,
              rental_timezone, catalog_revision, availability_revision,
              quote_version, currency, total_minor, quote_payload,
              quote_hash, issued_at, expires_at
       FROM booking_quotes WHERE renter_id = $1 ORDER BY issued_at`, userId),
    rows(client,
      `SELECT id,
              CASE WHEN owner_id = $1 THEN 'owner' ELSE 'renter' END AS my_role,
              marketplace_context, country_code, currency,
              rental_start_date, rental_end_date, rental_timezone,
              starts_at, ends_at, handover_location_key,
              handover_policy_version, legal_document_set_version,
              cancellation_policy_version, payment_configuration_key,
              compatibility_hash, created_at
         FROM booking_groups
        WHERE owner_id = $1 OR renter_id = $1
        ORDER BY created_at`, userId),
    rows(client,
      `SELECT position.id, position.booking_group_id, position.listing_id,
              position.booking_id, position.quote_id, position.quote_hash,
              position.currency, position.rental_subtotal_minor,
              position.platform_fee_minor, position.total_minor,
              position.owner_payout_minor, position.security_deposit_minor,
              position.sort_order, position.created_at
         FROM booking_group_positions AS position
         JOIN booking_groups AS booking_group
           ON booking_group.id = position.booking_group_id
        WHERE booking_group.owner_id = $1 OR booking_group.renter_id = $1
        ORDER BY position.booking_group_id, position.sort_order`, userId),
    rows(client,
      `SELECT quote.id, quote.booking_group_id, quote.quote_revision,
              quote.predecessor_quote_id, quote.proposal_kind,
              (quote.proposed_by_id = $1) AS proposed_by_me,
              quote.proposed_by_role, quote.item_count, quote.currency,
              quote.rental_subtotal_minor, quote.platform_fee_minor,
              quote.total_minor, quote.owner_payout_minor,
              quote.security_deposit_minor, quote.quote_hash,
              quote.issued_at, quote.expires_at
         FROM booking_group_quotes AS quote
         JOIN booking_groups AS booking_group ON booking_group.id = quote.booking_group_id
        WHERE booking_group.owner_id = $1 OR booking_group.renter_id = $1
        ORDER BY quote.booking_group_id, quote.quote_revision`, userId),
    rows(client,
      `SELECT position.id, position.group_quote_id,
              position.booking_group_id, position.group_position_id,
              position.listing_id, position.booking_quote_id,
              position.booking_quote_hash, position.currency,
              position.rental_subtotal_minor, position.platform_fee_minor,
              position.total_minor, position.owner_payout_minor,
              position.security_deposit_minor, position.sort_order,
              position.created_at
         FROM booking_group_quote_positions AS position
         JOIN booking_groups AS booking_group
           ON booking_group.id = position.booking_group_id
        WHERE booking_group.owner_id = $1 OR booking_group.renter_id = $1
        ORDER BY position.booking_group_id, position.group_quote_id, position.sort_order`, userId),
    rows(client,
      `SELECT event.id, event.booking_group_id, event.event_sequence,
              (event.actor_id = $1) AS acted_by_me,
              event.actor_group_role, event.event_type,
              event.from_state, event.to_state, event.group_quote_id,
              event.group_quote_hash, event.metadata, event.created_at
         FROM booking_group_state_events AS event
         JOIN booking_groups AS booking_group
           ON booking_group.id = event.booking_group_id
        WHERE booking_group.owner_id = $1 OR booking_group.renter_id = $1
        ORDER BY event.booking_group_id, event.event_sequence`, userId),
    rows(client,
      `SELECT command.idempotency_key, command.booking_group_id,
              (command.actor_id = $1) AS acted_by_me,
              command.command_type, command.request_hash,
              command.response_payload, command.created_at, command.completed_at
         FROM booking_group_commands AS command
         JOIN booking_groups AS booking_group
           ON booking_group.id = command.booking_group_id
        WHERE booking_group.owner_id = $1 OR booking_group.renter_id = $1
        ORDER BY command.created_at`, userId),
    rows(client,
      `SELECT binding.id, binding.booking_group_id, binding.group_quote_id,
              binding.group_quote_hash, binding.group_quote_position_id,
              binding.group_position_id, binding.listing_id, binding.booking_id,
              binding.platform_contract_id, binding.booking_quote_id,
              binding.booking_quote_hash,
              (binding.bound_by_id = $1) AS bound_by_me, binding.created_at
         FROM booking_group_position_booking_bindings AS binding
         JOIN booking_groups AS booking_group
           ON booking_group.id = binding.booking_group_id
        WHERE booking_group.owner_id = $1 OR booking_group.renter_id = $1
        ORDER BY binding.created_at`, userId),
    rows(client,
      `SELECT appointment.id, appointment.booking_group_id,
              appointment.group_quote_id, appointment.group_quote_hash,
              appointment.appointment_type, appointment.scheduled_at,
              appointment.rental_timezone, appointment.handover_location_key,
              appointment.evidence_policy, appointment.chat_policy,
              appointment.timer_policy, appointment.address_policy,
              (appointment.created_by_id = $1) AS created_by_me,
              appointment.created_at
         FROM booking_group_appointments AS appointment
         JOIN booking_groups AS booking_group
           ON booking_group.id = appointment.booking_group_id
        WHERE booking_group.owner_id = $1 OR booking_group.renter_id = $1
        ORDER BY appointment.booking_group_id, appointment.scheduled_at`, userId),
    rows(client,
      `SELECT command.idempotency_key, command.booking_group_id,
              (command.actor_id = $1) AS acted_by_me,
              command.command_type, command.request_hash,
              command.response_payload, command.created_at, command.completed_at
         FROM booking_group_appointment_commands AS command
         JOIN booking_groups AS booking_group
           ON booking_group.id = command.booking_group_id
        WHERE booking_group.owner_id = $1 OR booking_group.renter_id = $1
        ORDER BY command.created_at`, userId),
    rows(client,
      `SELECT id, schema_version, revision, created_at, updated_at
         FROM rental_carts WHERE user_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT project.id, project.client_project_id, project.title,
              project.answers, project.sort_order,
              project.created_at, project.updated_at
         FROM rental_cart_projects AS project
         JOIN rental_carts AS cart ON cart.id = project.cart_id
        WHERE cart.user_id = $1
        ORDER BY project.sort_order, project.created_at`, userId),
    rows(client,
      `SELECT item.id, item.client_item_id, item.listing_id,
              project.client_project_id,
              item.rental_start_date, item.rental_end_date,
              item.quote_id, item.quote_hash, item.quote_payload,
              item.quote_status, item.quote_error_code,
              item.quote_rechecked_at, item.sort_order,
              item.created_at, item.updated_at
         FROM rental_cart_items AS item
         JOIN rental_carts AS cart ON cart.id = item.cart_id
         LEFT JOIN rental_cart_projects AS project ON project.id = item.project_id
        WHERE cart.user_id = $1
        ORDER BY item.sort_order, item.created_at`, userId),
    rows(client,
      `SELECT contract.id, contract.booking_id, contract.quote_id,
              contract.quote_hash, contract.contract_version, contract.locale,
              contract.client_build, contract.accepted_at, contract.created_at,
              contract.sit_acceptance_wording,
              contract.sit_acceptance_sha256,
              platform_terms.content_sha256 AS platform_terms_sha256,
              private_terms.content_sha256 AS private_rental_terms_sha256,
              cancellation_refund.content_sha256 AS cancellation_refund_sha256,
              handover_return_damage.content_sha256 AS handover_return_damage_sha256,
              payment_payout.content_sha256 AS payment_payout_sha256,
              community_safety.content_sha256 AS community_safety_sha256,
              reporting_moderation.content_sha256 AS reporting_moderation_review_sha256,
              privacy.content_sha256 AS privacy_sha256,
              imprint_withdrawal.content_sha256 AS imprint_withdrawal_shorttexts_sha256
       FROM platform_contracts AS contract
       JOIN legal_document_snapshots AS platform_terms
         ON platform_terms.id = contract.platform_terms_snapshot_id
       JOIN legal_document_snapshots AS private_terms
         ON private_terms.id = contract.private_rental_terms_snapshot_id
       LEFT JOIN legal_document_snapshots AS cancellation_refund
         ON cancellation_refund.id = contract.cancellation_refund_snapshot_id
       LEFT JOIN legal_document_snapshots AS handover_return_damage
         ON handover_return_damage.id = contract.handover_return_damage_snapshot_id
       LEFT JOIN legal_document_snapshots AS payment_payout
         ON payment_payout.id = contract.payment_payout_snapshot_id
       LEFT JOIN legal_document_snapshots AS community_safety
         ON community_safety.id = contract.community_safety_snapshot_id
       LEFT JOIN legal_document_snapshots AS reporting_moderation
         ON reporting_moderation.id = contract.reporting_moderation_review_snapshot_id
       LEFT JOIN legal_document_snapshots AS privacy
         ON privacy.id = contract.privacy_snapshot_id
       LEFT JOIN legal_document_snapshots AS imprint_withdrawal
         ON imprint_withdrawal.id = contract.imprint_withdrawal_shorttexts_snapshot_id
       WHERE contract.user_id = $1 ORDER BY contract.accepted_at`, userId),
    rows(client,
      `SELECT declaration.id, declaration.contract_id,
              declaration.declaration_type, declaration.exact_wording,
              declaration.wording_sha256, declaration.accepted_at,
              declaration.user_id, declaration.booking_id,
              declaration.document_version, declaration.locale,
              declaration.client_build, declaration.quote_id,
              declaration.quote_hash, declaration.document_references,
              declaration.created_at
       FROM platform_contract_declarations AS declaration
       JOIN platform_contracts AS contract ON contract.id = declaration.contract_id
       WHERE contract.user_id = $1 ORDER BY declaration.accepted_at`, userId),
    rows(client,
      `SELECT receipt.id, receipt.contract_id, receipt.artifact_format,
              receipt.content_html, receipt.artifact_sha256,
              receipt.generated_at, receipt.created_at
       FROM platform_contract_receipts AS receipt
       JOIN platform_contracts AS contract ON contract.id = receipt.contract_id
       WHERE contract.user_id = $1 ORDER BY receipt.generated_at`, userId),
    rows(client,
      `SELECT event.id, event.contract_id, event.event_type,
              event.artifact_format, event.artifact_sha256,
              event.artifact_reference, event.delivery_channel,
              event.occurred_at, event.metadata
       FROM platform_contract_receipt_events AS event
       JOIN platform_contracts AS contract ON contract.id = event.contract_id
       WHERE contract.user_id = $1 ORDER BY event.occurred_at`, userId),
    rows(client,
      `SELECT id, scope, platform_contract_id, booking_id, actor_name,
              electronic_channel, effect_phase, effect_status,
              eligibility_status, right_expires_at,
              submitted_at, created_at
       FROM v51_withdrawals WHERE user_id = $1 ORDER BY submitted_at`, userId),
    rows(client,
      `SELECT obligation.id, obligation.withdrawal_id, obligation.booking_id,
              obligation.refund_type, obligation.debtor_role,
              obligation.currency, obligation.status,
              obligation.amount_due_minor, obligation.maximum_minor,
              obligation.calculation_basis, obligation.created_at
       FROM v51_refund_obligations AS obligation
       JOIN v51_withdrawals AS withdrawal ON withdrawal.id = obligation.withdrawal_id
       WHERE withdrawal.user_id = $1 ORDER BY obligation.created_at`, userId),
    rows(client,
      `SELECT event.id, event.obligation_id, obligation.withdrawal_id,
              event.event_type, event.amount_due_minor,
              event.calculation_basis, event.occurred_at
       FROM v51_refund_obligation_events AS event
       JOIN v51_refund_obligations AS obligation
         ON obligation.id = event.obligation_id
       JOIN v51_withdrawals AS withdrawal
         ON withdrawal.id = obligation.withdrawal_id
       WHERE withdrawal.user_id = $1 ORDER BY event.occurred_at`, userId),
    rows(client,
      `SELECT obligation.id, obligation.booking_id, obligation.refund_type,
              obligation.debtor_role, obligation.currency, obligation.status,
              obligation.amount_due_minor, obligation.maximum_minor,
              obligation.calculation_basis, obligation.created_at
       FROM v51_cancellation_refund_obligations AS obligation
       JOIN bookings AS booking ON booking.id = obligation.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY obligation.created_at`, userId),
    rows(client,
      `SELECT loss_case.id, loss_case.booking_id, loss_case.cause,
              loss_case.contract_version, loss_case.locale,
              loss_case.quote_id, loss_case.quote_hash,
              loss_case.rental_subtotal_minor, loss_case.platform_fee_minor,
              loss_case.currency, loss_case.opened_at, loss_case.created_at
       FROM v52_actual_loss_cases AS loss_case
       JOIN bookings AS booking ON booking.id = loss_case.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY loss_case.opened_at`, userId),
    rows(client,
      `SELECT statement.id, statement.case_id, statement.actor_role,
              statement.statement_type, statement.owner_claimed_loss_minor,
              statement.saved_expense_minor, statement.replacement_rental_minor,
              statement.proven_lower_loss_minor, statement.evidence_references,
              statement.statement_text, statement.submitted_at
       FROM v52_actual_loss_statements AS statement
       JOIN v52_actual_loss_cases AS loss_case ON loss_case.id = statement.case_id
       JOIN bookings AS booking ON booking.id = loss_case.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY statement.submitted_at`, userId),
    rows(client,
      `SELECT resolution.id, resolution.case_id,
              resolution.renter_lower_loss_accepted, resolution.reason_code,
              resolution.calculation_basis, resolution.rent_refund_minor,
              resolution.rent_retained_minor, resolution.sit_fee_refund_minor,
              resolution.sit_fee_retained_minor, resolution.resolved_at
       FROM v52_actual_loss_resolutions AS resolution
       JOIN v52_actual_loss_cases AS loss_case ON loss_case.id = resolution.case_id
       JOIN bookings AS booking ON booking.id = loss_case.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY resolution.resolved_at`, userId),
    rows(client,
      `SELECT event.id, event.resolution_id, event.refund_type,
              event.debtor_role, event.amount_due_minor,
              event.calculation_basis, event.occurred_at
       FROM v52_cancellation_refund_resolution_events AS event
       JOIN v52_actual_loss_resolutions AS resolution
         ON resolution.id = event.resolution_id
       JOIN v52_actual_loss_cases AS loss_case ON loss_case.id = resolution.case_id
       JOIN bookings AS booking ON booking.id = loss_case.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY event.occurred_at`, userId),
    rows(client,
      `SELECT receipt.id, receipt.resolution_id, receipt.artifact_format,
              receipt.content_html, receipt.artifact_sha256,
              receipt.generated_at, receipt.created_at
       FROM v52_actual_loss_receipts AS receipt
       JOIN v52_actual_loss_resolutions AS resolution
         ON resolution.id = receipt.resolution_id
       JOIN v52_actual_loss_cases AS loss_case ON loss_case.id = resolution.case_id
       JOIN bookings AS booking ON booking.id = loss_case.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY receipt.generated_at`, userId),
    rows(client,
      `SELECT event.id, event.resolution_id, event.event_type,
              event.artifact_sha256, event.occurred_at, event.metadata
       FROM v52_actual_loss_receipt_events AS event
       JOIN v52_actual_loss_resolutions AS resolution
         ON resolution.id = event.resolution_id
       JOIN v52_actual_loss_cases AS loss_case ON loss_case.id = resolution.case_id
       JOIN bookings AS booking ON booking.id = loss_case.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY event.occurred_at`, userId),
    rows(client,
      `SELECT receipt.id, receipt.withdrawal_id, receipt.artifact_format,
              receipt.content_html, receipt.artifact_sha256,
              receipt.generated_at, receipt.created_at
       FROM v51_withdrawal_receipts AS receipt
       JOIN v51_withdrawals AS withdrawal ON withdrawal.id = receipt.withdrawal_id
       WHERE withdrawal.user_id = $1 ORDER BY receipt.generated_at`, userId),
    rows(client,
      `SELECT event.id, event.withdrawal_id, event.event_type,
              event.artifact_sha256, event.delivery_channel,
              event.occurred_at, event.metadata
       FROM v51_withdrawal_receipt_events AS event
       JOIN v51_withdrawals AS withdrawal ON withdrawal.id = event.withdrawal_id
       WHERE withdrawal.user_id = $1 ORDER BY event.occurred_at`, userId),
    rows(client,
      `SELECT id, booking_id, item_id, archived_for, created_at,
              last_message_at, updated_at
       FROM message_threads
       WHERE user1_id = $1 OR user2_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT message.id, message.thread_id,
              (message.sender_id = $1) AS sent_by_me,
              message.sender_type, message.body, message.attachments,
              message.created_at
       FROM messages AS message
       JOIN message_threads AS thread ON thread.id = message.thread_id
       WHERE thread.user1_id = $1 OR thread.user2_id = $1
       ORDER BY message.created_at`, userId),
    rows(client,
      `SELECT id, purpose, visibility, listing_id, thread_id, mime_type,
              byte_size, image_width, image_height, content_sha256,
              content_scan_status, created_at
       FROM uploads WHERE owner_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT evidence.id, evidence.booking_id, evidence.segment,
              evidence.evidence_kind, evidence.actor_role,
              evidence.upload_id, evidence.message_id, evidence.source,
              evidence.created_at
       FROM booking_condition_evidence AS evidence
       JOIN bookings AS booking ON booking.id = evidence.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY evidence.created_at`, userId),
    rows(client,
      `SELECT confirmation.id, confirmation.booking_id,
              confirmation.segment, confirmation.verifier_role,
              confirmation.decision, confirmation.presenter_photo_count,
              confirmation.deviation_photo_count, confirmation.created_at
       FROM booking_condition_confirmations AS confirmation
       JOIN bookings AS booking ON booking.id = confirmation.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY confirmation.created_at`, userId),
    rows(client,
      `SELECT binding.evidence_id, binding.booking_id,
              binding.platform_contract_id,
              binding.handover_return_damage_snapshot_id,
              binding.quote_id, binding.quote_hash, binding.contract_version,
              binding.locale, binding.segment, binding.evidence_kind,
              binding.semantic_slot, binding.actor_role,
              (binding.actor_id = $1) AS recorded_by_me,
              binding.upload_id, binding.upload_purpose,
              binding.upload_sha256, binding.source,
              binding.observed_at, binding.created_at
       FROM v52_condition_evidence_bindings AS binding
       JOIN bookings AS booking ON booking.id = binding.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY binding.created_at`, userId),
    rows(client,
      `SELECT binding.confirmation_id, binding.booking_id,
              binding.platform_contract_id,
              binding.handover_return_damage_snapshot_id,
              binding.quote_id, binding.quote_hash, binding.contract_version,
              binding.locale, binding.segment, binding.verifier_role,
              (binding.verifier_user_id = $1) AS verified_by_me,
              binding.decision, binding.presenter_evidence_set_sha256,
              binding.presenter_photo_count, binding.deviation_photo_count,
              binding.confirmed_at, binding.created_at
       FROM v52_condition_confirmation_bindings AS binding
       JOIN bookings AS booking ON booking.id = binding.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY binding.confirmed_at`, userId),
    rows(client,
      `SELECT binding.challenge_id, binding.booking_id,
              binding.platform_contract_id,
              binding.handover_return_damage_snapshot_id,
              binding.quote_id, binding.quote_hash, binding.contract_version,
              binding.locale, binding.segment, binding.presenter_role,
              (binding.presenter_user_id = $1) AS presented_by_me,
              binding.presenter_evidence_set_sha256,
              binding.issued_at, binding.created_at
       FROM v52_confirmation_challenge_bindings AS binding
       JOIN bookings AS booking ON booking.id = binding.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY binding.issued_at`, userId),
    rows(client,
      `SELECT event.id, event.challenge_id, event.confirmation_id,
              event.booking_id,
              (event.verifier_user_id = $1) AS verified_by_me,
              event.verifier_role, event.presenter_evidence_set_sha256,
              event.verification_method, event.verified_at, event.created_at
       FROM v52_confirmation_verification_events AS event
       JOIN bookings AS booking ON booking.id = event.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY event.verified_at`, userId),
    rows(client,
      `SELECT return_case.id, return_case.booking_case_id,
              return_case.report_id, return_case.booking_id,
              return_case.platform_contract_id,
              return_case.handover_return_damage_snapshot_id,
              return_case.quote_id, return_case.quote_hash,
              return_case.contract_version, return_case.locale,
              (return_case.opened_by = $1) AS opened_by_me,
              return_case.opened_by_role, return_case.reason_code,
              return_case.reason_details, return_case.t0, return_case.t1,
              return_case.report_deadline, return_case.response_due_at,
              return_case.next_status_update_due_at,
              return_case.deadline_timezone,
              return_case.deadline_policy_version,
              return_case.authorized_booking_minor,
              return_case.contested_authorized_minor,
              return_case.undisputed_releasable_minor,
              return_case.additional_charge_minor, return_case.created_at
       FROM v52_return_cases AS return_case
       JOIN bookings AS booking ON booking.id = return_case.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY return_case.t1`, userId),
    rows(client,
      `SELECT evidence.return_case_id, evidence.upload_id,
              evidence.upload_purpose, evidence.upload_sha256,
              evidence.created_at
       FROM v52_return_case_evidence AS evidence
       JOIN v52_return_cases AS return_case ON return_case.id = evidence.return_case_id
       JOIN bookings AS booking ON booking.id = return_case.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY evidence.created_at`, userId),
    rows(client,
      `SELECT event.id, event.return_case_id,
              (event.actor_id = $1) AS acted_by_me,
              event.actor_role, event.event_type, event.occurred_at,
              event.metadata, event.created_at
       FROM v52_return_case_events AS event
       JOIN v52_return_cases AS return_case ON return_case.id = event.return_case_id
       JOIN bookings AS booking ON booking.id = return_case.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY event.occurred_at`, userId),
    rows(client,
      `SELECT support_case.id, support_case.human_readable_case_number,
              support_case.case_type, support_case.case_subtype,
              CASE WHEN support_case.reporter_user_id = $1
                THEN support_case.dsa_notice_number ELSE NULL
              END AS dsa_notice_number,
              CASE WHEN support_case.reporter_user_id = $1
                THEN support_case.dsa_notice_evidence ELSE NULL
              END AS dsa_notice_evidence,
              CASE WHEN support_case.reporter_user_id = $1
                THEN support_case.dsa_notice_locator_status ELSE NULL
              END AS dsa_notice_locator_status,
              CASE WHEN support_case.reporter_user_id = $1
                THEN support_case.product_safety_notice_number ELSE NULL
              END AS product_safety_notice_number,
              CASE WHEN support_case.reporter_user_id = $1
                THEN support_case.product_safety_evidence ELSE NULL
              END AS product_safety_evidence,
              CASE WHEN support_case.reporter_user_id = $1
                THEN support_case.product_safety_triage_due_at ELSE NULL
              END AS product_safety_triage_due_at,
              CASE WHEN support_case.reporter_user_id = $1
                THEN support_case.feedback_context ELSE NULL
              END AS feedback_context,
              support_case.status, support_case.priority,
              support_case.source_channel, support_case.operating_mode,
              support_case.locale, support_case.linked_booking_id,
              support_case.linked_listing_id, support_case.waiting_on,
              support_case.next_action, support_case.next_update_at,
              support_case.user_facing_summary,
              support_case.appeal_available, support_case.appeal_deadline,
              support_case.appeal_configured_at,
              support_case.closure_reason, support_case.created_at,
              support_case.updated_at, support_case.resolved_at,
              support_case.closed_at
         FROM support_cases AS support_case
        WHERE support_case.reporter_user_id = $1
           OR $1 = ANY(support_case.affected_user_ids)
        ORDER BY support_case.created_at`, userId),
    rows(client,
      `SELECT duplicate_case.human_readable_case_number AS duplicate_case_number,
              leading_case.human_readable_case_number AS leading_case_number,
              link.relation_type, link.snapshot_sha256, link.created_at
         FROM support_case_links AS link
         JOIN support_cases AS duplicate_case ON duplicate_case.id = link.case_id
         JOIN support_cases AS leading_case ON leading_case.id = link.object_id
        WHERE duplicate_case.reporter_user_id = $1
           OR $1 = ANY(duplicate_case.affected_user_ids)
        ORDER BY link.created_at, link.id`, userId),
    rows(client,
      `SELECT privacy_request.id, privacy_request.case_id,
              privacy_request.request_version, privacy_request.request_kind,
              privacy_request.identity_status,
              privacy_request.identity_verified_at,
              privacy_request.processing_status,
              privacy_request.received_at,
              privacy_request.first_response_due_at,
              privacy_request.response_due_at,
              privacy_request.deadline_policy_version,
              privacy_request.extension_count,
              privacy_request.completed_at,
              privacy_request.created_at, privacy_request.updated_at
         FROM support_privacy_rights_requests AS privacy_request
        WHERE privacy_request.subject_user_id = $1
        ORDER BY privacy_request.received_at, privacy_request.id`, userId),
    rows(client,
      `SELECT verification.id, verification.privacy_request_id,
              verification.verification_method, verification.verified_at
         FROM support_privacy_identity_verifications AS verification
        WHERE verification.subject_user_id = $1
        ORDER BY verification.verified_at, verification.id`, userId),
    rows(client,
      `SELECT extension.id, extension.privacy_request_id,
              extension.previous_due_at, extension.extended_due_at,
              extension.user_facing_reason, extension.recorded_at
         FROM support_privacy_deadline_extensions AS extension
         JOIN support_privacy_rights_requests AS privacy_request
           ON privacy_request.id = extension.privacy_request_id
        WHERE privacy_request.subject_user_id = $1
        ORDER BY extension.recorded_at, extension.id`, userId),
    rows(client,
      `SELECT incident.id, incident.case_id, incident.incident_version,
              incident.breach_awareness_at, incident.notification_deadline_at,
              incident.reminder_at, incident.deadline_policy_version,
              incident.containment_status, incident.assessment_status,
              incident.authority_notification_status,
              incident.affected_person_notification_status,
              incident.created_at, incident.updated_at
         FROM support_privacy_incidents AS incident
         JOIN support_cases AS support_case ON support_case.id = incident.case_id
        WHERE support_case.reporter_user_id = $1
           OR $1 = ANY(support_case.affected_user_ids)
        ORDER BY incident.breach_awareness_at, incident.id`, userId),
    rows(client,
      `SELECT amendment.id, amendment.case_id,
              amendment.dsa_notice_number, amendment.content_locator,
              amendment.locator_kind, amendment.submitted_at
         FROM support_dsa_notice_locator_amendments AS amendment
        WHERE amendment.reporter_user_id = $1
        ORDER BY amendment.submitted_at, amendment.id`, userId),
    rows(client,
      `SELECT event.id, event.case_id, event.event_type,
              event.from_status, event.to_status, event.transition_reason,
              event.created_at
         FROM support_case_events AS event
         JOIN support_cases AS support_case ON support_case.id = event.case_id
        WHERE (support_case.reporter_user_id = $1
           OR $1 = ANY(support_case.affected_user_ids))
          AND event.visibility = 'user_visible'
        ORDER BY event.created_at, event.id`, userId),
    rows(client,
      `SELECT access_grant.case_id,
              'p0_emergency_case_access'::text AS access_purpose,
              access_grant.created_at, access_grant.expires_at,
              (access_grant.last_used_at IS NOT NULL) AS access_used,
              access_grant.last_used_at, access_grant.revoked_at,
              access_grant.review_status, access_grant.review_outcome,
              access_grant.reviewed_at
         FROM support_break_glass_grants AS access_grant
         JOIN support_cases AS support_case ON support_case.id = access_grant.case_id
        WHERE support_case.reporter_user_id = $1
           OR $1 = ANY(support_case.affected_user_ids)
        ORDER BY access_grant.created_at, access_grant.id`, userId),
    rows(client,
      `SELECT message.id, message.case_id, message.sender_type,
              (message.sender_id = $1) AS sent_by_me,
              (message.recipient_user_id = $1) AS addressed_to_me,
              message.message_type, message.message_title,
              message.template_id, message.template_version, message.locale,
              message.rendered_content, message.send_status,
              message.sent_at, message.delivery_status,
              message.corrects_message_id,
              message.ai_disclosure_included,
              message.human_handoff_available, message.created_at
         FROM support_messages AS message
        WHERE message.sender_id = $1
           OR (message.recipient_user_id = $1 AND message.send_status = 'sent')
        ORDER BY message.created_at, message.id`, userId),
    rows(client,
      `SELECT progress.id, progress.case_id, progress.message_id,
              progress.progress_version, progress.template_id,
              progress.prior_next_update_at,
              progress.proposed_next_update_at, progress.was_overdue,
              progress.proposal_status, progress.reviewed_at,
              progress.published_at, progress.created_at
         FROM support_case_progress_updates AS progress
         JOIN support_cases AS support_case ON support_case.id = progress.case_id
        WHERE support_case.reporter_user_id = $1
           OR $1 = ANY(support_case.affected_user_ids)
        ORDER BY progress.created_at, progress.id`, userId),
    rows(client,
      `SELECT legacy_import.id, legacy_import.case_id,
              legacy_import.source_system, legacy_import.source_thread_id,
              legacy_import.legacy_status, legacy_import.mapped_status,
              legacy_import.template_state, legacy_import.verification_state,
              legacy_import.history_entry_count,
              legacy_import.unresolved_local_timestamp_count,
              legacy_import.imported_at
         FROM support_legacy_imports AS legacy_import
        WHERE legacy_import.reporter_user_id = $1
        ORDER BY legacy_import.imported_at, legacy_import.id`, userId),
    rows(client,
      `SELECT history.id, history.case_id, history.source_message_id,
              history.sequence_number, history.sender_type,
              (history.sender_user_id = $1) AS sent_by_me,
              history.source_trust, history.rendered_content,
              history.source_timestamp_text, history.occurred_at,
              history.timestamp_interpretation, history.was_read,
              history.archived_at
         FROM support_legacy_history_entries AS history
         JOIN support_legacy_imports AS legacy_import
           ON legacy_import.id = history.import_id
        WHERE legacy_import.reporter_user_id = $1
        ORDER BY history.archived_at, history.sequence_number, history.id`, userId),
    rows(client,
      `SELECT decision.id, decision.case_id, decision.decision_code,
              decision.decision_scope, decision.measure_type,
              decision.amount_minor, decision.currency, decision.duration,
              decision.unaffected_areas, decision.user_facing_decision,
              decision.user_facing_effect, decision.user_facing_reason,
              decision.user_facing_implementation_result,
              decision.redress_route, decision.implementation_status,
              decision.decided_at, decision.implemented_at,
              decision.communicated_at
         FROM support_decisions AS decision
         JOIN support_cases AS support_case ON support_case.id = decision.case_id
        WHERE (support_case.reporter_user_id = $1
           OR $1 = ANY(support_case.affected_user_ids))
          AND decision.communicated_at IS NOT NULL
        ORDER BY decision.decided_at, decision.id`, userId),
    rows(client,
      `SELECT appeal.id, appeal.original_decision_id, appeal.case_id,
              appeal.human_readable_appeal_number, appeal.grounds,
              appeal.submitted_at, appeal.next_update_at, appeal.status,
              appeal.outcome, appeal.outcome_reason,
              appeal.communicated_at
         FROM support_appeals AS appeal
        WHERE appeal.submitted_by = $1
        ORDER BY appeal.submitted_at, appeal.id`, userId),
    rows(client,
      `SELECT evidence.id, evidence.case_id, evidence.evidence_class,
              evidence.description, evidence.purpose,
              evidence.claimed_event_time, evidence.received_at,
              evidence.linked_booking_id, evidence.linked_listing_id,
              evidence.third_party_data_flag, evidence.access_level,
              evidence.retention_category, evidence.legal_hold_flag,
              evidence.review_result, evidence.limitations
         FROM support_evidence AS evidence
        WHERE evidence.submitter_id = $1
          AND evidence.access_level = 'user_visible'
        ORDER BY evidence.received_at, evidence.id`, userId),
    rows(client,
      `SELECT evidence_file.evidence_id, evidence_file.detected_mime_type,
              evidence_file.original_byte_size,
              evidence_file.original_sha256,
              evidence_file.preview_mime_type,
              evidence_file.preview_byte_size,
              evidence_file.preview_sha256,
              evidence_file.image_width, evidence_file.image_height,
              evidence_file.scan_status, evidence_file.scan_engine,
              evidence_file.quarantine_reason_code,
              evidence_file.external_ai_used, evidence_file.created_at,
              evidence_file.scanned_at
         FROM support_evidence_files AS evidence_file
         JOIN support_evidence AS evidence ON evidence.id = evidence_file.evidence_id
        WHERE evidence.submitter_id = $1
          AND evidence.access_level = 'user_visible'
        ORDER BY evidence_file.created_at, evidence_file.id`, userId),
    rows(client,
      `SELECT in_app_enabled, email_enabled, push_enabled,
              message_push_enabled, booking_push_enabled, locale, updated_at
       FROM notification_preferences WHERE user_id = $1`, userId),
    rows(client,
      `SELECT id, category, kind, priority, title, body, entity_type,
              entity_id, booking_id, thread_id, read_at, archived_at, created_at
       FROM notifications WHERE user_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT id, booking_id, listing_id,
              CASE WHEN reviewer_id = $1 THEN 'submitted' ELSE 'received' END AS relationship,
              rating, body, direction, criteria, moderation_status,
              created_at, updated_at
       FROM reviews WHERE reviewer_id = $1 OR reviewee_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT id, target_type, target_id, reason_code, details, status,
              priority, reporter_reference, created_at, updated_at, closed_at
       FROM reports WHERE reporter_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT id, from_status, to_status, reason_code, created_at
       FROM private_marketplace_review_events
       WHERE user_id = $1 ORDER BY created_at, id`, userId),
    rows(client,
      `SELECT id, report_id, status, payload_sha256,
              payload->>'reasonCode' AS reason_code,
              (payload->>'noGuiltDetermination')::boolean AS no_guilt_determination,
              payload->>'userFacingMeasureNotice' AS user_facing_measure_notice,
              approved_at, rejected_at, created_at, updated_at
         FROM moderation_account_suspension_proposals
        WHERE user_id = $1 AND status IN ('approved', 'rejected')
        ORDER BY created_at, id`, userId),
    rows(client,
      `SELECT decision.id, decision.report_id, decision.target_type,
              decision.target_id, decision.measure_type, decision.measure_state,
              decision.measure_status, decision.no_guilt_determination,
              decision.user_facing_measure_notice,
              decision.account_suspension_proposal_id,
              decision.facts, decision.basis, decision.reasoning,
              decision.detection_method, decision.automated_means,
              decision.review_available, decision.review_deadline_at,
              statement.statement_version, statement.decision_ground,
              statement.decision_origin, statement.territorial_scope,
              statement.duration_type, statement.starts_at, statement.ends_at,
              statement.automation_role, statement.human_reviewed,
              statement.review_channel, statement.published_at,
              decision.created_at
       FROM moderation_decisions AS decision
       LEFT JOIN moderation_statements_of_reasons AS statement
         ON statement.moderation_decision_id = decision.id
       WHERE decision.recipient_user_id = $1
       ORDER BY decision.created_at, decision.id`, userId),
    rows(client,
      `SELECT request.id, request.decision_id, request.reason, request.status,
              request.submitted_at, request.updated_at,
              request.resolved_at, resolution.outcome,
              resolution.user_facing_reason,
              resolution.human_reviewed,
              resolution.independence_verified,
              resolution.automation_role,
              resolution.measure_changed,
              resolution.communicated_at
       FROM moderation_review_requests AS request
       LEFT JOIN moderation_review_resolutions AS resolution
         ON resolution.review_request_id = request.id
       WHERE request.requester_id = $1 ORDER BY request.submitted_at, request.id`, userId),
    rows(client,
      `SELECT id, blocked_id, reason_code, created_at, unblocked_at
       FROM user_blocks WHERE blocker_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT payment.id, payment.booking_id, payment.status,
              payment.amount_minor, payment.currency, payment.rental_subtotal_minor,
              payment.platform_fee_minor, payment.owner_payout_minor,
              payment.security_deposit_minor, payment.captured_minor,
              payment.refunded_minor, payment.transferred_minor,
              payment.created_at, payment.updated_at
       FROM payments AS payment
       JOIN bookings AS booking ON booking.id = payment.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY payment.created_at`, userId),
    rows(client,
      `SELECT refund.id, payment.booking_id, refund.status,
              refund.amount_minor, refund.currency, refund.created_at,
              refund.updated_at
       FROM refunds AS refund
       JOIN payments AS payment ON payment.id = refund.payment_id
       JOIN bookings AS booking ON booking.id = payment.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY refund.created_at`, userId),
    rows(client,
      `SELECT id, booking_id, status, amount_minor, currency, available_at,
              paid_at, created_at, updated_at
       FROM payouts WHERE payee_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT id, booking_id, document_type, document_number, currency,
              amount_minor, private_rent_minor, sit_fee_minor,
              owner_payout_minor, rent_refund_minor, sit_fee_refund_minor,
              supplier_role, debtor_role, tax_treatment, test_mode,
              snapshot, content_html, artifact_sha256, issued_at, created_at
       FROM financial_documents
       WHERE audience_user_id = $1 ORDER BY issued_at`, userId),
    rows(client,
      `SELECT event.id, event.document_id, event.event_type,
              event.artifact_sha256, event.occurred_at, event.metadata
       FROM financial_document_events AS event
       JOIN financial_documents AS document ON document.id = event.document_id
       WHERE document.audience_user_id = $1 ORDER BY event.occurred_at`, userId),
    rows(client,
      `SELECT id, booking_id, status, maximum_amount_minor,
              charged_amount_minor, currency, consent_version, consented_at,
              expires_at, created_at, updated_at
       FROM deposit_mandates WHERE renter_id = $1 ORDER BY created_at`, userId),
    rows(client,
      `SELECT charge.id, charge.booking_id, charge.status,
              charge.amount_minor, charge.currency, charge.succeeded_at,
              charge.created_at, charge.updated_at
       FROM deposit_charges AS charge
       JOIN bookings AS booking ON booking.id = charge.booking_id
       WHERE booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY charge.created_at`, userId),
    rows(client,
      `SELECT dispute.id, dispute.booking_id,
              (dispute.opened_by = $1) AS opened_by_me,
              dispute.status, dispute.reason_code, dispute.summary,
              dispute.created_at, dispute.updated_at, dispute.resolved_at
       FROM disputes AS dispute
       JOIN bookings AS booking ON booking.id = dispute.booking_id
       WHERE dispute.opened_by = $1 OR booking.owner_id = $1 OR booking.renter_id = $1
       ORDER BY dispute.created_at`, userId),
    rows(client,
      `SELECT recovery.id, recovery.dispute_id, payment.booking_id,
              recovery.payout_id, recovery.status, recovery.amount_minor,
              recovery.recovered_minor, recovery.currency, recovery.attempt_count,
              recovery.needs_review, recovery.last_error_category,
              recovery.last_error_code, recovery.succeeded_at, recovery.created_at,
              recovery.updated_at
         FROM dispute_transfer_recoveries AS recovery
         JOIN payments AS payment ON payment.id = recovery.payment_id
         JOIN bookings AS booking ON booking.id = payment.booking_id
        WHERE booking.owner_id = $1 OR booking.renter_id = $1
        ORDER BY recovery.created_at, recovery.id`, userId),
    rows(client,
      `SELECT action, resource_type, resource_id, request_id, created_at
       FROM audit_log WHERE actor_id = $1 ORDER BY created_at`, userId),
  ]);

  const privacySafeMessages = minimizeThirdPartyStructuredLocations(messages);

  return {
    account,
    authentication: { sessions, identities, pushDevices },
    marketplace: {
      listings,
      listingSets: {
        sets: listingSets,
        versions: listingSetVersions,
        versionMembers: listingSetVersionMembers,
        individualBookabilityPreserved: true,
        transactionalEvidenceStoredOnItemBookings: true,
      },
      bookings,
      bookingQuotes,
      bookingGroups: {
        groups: bookingGroups,
        positions: bookingGroupPositions,
        quotes: bookingGroupQuotes,
        quotePositions: bookingGroupQuotePositions,
        stateEvents: bookingGroupStateEvents,
        commands: bookingGroupCommands,
        itemBookingBindings: bookingGroupPositionBindings,
        sharedAppointments: bookingGroupAppointments,
        appointmentCommands: bookingGroupAppointmentCommands,
        itemEvidenceRemainsInV52BookingRecords: true,
      },
      rentalCart: {
        cart: rentalCarts[0] ?? null,
        projects: rentalCartProjects,
        items: rentalCartItems,
        reservationCreated: false,
      },
      platformContracts,
      platformContractDeclarations,
      platformContractReceipts,
      platformContractReceiptEvents,
      withdrawals,
      withdrawalReceipts,
      withdrawalReceiptEvents,
      actualLossCases,
      actualLossStatements,
      actualLossResolutions,
      actualLossReceipts,
      actualLossReceiptEvents,
    },
    communication: {
      messageThreads,
      messages: privacySafeMessages.messages,
      privacyExportMinimization: {
        policyVersion: 'sit-third-party-structured-location-minimization-v1',
        thirdPartyStructuredLocationsOmitted: privacySafeMessages.omittedCount,
        ownStructuredLocationsIncluded: true,
      },
      bookingConditionEvidence,
      bookingConditionConfirmations,
      v52ConditionEvidenceBindings,
      v52ConditionConfirmationBindings,
      v52ConfirmationChallengeBindings,
      v52ConfirmationVerificationEvents,
      v52ReturnCases,
      v52ReturnCaseEvidence,
      v52ReturnCaseEvents,
      support: {
        cases: supportCases,
        duplicateCaseLinks: supportDuplicateCaseLinks,
        privacyRightsRequests: supportPrivacyRightsRequests,
        privacyIdentityVerifications: supportPrivacyIdentityVerifications,
        privacyDeadlineExtensions: supportPrivacyDeadlineExtensions,
        privacyIncidents: supportPrivacyIncidents,
        dsaNoticeLocatorAmendments: supportDsaNoticeLocatorAmendments,
        events: supportCaseEvents,
        emergencyAccess: supportBreakGlassAccess,
        messages: supportMessages,
        progressUpdates: supportProgressUpdates,
        legacyImports: supportLegacyImports,
        legacyHistory: supportLegacyHistory,
        legacyHistoryVerificationState: 'unverified_user_device_source',
        legacyHistoryUsableAsDecisionEvidence: false,
        decisions: supportDecisions,
        appeals: supportAppeals,
        submittedEvidence: supportEvidence,
        submittedEvidenceFiles: supportEvidenceFiles,
        evidenceOriginalsAreNeverPublic: true,
        evidenceExternalAiUsed: false,
        internalSafetyImpactReviewsExcluded: true,
        internalNotesExcluded: true,
        restrictedEvidenceExcluded: true,
        internalEmergencyAccessReasonsExcluded: true,
        staffIdentifiersExcluded: true,
      },
    },
    uploadedFiles: uploads,
    notifications: {
      preferences: notificationPreferences[0] ?? null,
      history: notifications,
    },
    trustAndSafety: {
      reviews,
      reports,
      privateMarketplaceReviewEvents,
      accountSuspensionProposals,
      moderationDecisions,
      moderationReviewRequests,
      blocks,
      disputes,
    },
    financialActivity: {
      payments,
      refunds,
      withdrawalRefundObligations,
      withdrawalRefundObligationEvents,
      cancellationRefundObligations,
      actualLossRefundResolutionEvents,
      payouts,
      financialDocuments,
      financialDocumentEvents,
      depositMandates,
      depositCharges,
      disputeTransferRecoveries,
    },
    auditEvents,
  };
}
