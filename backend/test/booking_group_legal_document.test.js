import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTechnicalBookingGroupLegalDocumentSet,
  bookingGroupLegalDocumentSet,
  BookingGroupLegalDocumentError,
} from '../src/booking_group_legal_document.js';

test('G3L booking-group document set is immutable, prospective, and fail-closed', () => {
  assert.equal(bookingGroupLegalDocumentSet.version, 'G3L-DRAFT-2026-08-20.1');
  assert.equal(bookingGroupLegalDocumentSet.parentVersion, 'V5.2-2026-08-16');
  assert.equal(bookingGroupLegalDocumentSet.status, 'draft-blocked');
  assert.equal(bookingGroupLegalDocumentSet.professionalApprovalClaimAllowed, false);
  assert.equal(bookingGroupLegalDocumentSet.publicActivationAllowed, false);
  assert.equal(bookingGroupLegalDocumentSet.productionProvisioningAllowed, false);
  assert.equal(bookingGroupLegalDocumentSet.realMoneyAllowed, false);
  assert.equal(bookingGroupLegalDocumentSet.historicalV52MutationAllowed, false);
  assert.ok(Object.isFrozen(bookingGroupLegalDocumentSet));
  assert.ok(Object.isFrozen(bookingGroupLegalDocumentSet.affectedDocumentTypes));
  assert.equal(
    assertTechnicalBookingGroupLegalDocumentSet(bookingGroupLegalDocumentSet.version),
    bookingGroupLegalDocumentSet,
  );
});

test('G3L document machinery rejects any other or missing version', () => {
  for (const version of [null, '', 'V5.2-2026-08-16', 'G3L-APPROVED']) {
    assert.throws(
      () => assertTechnicalBookingGroupLegalDocumentSet(version),
      (error) => error instanceof BookingGroupLegalDocumentError
        && error.code === 'booking_group_legal_document_not_available',
    );
  }
});
