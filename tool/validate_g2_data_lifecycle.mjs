#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePaths = {
  dataService: 'lib/services/data_service.dart',
  localSafetyPrivacy: 'lib/services/local_safety_privacy_service.dart',
  accountDeletion: 'lib/services/account_deletion_service.dart',
  privacyInfo: 'lib/screens/privacy_info_screen.dart',
  privacyExport: 'lib/services/privacy_export_service.dart',
  legalPrivacy: 'lib/screens/legal_privacy_screen.dart',
  mainNavigation: 'lib/navigation/main_navigation.dart',
  itemDetails: 'lib/widgets/item_details_overlay.dart',
  savedCartIntent: 'lib/widgets/saved_cart_intent.dart',
  login: 'lib/screens/login_screen.dart',
  register: 'lib/screens/register_screen.dart',
  backendApp: 'backend/src/app.js',
  backendExport: 'backend/src/privacy_export.js',
  backendWorkflow: 'backend/src/rental_cart_workflow.js',
  migration: 'backend/sql/migrations/027_g2_persistent_rental_cart.up.sql',
};

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (Object.keys(value).sort().join(',') !== expected.slice().sort().join(',')) {
    fail(`${label} must contain exactly: ${expected.join(', ')}.`);
  }
}

function exactArray(value, expected, label) {
  if (!Array.isArray(value) || value.join(',') !== expected.join(',')) {
    fail(`${label} must contain exactly: ${expected.join(', ')}.`);
  }
}

function source(root, sourceTexts, path) {
  return Object.hasOwn(sourceTexts, path)
    ? sourceTexts[path]
    : readFileSync(resolve(root, path), 'utf8');
}

function count(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function includesEvery(value, markers, label) {
  for (const marker of markers) {
    if (!value.includes(marker)) fail(`${label} is missing ${marker}.`);
  }
}

export function validateG2DataLifecycle({
  root,
  lifecycleManifest,
  sourceTexts = {},
}) {
  const lifecycle = object(lifecycleManifest, 'store/g2-data-lifecycle.json');
  exactKeys(lifecycle, [
    'schemaVersion',
    'state',
    'terminology',
    'currentSavedItems',
    'localSafetyPrivacy',
    'localOperationalRecords',
    'localListingCatalog',
    'localReviewReputation',
    'localAccountProfile',
    'persistentData',
    'boundaries',
  ], 'G2 lifecycle manifest');
  if (lifecycle.schemaVersion !== 1
      || lifecycle.state !== 'g2b-persistent-cart-active') {
    fail('G2 lifecycle manifest must bind the active G2B state.');
  }

  const terminology = object(lifecycle.terminology, 'terminology');
  exactKeys(terminology, ['savedItems', 'cartArea', 'projectContainer'], 'terminology');
  if (terminology.savedItems !== 'Gemerkt'
      || terminology.cartArea !== 'Mietkorb'
      || terminology.projectContainer !== 'Projektkorb') {
    fail('G2 terminology must use the approved names.');
  }

  const savedItems = object(lifecycle.currentSavedItems, 'currentSavedItems');
  exactKeys(savedItems, [
    'runtimeStatus',
    'binding',
    'storageScope',
    'canonicalKey',
    'legacyKeys',
    'principalBinding',
    'legacyMigrationRule',
    'exportStatus',
    'accountDeletionStatus',
    'retentionRule',
  ], 'currentSavedItems');
  if (savedItems.canonicalKey !== 'wishlist_state_v3') {
    fail('currentSavedItems.canonicalKey must bind the principal-scoped saved-state document.');
  }
  exactArray(savedItems.legacyKeys, [
    'wishlist_state_v2',
    'saved_item_ids',
    'wishlists_meta_v1',
    'wishlist_assign_v1',
  ], 'currentSavedItems.legacyKeys');
  if (savedItems.runtimeStatus !== 'active-local-device-principal-scoped'
      || savedItems.binding !== 'non-binding-no-reservation'
      || savedItems.storageScope !== 'local-device-opaque-principal-shared-preferences'
      || savedItems.principalBinding !== 'opaque-stable-token-or-guest'
      || savedItems.legacyMigrationRule !== 'guest-only-or-quarantine'
      || savedItems.exportStatus !== 'implemented-current-principal-local-section'
      || savedItems.accountDeletionStatus
        !== 'implemented-confirmed-account-principal-purge-by-explicit-identity-successor-preserved') {
    fail('Current Gemerkt lifecycle is incomplete or overstated.');
  }

  const safetyPrivacy = object(
    lifecycle.localSafetyPrivacy,
    'localSafetyPrivacy',
  );
  exactKeys(safetyPrivacy, [
    'runtimeStatus',
    'storageScope',
    'canonicalKey',
    'legacyKeys',
    'dataClasses',
    'principalBinding',
    'legacyMigrationRule',
    'corruptionPolicy',
    'maximumRetainedPrincipals',
    'exportStatus',
    'accountDeletionStatus',
    'retentionRule',
    'backendAuthority',
  ], 'localSafetyPrivacy');
  exactArray(safetyPrivacy.legacyKeys, [
    'blocked_user_ids_v1',
    'user_reports_v1',
    'hidden_listing_ids_v1',
    'listing_feedback_log_v1',
    'listing_feedback_reason_profile_v1',
    'muted_message_threads_v1',
    'messages_settings_v1',
    'notification_preferences_v2',
  ], 'localSafetyPrivacy.legacyKeys');
  exactArray(safetyPrivacy.dataClasses, [
    'blocked-users',
    'local-user-reports',
    'hidden-listings-and-feedback-profile',
    'muted-message-threads',
    'message-settings',
    'notification-preferences',
  ], 'localSafetyPrivacy.dataClasses');
  if (safetyPrivacy.runtimeStatus !== 'active-local-device-principal-scoped'
      || safetyPrivacy.storageScope
        !== 'local-device-opaque-principal-shared-preferences'
      || safetyPrivacy.canonicalKey !== 'local_safety_privacy_state_v1'
      || safetyPrivacy.principalBinding !== 'opaque-stable-token-or-guest'
      || safetyPrivacy.legacyMigrationRule
        !== 'unattributed-guest-only-attributed-exact-owner-or-quarantine'
      || safetyPrivacy.corruptionPolicy
        !== 'principal-bucket-quarantine-fail-closed-preserve-raw'
      || safetyPrivacy.maximumRetainedPrincipals !== 12
      || safetyPrivacy.exportStatus
        !== 'implemented-current-principal-local-section'
      || safetyPrivacy.accountDeletionStatus
        !== 'implemented-confirmed-account-principal-purge-by-explicit-identity-successor-preserved'
      || safetyPrivacy.backendAuthority
        !== 'remote-authoritative-when-enabled-local-qa-fallback-otherwise') {
    fail('Local safety/privacy lifecycle is incomplete or overstated.');
  }

  const operationalRecords = object(
    lifecycle.localOperationalRecords,
    'localOperationalRecords',
  );
  exactKeys(operationalRecords, [
    'runtimeStatus',
    'storageScope',
    'storageKeys',
    'dataClasses',
    'identityBinding',
    'legacyAttributionRule',
    'corruptionPolicy',
    'capacityPolicy',
    'mutationPolicy',
    'exportStatus',
    'accountDeletionStatus',
    'retentionRule',
    'backendAuthority',
  ], 'localOperationalRecords');
  exactArray(operationalRecords.storageKeys, [
    'message_threads_v1',
    'notifications',
    'rental_requests',
    'timeline_events',
    'read_requests_v1',
    'requests_last_seen_by_owner',
    'handover_return_state_v1',
    'handover_fail_counts',
    'handover_banners',
    'booking_selections_v2',
  ], 'localOperationalRecords.storageKeys');
  exactArray(operationalRecords.dataClasses, [
    'participant-message-threads-and-messages',
    'account-notifications',
    'participant-rental-requests-and-timeline',
    'account-read-and-last-seen-markers',
    'participant-handover-return-state',
    'participant-failure-counters-and-banners',
    'principal-booking-selections',
  ], 'localOperationalRecords.dataClasses');
  if (operationalRecords.runtimeStatus
        !== 'active-local-fallback-authenticated-participant-scoped'
      || operationalRecords.storageScope
        !== 'local-device-shared-preferences-remote-authoritative-when-enabled'
      || operationalRecords.identityBinding
        !== 'current-session-and-participant-or-current-principal-selection'
      || operationalRecords.legacyAttributionRule
        !== 'unattributed-notifications-preserved-unassigned-and-excluded'
      || operationalRecords.corruptionPolicy
        !== 'fail-closed-preserve-exact-raw-no-partial-rewrite'
      || operationalRecords.capacityPolicy
        !== 'bounded-reject-overflow-without-pruning'
      || operationalRecords.mutationPolicy
        !== 'serialized-verified-and-session-rechecked'
      || operationalRecords.exportStatus
        !== 'implemented-current-account-and-participant-local-section'
      || operationalRecords.accountDeletionStatus
        !== 'confirmed-account-convenience-state-purged-by-explicit-identity-shared-counterparty-audit-records-retained'
      || operationalRecords.retentionRule
        !== 'no-period-invented-shared-records-retained-for-counterparty-and-legal-audit-continuity'
      || operationalRecords.backendAuthority
        !== 'remote-authoritative-when-enabled-local-qa-fallback-otherwise') {
    fail('Local operational-record lifecycle is incomplete or overstated.');
  }

  const listingCatalog = object(
    lifecycle.localListingCatalog,
    'localListingCatalog',
  );
  exactKeys(listingCatalog, [
    'runtimeStatus',
    'storageScope',
    'storageKey',
    'dataClasses',
    'readScope',
    'mutationIdentityBinding',
    'corruptionPolicy',
    'capacityPolicy',
    'mutationPolicy',
    'exportStatus',
    'accountDeletionStatus',
    'retentionRule',
    'backendAuthority',
  ], 'localListingCatalog');
  exactArray(listingCatalog.dataClasses, [
    'public-listing-content-and-media',
    'listing-location-and-pricing',
    'owner-and-lifecycle-metadata',
  ], 'localListingCatalog.dataClasses');
  if (listingCatalog.runtimeStatus
        !== 'active-local-fallback-authenticated-owner-scoped'
      || listingCatalog.storageScope
        !== 'local-device-shared-preferences-remote-authoritative-when-enabled'
      || listingCatalog.storageKey !== 'items'
      || listingCatalog.readScope !== 'public-catalog-read'
      || listingCatalog.mutationIdentityBinding
        !== 'matching-auth-session-and-exact-listing-owner'
      || listingCatalog.corruptionPolicy
        !== 'fail-closed-preserve-exact-raw-no-partial-rewrite'
      || listingCatalog.capacityPolicy
        !== 'maximum-1000-reject-overflow-without-media-pruning'
      || listingCatalog.mutationPolicy
        !== 'serialized-verified-session-rechecked-and-revision-guarded'
      || listingCatalog.exportStatus
        !== 'implemented-current-owner-local-section'
      || listingCatalog.accountDeletionStatus
        !== 'current-owner-listings-ended-and-retained-no-period-invented'
      || listingCatalog.retentionRule
        !== 'no-automatic-60-day-deletion-no-period-invented'
      || listingCatalog.backendAuthority
        !== 'remote-authoritative-when-enabled-local-qa-fallback-otherwise') {
    fail('Local listing-catalog lifecycle is incomplete or overstated.');
  }

  const reviewReputation = object(
    lifecycle.localReviewReputation,
    'localReviewReputation',
  );
  exactKeys(reviewReputation, [
    'runtimeStatus',
    'storageScope',
    'storageKeys',
    'dataClasses',
    'readScope',
    'mutationIdentityBinding',
    'corruptionPolicy',
    'capacityPolicy',
    'mutationPolicy',
    'demoSeedPolicy',
    'exportStatus',
    'accountDeletionStatus',
    'retentionRule',
    'backendAuthority',
  ], 'localReviewReputation');
  exactArray(reviewReputation.storageKeys, [
    'reviews',
    'multi_reviews_v1',
  ], 'localReviewReputation.storageKeys');
  exactArray(reviewReputation.dataClasses, [
    'public-reviewer-reviewed-user-rating-and-comment',
    'booking-bound-directional-criteria-ratings-and-notes',
  ], 'localReviewReputation.dataClasses');
  if (reviewReputation.runtimeStatus
        !== 'active-local-fallback-public-read-authenticated-participant-write'
      || reviewReputation.storageScope
        !== 'local-device-shared-preferences-remote-authoritative-when-enabled'
      || reviewReputation.readScope !== 'public-reputation-read'
      || reviewReputation.mutationIdentityBinding
        !== 'matching-auth-session-exact-completed-booking-direction-counterparty-item-and-needs-review-clear'
      || reviewReputation.corruptionPolicy
        !== 'fail-closed-preserve-exact-raw-no-partial-rewrite'
      || reviewReputation.capacityPolicy
        !== 'maximum-1000-per-document-reject-overflow-without-pruning'
      || reviewReputation.mutationPolicy
        !== 'serialized-verified-session-rechecked-and-booking-snapshot-guarded'
      || reviewReputation.demoSeedPolicy
        !== 'explicit-qa-bootstrap-only-no-read-time-seeding'
      || reviewReputation.exportStatus
        !== 'implemented-current-account-authored-and-received-local-section'
      || reviewReputation.accountDeletionStatus
        !== 'shared-public-reviews-retained-with-account-anonymization-no-period-invented'
      || reviewReputation.retentionRule
        !== 'no-period-invented-shared-reputation-records-retained'
      || reviewReputation.backendAuthority
        !== 'remote-authoritative-when-enabled-local-qa-fallback-otherwise') {
    fail('Local review/reputation lifecycle is incomplete or overstated.');
  }

  const accountProfile = object(
    lifecycle.localAccountProfile,
    'localAccountProfile',
  );
  exactKeys(accountProfile, [
    'runtimeStatus',
    'storageScope',
    'storageKeys',
    'dataClasses',
    'readScope',
    'mutationIdentityBinding',
    'protectedFieldPolicy',
    'corruptionPolicy',
    'capacityPolicy',
    'mutationPolicy',
    'exportStatus',
    'accountDeletionStatus',
    'retentionRule',
    'backendAuthority',
  ], 'localAccountProfile');
  exactArray(accountProfile.storageKeys, [
    'currentUser',
    'users',
  ], 'localAccountProfile.storageKeys');
  exactArray(accountProfile.dataClasses, [
    'public-profile-and-visibility-preferences',
    'private-contact-address-and-approximate-location',
    'account-identity-verification-moderation-payout-and-reputation',
  ], 'localAccountProfile.dataClasses');
  if (accountProfile.runtimeStatus
        !== 'active-local-fallback-authenticated-current-account-scoped'
      || accountProfile.storageScope
        !== 'local-device-shared-preferences-remote-authoritative-when-enabled'
      || accountProfile.readScope
        !== 'exact-current-account-plus-public-profile-cache'
      || accountProfile.mutationIdentityBinding
        !== 'matching-auth-session-and-exact-current-account-field-patch'
      || accountProfile.protectedFieldPolicy
        !== 'identity-verification-moderation-payout-reputation-and-deactivation-not-caller-mutable'
      || accountProfile.corruptionPolicy
        !== 'fail-closed-preserve-exact-raw-no-read-time-normalization'
      || accountProfile.capacityPolicy
        !== 'maximum-1000-profiles-and-16-mib-document-reject-overflow-without-pruning'
      || accountProfile.mutationPolicy
        !== 'serialized-verified-paired-current-and-cache-write-with-exact-rollback'
      || accountProfile.exportStatus
        !== 'implemented-current-account-profile-only-cache-and-session-excluded'
      || accountProfile.accountDeletionStatus
        !== 'confirmed-account-profile-anonymized-exact-current-cache-and-session-cleared-successor-preserved'
      || accountProfile.retentionRule
        !== 'current-cache-cleared-on-logout-or-deletion-anonymized-public-entry-retained-no-period-invented'
      || accountProfile.backendAuthority
        !== 'remote-authoritative-when-enabled-local-qa-fallback-otherwise') {
    fail('Local account/profile lifecycle is incomplete or overstated.');
  }

  const persistent = object(lifecycle.persistentData, 'persistentData');
  exactKeys(persistent, ['rentalCart', 'projectCart'], 'persistentData');
  const rentalCart = object(persistent.rentalCart, 'persistentData.rentalCart');
  exactKeys(rentalCart, [
    'runtimeStatus',
    'binding',
    'storageKeys',
    'principalBinding',
    'legacyMigrationRule',
    'serverDatasets',
    'exportStatus',
    'accountDeletionStatus',
    'retentionRule',
    'serverAuthoritativeRecheck',
  ], 'persistentData.rentalCart');
  exactArray(
    rentalCart.storageKeys,
    ['rental_cart_v2', 'rental_cart_v1', 'rental_cart_sync_owner_v1'],
    'rentalCart.storageKeys',
  );
  exactArray(
    rentalCart.serverDatasets,
    ['rental_carts', 'rental_cart_items'],
    'rentalCart.serverDatasets',
  );
  if (rentalCart.runtimeStatus !== 'active-guest-local-principal-account-server'
      || rentalCart.binding !== 'non-binding-no-reservation-no-hold'
      || rentalCart.principalBinding !== 'opaque-stable-token-or-guest'
      || rentalCart.legacyMigrationRule !== 'guest-only-or-quarantine'
      || rentalCart.exportStatus
        !== 'implemented-current-principal-local-and-account-export'
      || rentalCart.accountDeletionStatus
        !== 'implemented-explicit-server-delete-and-current-principal-local-purge'
      || rentalCart.retentionRule
        !== 'user-controlled-until-removal-confirmed-account-deletion-or-app-data-clear'
      || rentalCart.serverAuthoritativeRecheck !== true) {
    fail('Persistent rental-cart lifecycle is incomplete or overstated.');
  }

  const projectCart = object(persistent.projectCart, 'persistentData.projectCart');
  exactKeys(projectCart, [
    'runtimeStatus',
    'binding',
    'storageKeys',
    'principalBinding',
    'legacyMigrationRule',
    'serverDatasets',
    'exportStatus',
    'accountDeletionStatus',
    'retentionRule',
  ], 'persistentData.projectCart');
  exactArray(
    projectCart.storageKeys,
    ['rental_cart_v2', 'project_cart_v1'],
    'projectCart.storageKeys',
  );
  exactArray(
    projectCart.serverDatasets,
    ['rental_cart_projects'],
    'projectCart.serverDatasets',
  );
  if (projectCart.runtimeStatus !== 'active-guest-local-principal-account-server'
      || projectCart.binding !== 'organizational-container-no-group-request'
      || projectCart.principalBinding !== 'opaque-stable-token-or-guest'
      || projectCart.legacyMigrationRule !== 'guest-only-or-quarantine'
      || projectCart.exportStatus
        !== 'implemented-current-principal-local-and-account-export'
      || projectCart.accountDeletionStatus
        !== 'implemented-cascade-and-current-principal-local-purge'
      || projectCart.retentionRule
        !== 'user-controlled-until-removal-confirmed-account-deletion-or-app-data-clear') {
    fail('Persistent project-cart lifecycle is incomplete or overstated.');
  }

  const boundaries = object(lifecycle.boundaries, 'boundaries');
  exactKeys(boundaries, [
    'persistentCartEnabled',
    'projectCartEnabled',
    'newDataCollectionEnabled',
    'operationalLocalFallbackHardened',
    'reservationCreatedByCart',
    'availabilityHoldCreatedByCart',
    'groupRequestEnabled',
    'paymentChanged',
    'retentionPeriodInvented',
    'legalApprovalChanged',
    'historicalSnapshotsChanged',
    'safetyBackendAuthorityChanged',
    'operationalBackendAuthorityChanged',
    'productionChanged',
  ], 'boundaries');
  if (boundaries.persistentCartEnabled !== true
      || boundaries.projectCartEnabled !== true
      || boundaries.newDataCollectionEnabled !== true
      || boundaries.operationalLocalFallbackHardened !== true) {
    fail('G2B persistent cart activation must be recorded.');
  }
  for (const key of [
    'reservationCreatedByCart',
    'availabilityHoldCreatedByCart',
    'groupRequestEnabled',
    'paymentChanged',
    'retentionPeriodInvented',
    'legalApprovalChanged',
    'historicalSnapshotsChanged',
    'safetyBackendAuthorityChanged',
    'operationalBackendAuthorityChanged',
    'productionChanged',
  ]) {
    if (boundaries[key] !== false) fail(`boundaries.${key} must remain false.`);
  }

  const dataService = source(root, sourceTexts, sourcePaths.dataService);
  includesEvery(dataService, [
    "'wishlist_state_v3'",
    "'wishlist_state_v2'",
    "'rental_cart_v2'",
    "'rental_cart_v1'",
    "'project_cart_v1'",
    "'rental_cart_sync_owner_v1'",
    'syncGuestRentalCartAfterAuthentication',
    'BackendRepository.putRentalCartProject',
    'BackendRepository.putRentalCartItem',
    'BackendRepository.recheckRentalCart',
    "'persistentRentalCart': true",
    "'persistentProjectCart': true",
    'prefs.remove(_rentalCartKey)',
    'prefs.remove(_wishlistStateKey)',
    'prefs.remove(_projectCartKey)',
    'prefs.remove(_rentalCartSyncOwnerKey)',
    'canSyncGuestCartToAccount',
    'canReadLocalRentalCart',
    "'scope': 'local-principal'",
    "'principalScope'",
    'registry.quarantinedPrincipals.remove(principal.token)',
    'exportOperationalRecordsForPrivacy()',
    'clearOperationalRecordsForAccountDeletion(',
    '_assertCurrentOperationalUserId(',
    '_decodeMessageThreadsStrict(',
    '_decodeNotificationsStrict(',
    '_decodeRentalRequestsStrict(',
    '_decodeTimelineStrict(',
    '_decodeListingsStrict(',
    '_maxLocalListings = 1000',
    'exportOwnedListingsForPrivacy()',
    'deactivateAllListingsForUser(',
    '_reviewMutationQueue',
    '_decodeClassicReviewsStrict(',
    '_decodeMultiReviewsStrict(',
    '_maxLocalReviews = 1000',
    'exportReviewRecordsForPrivacy()',
    "'sharedPublicReviewsRetainedAfterDeletion': true",
    '_accountProfileMutationQueue',
    '_decodeLocalUsersStrict(',
    '_maxLocalUsers = 1000',
    'updateCurrentUserProfile(',
    'exportCurrentAccountProfileForPrivacy()',
    'anonymizeAndDeactivateUser(',
  ], 'DataService G2B lifecycle');
  const syncStart = dataService.indexOf('syncGuestRentalCartAfterAuthentication');
  const syncEnd = dataService.indexOf('static Future<RentalCart> getRentalCart', syncStart);
  const syncSource = dataService.slice(syncStart, syncEnd);
  const lastRemoteUpsert = Math.max(
    syncSource.lastIndexOf('BackendRepository.putRentalCartProject'),
    syncSource.lastIndexOf('BackendRepository.putRentalCartItem'),
  );
  const localPurge = syncSource.lastIndexOf(
    '_writeLocalRentalCart(\n      guest,\n      const RentalCart(',
  );
  if (lastRemoteUpsert < 0 || localPurge <= lastRemoteUpsert) {
    fail('Guest cart must be purged only after all server upserts complete.');
  }

  const deletion = source(root, sourceTexts, sourcePaths.accountDeletion);
  if (count(
    deletion,
    /DataService\.clearSavedItemsForConfirmedAccountDeletion\(user\.id\)/gu,
  ) !== 2) {
    fail('Both confirmed account deletion paths must purge local G2 data.');
  }
  if (count(
    deletion,
    /LocalSafetyPrivacyService\.clearPrincipalForConfirmedAccountDeletion\(/gu,
  )
      !== 2) {
    fail('Both confirmed account deletion paths must purge local safety/privacy data.');
  }
  if (count(
    deletion,
    /DataService\.clearOperationalRecordsForAccountDeletion\(user\.id\)/gu,
  ) !== 1 || count(
    deletion,
    /DataService\.clearOperationalRecordsForConfirmedAccountDeletion\(/gu,
  ) !== 1) {
    fail('Both confirmed account deletion paths must apply scoped local operational cleanup.');
  }
  const localSafetyPrivacy = source(
    root,
    sourceTexts,
    sourcePaths.localSafetyPrivacy,
  );
  includesEvery(localSafetyPrivacy, [
    "storageKey = 'local_safety_privacy_state_v1'",
    'LocalPrincipalScope.maxRetainedPrincipals',
    'quarantinedPrincipals',
    'legacyGuestQuarantined',
    "'scope': 'local-principal'",
    "'principalScope'",
    'clearCurrentPrincipal()',
  ], 'Local safety/privacy lifecycle');

  const backendApp = source(root, sourceTexts, sourcePaths.backendApp);
  includesEvery(backendApp, [
    "app.get('/v1/rental-cart'",
    "app.put('/v1/rental-cart/projects/:id'",
    "app.put('/v1/rental-cart/items/:id'",
    "app.post('/v1/rental-cart/recheck'",
    "DELETE FROM rental_carts WHERE user_id = $1",
  ], 'Backend rental-cart API and deletion');
  const backendExport = source(root, sourceTexts, sourcePaths.backendExport);
  includesEvery(backendExport, [
    'rentalCartProjects',
    'rentalCartItems',
    'reservationCreated: false',
  ], 'Backend account export');
  const workflow = source(root, sourceTexts, sourcePaths.backendWorkflow);
  includesEvery(workflow, [
    'quoteBooking',
    'persist: false',
    'recheckRentalCart',
    'reservationCreated: false',
    "quote_status = 'unavailable'",
  ], 'Rental-cart workflow');
  if (/createBooking/u.test(workflow) || /INSERT\s+INTO\s+bookings/iu.test(workflow)) {
    fail('Rental-cart workflow must never create a booking or reservation.');
  }
  const migration = source(root, sourceTexts, sourcePaths.migration);
  includesEvery(migration, [
    'CREATE TABLE IF NOT EXISTS rental_carts',
    'CREATE TABLE IF NOT EXISTS rental_cart_projects',
    'CREATE TABLE IF NOT EXISTS rental_cart_items',
    'ON DELETE CASCADE',
  ], 'G2B migration');
  if (/hold_expires_at/u.test(migration) || /REFERENCES\s+bookings/iu.test(migration)) {
    fail('Rental-cart persistence must not create a hold or booking relationship.');
  }

  const mainNavigation = source(root, sourceTexts, sourcePaths.mainNavigation);
  if (!mainNavigation.includes('index != 0 && index != 1 && index != 4')) {
    fail('Guests must be able to open the local Mietkorb tab.');
  }
  const itemDetails = source(root, sourceTexts, sourcePaths.itemDetails);
  includesEvery(itemDetails, [
    "const Text('In den Mietkorb')",
    'saveListingToRentalCart(context, item: item, range: range)',
  ], 'Item detail Mietkorb entry');
  const savedCartIntent = source(root, sourceTexts, sourcePaths.savedCartIntent);
  includesEvery(savedCartIntent, [
    'DataService.addRentalCartItem',
    'expectedOwner: owner',
    'await action.isCurrent()',
    'await action.notice(context,',
    'noch nicht reserviert',
    'Speichern im Mietkorb konnte nicht bestätigt werden',
  ], 'Owned Mietkorb intent');
  for (const path of [sourcePaths.login, sourcePaths.register]) {
    if (!source(root, sourceTexts, path)
      .includes('syncGuestRentalCartAfterAuthentication')) {
      fail(`${path} must reconcile guest intent after authentication.`);
    }
  }

  const privacyInfo = source(root, sourceTexts, sourcePaths.privacyInfo);
  includesEvery(privacyInfo, ['widget.exportService.prepare(', 'Mietkorb'],
    'Privacy export and disclosure');
  const privacyExport = source(root, sourceTexts, sourcePaths.privacyExport);
  includesEvery(privacyExport, [
    'DataService.exportSavedItemsForPrivacy()',
    'DataService.exportReviewRecordsForPrivacy()',
    'LocalSafetyPrivacyService.exportCurrentPrincipal()',
    "'localDevice': local",
  ], 'Privacy export and disclosure');
  const legalPrivacy = source(root, sourceTexts, sourcePaths.legalPrivacy);
  includesEvery(legalPrivacy, [
    '„Gemerkt“ bleibt unverbindlich und ist keine Reservierung.',
    'Im Mietkorb – noch nicht reserviert',
    'bis zur Entfernung durch den Nutzer',
  ], 'Legal privacy copy');

  return {
    state: lifecycle.state,
    currentSavedItemKeyCount: savedItems.legacyKeys.length + 1,
    localSafetyPrivacyKeyCount: safetyPrivacy.legacyKeys.length + 1,
    persistentCartEnabled: true,
    projectCartEnabled: true,
    reservationCreatedByCart: false,
  };
}

function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const lifecycleManifest = JSON.parse(
    readFileSync(resolve(root, 'store/g2-data-lifecycle.json'), 'utf8'),
  );
  const result = validateG2DataLifecycle({ root, lifecycleManifest });
  process.stdout.write(
    `G2 data lifecycle: PASS (state=${result.state}, savedKeys=${result.currentSavedItemKeyCount}, persistentCart=true, projectCart=true, reservationCreated=false)\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}
