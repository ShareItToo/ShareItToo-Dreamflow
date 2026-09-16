import assert from 'node:assert/strict';
import test from 'node:test';

import { minimizeThirdPartyStructuredLocations } from '../src/privacy_export.js';
import {
  applyAccountExportPolicy,
  validateAccountExportPurpose,
} from '../src/privacy_export_policy.js';

test('privacy export removes a received structured exact location without mutating input', () => {
  const input = [
    {
      id: 'own-location',
      sent_by_me: true,
      body: '📍 LOCATION_SHARE|Übergabe|52.501|13.401|https://maps.example/own|handover|Eigenweg 7|Ich',
    },
    {
      id: 'received-location',
      sent_by_me: false,
      body: 'Hinweis\n📍 LOCATION_SHARE|Rückgabe|52.502|13.402|https://maps.example/other|return|Fremdweg 9|Andere Person',
    },
  ];

  const result = minimizeThirdPartyStructuredLocations(input);

  assert.equal(result.omittedCount, 1);
  assert.match(result.messages[0].body, /Eigenweg 7/u);
  assert.match(result.messages[1].body, /Hinweis/u);
  assert.match(result.messages[1].body, /THIRD_PARTY_EXACT_LOCATION_OMITTED/u);
  assert.doesNotMatch(
    result.messages[1].body,
    /Fremdweg|52\.502|13\.402|maps\.example|Andere Person/u,
  );
  assert.match(input[1].body, /Fremdweg 9/u);
});

test('privacy export leaves ordinary received text unchanged', () => {
  const message = { id: 'ordinary', sent_by_me: false, body: 'Treffen wir uns um 18 Uhr?' };
  const result = minimizeThirdPartyStructuredLocations([message]);
  assert.equal(result.omittedCount, 0);
  assert.equal(result.messages[0], message);
});

test('access-copy policy replaces internal identifiers and withholds security internals', () => {
  const result = applyAccountExportPolicy({
    account: {
      id: 'account-a',
      email: 'owner@example.invalid',
      password_changed_at: '2026-09-15T10:00:00.000Z',
    },
    authentication: {
      sessions: [{
        id: 'session-a',
        device_label: 'private-device-name',
        user_agent: 'secret-agent-shape',
        ip_address: '203.0.113.1',
        created_at: '2026-09-15T10:00:00.000Z',
      }],
      identities: [{
        provider: 'google',
        provider_subject: 'provider-subject-a',
        firebase_user_id: 'firebase-a',
      }],
    },
    marketplace: {
      bookings: [{ id: 'booking-a', listing_id: 'listing-a' }],
      bookingGroups: {
        groups: [{ id: 'group-a' }],
        positions: [{ booking_group_id: 'group-a', booking_id: 'booking-a' }],
        commands: [{
          booking_group_id: 'group-a',
          request_hash: 'internal-request-hash',
          response_payload: { accessToken: 'forbidden' },
        }],
      },
    },
    trustAndSafety: {
      moderationDecisions: [{
        id: 'decision-a',
        user_facing_measure_notice: 'Visible notice',
        facts: 'internal facts',
        basis: 'internal basis',
        reasoning: 'internal reasoning',
        detection_method: 'internal detector',
      }],
    },
    auditEvents: [{
      resource_id: 'booking-a',
      request_id: 'request-a',
      action: 'account.data_exported',
    }],
  }, 'access_copy');

  assert.equal(result.policy.purpose, 'access_copy');
  assert.equal(result.data.account.id, 'ref_000001');
  assert.equal(result.data.account.password_changed_at, '2026-09-15T10:00:00.000Z');
  assert.equal(
    result.data.marketplace.bookingGroups.positions[0].booking_id,
    result.data.marketplace.bookings[0].id,
  );
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /account-a|booking-a|listing-a|group-a|session-a/u);
  assert.doesNotMatch(
    serialized,
    /private-device-name|secret-agent-shape|203\.0\.113\.1|provider-subject-a|firebase-a|internal-request-hash|forbidden|internal facts|internal basis|internal reasoning|internal detector|request-a/u,
  );
  assert.match(serialized, /Visible notice|account\.data_exported/u);
});

test('portability policy contains own and observed data but excludes received and inferred records', () => {
  const result = applyAccountExportPolicy({
    account: { id: 'account-a', email: 'owner@example.invalid' },
    authentication: { identities: [], pushDevices: [], sessions: [{ id: 'session-a' }] },
    marketplace: {
      listings: [{ id: 'listing-a', payload: { title: 'Own listing' } }],
      listingSets: { sets: [] },
      bookings: [{ id: 'booking-a' }],
      bookingQuotes: [],
      bookingGroups: {
        groups: [{ id: 'group-a' }],
        positions: [],
        quotes: [
          { id: 'quote-own', proposed_by_me: true },
          { id: 'quote-other', proposed_by_me: false },
        ],
        quotePositions: [
          { id: 'position-own', group_quote_id: 'quote-own' },
          { id: 'position-other', group_quote_id: 'quote-other' },
        ],
        stateEvents: [
          { id: 'event-own', acted_by_me: true },
          { id: 'event-other', acted_by_me: false },
        ],
      },
      rentalCart: { projects: [] },
      platformContracts: [],
      platformContractDeclarations: [],
      platformContractReceipts: [],
      withdrawals: [],
      withdrawalReceipts: [],
    },
    communication: {
      messages: [
        { id: 'message-own', sent_by_me: true, body: 'Mine' },
        { id: 'message-other', sent_by_me: false, body: 'Received' },
      ],
      support: {
        messages: [
          { id: 'support-own', sent_by_me: true, rendered_content: 'Mine' },
          { id: 'support-other', sent_by_me: false, rendered_content: 'Received' },
        ],
      },
    },
    notifications: { preferences: { push_enabled: true }, history: [{ body: 'inferred' }] },
    trustAndSafety: {
      reviews: [
        { id: 'review-own', relationship: 'submitted' },
        { id: 'review-other', relationship: 'received' },
      ],
      reports: [],
      moderationDecisions: [{ id: 'decision-a' }],
      moderationReviewRequests: [],
      blocks: [],
      disputes: [],
    },
    financialActivity: { payments: [{ id: 'payment-a' }] },
    auditEvents: [{ action: 'internal' }],
  }, 'data_portability');

  const serialized = JSON.stringify(result.data);
  assert.equal(result.policy.portabilityExcludesReceivedAndInferredRecords, true);
  assert.match(serialized, /Own listing|Mine/u);
  assert.doesNotMatch(serialized, /Received|inferred|moderationDecisions|auditEvents|sessions/u);
  assert.equal(result.data.marketplace.bookingGroups.quotes.length, 1);
  assert.equal(result.data.marketplace.bookingGroups.quotePositions.length, 1);
  assert.equal(
    result.data.marketplace.bookingGroups.quotePositions[0].group_quote_id,
    result.data.marketplace.bookingGroups.quotes[0].id,
  );
  assert.equal(result.data.marketplace.bookingGroups.stateEvents.length, 1);
  assert.equal(result.data.trustAndSafety.reviews.length, 1);
  assert.equal(result.data.financialActivity.payments.length, 1);
});

test('privacy-export purpose is an exact closed enum', () => {
  assert.equal(validateAccountExportPurpose('access_copy'), 'access_copy');
  assert.equal(validateAccountExportPurpose('data_portability'), 'data_portability');
  for (const value of [undefined, null, '', 'access', 'ACCESS_COPY']) {
    assert.throws(
      () => validateAccountExportPurpose(value),
      /account_export_purpose_invalid/u,
    );
  }
});
