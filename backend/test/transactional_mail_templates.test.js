import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTransactionalEmail,
  transactionalEmailKinds,
} from '../src/transactional_mail_templates.js';

const base = {
  displayName: 'Walid',
  bookingReference: 'SIT-123456',
  itemTitle: 'Canon EOS R5',
  actionUrl: 'https://shareittoo.com/?booking=SIT-123456',
};

test('all required transactional templates render text and HTML', () => {
  assert.deepEqual(transactionalEmailKinds, [
    'booking_requested',
    'booking_accepted',
    'booking_confirmed',
    'booking_declined',
    'payment_confirmed',
    'booking_cancelled',
    'booking_active',
    'booking_returned',
    'booking_completed',
    'booking_refunded',
    'booking_disputed',
    'message_received',
    'handover_reminder',
    'return_reminder',
    'return_confirmation_reminder',
    'return_confirmation_window_closed',
    'return_report_window_closed',
    'return_case_opened',
    'return_case_response_due',
    'return_case_status_update',
    'payout_sent',
  ]);

  for (const kind of transactionalEmailKinds) {
    const message = buildTransactionalEmail({
      ...base,
      kind,
      amount: 49.9,
      currency: 'EUR',
      eventLabel: '10. August, 14:30 Uhr',
    });
    assert.match(message.subject, /Canon EOS R5/);
    assert.match(message.text, /SIT-123456/);
    assert.equal(
      message.text.split('\n').some((line) => line.split(': ').at(-1) === base.actionUrl),
      true,
    );
    assert.match(message.html, /<!doctype html>/);
    assert.match(message.html, /Buchungsnummer/);
    assert.doesNotMatch(message.html, /undefined|null/);
  }
});

test('money-bearing templates require and format an amount', () => {
  for (const kind of ['payment_confirmed', 'booking_refunded', 'payout_sent']) {
    assert.throws(
      () => buildTransactionalEmail({ ...base, kind }),
      /amount_invalid/,
    );
    const message = buildTransactionalEmail({
      ...base,
      kind,
      amount: 49.9,
      currency: 'EUR',
    });
    assert.match(message.text, /49,90/);
  }
});

test('scheduled reminders and case deadlines require a schedule label', () => {
  for (const kind of [
    'handover_reminder',
    'return_reminder',
    'return_confirmation_reminder',
    'return_case_response_due',
    'return_case_status_update',
  ]) {
    assert.throws(
      () => buildTransactionalEmail({ ...base, kind }),
      /event_label_required/,
    );
  }
});

test('template HTML escapes user-controlled content and rejects unsafe URLs', () => {
  const message = buildTransactionalEmail({
    ...base,
    kind: 'booking_confirmed',
    displayName: '<script>alert(1)</script>',
    itemTitle: '<img src=x onerror=alert(1)>',
    actionUrl: 'https://shareittoo.com/?x=<unsafe>',
  });
  assert.equal(message.html.includes('<script>'), false);
  assert.equal(message.html.includes('<img'), false);
  assert.match(message.html, /&lt;script&gt;/);
  assert.match(message.html, /%3Cunsafe%3E/);

  assert.throws(
    () => buildTransactionalEmail({
      ...base,
      kind: 'booking_confirmed',
      actionUrl: 'javascript:alert(1)',
    }),
    /action_url_invalid/,
  );

  assert.throws(
    () => buildTransactionalEmail({
      ...base,
      kind: 'booking_confirmed',
      itemTitle: 'Kamera\r\nBcc: attacker@example.com',
    }),
    /item_title_invalid/,
  );
});
