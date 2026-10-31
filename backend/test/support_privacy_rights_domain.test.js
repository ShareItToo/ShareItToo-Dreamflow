import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizePrivacyDeadlineExtension,
  normalizePrivacyIdentityVerification,
  normalizeSupportPrivacyRightsRequest,
  privacyRightsResponseDeadline,
  supportPrivacyRightsRequestVersion,
} from '../src/support_privacy_rights_domain.js';

test('privacy-rights intake requires one exact kind compatible with the case subtype', () => {
  assert.deepEqual(
    normalizeSupportPrivacyRightsRequest({
      version: supportPrivacyRightsRequestVersion,
      requestKind: 'erasure',
    }, {
      caseType: 'privacy_security',
      caseSubType: 'correction_or_deletion_request',
    }),
    {
      version: supportPrivacyRightsRequestVersion,
      requestKind: 'erasure',
    },
  );
  assert.throws(
    () => normalizeSupportPrivacyRightsRequest({
      version: supportPrivacyRightsRequestVersion,
      requestKind: 'access',
    }, {
      caseType: 'privacy_security',
      caseSubType: 'correction_or_deletion_request',
    }),
    /support_privacy_rights_request_kind_invalid/u,
  );
  assert.throws(
    () => normalizeSupportPrivacyRightsRequest(undefined, {
      caseType: 'privacy_security',
      caseSubType: 'access_or_copy_request',
    }),
    /support_privacy_rights_request_required/u,
  );
  assert.equal(
    normalizeSupportPrivacyRightsRequest(undefined, {
      caseType: 'privacy_security',
      caseSubType: 'suspected_personal_data_breach',
    }),
    null,
  );
  assert.throws(
    () => normalizeSupportPrivacyRightsRequest({
      version: supportPrivacyRightsRequestVersion,
      requestKind: 'access',
    }, {
      caseType: 'general_help',
      caseSubType: 'general_how_to',
    }),
    /support_privacy_rights_request_not_applicable/u,
  );
});

test('conservative calendar-month deadline ends on the matching Berlin date across DST', () => {
  assert.equal(
    privacyRightsResponseDeadline('2026-02-28T10:15:00.000Z', 1).toISOString(),
    '2026-03-28T22:59:59.999Z',
  );
  assert.equal(
    privacyRightsResponseDeadline('2026-03-31T10:15:00.000Z', 1).toISOString(),
    '2026-04-30T21:59:59.999Z',
  );
  assert.equal(
    privacyRightsResponseDeadline('2026-08-22T10:15:00.000Z', 3).toISOString(),
    '2026-11-22T22:59:59.999Z',
  );
});

test('one-month privacy deadline stays within the persisted 32-day bound across autumn DST', () => {
  const cases = [
    {
      received: '2026-09-30T21:59:59.999Z',
      expected: '2026-10-30T22:59:59.999Z',
      berlinDate: '2026-10-30',
    },
    {
      received: '2026-09-30T22:00:00.000Z',
      expected: '2026-11-01T22:00:00.000Z',
      berlinDate: '2026-11-01',
    },
    {
      received: '2026-09-30T22:28:00.000Z',
      expected: '2026-11-01T22:28:00.000Z',
      berlinDate: '2026-11-01',
    },
    {
      received: '2026-09-30T22:59:59.999Z',
      expected: '2026-11-01T22:59:59.999Z',
      berlinDate: '2026-11-01',
    },
    {
      received: '2026-09-30T23:00:00.000Z',
      expected: '2026-11-01T22:59:59.999Z',
      berlinDate: '2026-11-01',
    },
  ];
  const berlinDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  for (const fixture of cases) {
    const received = new Date(fixture.received);
    const deadline = privacyRightsResponseDeadline(received, 1);
    assert.equal(deadline.toISOString(), fixture.expected);
    assert.equal(berlinDate.format(deadline), fixture.berlinDate);
    assert.ok(deadline.getTime() - received.getTime() <= 32 * 24 * 60 * 60 * 1000);
  }

  assert.equal(
    privacyRightsResponseDeadline('2026-08-22T10:15:00.000Z', 3).toISOString(),
    '2026-11-22T22:59:59.999Z',
  );
});

test('identity and extension inputs are optimistic-lock bound and narrowly shaped', () => {
  assert.deepEqual(
    normalizePrivacyIdentityVerification({ expectedVersion: 2 }),
    { expectedVersion: 2 },
  );
  assert.deepEqual(
    normalizePrivacyDeadlineExtension({
      expectedVersion: 3,
      userFacingReason:
        'Die Anfrage umfasst mehrere Systeme; wir benötigen zusätzliche Prüfzeit.',
    }),
    {
      expectedVersion: 3,
      userFacingReason:
        'Die Anfrage umfasst mehrere Systeme; wir benötigen zusätzliche Prüfzeit.',
    },
  );
  assert.throws(
    () => normalizePrivacyIdentityVerification({
      expectedVersion: 2,
      [['current', 'Password'].join('')]: 'domain-must-reject-extra-field',
    }),
    /support_privacy_identity_verification_invalid/u,
  );
  assert.throws(
    () => normalizePrivacyDeadlineExtension({
      expectedVersion: 3,
      userFacingReason: 'zu kurz',
    }),
    /support_privacy_extension_reason_invalid/u,
  );
});
