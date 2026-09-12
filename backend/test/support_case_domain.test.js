import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canTransitionSupportCase,
  classifyDsaNoticeLocator,
  newHumanReadableCaseNumber,
  newHumanReadableDsaNoticeNumber,
  newHumanReadableProductSafetyNoticeNumber,
  normalizeSupportCaseInput,
  normalizeDsaNoticeLocatorCompletion,
  normalizeSupportCaseTransition,
  supportApprovalLevels,
  supportCaseFamilies,
  supportCaseStatuses,
  supportIntakeScopeVersion,
  supportDsaNoticeIntakeVersion,
  supportFeedbackContextVersion,
  supportProductSafetyContactPointVersion,
  supportProductSafetyIntakeVersion,
  supportPacketVersion,
  supportPriorities,
  supportRouteFor,
  supportSafetyGuidanceVersion,
  supportSafetyTriageVersion,
  supportStatusMachineSource,
} from '../src/support_case_domain.js';

const now = new Date('2026-08-21T10:00:00.000Z');
const nextUpdateAt = new Date('2026-08-21T12:00:00.000Z');
const userActionDueAt = new Date('2026-08-23T18:00:00.000Z');
const decisionId = '11111111-1111-4111-8111-111111111111';

function safetyTriage(immediateDanger = false) {
  return {
    version: supportSafetyTriageVersion,
    packetVersion: supportPacketVersion,
    guidanceVersion: supportSafetyGuidanceVersion,
    immediateDanger,
    guidanceShown: immediateDanger,
  };
}

function issueScope(separationGuidanceShown = false) {
  return {
    version: supportIntakeScopeVersion,
    singleIssueConfirmed: true,
    separationGuidanceShown,
  };
}

function caseRecord(overrides = {}) {
  return {
    status: 'acknowledged',
    priority: 'p1',
    severity: 'high',
    approval_level: 'yellow_human_review',
    current_owner_role: 'booking_operations_owner',
    current_owner_id: null,
    decision_id: null,
    lock_version: 3,
    ...overrides,
  };
}

function transition(record, raw, actorRole = 'support') {
  return normalizeSupportCaseTransition(record, {
    expectedVersion: record.lock_version,
    reason: 'Sachlich geprüfter nächster Schritt.',
    nextAction: 'Fall innerhalb der Frist weiter prüfen.',
    nextUpdateAt,
    ...raw,
  }, { actorRole, now });
}

test('support taxonomy and controlled vocabularies stay canonical and exclude paused', () => {
  assert.equal(Object.keys(supportCaseFamilies).length, 13);
  assert.deepEqual(supportCaseStatuses, [
    'received',
    'acknowledged',
    'waiting_for_user',
    'waiting_for_other_party',
    'under_review',
    'escalated',
    'decision_pending_approval',
    'decided',
    'resolved',
    'closed',
    'reopened',
  ]);
  assert.deepEqual(supportStatusMachineSource, {
    version: '1.0.0',
    packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
    driveFileId: '1qj0md6DoHt7lDAfIvFtmMiT0vQ48KbYG',
    sha256: '3cc58111a6079f9f82ce90d9fed18d4a8b10bd27191777ed30130d03fbbf2f55',
    statusCount: 11,
    transitionCount: 18,
  });
  assert.equal(supportCaseStatuses.includes('paused'), false);
  assert.deepEqual(supportPriorities, ['p0', 'p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(supportApprovalLevels, [
    'green_automatic',
    'yellow_human_review',
    'red_explicit_decision',
  ]);
  for (const [family, subtypes] of Object.entries(supportCaseFamilies)) {
    assert.ok(subtypes.length >= 4, family);
    for (const subtype of subtypes) assert.doesNotThrow(() => supportRouteFor(family, subtype));
  }
});

test('routing is deterministic and fails closed at money, privacy, authority and P0 boundaries', () => {
  assert.deepEqual(
    supportRouteFor('general_help', 'general_how_to'),
    {
      priority: 'p3',
      severity: 'low',
      ownerRole: 'general_support_owner',
      approvalLevel: 'green_automatic',
      waitingOn: 'support_owner',
      safetyFlag: false,
      privacyFlag: false,
      dsaFlag: false,
      authorityFlag: false,
      article18CandidateFlag: false,
      moneyFlag: false,
      accountTakeoverFlag: false,
    },
  );
  const handover = supportRouteFor('active_handover', 'qr_or_code_failure');
  assert.equal(handover.priority, 'p1');
  assert.equal(handover.approvalLevel, 'yellow_human_review');

  for (const [family, subtype, owner] of [
    ['money_case', 'refund_request_or_review', 'finance_owner'],
    ['privacy_security', 'access_or_copy_request', 'privacy_owner'],
    ['legal_authority', 'formal_legal_notice', 'legal_authority_owner'],
  ]) {
    const route = supportRouteFor(family, subtype);
    assert.equal(route.ownerRole, owner);
    assert.equal(route.approvalLevel, 'red_explicit_decision');
  }
  const danger = supportRouteFor('trust_safety', 'immediate_physical_danger');
  assert.equal(danger.priority, 'p0');
  assert.equal(danger.severity, 'critical');
  assert.equal(danger.approvalLevel, 'red_explicit_decision');
  assert.equal(danger.safetyFlag, true);
  assert.equal(danger.authorityFlag, true);
  assert.equal(danger.article18CandidateFlag, true);
  const dangerSignal = supportRouteFor('active_handover', 'unsafe_handover', {
    immediateDanger: true,
  });
  assert.equal(dangerSignal.ownerRole, 'trust_safety_owner');
  assert.equal(dangerSignal.waitingOn, 'trust_safety_owner');
  assert.equal(dangerSignal.priority, 'p0');
});

test('routing rejects unknown or mismatched taxonomy values', () => {
  assert.throws(
    () => supportRouteFor('unknown', 'general_how_to'),
    /support_case_type_invalid/,
  );
  assert.throws(
    () => supportRouteFor('general_help', 'refund_request_or_review'),
    /support_case_subtype_invalid/,
  );
});

test('non-urgent feedback is routed to P4 without artificial escalation', () => {
  const route = supportRouteFor('general_help', 'feedback_or_improvement');
  assert.deepEqual(route, {
    priority: 'p4',
    severity: 'low',
    ownerRole: 'general_support_owner',
    approvalLevel: 'green_automatic',
    waitingOn: 'support_owner',
    safetyFlag: false,
    privacyFlag: false,
    dsaFlag: false,
    authorityFlag: false,
    article18CandidateFlag: false,
    moneyFlag: false,
    accountTakeoverFlag: false,
  });

  const result = normalizeSupportCaseInput({
    caseType: 'general_help',
    caseSubType: 'feedback_or_improvement',
    summary: 'Nicht dringendes Feedback zur Bedienung der App.',
    safetyTriage: safetyTriage(),
    issueScope: issueScope(),
    feedbackContext: {
      version: supportFeedbackContextVersion,
      feedbackKind: 'improvement_suggestion',
      productArea: 'app_experience',
      nonUrgentConfirmed: true,
    },
  }, { now });

  assert.equal(result.priority, 'p4');
  assert.equal(result.nextUpdateAt.toISOString(), '2026-08-22T10:00:00.000Z');
  assert.equal(result.nextAction,
    'Feedback beantworten und dem bestätigten Produktbereich zuordnen.');
  assert.deepEqual(result.feedbackContext, {
    version: supportFeedbackContextVersion,
    feedbackKind: 'improvement_suggestion',
    productArea: 'app_experience',
    nonUrgentConfirmed: true,
  });
  assert.equal(result.linkedBookingId, null);
  assert.equal(result.linkedListingId, null);
});

test('feedback intake fails closed on missing scope, urgency and entity links', () => {
  const base = {
    caseType: 'general_help',
    caseSubType: 'feedback_or_improvement',
    summary: 'Nicht dringendes Feedback zur Bedienung der App.',
    safetyTriage: safetyTriage(),
    issueScope: issueScope(),
    feedbackContext: {
      version: supportFeedbackContextVersion,
      feedbackKind: 'general_feedback',
      productArea: 'app_experience',
      nonUrgentConfirmed: true,
    },
  };
  assert.throws(
    () => normalizeSupportCaseInput({ ...base, feedbackContext: undefined }, { now }),
    /support_feedback_context_required/u,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      ...base,
      feedbackContext: { ...base.feedbackContext, nonUrgentConfirmed: false },
    }, { now }),
    /support_feedback_non_urgent_confirmation_required/u,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      ...base,
      safetyTriage: safetyTriage(true),
    }, { now }),
    /support_feedback_urgent_route_required/u,
  );
  assert.throws(
    () => normalizeSupportCaseInput({ ...base, linkedBookingId: 'booking-1' }, { now }),
    /support_feedback_entity_link_not_allowed/u,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      ...base,
      feedbackContext: { ...base.feedbackContext, feedbackKind: 'complaint' },
    }, { now }),
    /support_feedback_kind_invalid/u,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      ...base,
      feedbackContext: { ...base.feedbackContext, productArea: 'live_payments' },
    }, { now }),
    /support_feedback_product_area_invalid/u,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      ...base,
      caseSubType: 'general_how_to',
    }, { now }),
    /support_feedback_context_not_applicable/u,
  );
});

test('human-readable case number is opaque, fixed length and ambiguity-safe', () => {
  const number = newHumanReadableCaseNumber(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8]));
  assert.match(number, /^SIT-[A-HJ-NP-Z2-9]{12}$/);
  assert.equal(number.length, 16);
  assert.doesNotMatch(number.slice(4), /[01IO]/);
});

test('human-readable DSA Notice ID is opaque, fixed length and ambiguity-safe', () => {
  const number = newHumanReadableDsaNoticeNumber(
    Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8]),
  );
  assert.match(number, /^SIT-N-[A-HJ-NP-Z2-9]{12}$/u);
  assert.equal(number.length, 18);
  assert.doesNotMatch(number.slice(6), /[01IO]/u);
});

test('human-readable product-safety Notice ID is opaque and ambiguity-safe', () => {
  const number = newHumanReadableProductSafetyNoticeNumber(
    Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8]),
  );
  assert.match(number, /^SIT-P-[A-HJ-NP-Z2-9]{12}$/u);
  assert.equal(number.length, 18);
  assert.doesNotMatch(number.slice(6), /[01IO]/u);
});

test('intake derives authoritative route and retains non-live operating truth', () => {
  const result = normalizeSupportCaseInput({
    caseType: 'money_case',
    caseSubType: 'refund_request_or_review',
    summary: 'Erstattung im Testmodus nachvollziehbar prüfen.',
    linkedBookingId: 'booking-123',
    linkedPaymentId: decisionId,
    safetyTriage: safetyTriage(),
    issueScope: issueScope(),
  }, {
    sourceChannel: 'app',
    operatingMode: 'internal_testing',
    nextUpdateAt,
    now,
  });
  assert.equal(result.status, 'received');
  assert.equal(result.priority, 'p2');
  assert.equal(result.ownerRole, 'finance_owner');
  assert.equal(result.approvalLevel, 'red_explicit_decision');
  assert.equal(result.moneyFlag, true);
  assert.equal(result.operatingMode, 'internal_testing');
  assert.equal(result.locale, 'de-DE');
  assert.equal(result.linkedBookingId, 'booking-123');
});

test('privacy intake gets its own owner and bounded operational checkpoint', () => {
  const result = normalizeSupportCaseInput({
    caseType: 'privacy_security',
    caseSubType: 'access_or_copy_request',
    summary: 'Datenauskunft als eigenständigen Privacy-Fall prüfen.',
    safetyTriage: safetyTriage(),
    issueScope: issueScope(),
  }, { now });

  assert.equal(result.priority, 'p2');
  assert.equal(result.ownerRole, 'privacy_owner');
  assert.equal(result.waitingOn, 'privacy_owner');
  assert.equal(result.approvalLevel, 'red_explicit_decision');
  assert.equal(result.privacyFlag, true);
  assert.equal(result.nextUpdateAt.toISOString(), '2026-08-21T14:00:00.000Z');
  assert.equal(result.operatingMode, 'simulation');
});

test('product-safety intake is server-routed to rapid red Trust and Safety triage', () => {
  const result = normalizeSupportCaseInput({
    caseType: 'trust_safety',
    caseSubType: 'dangerous_item_or_injury',
    summary: 'Möglicherweise gefährliches Produkt gesondert prüfen.',
    safetyTriage: safetyTriage(),
    issueScope: issueScope(),
    productSafetyNotice: {
      version: supportProductSafetyIntakeVersion,
      contactPointVersion: supportProductSafetyContactPointVersion,
      issueKind: 'dangerous_product',
      productIdentification: 'Bohrmaschine, Modell X',
      riskDescription:
        'Das Gehäuse wird beim Betrieb sehr heiß und riecht verschmort.',
      injuryOccurred: false,
      safetyGuidanceAcknowledged: true,
    },
  }, { now });

  assert.equal(result.priority, 'p1');
  assert.equal(result.ownerRole, 'trust_safety_owner');
  assert.equal(result.waitingOn, 'trust_safety_owner');
  assert.equal(result.approvalLevel, 'red_explicit_decision');
  assert.equal(result.safetyFlag, true);
  assert.equal(result.authorityFlag, true);
  assert.equal(result.article18CandidateFlag, false);
  assert.equal(result.nextUpdateAt.toISOString(), '2026-08-21T11:00:00.000Z');
  assert.deepEqual(result.productSafetyNotice, {
    version: supportProductSafetyIntakeVersion,
    contactPointVersion: supportProductSafetyContactPointVersion,
    issueKind: 'dangerous_product',
    productIdentification: 'Bohrmaschine, Modell X',
    riskDescription:
      'Das Gehäuse wird beim Betrieb sehr heiß und riecht verschmort.',
    injuryOccurred: false,
    safetyGuidanceAcknowledged: true,
  });
});

test('product-safety evidence is required only on its exact route and fails closed', () => {
  const base = {
    caseType: 'trust_safety',
    caseSubType: 'dangerous_item_or_injury',
    summary: 'Möglicherweise gefährliches Produkt gesondert prüfen.',
    safetyTriage: safetyTriage(),
    issueScope: issueScope(),
  };
  assert.throws(
    () => normalizeSupportCaseInput(base, { now }),
    /support_product_safety_notice_required/u,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      ...base,
      productSafetyNotice: {
        version: supportProductSafetyIntakeVersion,
        contactPointVersion: supportProductSafetyContactPointVersion,
        issueKind: 'dangerous_product',
        productIdentification: 'Produkt X',
        riskDescription: 'Eine ausreichend konkrete Gefahrbeschreibung liegt vor.',
        injuryOccurred: false,
        safetyGuidanceAcknowledged: false,
      },
    }, { now }),
    /support_product_safety_guidance_required/u,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      caseType: 'general_help',
      caseSubType: 'general_how_to',
      summary: 'Allgemeine Hilfe anfordern.',
      safetyTriage: safetyTriage(),
      issueScope: issueScope(),
      productSafetyNotice: {},
    }, { now }),
    /support_product_safety_notice_not_applicable/u,
  );
});

test('illegal-content notice records structured DSA evidence and keeps a human-review boundary', () => {
  const result = normalizeSupportCaseInput({
    caseType: 'moderation_content',
    caseSubType: 'illegal_content_notice',
    summary: 'Konkreten mutmaßlich rechtswidrigen Inhalt prüfen.',
    safetyTriage: safetyTriage(),
    issueScope: issueScope(),
    dsaNotice: {
      version: supportDsaNoticeIntakeVersion,
      contentType: 'message',
      contentLocator: 'thread:abc:message:42',
      illegalityStatement:
          'Diese konkrete Nachricht verletzt nach meiner Einschätzung geltendes Recht.',
      jurisdictionOrLegalBasis: '',
      goodFaithConfirmed: true,
    },
  }, { now });

  assert.equal(result.priority, 'p2');
  assert.equal(result.ownerRole, 'moderation_owner');
  assert.equal(result.waitingOn, 'support_owner');
  assert.equal(result.approvalLevel, 'red_explicit_decision');
  assert.equal(result.dsaFlag, true);
  assert.deepEqual(result.dsaNotice, {
    version: supportDsaNoticeIntakeVersion,
    contentType: 'message',
    contentLocator: 'thread:abc:message:42',
    locatorStatus: 'complete',
    locatorKind: 'message_reference',
    illegalityStatement:
        'Diese konkrete Nachricht verletzt nach meiner Einschätzung geltendes Recht.',
    jurisdictionOrLegalBasis: null,
    goodFaithConfirmed: true,
  });
});

test('DSA locator completeness is deterministic and missing locators remain recordable', () => {
  const base = {
    caseType: 'moderation_content',
    caseSubType: 'illegal_content_notice',
    summary: 'Konkreten mutmaßlich rechtswidrigen Inhalt prüfen.',
    safetyTriage: safetyTriage(),
    issueScope: issueScope(),
    dsaNotice: {
      version: supportDsaNoticeIntakeVersion,
      contentType: 'listing',
      contentLocator: '',
      illegalityStatement:
          'Diese konkrete Anzeige verletzt nach meiner Einschätzung geltendes Recht.',
      goodFaithConfirmed: true,
    },
  };
  const incomplete = normalizeSupportCaseInput(base, { now });
  assert.equal(incomplete.dsaNotice.contentLocator, null);
  assert.equal(incomplete.dsaNotice.locatorStatus, 'needs_clarification');
  assert.equal(incomplete.dsaNotice.locatorKind, null);

  assert.deepEqual(classifyDsaNoticeLocator(
    'https://example.test/listings/123',
    'listing',
  ), {
    contentLocator: 'https://example.test/listings/123',
    locatorStatus: 'complete',
    locatorKind: 'url',
  });
  assert.equal(
    classifyDsaNoticeLocator('Die Anzeige oben', 'listing').locatorStatus,
    'needs_clarification',
  );
  assert.throws(
    () => normalizeDsaNoticeLocatorCompletion({
      contentLocator: 'profile:user-1',
      expectedVersion: 1,
    }, { contentType: 'listing' }),
    /support_dsa_notice_locator_exact_required/u,
  );
  assert.deepEqual(normalizeDsaNoticeLocatorCompletion({
    contentLocator: 'listing:listing-1',
    expectedVersion: 3,
  }, { contentType: 'listing' }), {
    contentLocator: 'listing:listing-1',
    locatorStatus: 'complete',
    locatorKind: 'listing_reference',
    expectedVersion: 3,
  });
});

test('DSA intake rejects missing, malformed, extra or misplaced evidence', () => {
  const base = {
    caseType: 'moderation_content',
    caseSubType: 'illegal_content_notice',
    summary: 'Konkreten mutmaßlich rechtswidrigen Inhalt prüfen.',
    safetyTriage: safetyTriage(),
    issueScope: issueScope(),
  };
  const validNotice = {
    version: supportDsaNoticeIntakeVersion,
    contentType: 'listing',
    contentLocator: 'listing:123',
    illegalityStatement:
        'Diese konkrete Anzeige verletzt nach meiner Einschätzung geltendes Recht.',
    goodFaithConfirmed: true,
  };

  assert.throws(
    () => normalizeSupportCaseInput(base, { now }),
    /support_dsa_notice_required/u,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      ...base,
      dsaNotice: { ...validNotice, goodFaithConfirmed: false },
    }, { now }),
    /support_dsa_notice_good_faith_required/u,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      ...base,
      dsaNotice: { ...validNotice, contentType: 'booking' },
    }, { now }),
    /support_dsa_notice_content_type_invalid/u,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      ...base,
      dsaNotice: { ...validNotice, clientReporterEmail: 'fake@example.test' },
    }, { now }),
    /support_dsa_notice_shape_invalid/u,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      caseType: 'general_help',
      caseSubType: 'general_how_to',
      summary: 'Allgemeiner Support-Fall ohne DSA-Route.',
      safetyTriage: safetyTriage(),
      issueScope: issueScope(),
      dsaNotice: validNotice,
    }, { now }),
    /support_dsa_notice_not_applicable/u,
  );
});

test('intake rejects live modes, malformed references and unsafe deadlines', () => {
  const raw = {
    caseType: 'general_help',
    caseSubType: 'general_how_to',
    summary: 'Eine zulässige Zusammenfassung.',
    safetyTriage: safetyTriage(),
    issueScope: issueScope(),
  };
  assert.throws(
    () => normalizeSupportCaseInput(raw, {
      operatingMode: 'production',
      nextUpdateAt,
      now,
    }),
    /support_operating_mode_invalid/,
  );
  assert.throws(
    () => normalizeSupportCaseInput({ ...raw, linkedPaymentId: 'not-a-uuid' }, {
      nextUpdateAt,
      now,
    }),
    /support_linked_payment_invalid/,
  );
  assert.throws(
    () => normalizeSupportCaseInput(raw, { nextUpdateAt: now, now }),
    /support_next_update_at_required/,
  );
  assert.throws(
    () => normalizeSupportCaseInput(raw, {
      nextUpdateAt: new Date('2026-10-01T10:00:00.000Z'),
      now,
    }),
    /support_next_update_at_required/,
  );
});

test('intake derives bounded internal checkpoints when no client deadline is supplied', () => {
  const base = {
    summary: 'Interner Checkpoint wird vom Server bestimmt.',
    safetyTriage: safetyTriage(),
    issueScope: issueScope(),
  };
  const p0 = normalizeSupportCaseInput({
    ...base,
    caseType: 'trust_safety',
    caseSubType: 'immediate_physical_danger',
  }, { now });
  const p3 = normalizeSupportCaseInput({
    ...base,
    caseType: 'general_help',
    caseSubType: 'general_how_to',
  }, { now });
  assert.equal(p0.nextUpdateAt.toISOString(), '2026-08-21T10:15:00.000Z');
  assert.equal(p3.nextUpdateAt.toISOString(), '2026-08-22T10:00:00.000Z');
});

test('intake requires versioned safety-first evidence and rejects contradictions', () => {
  const base = {
    caseType: 'active_handover',
    caseSubType: 'unsafe_handover',
    summary: 'Unsichere Übergabe wird zuerst sicherheitsbezogen eingeordnet.',
    issueScope: issueScope(),
  };
  assert.throws(
    () => normalizeSupportCaseInput(base, { now }),
    /support_safety_triage_required/,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      ...base,
      safetyTriage: { ...safetyTriage(true), guidanceShown: false },
    }, { now }),
    /support_safety_guidance_evidence_invalid/,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      ...base,
      immediateDanger: false,
      safetyTriage: safetyTriage(true),
    }, { now }),
    /support_safety_triage_conflict/,
  );

  const danger = normalizeSupportCaseInput({
    ...base,
    safetyTriage: safetyTriage(true),
  }, { now });
  assert.equal(danger.priority, 'p0');
  assert.equal(danger.ownerRole, 'trust_safety_owner');
  assert.equal(danger.safetyTriage.guidanceShown, true);
});

test('intake requires versioned single-issue evidence and rejects multiple issues', () => {
  const base = {
    caseType: 'general_help',
    caseSubType: 'general_how_to',
    summary: 'Ein abgegrenztes Problem wird als eigener Fall eingereicht.',
    safetyTriage: safetyTriage(),
  };
  assert.throws(
    () => normalizeSupportCaseInput(base, { now }),
    /support_issue_scope_required/,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      ...base,
      issueScope: { ...issueScope(), version: 'stale' },
    }, { now }),
    /support_issue_scope_version_invalid/,
  );
  assert.throws(
    () => normalizeSupportCaseInput({
      ...base,
      issueScope: { ...issueScope(true), singleIssueConfirmed: false },
    }, { now }),
    /support_single_issue_confirmation_required/,
  );

  const separated = normalizeSupportCaseInput({
    ...base,
    issueScope: issueScope(true),
  }, { now });
  assert.deepEqual(separated.issueScope, issueScope(true));
});

test('transition graph is explicit and rejects skips, paused and stale versions', () => {
  assert.equal(canTransitionSupportCase('received', 'acknowledged'), true);
  assert.equal(canTransitionSupportCase('received', 'resolved'), false);
  assert.throws(
    () => transition(caseRecord({ status: 'received' }), { status: 'resolved' }),
    /support_transition_not_allowed/,
  );
  assert.throws(
    () => transition(caseRecord(), { status: 'paused' }),
    /support_status_invalid/,
  );
  assert.throws(
    () => transition(caseRecord({ status: 'decided' }), {
      status: 'implementation_pending',
    }),
    /support_status_invalid/,
  );
  assert.throws(
    () => normalizeSupportCaseTransition(caseRecord(), {
      status: 'under_review',
      expectedVersion: 2,
      reason: 'Stale Version muss scheitern.',
      nextAction: 'Weiter prüfen.',
      nextUpdateAt,
    }, { actorRole: 'support', now }),
    /support_case_version_conflict/,
  );
});

test('only staff or system can transition a support case', () => {
  assert.throws(
    () => transition(caseRecord(), { status: 'under_review' }, 'user'),
    /support_transition_forbidden/,
  );
});

test('waiting and escalation transitions require explicit operational context', () => {
  assert.throws(
    () => transition(caseRecord(), { status: 'waiting_for_user', waitingReason: '' }),
    /support_waiting_reason_required/,
  );
  assert.throws(
    () => transition(caseRecord(), {
      status: 'waiting_for_user',
      waitingReason: 'Beleg wurde konkret angefordert.',
    }),
    /support_user_action_due_at_required/,
  );
  assert.throws(
    () => transition(caseRecord(), {
      status: 'waiting_for_user',
      waitingReason: 'Beleg wurde konkret angefordert.',
      userActionDueAt: now,
    }),
    /support_user_action_due_at_required/,
  );
  const waiting = transition(caseRecord(), {
    status: 'waiting_for_user',
    waitingReason: 'Beleg wurde konkret angefordert.',
    userActionDueAt,
  });
  assert.equal(waiting.waitingOn, 'reporter');
  assert.equal(waiting.waitingReason, 'Beleg wurde konkret angefordert.');
  assert.deepEqual(waiting.userActionDueAt, userActionDueAt);

  const otherParty = transition(caseRecord(), {
    status: 'waiting_for_other_party',
    waitingReason: 'Bestätigung der anderen Partei steht noch aus.',
  });
  assert.equal(otherParty.userActionDueAt, null);

  const underReview = caseRecord({ status: 'under_review' });
  assert.throws(
    () => transition(underReview, {
      status: 'escalated',
      escalationTargetRole: 'unknown_owner',
    }),
    /support_escalation_target_invalid/,
  );
  const escalated = transition(underReview, {
    status: 'escalated',
    escalationTargetRole: 'privacy_owner',
  });
  assert.equal(escalated.currentOwnerRole, 'privacy_owner');
  assert.equal(escalated.waitingOn, 'privacy_owner');
});

test('green cases cannot enter approval and decided cases stay operationally active', () => {
  assert.throws(
    () => transition(caseRecord({
      status: 'under_review',
      approval_level: 'green_automatic',
      severity: 'low',
      priority: 'p3',
      current_owner_role: 'general_support_owner',
    }), { status: 'decision_pending_approval', decisionId }),
    /support_decision_approval_level_invalid/,
  );
  assert.throws(
    () => transition(caseRecord({ status: 'under_review' }), {
      status: 'decision_pending_approval',
    }),
    /support_decision_id_required/,
  );
  const pending = transition(caseRecord({ status: 'under_review' }), {
    status: 'decision_pending_approval',
    decisionId,
  });
  assert.equal(pending.decisionId, decisionId);
  const decided = transition(caseRecord({ status: 'decision_pending_approval' }), {
    status: 'decided',
    decisionId,
  });
  assert.equal(decided.decisionId, decisionId);
  assert.equal(decided.waitingOn, 'support_owner');
  assert.equal(decided.nextAction, 'Fall innerhalb der Frist weiter prüfen.');
  assert.deepEqual(decided.nextUpdateAt, nextUpdateAt);
  assert.throws(
    () => transition(caseRecord({
      status: 'decision_pending_approval',
      decision_id: decisionId,
    }), {
      status: 'decided',
      decisionId: '22222222-2222-4222-8222-222222222222',
    }),
    /support_decision_id_mismatch/,
  );
});

test('review always reaches decided before verified implementation can resolve', () => {
  assert.throws(
    () => transition(caseRecord({ status: 'under_review' }), {
      status: 'resolved',
      resolutionReference: 'Information wurde nachvollziehbar geliefert.',
    }),
    /support_transition_not_allowed/,
  );
  const decided = transition(caseRecord({
    status: 'under_review',
    approval_level: 'green_automatic',
    priority: 'p3',
    severity: 'low',
    current_owner_role: 'general_support_owner',
  }), {
    status: 'decided',
    decisionId,
  });
  assert.equal(decided.status, 'decided');
  assert.equal(decided.decisionId, decisionId);
});

test('resolution, closure and reopen guards fail closed', () => {
  assert.throws(
    () => transition(caseRecord({ status: 'decided', priority: 'p0', severity: 'critical' }), {
      status: 'resolved',
      resolutionReference: 'Interne Auflösung dokumentiert.',
    }),
    /support_p0_resolution_requires_admin/,
  );
  const resolved = transition(
    caseRecord({ status: 'decided', priority: 'p0', severity: 'critical' }),
    { status: 'resolved', resolutionReference: 'Interne Auflösung dokumentiert.' },
    'admin',
  );
  assert.equal(resolved.waitingOn, 'none');
  assert.equal(resolved.nextAction, null);
  assert.equal(resolved.resolutionReference, 'Interne Auflösung dokumentiert.');

  assert.throws(
    () => transition(caseRecord({ status: 'resolved' }), {
      status: 'closed',
      closureReason: 'anything',
      appealAvailable: false,
    }),
    /support_closure_reason_invalid/,
  );
  assert.throws(
    () => transition(caseRecord({ status: 'resolved' }), {
      status: 'closed',
      closureReason: 'information_provided',
    }),
    /support_appeal_configuration_required/,
  );
  const closedWithoutAppeal = transition(caseRecord({ status: 'resolved' }), {
    status: 'closed',
    closureReason: 'information_provided',
    appealAvailable: false,
  });
  assert.equal(closedWithoutAppeal.appealAvailable, false);
  assert.equal(closedWithoutAppeal.appealDeadline, null);
  const closedWithAppeal = transition(caseRecord({
    status: 'resolved',
    decision_id: decisionId,
  }), {
    status: 'closed',
    closureReason: 'resolved_action_completed',
    appealAvailable: true,
    appealDeadline: '2026-09-15T18:00:00.000Z',
  });
  assert.equal(closedWithAppeal.appealAvailable, true);
  assert.equal(
    closedWithAppeal.appealDeadline.toISOString(),
    '2026-09-15T18:00:00.000Z',
  );
  assert.throws(
    () => transition(caseRecord({ status: 'closed' }), {
      status: 'reopened',
      reopenReason: '',
    }),
    /support_reopen_reason_required/,
  );
  assert.throws(
    () => transition(caseRecord({ status: 'closed' }), {
      status: 'reopened',
      reopenReason: 'Neue erhebliche Information wurde eingereicht.',
    }),
    /support_reopen_owner_required/,
  );
  const reopened = transition(caseRecord({ status: 'closed' }), {
    status: 'reopened',
    reopenReason: 'Neue erhebliche Information wurde eingereicht.',
    currentOwnerId: 'support-1',
  });
  assert.equal(reopened.status, 'reopened');
  assert.equal(reopened.waitingOn, 'support_owner');
  assert.equal(reopened.currentOwnerId, 'support-1');
  assert.equal(reopened.appealAvailable, false);
});
