import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/invoice.dart';

Map<String, dynamic> documentJson({
  String type = 'booking_payment_receipt',
  String sourceKind = 'payment',
  int amountMinor = 4400,
  int privateRentMinor = 4000,
  int sitFeeMinor = 400,
  int ownerPayoutMinor = 0,
  int rentRefundMinor = 0,
  int sitFeeRefundMinor = 0,
}) =>
    {
      'id': 'document-1',
      'documentNumber': 'SIT-BUCHUNG-202608-ABCDEF123456',
      'bookingId': 'booking-1',
      'type': type,
      'title': 'Finanzdokument',
      'sourceKind': sourceKind,
      'sourceId': 'source-1',
      'currency': 'EUR',
      'amountMinor': amountMinor,
      'privateRentMinor': privateRentMinor,
      'sitFeeMinor': sitFeeMinor,
      'ownerPayoutMinor': ownerPayoutMinor,
      'rentRefundMinor': rentRefundMinor,
      'sitFeeRefundMinor': sitFeeRefundMinor,
      'supplierRole': 'private_owner',
      'debtorRole': 'renter',
      'taxTreatment': 'private_rent_no_sit_vat',
      'testMode': true,
      'issuedAt': '2026-08-19T12:00:00.000Z',
      'artifactSha256': 'a' * 64,
      'downloadPath': '/v1/financial-documents/document-1/artifact',
      'sitFeeTaxLabel': 'im Testbetrieb nicht freigegeben',
      'booking': {
        'itemTitle': 'Bohrmaschine',
        'renterName': 'Mieter',
        'ownerName': 'Privater Vermieter',
        'startsAt': '2026-08-20T10:00:00.000Z',
        'endsAt': '2026-08-22T10:00:00.000Z',
        'quoteId': 'quote-1',
        'quoteHash': 'b' * 64,
        'contractVersion': 'V5.1-2026-08-16',
      },
    };

void main() {
  test(
      'server financial document snapshot is parsed without client calculation',
      () {
    final invoice = Invoice.fromJson(documentJson());

    expect(invoice.type, InvoiceType.bookingPaymentReceipt);
    expect(invoice.amount, 44.0);
    expect(invoice.pricing.netAmount, 40.0);
    expect(invoice.pricing.platformFee, 4.0);
    expect(invoice.pricing.taxAmount, 0.0);
    expect(invoice.booking.rentalDays, 2);
    expect(invoice.testMode, isTrue);
    expect(invoice.toJson()['type'], 'booking_payment_receipt');
  });

  test('every server document type maps to one explicit UI type', () {
    final mapping = {
      'booking_payment_receipt': (
        InvoiceType.bookingPaymentReceipt,
        documentJson(),
      ),
      'sit_fee_receipt': (
        InvoiceType.sitFeeReceipt,
        documentJson(
          type: 'sit_fee_receipt',
          amountMinor: 400,
          privateRentMinor: 0,
        ),
      ),
      'owner_payout_statement': (
        InvoiceType.ownerPayoutStatement,
        documentJson(
          type: 'owner_payout_statement',
          sourceKind: 'payout',
          amountMinor: 4000,
          privateRentMinor: 0,
          sitFeeMinor: 0,
          ownerPayoutMinor: 4000,
        ),
      ),
      'refund_receipt': (
        InvoiceType.refundReceipt,
        documentJson(
          type: 'refund_receipt',
          sourceKind: 'refund',
          amountMinor: 2200,
          privateRentMinor: 0,
          sitFeeMinor: 0,
          rentRefundMinor: 2000,
          sitFeeRefundMinor: 200,
        ),
      ),
    };
    for (final entry in mapping.entries) {
      final invoice = Invoice.fromJson(entry.value.$2);
      expect(invoice.type, entry.value.$1);
    }
  });

  test('unknown document types and malformed snapshots fail closed', () {
    expect(
      () => Invoice.fromJson(documentJson(type: 'legacy_invoice')),
      throwsFormatException,
    );
    expect(
      () => Invoice.fromJson({
        ...documentJson(),
        'artifactSha256': 'not-a-hash',
      }),
      throwsFormatException,
    );
    expect(
      () => Invoice.fromJson({
        ...documentJson(),
        'amountMinor': 4399,
      }),
      throwsFormatException,
    );
    expect(
      () => Invoice.fromJson({
        ...documentJson(),
        'booking': {
          ...documentJson()['booking'] as Map<String, dynamic>,
          'ownerName': '',
        },
      }),
      throwsFormatException,
    );
  });
}
