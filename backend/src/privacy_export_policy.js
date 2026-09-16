const accessCopyPurpose = 'access_copy';
const dataPortabilityPurpose = 'data_portability';

export const accountExportPurposes = Object.freeze([
  accessCopyPurpose,
  dataPortabilityPurpose,
]);

const credentialKeyPattern = /(?:password|passcode|credential|access.?token|refresh.?token|authorization|cookie|private.?key|api.?key)/iu;
const identifierKeyPattern = /(?:^id$|_id$|_ids$|Id$|Ids$)/u;
const explicitlyWithheldKeys = new Set([
  'device_label',
  'user_agent',
  'ip_address',
  'provider_subject',
  'firebase_user_id',
  'session_id',
  'sessionId',
  'idempotency_key',
  'request_hash',
  'response_payload',
  'payment_configuration_key',
  'compatibility_hash',
  'membership_hash',
  'private_pilot_region_code',
  'moderation_status',
  'moderation_reason_code',
  'payload_sha256',
  'facts',
  'basis',
  'reasoning',
  'detection_method',
  'automated_means',
  'reporter_reference',
  'access_level',
  'retention_category',
  'legal_hold_flag',
  'review_result',
  'limitations',
  'scan_engine',
  'quarantine_reason_code',
  'last_error_category',
  'last_error_code',
  'request_id',
]);

function cloneRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {};
}

function records(value) {
  return Array.isArray(value) ? value : [];
}

function own(recordsValue, relationshipKey) {
  return records(recordsValue).filter((entry) => entry?.[relationshipKey] === true);
}

function portabilityProjection(raw) {
  const marketplace = cloneRecord(raw.marketplace);
  const groups = cloneRecord(marketplace.bookingGroups);
  const communication = cloneRecord(raw.communication);
  const support = cloneRecord(communication.support);
  const trustAndSafety = cloneRecord(raw.trustAndSafety);
  const ownQuotes = own(groups.quotes, 'proposed_by_me');
  const ownQuoteIds = new Set(ownQuotes.map((entry) => entry?.id).filter(Boolean));

  return {
    account: raw.account,
    authentication: {
      identities: records(raw.authentication?.identities),
      pushDevices: records(raw.authentication?.pushDevices),
    },
    marketplace: {
      listings: records(marketplace.listings),
      listingSets: marketplace.listingSets,
      bookings: records(marketplace.bookings),
      bookingQuotes: records(marketplace.bookingQuotes),
      bookingGroups: {
        groups: records(groups.groups),
        positions: records(groups.positions),
        quotes: ownQuotes,
        quotePositions: records(groups.quotePositions)
          .filter((entry) => ownQuoteIds.has(entry?.group_quote_id)),
        stateEvents: own(groups.stateEvents, 'acted_by_me'),
        commands: own(groups.commands, 'acted_by_me'),
        itemBookingBindings: own(groups.itemBookingBindings, 'bound_by_me'),
        sharedAppointments: own(groups.sharedAppointments, 'created_by_me'),
        appointmentCommands: own(groups.appointmentCommands, 'acted_by_me'),
        itemEvidenceRemainsInV52BookingRecords: true,
      },
      rentalCart: marketplace.rentalCart,
      platformContracts: records(marketplace.platformContracts),
      platformContractDeclarations:
        records(marketplace.platformContractDeclarations),
      platformContractReceipts: records(marketplace.platformContractReceipts),
      withdrawals: records(marketplace.withdrawals),
      withdrawalReceipts: records(marketplace.withdrawalReceipts),
    },
    communication: {
      messages: own(communication.messages, 'sent_by_me'),
      v52ConditionEvidenceBindings:
        own(communication.v52ConditionEvidenceBindings, 'recorded_by_me'),
      v52ConditionConfirmationBindings:
        own(communication.v52ConditionConfirmationBindings, 'verified_by_me'),
      v52ConfirmationChallengeBindings:
        own(communication.v52ConfirmationChallengeBindings, 'presented_by_me'),
      v52ConfirmationVerificationEvents:
        own(communication.v52ConfirmationVerificationEvents, 'verified_by_me'),
      v52ReturnCases: own(communication.v52ReturnCases, 'opened_by_me'),
      v52ReturnCaseEvents: own(communication.v52ReturnCaseEvents, 'acted_by_me'),
      support: {
        privacyRightsRequests: records(support.privacyRightsRequests),
        privacyIdentityVerifications: records(support.privacyIdentityVerifications),
        privacyDeadlineExtensions: records(support.privacyDeadlineExtensions),
        dsaNoticeLocatorAmendments: records(support.dsaNoticeLocatorAmendments),
        messages: own(support.messages, 'sent_by_me'),
        appeals: records(support.appeals),
        submittedEvidence: records(support.submittedEvidence),
        submittedEvidenceFiles: records(support.submittedEvidenceFiles),
      },
    },
    uploadedFiles: records(raw.uploadedFiles),
    notifications: {
      preferences: raw.notifications?.preferences ?? null,
    },
    trustAndSafety: {
      reviews: records(trustAndSafety.reviews)
        .filter((entry) => entry?.relationship === 'submitted'),
      reports: records(trustAndSafety.reports),
      moderationReviewRequests: records(trustAndSafety.moderationReviewRequests),
      blocks: records(trustAndSafety.blocks),
      disputes: own(trustAndSafety.disputes, 'opened_by_me'),
    },
    financialActivity: raw.financialActivity,
  };
}

function collectIdentifiers(value, result) {
  if (Array.isArray(value)) {
    for (const entry of value) collectIdentifiers(entry, result);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (identifierKeyPattern.test(key)) {
      const identifiers = Array.isArray(entry) ? entry : [entry];
      for (const identifier of identifiers) {
        if (typeof identifier === 'string' && identifier.trim() !== '') {
          result.add(identifier);
        }
      }
    }
    collectIdentifiers(entry, result);
  }
}

function documentReferenceMap(value) {
  const identifiers = new Set();
  collectIdentifiers(value, identifiers);
  const result = new Map();
  let sequence = 0;
  for (const identifier of identifiers) {
    sequence += 1;
    result.set(identifier, `ref_${String(sequence).padStart(6, '0')}`);
  }
  return result;
}

function sanitize(value, references, parentKey = '') {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitize(entry, references, parentKey));
  }
  if (!value || typeof value !== 'object') {
    return typeof value === 'string'
      && identifierKeyPattern.test(parentKey)
      && references.has(value)
      ? references.get(value)
      : value;
  }
  const result = {};
  for (const [rawKey, entry] of Object.entries(value)) {
    if ((rawKey !== 'password_changed_at' && credentialKeyPattern.test(rawKey))
        || explicitlyWithheldKeys.has(rawKey)) continue;
    const key = references.get(rawKey) ?? rawKey;
    result[key] = sanitize(entry, references, rawKey);
  }
  return result;
}

function assertSanitized(value, references, parentKey = '') {
  if (Array.isArray(value)) {
    for (const entry of value) assertSanitized(entry, references, parentKey);
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string'
        && identifierKeyPattern.test(parentKey)
        && references.has(value)) {
      throw new Error('account_export_raw_identifier_detected');
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if ((key !== 'password_changed_at' && credentialKeyPattern.test(key))
        || explicitlyWithheldKeys.has(key)
        || references.has(key)) {
      throw new Error('account_export_forbidden_field_detected');
    }
    assertSanitized(entry, references, key);
  }
}

export function validateAccountExportPurpose(value) {
  if (!accountExportPurposes.includes(value)) {
    const error = new TypeError('account_export_purpose_invalid');
    error.code = 'account_export_purpose_invalid';
    throw error;
  }
  return value;
}

export function applyAccountExportPolicy(raw, purpose) {
  const exactPurpose = validateAccountExportPurpose(purpose);
  const projected = exactPurpose === dataPortabilityPurpose
    ? portabilityProjection(raw)
    : raw;
  const references = documentReferenceMap(projected);
  const data = sanitize(projected, references);
  assertSanitized(data, references);
  return Object.freeze({
    data,
    policy: Object.freeze({
      version: 'sit-account-export-policy-v2',
      purpose: exactPurpose,
      format: 'application/json',
      referenceScope: 'document_local',
      rootAccountBindingIdentifierIncluded: true,
      rawInternalIdentifiersIncluded: false,
      authenticationSecretsIncluded: false,
      providerSubjectsIncluded: false,
      internalSecuritySignalsIncluded: false,
      userVisibleSharedContentMayBeIncluded: exactPurpose === accessCopyPurpose,
      receivedStructuredExactLocationsIncluded: false,
      portabilityExcludesReceivedAndInferredRecords:
        exactPurpose === dataPortabilityPurpose,
    }),
  });
}
