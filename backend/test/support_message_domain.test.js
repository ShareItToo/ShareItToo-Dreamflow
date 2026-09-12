import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSupportMessageNextUpdateBindingCurrent,
  listSupportMessageTemplates,
  normalizeSupportMessageDraft,
  normalizeSupportMessagePublication,
  normalizeSupportMessageReview,
  supportMessageContentBlockAuditMetadata,
  supportMessageContentGuardVersion,
  supportMessageTemplateSource,
} from '../src/support_message_domain.js';

const caseNumber = 'SIT-ABCDEFGHJKLM';
const supportCase = Object.freeze({
  human_readable_case_number: caseNumber,
  status: 'received',
  next_update_at: new Date('2026-08-22T10:00:00.000Z'),
  evidence_due_at: null,
  response_due_at: null,
  appeal_deadline: null,
  safety_flag: false,
});
const activeSupportCaseContext = Object.freeze({
  supportCase,
  now: new Date('2026-08-22T09:00:00.000Z'),
});
const consumerDisputeCase = Object.freeze({
  ...supportCase,
  case_type: 'legal_authority',
  case_subtype: 'consumer_dispute_information',
});
const approvedConsumerDisputeEnvironment = Object.freeze({
  SIT_CONSUMER_DISPUTE_APPROVED: 'true',
  SIT_CONSUMER_DISPUTE_CONFIGURATION_VERSION: 'VSBG-REVIEW-1',
  SIT_CONSUMER_DISPUTE_BODY_NAME: 'Universalschlichtungsstelle des Bundes',
  SIT_CONSUMER_DISPUTE_BODY_ADDRESS: 'Beispielweg 1, 00000 Beispielstadt',
  SIT_CONSUMER_DISPUTE_BODY_WEBSITE: 'https://www.verbraucher-schlichter.de/',
  SIT_CONSUMER_DISPUTE_PARTICIPATION_STATUS:
    'not_willing_or_obliged_except_mandatory_case',
});

function intakeVariables(overrides = {}) {
  return {
    first_name: 'Walid',
    confirmed_fact: 'Der Supportfall ist serverseitig eingegangen.',
    user_action_or_no_action: 'Du musst im Moment nichts weiter tun.',
    next_update_date: '22.08.2026',
    next_update_time: '12:00',
    ...overrides,
  };
}

test('Drive template catalog is hash-bound, complete and exposes safe metadata only', () => {
  const templates = listSupportMessageTemplates();
  assert.equal(supportMessageTemplateSource.templateCount, 55);
  assert.equal(supportMessageTemplateSource.sourceSha256,
    '947f307e7919eed543c28e36af4d2b364d87dcde52025649d0d4620d64baaaa5');
  assert.equal(templates.length, 55);
  assert.equal(templates.find((entry) => entry.id === 'T-001').genericDraftAvailable, true);
  assert.equal(templates.find((entry) => entry.id === 'T-021').moneySnapshotRequired, true);
  assert.equal(templates.find((entry) => entry.id === 'T-043').genericDraftAvailable, false);
  assert.equal(templates.find((entry) => entry.id === 'T-035').genericDraftAvailable, false);
  assert.equal('body' in templates[0], false);
});

test('green template renders exact server case ID and can be recorded in app', () => {
  const result = normalizeSupportMessageDraft({
    templateId: 'T-001',
    recipientUserId: 'user-1',
    variables: intakeVariables(),
    publishNow: true,
  }, activeSupportCaseContext);
  assert.equal(result.approvalLevel, 'green_automatic');
  assert.equal(result.sendStatus, 'sent');
  assert.equal(result.structuredVariables.case_id, caseNumber);
  assert.match(result.renderedContent, /SIT-ABCDEFGHJKLM/u);
  assert.match(result.renderedContent, /22\.08\.2026/u);
  assert.match(result.renderedContent, /12:00 Uhr/u);
  assert.doesNotMatch(result.renderedContent, /\{\{|\}\}/u);
  assert.match(result.renderedContentSha256, /^[0-9a-f]{64}$/u);
});

test('missing, unexpected and mismatched placeholders fail closed', () => {
  assert.throws(
    () => normalizeSupportMessageDraft({
      templateId: 'T-001',
      variables: intakeVariables({ confirmed_fact: undefined }),
    }, activeSupportCaseContext),
    /support_message_variable_invalid/u,
  );
  assert.throws(
    () => normalizeSupportMessageDraft({
      templateId: 'T-001',
      variables: { ...intakeVariables(), internal_note: 'Nicht sichtbar' },
    }, activeSupportCaseContext),
    /support_message_variable_unexpected/u,
  );
  assert.throws(
    () => normalizeSupportMessageDraft({
      templateId: 'T-001',
      variables: { ...intakeVariables(), case_id: 'SIT-ZZZZZZZZZZZZ' },
    }, activeSupportCaseContext),
    /support_message_server_binding_mismatch/u,
  );
  assert.throws(
    () => normalizeSupportMessageDraft({
      templateId: 'T-001',
      variables: { ...intakeVariables(), next_update_time: '10:00' },
    }, activeSupportCaseContext),
    /support_message_server_binding_mismatch/u,
  );
});

test('templates with a next-update promise reject an already overdue case deadline', () => {
  assert.throws(
    () => normalizeSupportMessageDraft({
      templateId: 'T-001',
      variables: intakeVariables(),
      publishNow: true,
    }, {
      supportCase,
      now: new Date('2026-08-22T10:00:00.000Z'),
    }),
    /support_message_next_update_overdue/u,
  );
  const noPromise = normalizeSupportMessageDraft({
    templateId: 'T-034',
    variables: { first_name: 'Walid', case_id: caseNumber },
    publishNow: true,
  }, {
    supportCase,
    now: new Date('2026-08-23T10:00:00.000Z'),
  });
  assert.equal(noPromise.sendStatus, 'sent');
});

test('publication rechecks the exact server next-update binding after approval', () => {
  assert.doesNotThrow(() => assertSupportMessageNextUpdateBindingCurrent({
    structured_variables: {
      next_update_date: '22.08.2026',
      next_update_time: '12:00',
    },
  }, supportCase));
  assert.throws(
    () => assertSupportMessageNextUpdateBindingCurrent({
      structured_variables: {
        next_update_date: '23.08.2026',
        next_update_time: '12:00',
      },
    }, supportCase),
    /support_message_next_update_binding_changed/u,
  );
});

test('sensitive data and unsafe decision claims are blocked in variables', () => {
  for (const confirmed_fact of [
    'API-Key: sk_live_1234567890',
    'Kontakt: gegenpartei@example.test',
    'IBAN DE89370400440532013000',
    'Die andere Partei ist eindeutig schuldig.',
    'Die Erstattung ist garantiert.',
  ]) {
    assert.throws(
      () => normalizeSupportMessageDraft({
        templateId: 'T-001',
        variables: intakeVariables({ confirmed_fact }),
      }, activeSupportCaseContext),
      /support_message_(?:sensitive_content|policy_claim)_blocked/u,
    );
  }
});

test('content guard classifies blocked input without retaining the input value', () => {
  for (const [confirmed_fact, contentClass] of [
    ['API-Key: sk_live_1234567890', 'secret'],
    ['Kontakt: gegenpartei@example.test', 'personal_data'],
  ]) {
    let blocked;
    try {
      normalizeSupportMessageDraft({
        templateId: 'T-001',
        variables: intakeVariables({ confirmed_fact }),
      }, activeSupportCaseContext);
    } catch (error) {
      blocked = error;
    }
    const metadata = supportMessageContentBlockAuditMetadata(blocked);
    assert.deepEqual(metadata, {
      reasonCode: 'support_message_sensitive_content_blocked',
      contentClass,
      blockedField: 'confirmed_fact',
      templateId: 'T-001',
      detectionVersion: supportMessageContentGuardVersion,
      inputStored: false,
      messageCreated: false,
      externalMessageSent: false,
    });
    assert.doesNotMatch(JSON.stringify(metadata), /sk_live|example\.test/u);
  }
  assert.equal(
    supportMessageContentBlockAuditMetadata(new Error('unrelated')),
    null,
  );
});

test('support cannot request passwords PINs or recovery codes in free variables', () => {
  for (const confirmed_fact of [
    'Bitte sende dein Passwort im Supportchat.',
    'Wir benötigen deine PIN zur Prüfung.',
    'Übermittle uns den Wiederherstellungscode.',
  ]) {
    assert.throws(
      () => normalizeSupportMessageDraft({
        templateId: 'T-001',
        variables: intakeVariables({ confirmed_fact }),
      }, activeSupportCaseContext),
      /support_message_credential_request_blocked/u,
    );
  }
  assert.doesNotThrow(() => normalizeSupportMessageDraft({
    templateId: 'T-001',
    variables: intakeVariables({
      confirmed_fact: 'Bitte sende keine Passwörter, PINs oder Wiederherstellungscodes.',
    }),
  }, activeSupportCaseContext));
});

test('T-035 requires server-bound account recovery guidance', () => {
  const accountCase = {
    ...supportCase,
    case_type: 'trust_safety',
    case_subtype: 'account_takeover',
    priority: 'p0',
    severity: 'critical',
    safety_flag: true,
    account_takeover_flag: true,
    approval_level: 'red_explicit_decision',
    reporter_user_id: 'user-1',
  };
  assert.throws(
    () => normalizeSupportMessageDraft({
      templateId: 'T-035',
      variables: {
        first_name: 'Walid',
        secure_recovery_channel: 'E-Mail',
        temporary_account_effect: 'Freigabe erteilt',
      },
    }, { supportCase: accountCase, now: activeSupportCaseContext.now }),
    /support_account_recovery_workflow_required/u,
  );
  const result = normalizeSupportMessageDraft({
    templateId: 'T-035',
    variables: {},
  }, {
    supportCase: accountCase,
    now: activeSupportCaseContext.now,
    accountRecoveryContext: {
      recipientUserId: 'user-1',
      activeAuthenticatedSession: true,
      passwordReauthenticationAvailable: true,
    },
  });
  assert.equal(result.sendStatus, 'pending_approval');
  assert.equal(result.structuredVariables.compromised_channel_used, false);
  assert.equal(result.structuredVariables.password_or_pin_requested, false);
  assert.match(result.renderedContent, /E-Mail-Kanal allein wird nicht akzeptiert/u);
});

test('yellow requires review while red and money templates stay on dedicated paths', () => {
  assert.throws(
    () => normalizeSupportMessageDraft({
      templateId: 'T-002',
      variables: {
        first_name: 'Walid',
        active_stage: 'Übergabe',
        safe_next_step: 'Beende die Übergabe vorerst.',
        confirmed_fact: 'Der Fall ist eingegangen.',
        open_check: 'Der bestätigte Übergabestatus.',
        next_update_date: '22.08.2026',
        next_update_time: '12:00',
      },
      publishNow: true,
    }, { supportCase }),
    /support_message_human_review_required/u,
  );
  assert.throws(
    () => normalizeSupportMessageDraft({ templateId: 'T-043', variables: {} }, { supportCase }),
    /support_message_red_template_requires_decision_workflow/u,
  );
  assert.throws(
    () => normalizeSupportMessageDraft({ templateId: 'T-021', variables: {} }, { supportCase }),
    /support_message_money_template_requires_snapshot_workflow/u,
  );
});

test('T-053 uses only complete server VSBG configuration and remains a red draft', () => {
  const result = normalizeSupportMessageDraft({
    templateId: 'T-053',
    variables: {
      first_name: 'Walid',
      dispute_subject: 'die entgeltliche Plattformleistung',
    },
  }, {
    supportCase: consumerDisputeCase,
    consumerDisputeEnvironment: approvedConsumerDisputeEnvironment,
  });
  assert.equal(result.approvalLevel, 'red_explicit_decision');
  assert.equal(result.sendStatus, 'pending_approval');
  assert.equal(
    result.structuredVariables.consumer_dispute_configuration_version,
    'VSBG-REVIEW-1',
  );
  assert.match(result.renderedContent, /Universalschlichtungsstelle des Bundes/u);
  assert.match(result.renderedContent, /wird in Textform erteilt/u);
  assert.doesNotMatch(result.renderedContent, /https?:\/\/ec\.europa\.eu\/consumers\/odr/iu);

  assert.throws(
    () => normalizeSupportMessageDraft({
      templateId: 'T-053',
      variables: {
        first_name: 'Walid',
        dispute_subject: 'die entgeltliche Plattformleistung',
      },
    }, { supportCase: consumerDisputeCase, consumerDisputeEnvironment: {} }),
    /support_consumer_dispute_configuration_incomplete/u,
  );
  assert.throws(
    () => normalizeSupportMessageDraft({
      templateId: 'T-053',
      variables: {
        first_name: 'Walid',
        dispute_subject: 'die entgeltliche Plattformleistung',
        participation_status_plain: 'frei erfunden',
      },
    }, {
      supportCase: consumerDisputeCase,
      consumerDisputeEnvironment: approvedConsumerDisputeEnvironment,
    }),
    /support_message_server_variable_forbidden/u,
  );
  assert.throws(
    () => normalizeSupportMessageDraft({
      templateId: 'T-053',
      variables: {
        first_name: 'Walid',
        dispute_subject: 'die entgeltliche Plattformleistung',
      },
    }, {
      supportCase,
      consumerDisputeEnvironment: approvedConsumerDisputeEnvironment,
    }),
    /support_consumer_dispute_case_required/u,
  );
});

test('review and publication require exact hash and positive version', () => {
  const review = normalizeSupportMessageReview({
    outcome: 'approved',
    expectedVersion: 1,
    expectedPayloadSha256: 'a'.repeat(64),
    reviewNotes: 'Wortlaut und bestätigte Falldaten wurden geprüft.',
  });
  assert.equal(review.expectedVersion, 1);
  assert.equal(review.expectedPayloadSha256, 'a'.repeat(64));
  assert.equal(normalizeSupportMessagePublication({
    expectedVersion: 2,
    expectedPayloadSha256: 'b'.repeat(64),
  }).expectedVersion, 2);
  assert.throws(
    () => normalizeSupportMessageReview({
      outcome: 'approved', expectedVersion: 0, expectedPayloadSha256: 'a'.repeat(64),
      reviewNotes: 'Wortlaut wurde geprüft.',
    }),
    /support_message_version_invalid/u,
  );
});
