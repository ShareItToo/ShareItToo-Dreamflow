#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePaths = [
  'lib/widgets/support_principal_controller.dart',
  'pubspec.yaml',
  'android/app/src/main/AndroidManifest.xml',
  'ios/Runner/Info.plist',
  'ios/Runner/PrivacyInfo.xcprivacy',
  'lib/screens/legal_privacy_screen.dart',
  'assets/legal/de/privacy_v5.html',
  'assets/legal/de/legal_manifest_v5.json',
  'lib/main.dart',
  'lib/screens/privacy_info_screen.dart',
  'lib/services/privacy_export_file_store.dart',
  'lib/services/privacy_export_file_platform_io.dart',
  'lib/services/privacy_export_file_platform_stub.dart',
  'lib/services/privacy_export_service.dart',
  'lib/widgets/privacy_export_cache_lifecycle_host.dart',
  'backend/src/account_actions.js',
  'backend/src/auth_session_actions.js',
  'backend/src/privacy_export.js',
  'backend/src/observability.js',
  'backend/src/server.js',
  'backend/src/credential_cleanup.js',
  'backend/src/db.js',
  'backend/src/mailer.js',
  'backend/src/support_case_domain.js',
  'backend/src/support_case_workflow.js',
  'backend/src/handover_exception_domain.js',
  'backend/src/handover_exception_workflow.js',
  'backend/src/support_privacy_rights_domain.js',
  'backend/src/support_privacy_rights_workflow.js',
  'backend/src/support_privacy_incident_domain.js',
  'backend/src/support_privacy_incident_workflow.js',
  'backend/src/support_article18_domain.js',
  'backend/src/support_article18_workflow.js',
  'backend/src/support_appeal_domain.js',
  'backend/src/support_appeal_workflow.js',
  'backend/src/support_decision_domain.js',
  'backend/src/support_decision_workflow.js',
  'backend/src/support_break_glass_domain.js',
  'backend/src/support_break_glass_workflow.js',
  'backend/src/consumer_dispute_config.js',
  'backend/src/product_safety_config.js',
  'backend/src/support_account_recovery_domain.js',
  'backend/src/support_message_domain.js',
  'backend/src/support_message_workflow.js',
  'backend/src/support_progress_update_domain.js',
  'backend/src/support_progress_update_workflow.js',
  'backend/src/support_notifications.js',
  'backend/src/support_message_templates_v1.json',
  'backend/src/support_deadline_watchdog.js',
  'backend/src/support_operational_metrics.js',
  'backend/src/support_legacy_migration.js',
  'backend/src/support_evidence_workflow.js',
  'backend/src/support_safety_impact_domain.js',
  'backend/src/support_safety_impact_workflow.js',
  'backend/src/support_duplicate_case_domain.js',
  'backend/src/support_duplicate_case_workflow.js',
  'backend/src/booking_workflow.js',
  'backend/src/booking_flow_time.js',
  'backend/src/booking_address_reveal_domain.js',
  'backend/src/booking_address_reveal_workflow.js',
  'backend/src/rental_cart_workflow.js',
  'backend/src/planner_core.js',
  'backend/src/planner_inventory_workflow.js',
  'backend/src/private_pilot_domain.js',
  'backend/src/listing_catalog.js',
  'backend/src/listing_supply_enrichment.js',
  'backend/src/listing_set_workflow.js',
  'backend/src/moderation_domain.js',
  'backend/src/moderation_account_measure_domain.js',
  'backend/src/moderation_account_measure_workflow.js',
  'backend/src/moderation_workflow.js',
  'backend/src/moderation_decision_workflow.js',
  'backend/src/moderation_review_correction_workflow.js',
  'backend/src/compliance_review.js',
  'backend/src/operator_readiness.js',
  'backend/src/v51_contract_workflow.js',
  'backend/src/v51_contract_receipt.js',
  'backend/src/v52_contract_workflow.js',
  'backend/src/v51_termination_domain.js',
  'backend/src/v51_withdrawal_workflow.js',
  'backend/src/v52_actual_loss_workflow.js',
  'backend/sql/migrations/015_v51_contract_persistence.up.sql',
  'backend/sql/migrations/016_v51_booking_quotes.up.sql',
  'backend/sql/migrations/017_v51_contract_receipts.up.sql',
  'backend/sql/migrations/018_v51_withdrawal_and_refund_obligations.up.sql',
  'backend/sql/migrations/019_v51_condition_evidence.up.sql',
  'backend/sql/migrations/023_v52_contract_binding.up.sql',
  'backend/sql/migrations/024_v52_actual_loss_resolution.up.sql',
  'backend/sql/migrations/025_v52_handover_return_evidence.up.sql',
  'backend/sql/migrations/026_v52_categories_moderation_operator.up.sql',
  'backend/sql/migrations/027_g2_persistent_rental_cart.up.sql',
  'backend/sql/migrations/031_g5b_listing_sets.up.sql',
  'backend/sql/migrations/032_support_case_foundation.up.sql',
  'backend/sql/migrations/033_support_decision_approval_guard.up.sql',
  'backend/sql/migrations/034_support_user_action_deadline.up.sql',
  'backend/sql/migrations/035_support_final_decision_publication.up.sql',
  'backend/sql/migrations/036_support_closed_case_appeal_submission.up.sql',
  'backend/sql/migrations/037_support_break_glass_access.up.sql',
  'backend/sql/migrations/038_support_message_template_guard.up.sql',
  'backend/sql/migrations/039_support_deadline_watchdog.up.sql',
  'backend/sql/migrations/040_support_single_issue_intake.up.sql',
  'backend/sql/migrations/041_support_closed_account_access_guard.up.sql',
  'backend/sql/migrations/042_support_dsa_notice_intake.up.sql',
  'backend/sql/migrations/043_support_dsa_notice_locator_completion.up.sql',
  'backend/sql/migrations/044_moderation_statement_of_reasons.up.sql',
  'backend/sql/migrations/045_independent_moderation_review_resolution.up.sql',
  'backend/sql/migrations/046_support_article18_authority_referral_guard.up.sql',
  'backend/sql/migrations/047_support_privacy_rights_control_plane.up.sql',
  'backend/sql/migrations/048_support_privacy_incident_control_plane.up.sql',
  'backend/sql/migrations/048_support_privacy_incident_control_plane.down.sql',
  'backend/sql/migrations/049_support_product_safety_intake.up.sql',
  'backend/sql/migrations/049_support_product_safety_intake.down.sql',
  'backend/sql/migrations/050_support_legacy_history_import.up.sql',
  'backend/sql/migrations/050_support_legacy_history_import.down.sql',
  'backend/sql/migrations/051_support_evidence_security.up.sql',
  'backend/sql/migrations/051_support_evidence_security.down.sql',
  'backend/sql/migrations/052_support_safety_impact_review.up.sql',
  'backend/sql/migrations/052_support_safety_impact_review.down.sql',
  'backend/sql/migrations/053_support_duplicate_case_linking.up.sql',
  'backend/sql/migrations/053_support_duplicate_case_linking.down.sql',
  'backend/sql/migrations/054_support_feedback_priority.up.sql',
  'backend/sql/migrations/054_support_feedback_priority.down.sql',
  'backend/sql/migrations/055_support_progress_updates.up.sql',
  'backend/sql/migrations/055_support_progress_updates.down.sql',
  'backend/sql/migrations/056_support_account_recovery_guard.up.sql',
  'backend/sql/migrations/056_support_account_recovery_guard.down.sql',
  'backend/sql/migrations/057_account_recovery_session_integrity.up.sql',
  'backend/sql/migrations/057_account_recovery_session_integrity.down.sql',
  'backend/sql/migrations/058_moderation_account_measure_approval.up.sql',
  'backend/sql/migrations/058_moderation_account_measure_approval.down.sql',
  'backend/sql/migrations/059_support_message_content_block_audit.up.sql',
  'backend/sql/migrations/059_support_message_content_block_audit.down.sql',
  'backend/sql/migrations/060_harassment_block_report_guard.up.sql',
  'backend/sql/migrations/060_harassment_block_report_guard.down.sql',
  'backend/sql/migrations/061_booking_exact_address_reveal_guard.up.sql',
  'backend/sql/migrations/061_booking_exact_address_reveal_guard.down.sql',
  'backend/sql/migrations/062_handover_exception_guard.up.sql',
  'backend/sql/migrations/062_handover_exception_guard.down.sql',
  'backend/sql/migrations/063_return_calendar_deadline_guard.up.sql',
  'backend/sql/migrations/063_return_calendar_deadline_guard.down.sql',
  'backend/sql/migrations/064_support_status_machine_v1_alignment.up.sql',
  'backend/sql/migrations/064_support_status_machine_v1_alignment.down.sql',
  'backend/sql/migrations/065_support_direct_decision_path.up.sql',
  'backend/sql/migrations/065_support_direct_decision_path.down.sql',
  'backend/src/booking_condition_evidence_workflow.js',
  'backend/src/booking_confirmation_workflow.js',
  'backend/src/message_workflow.js',
  'backend/src/v52_handover_return_workflow.js',
  'backend/src/retention_inventory.js',
  'backend/src/financial_documents.js',
  'backend/sql/migrations/020_v51_financial_documents.up.sql',
  'backend/src/security.js',
  'backend/src/maps_proxy.js',
  'backend/src/google_maps_activation.js',
  'backend/src/config.js',
  'backend/src/notifications.js',
  'backend/src/push_sender.js',
  'backend/src/transactional_mail_templates.js',
  'backend/src/return_lifecycle_workflow.js',
  'backend/src/private_pilot_return_domain.js',
  'backend/src/return_calendar_policy.js',
  'backend/src/firebase_phone_verification.js',
  'backend/src/firebase_social_auth.js',
  'backend/src/firebase_identity_cleanup.js',
  'backend/src/crashlytics_cleanup.js',
  'backend/sql/migrations/021_firebase_identity_deletion_outbox.up.sql',
  'backend/sql/migrations/022_crashlytics_subject_deletion.up.sql',
  'backend/sql/migrations/010_phone_verification.up.sql',
  'lib/services/backend_config.dart',
  'lib/services/firebase_runtime.dart',
  'lib/services/firebase_service_preferences.dart',
  'lib/services/app_link_service.dart',
  'lib/screens/app_link_destination_screen.dart',
  'android/app/src/main/kotlin/com/shareittoo/app/MainActivity.kt',
  'lib/widgets/app_image.dart',
  'lib/services/address_privacy.dart',
  'lib/services/data_service.dart',
  'lib/services/local_safety_privacy_service.dart',
  'lib/services/blocked_users_service.dart',
  'lib/services/listing_feedback_service.dart',
  'lib/services/user_reports_service.dart',
  'lib/services/messages_settings_service.dart',
  'lib/services/notification_preferences_service.dart',
  'lib/services/backend_repository.dart',
  'lib/screens/help_center_screen.dart',
  'lib/screens/moderation_admin_screen.dart',
  'lib/screens/moderation_decisions_screen.dart',
  'lib/screens/support_cases_screen.dart',
  'lib/screens/support_flow_screen.dart',
  'lib/models/rental_cart.dart',
  'lib/navigation/main_navigation.dart',
  'lib/screens/login_screen.dart',
  'lib/screens/register_screen.dart',
  'lib/screens/wishlists_screen.dart',
  'lib/widgets/item_details_overlay.dart',
  'lib/config/private_pilot_config.dart',
  'lib/config/supply_enrichment_technical_config.dart',
  'lib/models/supply_enrichment.dart',
  'lib/config/listing_sets_technical_config.dart',
  'lib/models/listing_set.dart',
  'lib/models/rental_request.dart',
  'lib/screens/private_pilot_checkout_screen.dart',
  'lib/screens/v52_legal_document_screen.dart',
  'lib/screens/bookings_screen.dart',
  'lib/screens/payment_methods_screen.dart',
  'lib/screens/stripe_payout_account_screen.dart',
  'lib/screens/payment_checkout_screen.dart',
  'lib/models/invoice.dart',
  'lib/services/invoices_service.dart',
  'lib/services/invoice_pdf_service.dart',
  'lib/screens/invoices_screen.dart',
  'lib/screens/invoice_detail_screen.dart',
  'lib/screens/booking_detail_screen.dart',
  'lib/screens/ongoing_owner_detail_screen.dart',
  'lib/screens/platform_withdrawal_screen.dart',
  'lib/services/account_deletion_service.dart',
  'lib/services/blue_ocean_draft_recovery_service.dart',
  'lib/services/auth_service.dart',
  'lib/screens/notification_settings_screen.dart',
  'lib/screens/contact_data_screen.dart',
  'lib/openai/openai_config.dart',
  'lib/services/maps_service.dart',
  'backend/src/app.js',
  'backend/src/rate_limit_policy.js',
  'tool/run_staging_synthetic_booking.mjs',
  'tool/run_staging_non_binding_simulation.mjs',
  'lib/screens/create_listing_screen.dart',
  'lib/screens/explore_screen.dart',
  'lib/widgets/supply_enrichment_dialog.dart',
  'lib/screens/message_thread_screen.dart',
  'lib/widgets/return_handover_stepper_sheet.dart',
  'lib/screens/report_issue_screen.dart',
  'lib/screens/report_user_screen.dart',
  'store/phone-verification-readiness.json',
  'store/g2-data-lifecycle.json',
];

const dataTypeIds = [
  'name',
  'emailAddress',
  'phoneNumber',
  'physicalAddress',
  'userId',
  'approximateLocation',
  'preciseLocation',
  'photos',
  'inAppMessages',
  'otherUserContent',
  'healthInfo',
  'purchaseHistory',
  'paymentInfo',
  'otherFinancialInfo',
  'deviceOrOtherIds',
  'crashData',
  'otherDiagnostics',
  'appInteractions',
];

const decisionKeys = [
  'googlePlayDataSafetyQuestionnaire',
  'appleAppPrivacyQuestionnaire',
  'processorSharingClassification',
  'googleMapsCredentialRestrictions',
  'retentionAndDeletionSchedule',
  'stripeFinalDataFlow',
];

const serviceKeys = [
  'firstPartyBackend',
  'hostingerVps',
  'firebaseCloudMessaging',
  'firebaseCrashlytics',
  'firebaseAuthentication',
  'googleWorkspaceSmtpRelay',
  'googleMapsPlatform',
  'stripe',
  'openAiHelpers',
  'analytics',
  'advertising',
];

const providerClassificationPath =
  'docs/evidence/b11/google-play-service-provider-sharing-classification-2026081505-20260815.json';

const purposeValues = new Set([
  'accountManagement',
  'appFunctionality',
  'developerCommunications',
  'fraudPreventionSecurityCompliance',
  'personalization',
  'analytics',
]);

const forbiddenSensitiveKeys = /^(password|secret|token|apiKey|privateKey|serviceAccount|credential|reviewAccount|email)$/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must be a lowercase SHA-256 value.`);
  }
}

function assertExactKeys(value, expected, label) {
  if (Object.keys(value).sort().join(',') !== expected.slice().sort().join(',')) {
    fail(`${label} must contain exactly: ${expected.join(', ')}.`);
  }
}

function assertNoSensitiveData(value, label = 'privacy disclosures') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveData(entry, `${label}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && emailPattern.test(value)) {
      fail(`${label} must not contain an email address.`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenSensitiveKeys.test(key)) fail(`${label}.${key} must not contain secrets or account data.`);
    assertNoSensitiveData(entry, `${label}.${key}`);
  }
}

function sourceText(root, sourceTexts, path) {
  return Object.hasOwn(sourceTexts, path)
    ? sourceTexts[path]
    : readFileSync(resolve(root, path), 'utf8');
}

function evidenceJson(root, evidenceTexts, path) {
  const raw = Object.hasOwn(evidenceTexts, path)
    ? evidenceTexts[path]
    : readFileSync(resolve(root, path), 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    fail(`${path} must contain valid JSON evidence.`);
  }
}

function assertApproval(value, label) {
  const approval = object(value, label);
  assertExactKeys(approval, ['status', 'evidenceRef'], label);
  if (!['open', 'closed'].includes(approval.status)) fail(`${label}.status must be open or closed.`);
  if (approval.status === 'open') {
    if (approval.evidenceRef !== null) fail(`${label} open must not reference evidence.`);
    return;
  }
  const ref = nonEmptyString(approval.evidenceRef, `${label}.evidenceRef`);
  if (!ref.startsWith('docs/evidence/b11/') || ref.includes('..') || !ref.endsWith('.json')) {
    fail(`${label}.evidenceRef must stay under docs/evidence/b11.`);
  }
}

function assertSourceContracts({ root, sourceTexts }) {
  const pubspec = sourceText(root, sourceTexts, 'pubspec.yaml');
  for (const dependency of [
    'firebase_messaging:',
    'firebase_crashlytics:',
    'firebase_app_installations:',
    'firebase_auth:',
    'google_sign_in:',
    'flutter_facebook_auth:',
    'geolocator:',
    'image_picker:',
    'file_picker:',
  ]) {
    if (!pubspec.includes(dependency)) fail(`pubspec.yaml is missing ${dependency}`);
  }
  for (const forbidden of ['firebase_analytics:', 'firebase_performance:', 'google_mobile_ads:']) {
    if (pubspec.includes(forbidden)) fail(`Undisclosed SDK is forbidden: ${forbidden}`);
  }

  const android = sourceText(root, sourceTexts, 'android/app/src/main/AndroidManifest.xml');
  for (const permission of [
    'android.permission.CAMERA',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.POST_NOTIFICATIONS',
  ]) {
    if (!android.includes(permission)) fail(`Android disclosure inventory is missing permission ${permission}.`);
  }
  for (const broadMediaPermission of [
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_MEDIA_VIDEO',
  ]) {
    if (android.includes(broadMediaPermission)) {
      fail(`Android must use the system photo picker instead of broad media permission ${broadMediaPermission}.`);
    }
  }
  for (const marker of [
    'firebase_messaging_auto_init_enabled',
    'firebase_analytics_collection_enabled',
    'firebase_crashlytics_collection_enabled',
  ]) {
    if (!new RegExp(`${marker}[\\s\\S]{0,120}android:value="false"`).test(android)) {
      fail(`Android Firebase opt-in default is missing ${marker}=false.`);
    }
  }
  const harassmentBlockReportAuditMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/060_harassment_block_report_guard.up.sql',
  );
  for (const marker of [
    'report.harassment_blocked_for_reporter',
    'immediateDanger',
    'directContactBlocked',
    'neutralReviewRequired',
    'guiltDetermined',
    'moderationAccountMeasureTaken',
    'externalActionTaken',
    'requestFingerprint',
    'active direct-contact block',
  ]) {
    if (!harassmentBlockReportAuditMigration.includes(marker)) {
      fail(`Harassment block-report privacy boundary is missing ${marker}.`);
    }
  }
  const bookingAddressAuditMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/061_booking_exact_address_reveal_guard.up.sql',
  );
  for (const marker of [
    'audit_log_booking_address_request_idx',
    'audit_log_booking_address_access_guard',
    'booking.exact_address_revealed',
    'booking.exact_address_access_hidden',
    'booking.exact_address_access_denied',
    "INTERVAL '6 hours'",
    "'address', 'exactAddress', 'locationText', 'latitude', 'longitude'",
  ]) {
    if (!bookingAddressAuditMigration.includes(marker)) {
      fail(`Booking-address privacy boundary is missing ${marker}.`);
    }
  }
  const handoverExceptionAuditMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/062_handover_exception_guard.up.sql',
  );
  for (const marker of [
    'audit_log_handover_exception_request_idx',
    'booking.handover_exception_reported',
    'requestFingerprint',
    'moneyOutcomeDecided',
    'guiltDetermined',
    "'details', 'summary', 'messageBody', 'address', 'exactAddress'",
  ]) {
    if (!handoverExceptionAuditMigration.includes(marker)) {
      fail(`Handover-exception privacy boundary is missing ${marker}.`);
    }
  }

  const ios = sourceText(root, sourceTexts, 'ios/Runner/Info.plist');
  for (const usage of [
    'NSPhotoLibraryUsageDescription',
    'NSCameraUsageDescription',
    'NSLocationWhenInUseUsageDescription',
    'remote-notification',
  ]) {
    if (!ios.includes(usage)) fail(`iOS disclosure inventory is missing ${usage}.`);
  }
  for (const marker of [
    'FirebaseMessagingAutoInitEnabled',
    'FirebaseCrashlyticsCollectionEnabled',
  ]) {
    if (!new RegExp(`<key>${marker}<\\/key>\\s*<false\\/>`).test(ios)) {
      fail(`iOS Firebase opt-in default is missing ${marker}=false.`);
    }
  }

  const applePrivacy = sourceText(root, sourceTexts, 'ios/Runner/PrivacyInfo.xcprivacy');
  for (const marker of [
    'NSPrivacyCollectedDataTypeDeviceID',
    'NSPrivacyCollectedDataTypeCrashData',
    'NSPrivacyCollectedDataTypeOtherDiagnosticData',
    'NSPrivacyCollectedDataTypeProductInteraction',
    'NSPrivacyCollectedDataTypePurposeAnalytics',
  ]) {
    if (!applePrivacy.includes(marker)) fail(`Apple privacy manifest is missing ${marker}.`);
  }

  const exportSource = sourceText(root, sourceTexts, 'backend/src/privacy_export.js');
  for (const marker of [
    'pushDevices', 'listings', 'bookings', 'messages', 'uploads',
    'payments', 'refunds', 'payouts', 'financialDocuments',
    'financialDocumentEvents', 'disputes', 'rentalCartProjects',
    'rentalCartItems', 'listingSetVersions', 'listingSetVersionMembers',
    'individualBookabilityPreserved: true', 'reservationCreated: false',
    'supportBreakGlassAccess', "'p0_emergency_case_access'::text",
    'internalEmergencyAccessReasonsExcluded: true', 'message.message_title',
    'message.corrects_message_id',
    'staffIdentifiersExcluded: true',
    'privacyExportMinimization',
    'THIRD_PARTY_EXACT_LOCATION_OMITTED',
    'privacyIncidents: supportPrivacyIncidents',
    'internalSafetyImpactReviewsExcluded: true',
    'duplicateCaseLinks: supportDuplicateCaseLinks',
    'support_case.feedback_context',
    'progressUpdates: supportProgressUpdates',
  ]) {
    if (!exportSource.includes(marker)) fail(`Backend privacy export is missing ${marker}.`);
  }
  const breakGlassMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/037_support_break_glass_access.up.sql',
  );
  for (const marker of [
    'support_break_glass_grants',
    "target_case.priority <> 'p0'",
    "target_case.operating_mode NOT IN ('simulation', 'internal_testing')",
    "expires_at <= created_at + interval '5 minutes'",
    'support_break_glass_delete_guard',
  ]) {
    if (!breakGlassMigration.includes(marker)) {
      fail(`Support break-glass privacy boundary is missing ${marker}.`);
    }
  }
  const supportMessageDomain = sourceText(
    root,
    sourceTexts,
    'backend/src/support_message_domain.js',
  );
  for (const marker of [
    '947f307e7919eed543c28e36af4d2b364d87dcde52025649d0d4620d64baaaa5',
    'support_message_sensitive_content_blocked',
    'supportMessageContentBlockAuditMetadata',
    'inputStored: false',
    'support_message_red_template_requires_decision_workflow',
    'support_message_money_template_requires_snapshot_workflow',
    'support_message_server_binding_mismatch',
    "timeZone: 'Europe/Berlin'",
  ]) {
    if (!supportMessageDomain.includes(marker)) {
      fail(`Support-message domain privacy boundary is missing ${marker}.`);
    }
  }
  const supportMessageWorkflow = sourceText(
    root,
    sourceTexts,
    'backend/src/support_message_workflow.js',
  );
  const supportMessageContentAuditMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/059_support_message_content_block_audit.up.sql',
  );
  for (const marker of [
    'support.message_content_blocked',
    'sit_support_content_guard_v1',
    "NEW.metadata -> 'inputStored' <> 'false'::jsonb",
    "NEW.metadata -> 'messageCreated' <> 'false'::jsonb",
    "NEW.metadata -> 'externalMessageSent' <> 'false'::jsonb",
  ]) {
    if (!supportMessageContentAuditMigration.includes(marker)) {
      fail(`Support-message content audit privacy boundary is missing ${marker}.`);
    }
  }
  for (const marker of [
    'support_message_live_delivery_forbidden',
    'support_message_recipient_forbidden',
    'externalMessageSent: false',
    "visibility: 'user_visible'",
  ]) {
    if (!supportMessageWorkflow.includes(marker)) {
      fail(`Support-message workflow privacy boundary is missing ${marker}.`);
    }
  }
  const supportMessageTemplates = JSON.parse(sourceText(
    root,
    sourceTexts,
    'backend/src/support_message_templates_v1.json',
  ));
  if (supportMessageTemplates.packet_version !== 'SIT_SUPPORT_PACKET_V1_2026-08-20'
      || supportMessageTemplates.rules?.unresolved_placeholders_block_send !== true
      || supportMessageTemplates.rules?.no_sensitive_content_in_push !== true
      || supportMessageTemplates.rules?.red_templates_never_auto_send !== true
      || supportMessageTemplates.templates?.length !== 55) {
    fail('Support-message template catalog is not the complete fail-closed Drive snapshot.');
  }
  const supportMessageMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/038_support_message_template_guard.up.sql',
  );
  for (const marker of [
    'Support message payload is immutable',
    'Support message recipient is outside the case',
    'Support message review requires independent active admin',
    "target_case.operating_mode NOT IN ('simulation', 'internal_testing')",
    "CHECK (notification_ids = '{}')",
  ]) {
    if (!supportMessageMigration.includes(marker)) {
      fail(`Support-message database privacy boundary is missing ${marker}.`);
    }
  }
  const supportDeadlineWatchdog = sourceText(
    root,
    sourceTexts,
    'backend/src/support_deadline_watchdog.js',
  );
  for (const marker of [
    "operating_mode IN ('simulation', 'internal_testing')",
    "true, 'internal'",
    'externalNotificationSent: false',
    'support_operational_alerts_forbidden',
  ]) {
    if (!supportDeadlineWatchdog.includes(marker)) {
      fail(`Support-deadline privacy boundary is missing ${marker}.`);
    }
  }
  const supportOperationalMetrics = sourceText(
    root,
    sourceTexts,
    'backend/src/support_operational_metrics.js',
  );
  for (const marker of [
    "operating_mode IN ('simulation', 'internal_testing')",
    'aggregateOnly: true',
    'containsPersonalData: false',
    'externalAnalyticsSent: false',
    'support_operational_metrics_forbidden',
  ]) {
    if (!supportOperationalMetrics.includes(marker)) {
      fail(`Support operational-metrics privacy boundary is missing ${marker}.`);
    }
  }
  const supportLegacyMigration = sourceText(
    root,
    sourceTexts,
    'backend/src/support_legacy_migration.js',
  );
  for (const marker of [
    "verificationState: 'unverified_user_device_source'",
    'usableAsDecisionEvidence: false',
    'externalMessagesSent: false',
    'pg_advisory_xact_lock',
    'const { source: _source, intake: _intake, ...result } = preview',
  ]) {
    if (!supportLegacyMigration.includes(marker)) {
      fail(`Legacy-support migration privacy boundary is missing ${marker}.`);
    }
  }
  const supportLegacyMigrationUp = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/050_support_legacy_history_import.up.sql',
  );
  const supportLegacyMigrationDown = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/050_support_legacy_history_import.down.sql',
  );
  for (const marker of [
    "verification_state = 'unverified_user_device_source'",
    "source_trust = 'unverified_user_device_source'",
    'support_legacy_imports_append_only',
    'support_legacy_history_entries_append_only',
  ]) {
    if (!supportLegacyMigrationUp.includes(marker)) {
      fail(`Legacy-support migration schema privacy boundary is missing ${marker}.`);
    }
  }
  if (!supportLegacyMigrationDown.includes('rollback would lose history')) {
    fail('Legacy-support migration rollback must refuse stored history.');
  }
  const supportEvidenceWorkflow = sourceText(
    root,
    sourceTexts,
    'backend/src/support_evidence_workflow.js',
  );
  const supportEvidenceMigrationUp = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/051_support_evidence_security.up.sql',
  );
  const supportEvidenceMigrationDown = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/051_support_evidence_security.down.sql',
  );
  for (const marker of [
    'sourceTrust: \'user_submitted_unverified\'',
    'usableAsDecisionEvidenceWithoutReview: false',
    'externalAiUsed: false',
    'access_grant.subject_user_id = $3',
    'access_grant.session_id = $4',
    'access_grant.expires_at > $5',
  ]) {
    if (!supportEvidenceWorkflow.includes(marker)) {
      fail(`Support-evidence privacy boundary is missing ${marker}.`);
    }
  }
  if (/fetch\s*\(|https?:\/\//u.test(supportEvidenceWorkflow)) {
    fail('Support evidence must not have an external network or AI path.');
  }
  for (const marker of [
    'external_ai_used BOOLEAN NOT NULL DEFAULT false CHECK (external_ai_used = false)',
    'support evidence source and preview are immutable',
    "expires_at <= created_at + interval '5 minutes'",
  ]) {
    if (!supportEvidenceMigrationUp.includes(marker)) {
      fail(`Support-evidence schema privacy boundary is missing ${marker}.`);
    }
  }
  if (!supportEvidenceMigrationDown.includes('rollback would lose retained evidence')) {
    fail('Support-evidence rollback must refuse stored evidence.');
  }
  const supportSafetyImpactWorkflow = sourceText(
    root,
    sourceTexts,
    'backend/src/support_safety_impact_workflow.js',
  );
  const supportSafetyImpactMigrationUp = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/052_support_safety_impact_review.up.sql',
  );
  const supportSafetyImpactMigrationDown = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/052_support_safety_impact_review.down.sql',
  );
  for (const marker of [
    'decisionBoundary: \'red_human_decision_required\'',
    'proportionalityRequired: true',
    'automaticActionAllowed: false',
    'externalDeliveryAllowed: false',
  ]) {
    if (!supportSafetyImpactWorkflow.includes(marker)) {
      fail(`Support safety-impact privacy boundary is missing ${marker}.`);
    }
  }
  if (/fetch\s*\(|https?:\/\//u.test(supportSafetyImpactWorkflow)) {
    fail('Support safety-impact review must not have an external network path.');
  }
  for (const marker of [
    'support_safety_impact_reviews_append_only',
    'CHECK (NOT action_executed)',
    'CHECK (NOT external_delivery_enabled)',
  ]) {
    if (!supportSafetyImpactMigrationUp.includes(marker)) {
      fail(`Support safety-impact schema privacy boundary is missing ${marker}.`);
    }
  }
  if (!supportSafetyImpactMigrationDown.includes(
    'rollback blocked: support safety impact reviews exist',
  )) {
    fail('Support safety-impact rollback must refuse stored reviews.');
  }
  const supportDuplicateCaseWorkflow = sourceText(
    root,
    sourceTexts,
    'backend/src/support_duplicate_case_workflow.js',
  );
  const supportDuplicateCaseMigrationUp = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/053_support_duplicate_case_linking.up.sql',
  );
  const supportDuplicateCaseMigrationDown = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/053_support_duplicate_case_linking.down.sql',
  );
  for (const marker of [
    'humanReviewed: row.human_reviewed === true',
    'automaticMergeExecuted: false',
    'externalDeliveryEnabled: false',
    "false, 'user_visible'",
    'leadingCaseNumber',
  ]) {
    if (!supportDuplicateCaseWorkflow.includes(marker)) {
      fail(`Support duplicate-case privacy boundary is missing ${marker}.`);
    }
  }
  if (/fetch\s*\(|https?:\/\//u.test(supportDuplicateCaseWorkflow)) {
    fail('Support duplicate-case linking must not have an external network path.');
  }
  for (const marker of [
    'support_case_links_append_only',
    'support_duplicate_case_separate_lane_required',
    'support_duplicate_case_link_required',
    'CHECK (NOT automatic_merge_executed)',
    'CHECK (NOT external_delivery_enabled)',
  ]) {
    if (!supportDuplicateCaseMigrationUp.includes(marker)) {
      fail(`Support duplicate-case schema privacy boundary is missing ${marker}.`);
    }
  }
  if (!supportDuplicateCaseMigrationDown.includes(
    'Refusing to drop retained support duplicate-case links',
  )) {
    fail('Support duplicate-case rollback must refuse stored links.');
  }
  const supportFeedbackDomain = sourceText(
    root,
    sourceTexts,
    'backend/src/support_case_domain.js',
  );
  const supportFeedbackMigrationUp = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/054_support_feedback_priority.up.sql',
  );
  const supportFeedbackMigrationDown = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/054_support_feedback_priority.down.sql',
  );
  for (const marker of [
    'sit_support_feedback_context_v1',
    'support_feedback_urgent_route_required',
    'support_feedback_entity_link_not_allowed',
  ]) {
    if (!supportFeedbackDomain.includes(marker)) {
      fail(`Support feedback privacy boundary is missing ${marker}.`);
    }
  }
  for (const marker of [
    'support_cases_feedback_context_shape_check',
    'support_cases_feedback_route_check',
    'support_feedback_context_immutable',
    'linked_payment_id IS NULL',
    'NOT privacy_flag',
  ]) {
    if (!supportFeedbackMigrationUp.includes(marker)) {
      fail(`Support feedback schema privacy boundary is missing ${marker}.`);
    }
  }
  if (!supportFeedbackMigrationDown.includes(
    'Refusing to drop retained support feedback context',
  )) {
    fail('Support feedback rollback must refuse stored context.');
  }
  const supportProgressDomain = sourceText(
    root,
    sourceTexts,
    'backend/src/support_progress_update_domain.js',
  );
  const supportProgressWorkflow = sourceText(
    root,
    sourceTexts,
    'backend/src/support_progress_update_workflow.js',
  );
  const supportProgressMigrationUp = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/055_support_progress_updates.up.sql',
  );
  const supportProgressMigrationDown = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/055_support_progress_updates.down.sql',
  );
  for (const marker of [
    "templateId = wasOverdue ? 'T-010' : 'T-008'",
    'support_progress_update_live_forbidden',
    'support_progress_update_deadline_not_advanced',
  ]) {
    if (!supportProgressDomain.includes(marker)) {
      fail(`Support progress-update privacy boundary is missing ${marker}.`);
    }
  }
  for (const marker of [
    'independentReviewRequired: true',
    'externalMessageSent: false',
    'progressUpdatePublication: true',
  ]) {
    if (!supportProgressWorkflow.includes(marker)) {
      fail(`Support progress-update workflow privacy boundary is missing ${marker}.`);
    }
  }
  if (/fetch\s*\(|https?:\/\//u.test(supportProgressWorkflow)) {
    fail('Support progress updates must not have an external network path.');
  }
  for (const marker of [
    'support_case_progress_updates_one_live_proposal',
    "approval_level <> 'yellow_human_review'",
    'support_progress_update_history_append_only',
  ]) {
    if (!supportProgressMigrationUp.includes(marker)) {
      fail(`Support progress-update schema privacy boundary is missing ${marker}.`);
    }
  }
  if (!supportProgressMigrationDown.includes(
    'Cannot roll back support progress updates while retained update evidence exists',
  )) {
    fail('Support progress-update rollback must refuse stored update evidence.');
  }
  const observability = sourceText(root, sourceTexts, 'backend/src/observability.js');
  if (!observability.includes('safeOperationalErrorCode')
      || !observability.includes("error?.code")
      || observability.includes('error?.message')) {
    fail('Operational logging must expose bounded codes without exception messages.');
  }
  const privacyIncidentWorkflow = sourceText(
    root,
    sourceTexts,
    'backend/src/support_privacy_incident_workflow.js',
  );
  const privacyIncidentMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/048_support_privacy_incident_control_plane.up.sql',
  );
  for (const marker of [
    'gdpr-art33-awareness-72h-v1',
    'support.privacy_incident.awareness_recorded',
    'externalNotificationSent: false',
    'externalNotificationsSent: 0',
  ]) {
    if (!privacyIncidentWorkflow.includes(marker)) {
      fail(`Privacy-incident workflow is missing ${marker}.`);
    }
  }
  for (const marker of [
    "notification_deadline_at = breach_awareness_at + INTERVAL '72 hours'",
    'support_privacy_incident_action_append_only',
    "target_case.operating_mode NOT IN ('simulation', 'internal_testing')",
    'NOT external_notifications_sent',
  ]) {
    if (!privacyIncidentMigration.includes(marker)) {
      fail(`Privacy-incident database boundary is missing ${marker}.`);
    }
  }
  const rentalCartApp = sourceText(root, sourceTexts, 'backend/src/app.js');
  if (!rentalCartApp.includes("app.post('/v1/account/export'")
      || !rentalCartApp.includes('account_export_request_invalid')
      || !rentalCartApp.includes('verifyPassword(raw.currentPassword')) {
    fail('Account privacy export must be password re-authenticated and account-bound.');
  }
  const rentalCartWorkflow = sourceText(
    root,
    sourceTexts,
    'backend/src/rental_cart_workflow.js',
  );
  const rentalCartMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/027_g2_persistent_rental_cart.up.sql',
  );
  const dataService = sourceText(root, sourceTexts, 'lib/services/data_service.dart');
  for (const marker of [
    'reservationCreated: false',
    'persist: false',
    'recheckRentalCart',
  ]) {
    if (!rentalCartWorkflow.includes(marker)) {
      fail(`Rental-cart privacy boundary is missing ${marker}.`);
    }
  }
  for (const marker of [
    'rental_carts',
    'rental_cart_projects',
    'rental_cart_items',
    'ON DELETE CASCADE',
  ]) {
    if (!rentalCartMigration.includes(marker)) {
      fail(`Rental-cart persistence inventory is missing ${marker}.`);
    }
  }
  for (const marker of [
    "'wishlist_state_v3'",
    "'rental_cart_v2'",
    "'rental_cart_v1'",
    "'project_cart_v1'",
    "'rental_cart_sync_owner_v1'",
    "'persistentRentalCart': true",
    "'persistentProjectCart': true",
    "'scope': 'local-principal'",
    "'principalScope'",
    'registry.quarantinedPrincipals.remove(principal.token)',
  ]) {
    if (!dataService.includes(marker)) fail(`Local cart privacy coverage is missing ${marker}.`);
  }
  if (!rentalCartApp.includes('DELETE FROM rental_carts WHERE user_id = $1')) {
    fail('Account erasure must delete the account-bound rental cart.');
  }
  const listingSetWorkflow = sourceText(
    root,
    sourceTexts,
    'backend/src/listing_set_workflow.js',
  );
  for (const marker of [
    'maximumListingSetMembers = 12',
    'allRequiredItemsAvailable: true',
    'individualBookabilityPreserved: true',
    'businessStatusUsed: false',
    'hiddenPriceManipulationUsed: false',
    "handoverReturnEvidence: 'v52_item_booking_evidence'",
    'persist: false',
  ]) {
    if (!listingSetWorkflow.includes(marker)) {
      fail(`Listing-set privacy boundary is missing ${marker}.`);
    }
  }
  const listingSetMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/031_g5b_listing_sets.up.sql',
  );
  for (const marker of [
    'listing_sets',
    'listing_set_versions',
    'listing_set_version_members',
    'target_listing.owner_id <> target_set.owner_id',
  ]) {
    if (!listingSetMigration.includes(marker)) {
      fail(`Listing-set persistence boundary is missing ${marker}.`);
    }
  }
  if (!rentalCartApp.includes('DELETE FROM listing_sets WHERE owner_id = $1')) {
    fail('Account erasure must delete owner listing-set user intent.');
  }
  const supplyEnrichment = sourceText(
    root,
    sourceTexts,
    'backend/src/listing_supply_enrichment.js',
  );
  for (const marker of [
    'MAX_SUGGESTIONS = 3',
    'suggestionIsDetectionTruth: false',
    'externalGenerativeAiUsed: false',
    'acceptedAsListingTruth: false',
    'handoverEvidenceSlot: \'accessories\'',
  ]) {
    if (!supplyEnrichment.includes(marker)) {
      fail(`Supply-enrichment privacy boundary is missing ${marker}.`);
    }
  }
  if (!rentalCartApp.includes("payload = jsonb_build_object(")
      || !rentalCartApp.includes("'photos', '[]'::jsonb")) {
    fail('Account erasure must rebuild listing payloads without supply-enrichment feedback.');
  }

  const financialDocuments = sourceText(root, sourceTexts, 'backend/src/financial_documents.js');
  for (const marker of [
    'booking_payment_receipt',
    'sit_fee_receipt',
    'owner_payout_statement',
    'refund_receipt',
    'financial_document_live_issuance_not_approved',
    'private_rent_no_sit_vat',
    'observedHash !== row.artifact_sha256',
  ]) {
    if (!financialDocuments.includes(marker)) {
      fail(`Immutable financial documents are missing ${marker}.`);
    }
  }
  const financialMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/020_v51_financial_documents.up.sql',
  );
  for (const marker of [
    'CREATE TABLE IF NOT EXISTS financial_documents',
    'CREATE TABLE IF NOT EXISTS financial_document_events',
    'financial_documents_append_only',
    'financial_document_events_append_only',
  ]) {
    if (!financialMigration.includes(marker)) {
      fail(`Financial-document persistence is missing ${marker}.`);
    }
  }
  const invoiceService = sourceText(root, sourceTexts, 'lib/services/invoices_service.dart');
  if (!invoiceService.includes('BackendRepository.getFinancialDocuments()')
      || invoiceService.includes('quoteForItem')
      || invoiceService.includes('platformFeeMinor(')) {
    fail('Release financial documents must come from server snapshots without client repricing.');
  }

  const firebase = sourceText(root, sourceTexts, 'lib/services/firebase_runtime.dart');
  for (const marker of [
    'FirebaseMessaging',
    'FirebaseCrashlytics',
    'FirebaseInstallations.instance.delete()',
    'FirebaseServicePreferencesStore.read()',
  ]) {
    if (!firebase.includes(marker)) fail(`Firebase runtime is missing ${marker}.`);
  }
  const auth = sourceText(root, sourceTexts, 'lib/services/auth_service.dart');
  for (const marker of [
    'GoogleAuthProvider',
    'AppleAuthProvider',
    'FacebookAuthProvider',
    "path: '/auth/social'",
  ]) {
    if (!auth.includes(marker)) fail(`Social authentication is missing ${marker}.`);
  }
  for (const marker of [
    'FirebaseAuth.instance.verifyPhoneNumber(',
    "path: '/auth/phone-verification/status'",
    "path: '/auth/phone-verification/confirm'",
  ]) {
    if (!auth.includes(marker)) fail(`Phone authentication is missing ${marker}.`);
  }
  const phoneConfig = sourceText(root, sourceTexts, 'backend/src/config.js');
  if (!phoneConfig.includes("process.env.FIREBASE_PHONE_VERIFICATION_ENABLED ?? 'false'")) {
    fail('Phone authentication must remain separately disabled by default.');
  }
  const phoneVerifier = sourceText(root, sourceTexts, 'backend/src/firebase_phone_verification.js');
  for (const marker of ["sign_in_provider, 40) !== 'phone'", 'await verify(token, true)']) {
    if (!phoneVerifier.includes(marker)) fail(`Phone token verification is missing ${marker}.`);
  }
  if (!phoneVerifier.includes("providers[0]?.providerId !== 'phone'")
      || !phoneVerifier.includes('await remove(firebaseUserId)')) {
    fail('Temporary Firebase phone identities must be removed after ownership proof.');
  }
  const firebaseIdentityCleanup = sourceText(
    root,
    sourceTexts,
    'backend/src/firebase_identity_cleanup.js',
  );
  const firebaseIdentityMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/021_firebase_identity_deletion_outbox.up.sql',
  );
  for (const marker of [
    'enqueueFirebaseIdentityDeletions',
    'drainFirebaseIdentityDeletionOutbox',
    'FOR UPDATE SKIP LOCKED',
    "userNotFoundCodes.has(code)",
    "SET status = 'retry'",
  ]) {
    if (!firebaseIdentityCleanup.includes(marker)) {
      fail(`Persistent Firebase identity deletion is missing ${marker}.`);
    }
  }
  if (!firebaseIdentityMigration.includes(
    'CREATE TABLE IF NOT EXISTS firebase_identity_deletion_outbox',
  ) || !firebaseIdentityMigration.includes(
    "provider IN ('google', 'apple', 'facebook')",
  )) {
    fail('Persistent Firebase identity deletion requires its bounded durable outbox.');
  }
  const phoneMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/010_phone_verification.up.sql',
  );
  if (!phoneMigration.includes('users_verified_phone_unique_idx')) {
    fail('Verified phone numbers must remain unique at the database layer.');
  }
  const phoneConsent = sourceText(root, sourceTexts, 'lib/screens/contact_data_screen.dart');
  for (const marker of ['Firebase Authentication (Google)', 'ShareItToo speichert keinen SMS-Code']) {
    if (!phoneConsent.includes(marker)) fail(`Phone verification consent is missing ${marker}.`);
  }
  const phoneReadiness = JSON.parse(sourceText(
    root,
    sourceTexts,
    'store/phone-verification-readiness.json',
  ));
  const phoneReadinessStates = new Map([
    ['implementation-complete-external-gates-open', {
      activationAllowed: false,
      privacy: 'pending-successor-candidate-reclassification',
    }],
    ['firebase-console-activated-staging-test-pending', {
      activationAllowed: false,
      privacy: 'successor-candidate-copy-updated-play-form-pending',
    }],
    ['android-real-device-sms-passed', {
      activationAllowed: true,
      privacy: 'successor-candidate-copy-updated-play-form-pending',
    }],
  ]);
  const expectedPhoneReadiness = phoneReadinessStates.get(phoneReadiness.state);
  if (!expectedPhoneReadiness
      || phoneReadiness.activationAllowed !== expectedPhoneReadiness.activationAllowed
      || phoneReadiness.storeSubmissionAllowed !== false
      || phoneReadiness.externalGates?.privacyAndProviderClassification !==
        expectedPhoneReadiness.privacy) {
    fail('Phone verification privacy and activation gates must remain open.');
  }

  const maps = sourceText(root, sourceTexts, 'lib/services/maps_service.dart');
  const mapsProxy = sourceText(root, sourceTexts, 'backend/src/maps_proxy.js');
  const mapsActivation = sourceText(
    root,
    sourceTexts,
    'backend/src/google_maps_activation.js',
  );
  if (!maps.includes('BackendRepository.autocompleteAddresses')
      || !mapsProxy.includes("const GOOGLE_PLACES_ORIGIN = 'https://maps.googleapis.com'")
      || !mapsActivation.includes('GOOGLE_MAPS_ACTIVATION_APPROVED')
      || !mapsActivation.includes('GOOGLE_MAPS_TRANSFER_MECHANISM')
      || !mapsActivation.includes("serverApiKey: enabled ? serverApiKey : ''")) {
    fail('Google Maps must be inventoried through the authenticated backend proxy.');
  }
  for (const directClientMarker of ['maps.googleapis.com', 'GOOGLE_MAPS_API_KEY']) {
    if (maps.includes(directClientMarker)) fail(`Google Maps client integration is forbidden: ${directClientMarker}`);
  }

  const ai = sourceText(root, sourceTexts, 'lib/openai/openai_config.dart');
  if (!/aiHelpersEnabled\s*=\s*false/.test(ai)) fail('OpenAI helpers must remain disabled in this candidate.');
  const launchPubspec = sourceText(root, sourceTexts, 'pubspec.yaml');
  for (const forbiddenDependency of [
    'firebase_analytics:',
    'firebase_performance:',
    'google_mobile_ads:',
    'google_fonts:',
  ]) {
    if (launchPubspec.includes(forbiddenDependency)) {
      fail(`Launch dependency must remain disabled: ${forbiddenDependency}`);
    }
  }

  const pushSender = sourceText(root, sourceTexts, 'backend/src/push_sender.js');
  const notifications = sourceText(root, sourceTexts, 'backend/src/notifications.js');
  for (const marker of [
    "V52_PUSH_TITLE = 'Neue ShareItToo-Aktualisierung'",
    "V52_PUSH_BODY = 'In der App ansehen.'",
    "route: 'notifications'",
    'ttl: payload.ttlSeconds * 1000',
    "'apns-expiration': String(expiration)",
    "throw pushError('push_kind_not_allowlisted')",
  ]) {
    if (!pushSender.includes(marker)) fail(`V5.2 Push contract is missing ${marker}.`);
  }
  if (!notifications.includes('kind: row.kind')
      || notifications.includes('const push = payload.push')) {
    fail('Notification delivery must delegate only the allowlisted kind to the V5.2 Push contract.');
  }
  const firebaseRuntime = sourceText(root, sourceTexts, 'lib/services/firebase_runtime.dart');
  const appLinks = sourceText(root, sourceTexts, 'lib/services/app_link_service.dart');
  const appLinkDestination = sourceText(
    root,
    sourceTexts,
    'lib/screens/app_link_destination_screen.dart',
  );
  const androidPushBridge = sourceText(
    root,
    sourceTexts,
    'android/app/src/main/kotlin/com/shareittoo/app/MainActivity.kt',
  );
  if (!firebaseRuntime.includes("data.length != 2")
      || !firebaseRuntime.includes("Uri.parse('shareittoo://notifications')")
      || !firebaseRuntime.includes('setDeliveryMetricsExportToBigQuery(false)')
      || firebaseRuntime.includes('setDeliveryMetricsExportToBigQuery(true)')
      || firebaseRuntime.includes('FirebaseAnalytics')
      || !appLinks.includes("case 'notifications':")
      || !appLinkDestination.includes('return const NotificationsScreen();')
      || !androidPushBridge.includes('contract == "v52" && routeSignal == "notifications"')) {
    fail('V5.2 Push must open only the authenticated identifier-free notification center.');
  }

  const backendApp = sourceText(root, sourceTexts, 'backend/src/app.js');
  for (const marker of [
    "new Set(['image/jpeg', 'image/png', 'image/webp'])",
    "throw new HttpError(415, 'unsupported_image_type')",
  ]) {
    if (!backendApp.includes(marker)) fail(`Backend image-only upload boundary is missing ${marker}.`);
  }
  const moderationStatementMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/044_moderation_statement_of_reasons.up.sql',
  );
  const moderationReviewMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/045_independent_moderation_review_resolution.up.sql',
  );
  const moderationReviewCorrection = sourceText(
    root,
    sourceTexts,
    'backend/src/moderation_review_correction_workflow.js',
  );
  const moderationDecisionWorkflow = sourceText(
    root,
    sourceTexts,
    'backend/src/moderation_decision_workflow.js',
  );
  const moderationWorkflow = sourceText(
    root,
    sourceTexts,
    'backend/src/moderation_workflow.js',
  );
  const accountMeasureWorkflow = sourceText(
    root,
    sourceTexts,
    'backend/src/moderation_account_measure_workflow.js',
  );
  const accountMeasureDomain = sourceText(
    root,
    sourceTexts,
    'backend/src/moderation_account_measure_domain.js',
  );
  const accountMeasureMigration = sourceText(
    root,
    sourceTexts,
    'backend/sql/migrations/058_moderation_account_measure_approval.up.sql',
  );
  const moderationDecisionsScreen = sourceText(
    root,
    sourceTexts,
    'lib/screens/moderation_decisions_screen.dart',
  );
  const moderationAdminScreen = sourceText(
    root,
    sourceTexts,
    'lib/screens/moderation_admin_screen.dart',
  );
  const backendRepository = sourceText(
    root,
    sourceTexts,
    'lib/services/backend_repository.dart',
  );
  for (const marker of [
    'moderation_statements_of_reasons_append_only',
    'moderation_decisions_statement_required',
    'moderation_statement_admin_reviewer_required',
    "review_channel = 'authenticated_in_app'",
  ]) {
    if (!moderationStatementMigration.includes(marker)) {
      fail(`Moderation Statement of Reasons migration is missing ${marker}.`);
    }
  }
  for (const marker of [
    'LEFT JOIN moderation_statements_of_reasons AS statement',
    'statementOfReasons: statement',
    "statementVersion: decision.statementOfReasons?.version ?? null",
  ]) {
    if (!moderationDecisionWorkflow.includes(marker)) {
      fail(`Moderation Statement of Reasons workflow is missing ${marker}.`);
    }
  }
  if (!moderationDecisionsScreen.includes('sit_dsa_statement_of_reasons_v1')
      || !moderationDecisionsScreen.includes('keine vollständig bestätigte digitale Begründung')
      || !moderationDecisionsScreen.includes('Menschliche Prüfung beantragen')
      || moderationAdminScreen.includes("value: 'automated'")
      || !backendRepository.includes("path: '/moderation/decisions'")) {
    fail('Moderation reasons must stay exact, user-bound, reviewable and human-reviewed.');
  }
  for (const marker of [
    'moderation_review_resolutions_append_only',
    'moderation_review_independent_reviewer_required',
    'moderation_review_requests_resolution_required',
  ]) {
    if (!moderationReviewMigration.includes(marker)) {
      fail(`Independent moderation review migration is missing ${marker}.`);
    }
  }
  if (!moderationReviewCorrection.includes('moderation_review_correction_human_only')
      || !moderationReviewCorrection.includes('moderation_review_measure_state_changed')
      || !moderationDecisionWorkflow.includes('resolutionDetails: reviewResolution')
      || !moderationDecisionsScreen.includes('Unabhängig und ausschließlich menschlich geprüft')) {
    fail('Moderation review must remain independent, human-only, corrected and user-visible.');
  }
  for (const marker of [
    'moderation_account_suspension_proposals',
    'payload_sha256 CHAR(64) GENERATED ALWAYS AS',
    'approved_by IS NOT NULL AND approved_by <> proposed_by',
    'account_suspension_proposal_payload_immutable',
    'new_legacy_suspension_forbidden',
  ]) {
    if (!accountMeasureMigration.includes(marker)) {
      fail(`Account suspension approval migration is missing ${marker}.`);
    }
  }
  for (const marker of [
    "candidate.provisional !== true",
    'account_suspension_approval_required',
    'account_suspension_four_eyes_required',
    'account_suspension_proposal_payload_changed',
    'account_suspension_target_state_changed',
  ]) {
    if (!moderationWorkflow.includes(marker)
        && !accountMeasureWorkflow.includes(marker)) {
      fail(`Account suspension workflow is missing ${marker}.`);
    }
  }
  if (!accountMeasureDomain.includes('Diese Kontoeinschränkung ist vorläufig.')
      || !accountMeasureDomain.includes('keine Feststellung strafrechtlicher oder zivilrechtlicher Schuld')
      || !backendApp.includes('/v1/admin/users/:id/account-suspension-proposals')
      || !backendApp.includes('/v1/admin/account-suspension-proposals/:id/review')) {
    fail('Account measures must stay provisional/no-guilt or independently approved.');
  }
  const listingUpload = sourceText(root, sourceTexts, 'lib/screens/create_listing_screen.dart');
  const chatUpload = sourceText(root, sourceTexts, 'lib/screens/message_thread_screen.dart');
  const handoverUpload = sourceText(root, sourceTexts, 'lib/widgets/return_handover_stepper_sheet.dart');
  const reportUpload = sourceText(root, sourceTexts, 'lib/screens/report_user_screen.dart');
  if (!listingUpload.includes('type: FileType.image')
      || !chatUpload.includes("allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp']")
      || !handoverUpload.includes('type: FileType.image')
      || !reportUpload.includes('ImagePicker().pickImage')) {
    fail('All launch upload surfaces must remain image-only.');
  }

  const legalPrivacy = sourceText(root, sourceTexts, 'lib/screens/legal_privacy_screen.dart');
  const v51Privacy = sourceText(root, sourceTexts, 'assets/legal/de/privacy_v5.html');
  const v51LegalManifest = JSON.parse(sourceText(
    root,
    sourceTexts,
    'assets/legal/de/legal_manifest_v5.json',
  ));
  if (v51LegalManifest.status !== 'draft-blocked'
      || v51LegalManifest.activationAllowed !== false
      || v51LegalManifest.productDecisions?.firebaseCloudMessaging?.decision !== 'retained'
      || v51LegalManifest.productDecisions?.firebaseCloudMessaging
        ?.requiresSeparateVoluntaryOptIn !== true
      || v51LegalManifest.productDecisions?.firebaseCrashlytics?.decision !== 'retained'
      || v51LegalManifest.productDecisions?.firebaseCrashlytics
        ?.requiresSeparateVoluntaryOptIn !== true
      || !v51LegalManifest.knownConflicts?.some(
        (entry) => entry?.id === 'firebase-push-crash-retained-after-v51-source'
          && entry?.status === 'source-superseded-activation-blocked'
          && entry?.successorDecisionDate === '2026-08-17'
          && entry?.successorDecisionPath === 'assets/legal/de/privacy_v5.html',
      )) {
    fail('The V5.1 legal bundle must preserve retained, independently opted-in Push and Crashlytics while keeping activation blocked.');
  }
  for (const marker of [
    'Externe Push-Benachrichtigungen sind im Startbetrieb nicht aktiviert.',
    'Im Startbetrieb sind keine externen Crashanalyse-',
    'data-successor-decision="2026-08-17"',
    'data-supersedes-source-page="38"',
    'Die Aktivierung von Push aktiviert Crashlytics nicht.',
    'Der Nachtrag ist keine Live- oder Datenschutzfreigabe.',
  ]) {
    if (!v51Privacy.includes(marker)) {
      fail(`The source-bound V5.1 privacy draft is missing its source or successor marker: ${marker}`);
    }
  }
  const privacyInfo = sourceText(root, sourceTexts, 'lib/screens/privacy_info_screen.dart');
  for (const [label, source] of [
    ['legal privacy notice', legalPrivacy],
    ['in-app privacy information', privacyInfo],
  ]) {
    for (const marker of [
      'genaue Standortkoordinaten',
      'Standort prüfen',
      'dauerhafte Hintergrund- oder Live‑Ortung findet nicht statt',
      'Google Maps Platform',
      'Firebase Cloud Messaging',
      'Firebase Crashlytics',
      'Firebase Authentication',
      'freigegebenen externen Anbieter',
      'technische Installationskennung',
      'App-Sitzungsdaten',
      'keine Ausweisprüfung',
      'SMS-Verifizierung',
      'Firebase-Authentifizierungsidentität',
    ]) {
      if (!source.includes(marker)) fail(`The ${label} is missing the truthful disclosure marker: ${marker}.`);
    }
  }

  const publicPrivacy = sourceText(root, sourceTexts, 'backend/src/account_actions.js');
  for (const marker of [
    'Google Maps Platform',
    'Firebase Cloud Messaging',
    'Firebase Crashlytics',
    'Anmeldung mit Google, Apple oder Facebook',
    'dauerhaft zur Anbieterlöschung vorgemerkt',
    'bis zu 180 Tagen',
    '90 Tage',
    'keine dauerhafte Hintergrund- oder Live-Ortung',
    'keine aktivierte Echtgeld-Zahlungsübertragung an Stripe',
    'https://shareittoo.com/account-deletion',
  ]) {
    if (!publicPrivacy.includes(marker)) {
      fail(`Public privacy draft is missing the evidenced disclosure marker: ${marker}.`);
    }
  }
}

export function validatePrivacyDisclosures({
  root,
  privacyManifest,
  submissionManifest,
  deviceManifest,
  sourceTexts = {},
  evidenceTexts = {},
  requireApproved = false,
}) {
  const privacy = object(privacyManifest, 'store/privacy-disclosures.json');
  const submission = object(submissionManifest, 'store/submission.json');
  const device = object(deviceManifest, 'store/device-validation.json');
  assertNoSensitiveData(privacy);

  if (privacy.schemaVersion !== 1) fail('privacy disclosure schemaVersion must be 1.');
  if (!['draft', 'approved'].includes(privacy.state)) fail('privacy disclosure state must be draft or approved.');
  if (typeof privacy.approvalAllowed !== 'boolean') fail('approvalAllowed must be boolean.');

  const candidate = object(privacy.candidate, 'candidate');
  const superseded = candidate.status === 'superseded';
  if (superseded && !/^\d{10}$/.test(candidate.replacementBuildNumber ?? '')) {
    fail('A superseded candidate must name its replacement build number.');
  }
  const deviceCandidate = object(device.candidate, 'store/device-validation.json candidate');
  for (const key of ['applicationId', 'bundleId', 'versionName', 'buildNumber', 'commit']) {
    if (candidate[key] !== deviceCandidate[key]) fail(`candidate.${key} must match store/device-validation.json.`);
  }
  if (candidate.applicationId !== submission.identity?.applicationId || candidate.bundleId !== submission.identity?.bundleId) {
    fail('Privacy candidate package identity must match store/submission.json.');
  }

  if (!Array.isArray(privacy.sourceInventory) || privacy.sourceInventory.length !== sourcePaths.length) {
    fail('sourceInventory must contain every required privacy source exactly once.');
  }
  const sourceMap = new Map();
  for (const entryValue of privacy.sourceInventory) {
    const entry = object(entryValue, 'sourceInventory entry');
    assertExactKeys(entry, ['path', 'sha256'], `sourceInventory.${entry.path ?? 'unknown'}`);
    if (sourceMap.has(entry.path)) fail(`sourceInventory contains duplicate path ${entry.path}.`);
    assertSha256(entry.sha256, `sourceInventory.${entry.path}.sha256`);
    sourceMap.set(entry.path, entry.sha256);
  }
  if (sourcePaths.some((path) => !sourceMap.has(path))) fail('sourceInventory paths do not match the required contract.');
  for (const path of sourcePaths) {
    const actual = sha256(sourceText(root, sourceTexts, path));
    if (actual !== sourceMap.get(path)) fail(`sourceInventory hash is stale: ${path}.`);
  }
  const localPrincipalState = object(
    privacy.localDevicePrincipalState,
    'localDevicePrincipalState',
  );
  assertExactKeys(localPrincipalState, [
    'status',
    'canonicalKey',
    'principalBinding',
    'maximumRetainedPrincipals',
    'legacyMigration',
    'corruptionPolicy',
    'privacyExport',
    'confirmedAccountDeletion',
    'containsCredentials',
    'externalTransferAdded',
  ], 'localDevicePrincipalState');
  if (localPrincipalState.status !== 'implemented-local-only-principal-scoped'
      || localPrincipalState.canonicalKey !== 'local_safety_privacy_state_v1'
      || localPrincipalState.principalBinding !== 'opaque-token-or-guest'
      || localPrincipalState.maximumRetainedPrincipals !== 12
      || localPrincipalState.legacyMigration
        !== 'unattributed-guest-only-attributed-exact-owner-or-quarantine'
      || localPrincipalState.corruptionPolicy
        !== 'preserve-quarantine-fail-closed'
      || localPrincipalState.privacyExport !== 'current-principal-only'
      || localPrincipalState.confirmedAccountDeletion
        !== 'confirmed-account-principal-purged-by-explicit-identity-successor-preserved'
      || localPrincipalState.containsCredentials !== false
      || localPrincipalState.externalTransferAdded !== false) {
    fail('Local principal privacy disclosure is incomplete or overstated.');
  }
  const localOperationalRecords = object(
    privacy.localOperationalRecords,
    'localOperationalRecords',
  );
  assertExactKeys(localOperationalRecords, [
    'status',
    'dataClasses',
    'identityBinding',
    'unattributedLegacyNotifications',
    'corruptionPolicy',
    'privacyExport',
    'confirmedAccountDeletion',
    'retentionPeriodInvented',
    'containsCredentials',
    'externalTransferAdded',
    'backendAuthorityChanged',
  ], 'localOperationalRecords');
  if (localOperationalRecords.status
        !== 'implemented-local-fallback-authenticated-participant-scoped'
      || !Array.isArray(localOperationalRecords.dataClasses)
      || localOperationalRecords.dataClasses.join(',') !== [
        'participant-message-threads-and-messages',
        'account-notifications',
        'participant-rental-requests-and-timeline',
        'account-read-and-last-seen-markers',
        'participant-handover-return-state',
        'participant-failure-counters-and-banners',
        'principal-booking-selections',
      ].join(',')
      || localOperationalRecords.identityBinding
        !== 'matching-auth-session-and-participant-or-current-principal-selection'
      || localOperationalRecords.unattributedLegacyNotifications
        !== 'preserved-unassigned-and-excluded'
      || localOperationalRecords.corruptionPolicy
        !== 'preserve-exact-raw-and-fail-closed'
      || localOperationalRecords.privacyExport
        !== 'current-account-and-participant-records-only'
      || localOperationalRecords.confirmedAccountDeletion
        !== 'confirmed-account-convenience-state-purged-by-explicit-identity-shared-counterparty-audit-records-retained'
      || localOperationalRecords.retentionPeriodInvented !== false
      || localOperationalRecords.containsCredentials !== false
      || localOperationalRecords.externalTransferAdded !== false
      || localOperationalRecords.backendAuthorityChanged !== false) {
    fail('Local operational-record privacy disclosure is incomplete or overstated.');
  }
  const localListingCatalog = object(
    privacy.localListingCatalog,
    'localListingCatalog',
  );
  assertExactKeys(localListingCatalog, [
    'status',
    'dataClasses',
    'publicCache',
    'identityBinding',
    'corruptionPolicy',
    'privacyExport',
    'confirmedAccountDeletion',
    'retentionPeriodInvented',
    'containsCredentials',
    'externalTransferAdded',
    'backendAuthorityChanged',
  ], 'localListingCatalog');
  if (localListingCatalog.status
        !== 'implemented-local-fallback-authenticated-owner-scoped'
      || !Array.isArray(localListingCatalog.dataClasses)
      || localListingCatalog.dataClasses.join(',') !== [
        'public-listing-content-and-media',
        'listing-location-and-pricing',
        'owner-and-lifecycle-metadata',
      ].join(',')
      || localListingCatalog.publicCache
        !== 'may-contain-public-listings-owned-by-other-accounts'
      || localListingCatalog.identityBinding
        !== 'matching-auth-session-and-exact-listing-owner-for-mutations'
      || localListingCatalog.corruptionPolicy
        !== 'preserve-exact-raw-and-fail-closed'
      || localListingCatalog.privacyExport
        !== 'current-owner-listings-only'
      || localListingCatalog.confirmedAccountDeletion
        !== 'current-owner-listings-ended-and-retained'
      || localListingCatalog.retentionPeriodInvented !== false
      || localListingCatalog.containsCredentials !== false
      || localListingCatalog.externalTransferAdded !== false
      || localListingCatalog.backendAuthorityChanged !== false) {
    fail('Local listing-catalog privacy disclosure is incomplete or overstated.');
  }
  const localReviewReputation = object(
    privacy.localReviewReputation,
    'localReviewReputation',
  );
  assertExactKeys(localReviewReputation, [
    'status',
    'dataClasses',
    'identityBinding',
    'corruptionPolicy',
    'capacityPolicy',
    'demoSeedPolicy',
    'privacyExport',
    'confirmedAccountDeletion',
    'retentionPeriodInvented',
    'containsCredentials',
    'externalTransferAdded',
    'backendAuthorityChanged',
  ], 'localReviewReputation');
  if (localReviewReputation.status
        !== 'implemented-local-fallback-public-read-authenticated-participant-write'
      || !Array.isArray(localReviewReputation.dataClasses)
      || localReviewReputation.dataClasses.join(',') !== [
        'public-reviewer-reviewed-user-rating-and-comment',
        'booking-bound-directional-criteria-ratings-and-notes',
      ].join(',')
      || localReviewReputation.identityBinding
        !== 'matching-auth-session-exact-completed-booking-direction-counterparty-item-and-needs-review-clear'
      || localReviewReputation.corruptionPolicy
        !== 'preserve-exact-raw-and-fail-closed'
      || localReviewReputation.capacityPolicy
        !== 'maximum-1000-per-document-reject-overflow-without-pruning'
      || localReviewReputation.demoSeedPolicy
        !== 'explicit-qa-bootstrap-only-no-read-time-seeding'
      || localReviewReputation.privacyExport
        !== 'current-account-authored-and-received-reviews-only'
      || localReviewReputation.confirmedAccountDeletion
        !== 'shared-public-reviews-retained-with-account-anonymization'
      || localReviewReputation.retentionPeriodInvented !== false
      || localReviewReputation.containsCredentials !== false
      || localReviewReputation.externalTransferAdded !== false
      || localReviewReputation.backendAuthorityChanged !== false) {
    fail('Local review/reputation privacy disclosure is incomplete or overstated.');
  }
  const localAccountProfile = object(
    privacy.localAccountProfile,
    'localAccountProfile',
  );
  assertExactKeys(localAccountProfile, [
    'status',
    'dataClasses',
    'publicCache',
    'identityBinding',
    'protectedFields',
    'corruptionPolicy',
    'privacyExport',
    'confirmedAccountDeletion',
    'retentionPeriodInvented',
    'containsCredentials',
    'externalTransferAdded',
    'backendAuthorityChanged',
  ], 'localAccountProfile');
  if (localAccountProfile.status
        !== 'implemented-local-fallback-authenticated-current-account-scoped'
      || !Array.isArray(localAccountProfile.dataClasses)
      || localAccountProfile.dataClasses.join(',') !== [
        'public-profile-and-visibility-preferences',
        'private-contact-address-and-approximate-location',
        'account-identity-verification-moderation-payout-and-reputation',
      ].join(',')
      || localAccountProfile.publicCache
        !== 'may-contain-public-profiles-owned-by-other-accounts'
      || localAccountProfile.identityBinding
        !== 'matching-auth-session-and-exact-current-account-for-field-patches'
      || localAccountProfile.protectedFields
        !== 'identity-verification-moderation-payout-reputation-and-deactivation'
      || localAccountProfile.corruptionPolicy
        !== 'preserve-exact-raw-and-fail-closed'
      || localAccountProfile.privacyExport
        !== 'current-account-profile-only-other-cache-and-auth-session-excluded'
      || localAccountProfile.confirmedAccountDeletion
        !== 'confirmed-account-profile-anonymized-exact-current-cache-and-session-cleared-successor-preserved'
      || localAccountProfile.retentionPeriodInvented !== false
      || localAccountProfile.containsCredentials !== false
      || localAccountProfile.externalTransferAdded !== false
      || localAccountProfile.backendAuthorityChanged !== false) {
    fail('Local account/profile privacy disclosure is incomplete or overstated.');
  }
  const operationalDataService = sourceText(
    root,
    sourceTexts,
    'lib/services/data_service.dart',
  );
  for (const marker of [
    'exportOperationalRecordsForPrivacy()',
    'clearOperationalRecordsForAccountDeletion(',
    "'unattributedLegacyNotificationsExcluded': true",
    "'scope': 'current-authenticated-account'",
    'exportOwnedListingsForPrivacy()',
    'deactivateAllListingsForUser(',
    '_decodeListingsStrict(',
    '_maxLocalListings = 1000',
    'exportReviewRecordsForPrivacy()',
    '_decodeClassicReviewsStrict(',
    '_decodeMultiReviewsStrict(',
    '_maxLocalReviews = 1000',
    'exportCurrentAccountProfileForPrivacy()',
    'updateCurrentUserProfile(',
    '_decodeLocalUsersStrict(',
    '_maxLocalUsers = 1000',
  ]) {
    if (!operationalDataService.includes(marker)) {
      fail(`Local operational-record privacy coverage is missing ${marker}.`);
    }
  }
  const privacyExportSource = sourceText(
    root,
    sourceTexts,
    'lib/services/privacy_export_service.dart',
  );
  if (!privacyExportSource.includes(
    'await DataService.exportOwnedListingsForPrivacy()',
  )) {
    fail('Privacy UI is missing the current-owner local listing export.');
  }
  if (!privacyExportSource.includes(
    'await DataService.exportReviewRecordsForPrivacy()',
  )) {
    fail('Privacy UI is missing the current-account local review export.');
  }
  if (!privacyExportSource.includes(
    'PrivacyExportSection.accountProfile',
  ) || !privacyExportSource.includes(
    'await DataService.exportCurrentAccountProfileForPrivacy()',
  )) {
    fail('Privacy UI is missing the exact-current local account/profile export.');
  }
  const operationalDeletion = sourceText(
    root,
    sourceTexts,
    'lib/services/account_deletion_service.dart',
  );
  if ([...operationalDeletion.matchAll(
    /DataService\.clearOperationalRecordsForAccountDeletion\(user\.id\)/gu,
  )].length !== 1 || [...operationalDeletion.matchAll(
    /DataService\.clearOperationalRecordsForConfirmedAccountDeletion\(/gu,
  )].length !== 1) {
    fail('Both confirmed account deletion paths must clear scoped local operational records.');
  }
  const localSafetyPrivacy = sourceText(
    root,
    sourceTexts,
    'lib/services/local_safety_privacy_service.dart',
  );
  for (const marker of [
    "storageKey = 'local_safety_privacy_state_v1'",
    'LocalPrincipalScope.maxRetainedPrincipals',
    'legacyGuestQuarantined',
    'quarantinedPrincipals',
    "'scope': 'local-principal'",
    'clearCurrentPrincipal()',
  ]) {
    if (!localSafetyPrivacy.includes(marker)) {
      fail(`Local principal privacy coverage is missing ${marker}.`);
    }
  }
  assertSourceContracts({ root, sourceTexts });

  const binary = object(privacy.binaryEvidence, 'binaryEvidence');
  const expectedCandidateEvidenceRef = `docs/evidence/b11/android-candidate-${candidate.buildNumber}.json`;
  if (binary.candidateEvidenceRef !== expectedCandidateEvidenceRef) {
    fail('binaryEvidence must reference the current sanitized Android candidate evidence.');
  }
  if (!superseded && binary.binaryScan !== 'passed') fail('The bound Android binary privacy scan must pass.');
  assertSha256(binary.binaryScanReportSha256, 'binaryEvidence.binaryScanReportSha256');
  const candidateEvidence = evidenceJson(root, evidenceTexts, binary.candidateEvidenceRef);
  if (candidateEvidence.candidate?.commit !== candidate.commit || candidateEvidence.candidate?.buildNumber !== candidate.buildNumber) {
    fail('Binary evidence must be bound to the same candidate.');
  }
  if (superseded) {
    if (binary.binaryScan !== 'failed-extended-runtime-origin-scan'
        || binary.releaseCheckStatus !== 'blocked-replacement-pending') {
      fail('A superseded candidate must remain blocked by the extended privacy rescan.');
    }
    const supersessionRef = nonEmptyString(
      binary.supersessionEvidenceRef,
      'binaryEvidence.supersessionEvidenceRef',
    );
    if (supersessionRef !== `docs/evidence/b11/android-candidate-${candidate.buildNumber}-superseded-privacy-rescan-20260812.json`) {
      fail('Supersession evidence must bind the exact old candidate.');
    }
    const supersessionEvidence = evidenceJson(root, evidenceTexts, supersessionRef);
    if (supersessionEvidence.status !== 'superseded-privacy-rescan-failed'
        || supersessionEvidence.extendedPrivacyRescan?.status !== 'failed'
        || supersessionEvidence.remediation?.replacementBuildNumber !== candidate.replacementBuildNumber
        || supersessionEvidence.boundaries?.uploadedToStore !== false
        || supersessionEvidence.boundaries?.submissionAllowed !== false) {
      fail('Supersession evidence is incomplete or no longer fail closed.');
    }
  } else {
    if (candidateEvidence.privacyAndNetwork?.binaryScan !== 'passed'
        || candidateEvidence.privacyAndNetwork?.binaryScanReportSha256 !== binary.binaryScanReportSha256) {
      fail('Binary evidence scan status and report hash must match the privacy manifest.');
    }
    if (binary.releaseCheckStatus !== device.releaseChecks?.binaryPrivacyAndNetwork?.status) {
      fail('binaryEvidence.releaseCheckStatus must match the device release check.');
    }
  }

  const services = object(privacy.externalServices, 'externalServices');
  assertExactKeys(services, serviceKeys, 'externalServices');
  const providerClassification = evidenceJson(
    root,
    evidenceTexts,
    providerClassificationPath,
  );
  if (providerClassification.status !==
        'technical-provider-roles-classified-owner-contract-and-legal-approval-open'
      || providerClassification.technicalConclusion?.consoleAnswerAllowed !== false
      || providerClassification.blockingGates?.currentAccountContractAcceptanceConfirmed !== false
      || providerClassification.blockingGates?.retentionAndDeletionScheduleApproved !== false) {
    fail('Active provider classification must remain complete and externally unapproved.');
  }
  const classifiedServices = new Map(
    (providerClassification.services ?? []).map((service) => [service?.id, service]),
  );
  const hoster = object(services.hostingerVps, 'externalServices.hostingerVps');
  const smtp = object(
    services.googleWorkspaceSmtpRelay,
    'externalServices.googleWorkspaceSmtpRelay',
  );
  const activeProcessorDefinitions = [
    [
      'hostingerVps',
      hoster,
      'active-first-party-backend-and-database-hosting',
      'providerSeatAndRegionApproved',
    ],
    [
      'googleWorkspaceSmtpRelay',
      smtp,
      'active-staging-transactional-mail',
      'providerSeatAndSendingRegionApproved',
    ],
  ];
  for (const [serviceId, service, candidateState, regionApprovalKey]
    of activeProcessorDefinitions) {
    const classified = classifiedServices.get(serviceId);
    if (service.enabled !== true
        || service.role !== 'processor'
        || service.candidateState !== candidateState
        || service.providerClassificationEvidenceRef !== providerClassificationPath
        || classified?.technicalRole !== 'processor'
        || classified.candidateState !== candidateState
        || !Array.isArray(classified.actualCandidateTransfers)
        || classified.actualCandidateTransfers.length === 0) {
      fail(`${serviceId} must remain an explicitly inventoried active processor.`);
    }
    for (const approvalKey of [
      'contractAndDpaApproved',
      regionApprovalKey,
      'transferMechanismApproved',
      'retentionAndDeletionApproved',
    ]) {
      if (typeof service[approvalKey] !== 'boolean') {
        fail(`${serviceId}.${approvalKey} must be a boolean external decision.`);
      }
    }
  }
  if (!Array.isArray(hoster.dataTypes)
      || hoster.dataTypes.length !== dataTypeIds.length - 1
      || hoster.dataTypes.includes('paymentInfo')
      || dataTypeIds.some((id) => id !== 'paymentInfo' && !hoster.dataTypes.includes(id))) {
    fail('Hoster disclosure must cover every collected backend data type without payment credentials.');
  }
  if (!Array.isArray(smtp.dataTypes)
      || smtp.dataTypes.join(',') !== 'emailAddress') {
    fail('SMTP disclosure must preserve the classified transactional email-address transfer.');
  }
  if (services.firebaseCloudMessaging?.enabled !== true || services.firebaseCrashlytics?.enabled !== true) {
    fail('Firebase Messaging and Crashlytics must remain disclosed as enabled.');
  }
  for (const serviceKey of ['firebaseCloudMessaging', 'firebaseCrashlytics']) {
    const service = object(services[serviceKey], `externalServices.${serviceKey}`);
    if (service.candidateCollectionMode !== 'automatic-in-bound-candidate'
        || service.nextCandidateCollectionMode !== 'user-opt-in-default-off'
        || service.replacementCandidateRequired !== true) {
      fail(`${serviceKey} must separate the automatic bound candidate from the opt-in replacement source.`);
    }
  }
  const push = object(
    services.firebaseCloudMessaging,
    'externalServices.firebaseCloudMessaging',
  );
  if (push.payloadContractVersion !== 'v52'
      || push.neutralLockscreenCopy !==
        'Neue ShareItToo-Aktualisierung – in der App ansehen.'
      || push.authenticatedDetailRetrieval !== true
      || push.eventSpecificTtlImplemented !== true
      || push.bigQueryDeliveryMetricsExportEnabled !== false
      || push.analyticsLinkEnabled !== false
      || push.providerContractTransferAndStoreApproval !== false) {
    fail('FCM disclosure must preserve the local V5.2 contract and the open provider/Store gate.');
  }
  const crashlytics = object(
    services.firebaseCrashlytics,
    'externalServices.firebaseCrashlytics',
  );
  if (crashlytics.serverDeletionQueueFoundationImplemented !== true
      || crashlytics.pseudonymousSubjectTransmissionImplemented !== false
      || crashlytics.providerDeletionExecutionEnabled !== false
      || crashlytics.analyticsBreadcrumbsEnabled !== false
      || crashlytics.crashInsightsSharingVerified !== false
      || crashlytics.userIdentifierConfigured !== false
      || crashlytics.providerContractTransferAndStoreApproval !== false) {
    fail('Crashlytics deletion foundation must remain default-off until pseudonymous subject transfer is approved.');
  }
  const socialAuth = object(services.firebaseAuthentication, 'externalServices.firebaseAuthentication');
  if (socialAuth.enabled !== true
      || socialAuth.enabledInBoundEnvironment !== true
      || socialAuth.role !==
        'processor-for-firebase-authentication-phone-active-social-provider-review-if-enabled'
      || socialAuth.socialProvidersActivated !== false
      || socialAuth.persistentIdentityDeletionImplemented !== true
      || !Array.isArray(socialAuth.providers)
      || socialAuth.providers.join(',') !== 'google,apple,facebook,phone'
      || !Array.isArray(socialAuth.dataTypes)
      || !socialAuth.dataTypes.includes('phoneNumber')) {
    fail('Firebase Authentication must disclose Google, Apple, Facebook, and phone verification.');
  }
  const maps = object(services.googleMapsPlatform, 'externalServices.googleMapsPlatform');
  if (maps.enabled !== true) {
    fail('The candidate must disclose its Google Maps integration.');
  }
  if (maps.activeTransferProven !== false
      || maps.role !== 'independent-controller-if-activated'
      || maps.nextCandidateActivationMode !== 'provider-gated-default-off'
      || maps.activationApproved !== false
      || maps.providerFactsComplete !== false) {
    fail('Google Maps must remain an unproven independent-controller transfer until activation.');
  }
  if (!superseded && (maps.clientCredentialEmbedded !== false || maps.serverProxied !== true)) {
    fail('The signed candidate must disclose the server-proxied Google Maps integration without a client credential.');
  }
  if (superseded && maps.clientCredentialEmbedded !== true) {
    fail('The superseded candidate must retain its truthful embedded Maps credential disclosure.');
  }
  if (maps.serverCredentialRestrictionVerified !== false && privacy.state === 'draft') {
    fail('The draft must not claim Google Maps server credential restrictions were verified.');
  }
  if (services.stripe?.enabledInCandidate !== false || services.stripe?.configuredMode !== 'memory') {
    fail('Stripe must remain disabled in this payment-memory candidate.');
  }
  if (services.openAiHelpers?.enabledInCandidate !== false || services.openAiHelpers?.endpointEmbedded !== false) {
    fail('OpenAI helpers must remain disabled and absent from this candidate.');
  }
  if (services.analytics?.enabled !== false || services.advertising?.enabled !== false) {
    fail('Analytics and advertising must remain disabled.');
  }

  if (!Array.isArray(privacy.dataTypes) || privacy.dataTypes.length !== dataTypeIds.length) {
    fail('dataTypes must contain the complete cross-platform inventory.');
  }
  const observedIds = [];
  for (const itemValue of privacy.dataTypes) {
    const item = object(itemValue, 'dataTypes entry');
    assertExactKeys(item, ['id', 'google', 'apple', 'collected', 'optional', 'linkedToUser', 'tracking', 'purposes'], `dataTypes.${item.id ?? 'unknown'}`);
    observedIds.push(nonEmptyString(item.id, 'dataTypes.id'));
    nonEmptyString(item.google, `dataTypes.${item.id}.google`);
    nonEmptyString(item.apple, `dataTypes.${item.id}.apple`);
    for (const key of ['collected', 'optional', 'linkedToUser', 'tracking']) {
      if (typeof item[key] !== 'boolean') fail(`dataTypes.${item.id}.${key} must be boolean.`);
    }
    if (item.tracking !== false) fail(`dataTypes.${item.id} must not claim tracking.`);
    if (!Array.isArray(item.purposes) || item.purposes.length === 0
        || item.purposes.some((purpose) => !purposeValues.has(purpose))) {
      fail(`dataTypes.${item.id}.purposes contains an invalid or empty purpose list.`);
    }
  }
  if (observedIds.join(',') !== dataTypeIds.join(',')) fail('dataTypes must use the required IDs and order.');
  if (privacy.dataTypes.find((item) => item.id === 'preciseLocation')?.collected !== true) {
    fail('Fine-location and booking flows require preciseLocation disclosure.');
  }
  if (privacy.dataTypes.find((item) => item.id === 'paymentInfo')?.collected !== false) {
    fail('The payment-memory candidate must not claim collection of user payment credentials.');
  }
  const deviceId = privacy.dataTypes.find((item) => item.id === 'deviceOrOtherIds');
  if (deviceId?.collected !== true || deviceId.optional !== false) {
    fail('The automatic bound candidate requires non-optional device or installation ID disclosure.');
  }
  const interactions = privacy.dataTypes.find((item) => item.id === 'appInteractions');
  if (interactions?.collected !== true || interactions.optional !== false
      || interactions.linkedToUser !== false || !interactions.purposes.includes('analytics')) {
    fail('The automatic bound candidate requires non-optional, non-linked app interaction disclosure for analytics.');
  }

  const decisions = object(privacy.requiredDecisions, 'requiredDecisions');
  assertExactKeys(decisions, decisionKeys, 'requiredDecisions');
  decisionKeys.forEach((key) => assertApproval(decisions[key], `requiredDecisions.${key}`));

  const forms = object(privacy.platformForms, 'platformForms');
  assertExactKeys(forms, ['googlePlay', 'apple'], 'platformForms');
  for (const platform of ['googlePlay', 'apple']) {
    const form = object(forms[platform], `platformForms.${platform}`);
    assertExactKeys(form, ['status', 'evidenceRef'], `platformForms.${platform}`);
    if (!['draft', 'verified'].includes(form.status)) fail(`platformForms.${platform}.status must be draft or verified.`);
    if (form.status === 'draft' && form.evidenceRef !== null) fail(`platformForms.${platform} draft must not reference evidence.`);
    if (form.status === 'verified') assertApproval({ status: 'closed', evidenceRef: form.evidenceRef }, `platformForms.${platform}`);
  }

  const storeGate = object(privacy.storeGate, 'storeGate');
  if (storeGate.field !== 'blockingGates.finalBinaryPrivacyScan') {
    fail('storeGate.field must reference blockingGates.finalBinaryPrivacyScan.');
  }
  if (storeGate.status !== submission.blockingGates?.finalBinaryPrivacyScan) {
    fail('Privacy store gate must match store/submission.json.');
  }

  const boundaries = object(privacy.boundaries, 'boundaries');
  for (const key of ['legalApproval', 'storeSubmissionChanged', 'publicRoutesChanged', 'productionChanged', 'containsSecrets', 'containsAccountData']) {
    if (boundaries[key] !== false) fail(`boundaries.${key} must be false.`);
  }

  const allDecisionsClosed = decisionKeys.every((key) => decisions[key].status === 'closed');
  const allDecisionsOpen = decisionKeys.every((key) => decisions[key].status === 'open');
  const formsVerified = ['googlePlay', 'apple'].every((platform) => forms[platform].status === 'verified');
  const activeProcessorApprovals = activeProcessorDefinitions.flatMap(
    ([, service, , regionApprovalKey]) => [
      service.contractAndDpaApproved,
      service[regionApprovalKey],
      service.transferMechanismApproved,
      service.retentionAndDeletionApproved,
    ],
  );
  const activeProcessorsApproved = activeProcessorApprovals.every((value) => value === true);
  const activeProcessorsOpen = activeProcessorApprovals.every((value) => value === false);
  const approved = privacy.state === 'approved'
    && privacy.approvalAllowed === true
    && allDecisionsClosed
    && formsVerified
    && activeProcessorsApproved
    && maps.serverCredentialRestrictionVerified === true
    && binary.releaseCheckStatus === 'passed'
    && storeGate.status === 'closed';

  if (privacy.state === 'draft') {
    if (privacy.approvalAllowed !== false
        || !allDecisionsOpen
        || !activeProcessorsOpen
        || formsVerified
        || storeGate.status !== 'open') {
      fail('Draft privacy disclosures must remain fail closed with every owner decision and Store gate open.');
    }
  } else if (!approved) {
    fail('Approved privacy disclosures are internally incomplete.');
  }
  if (requireApproved && !approved) fail('Approved privacy disclosures are required, but the manifest remains draft.');

  return {
    state: privacy.state,
    approvalAllowed: privacy.approvalAllowed,
    dataTypeCount: privacy.dataTypes.length,
    externalServiceCount: serviceKeys.length,
    storeGate: storeGate.status,
    binaryReleaseCheck: binary.releaseCheckStatus,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--require-approved')) fail(`Unknown argument: ${args.find((arg) => arg !== '--require-approved')}`);
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = validatePrivacyDisclosures({
    root,
    privacyManifest: JSON.parse(readFileSync(resolve(root, 'store/privacy-disclosures.json'), 'utf8')),
    submissionManifest: JSON.parse(readFileSync(resolve(root, 'store/submission.json'), 'utf8')),
    deviceManifest: JSON.parse(readFileSync(resolve(root, 'store/device-validation.json'), 'utf8')),
    requireApproved: args.includes('--require-approved'),
  });
  console.log(
    `Privacy disclosures valid: state=${result.state}, approvalAllowed=${result.approvalAllowed}, `
    + `dataTypes=${result.dataTypeCount}, services=${result.externalServiceCount}, `
    + `binaryReleaseCheck=${result.binaryReleaseCheck}, finalBinaryPrivacyScan=${result.storeGate}.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
