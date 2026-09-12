export const bookingGroupLegalDocumentSet = Object.freeze({
  version: 'G3L-DRAFT-2026-08-20.1',
  parentVersion: 'V5.2-2026-08-16',
  locale: 'de',
  status: 'draft-blocked',
  professionalApprovalClaimAllowed: false,
  publicActivationAllowed: false,
  productionProvisioningAllowed: false,
  realMoneyAllowed: false,
  historicalV52MutationAllowed: false,
  affectedDocumentTypes: Object.freeze([
    'platform_terms',
    'private_rental_terms',
    'cancellation_refund',
    'handover_return_damage',
    'payment_payout',
    'reporting_moderation_review',
    'privacy',
    'imprint_withdrawal_shorttexts',
  ]),
});

export class BookingGroupLegalDocumentError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function assertTechnicalBookingGroupLegalDocumentSet(value) {
  if (value !== bookingGroupLegalDocumentSet.version
      || bookingGroupLegalDocumentSet.status !== 'draft-blocked'
      || bookingGroupLegalDocumentSet.professionalApprovalClaimAllowed !== false
      || bookingGroupLegalDocumentSet.publicActivationAllowed !== false
      || bookingGroupLegalDocumentSet.productionProvisioningAllowed !== false
      || bookingGroupLegalDocumentSet.realMoneyAllowed !== false
      || bookingGroupLegalDocumentSet.historicalV52MutationAllowed !== false) {
    throw new BookingGroupLegalDocumentError('booking_group_legal_document_not_available');
  }
  return bookingGroupLegalDocumentSet;
}
