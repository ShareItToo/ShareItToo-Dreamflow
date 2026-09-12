import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/invoice.dart';
import 'package:lendify/services/invoice_pdf_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('reviewed PDF dependency set produces a valid immutable test document',
      () async {
    final invoice = Invoice.fromJson({
      'id': 'document-pdf-compatibility',
      'documentNumber': 'SIT-BUCHUNG-202608-PDFTEST000001',
      'bookingId': 'booking-pdf-compatibility',
      'type': 'booking_payment_receipt',
      'title': 'Finanzdokument',
      'sourceKind': 'payment',
      'sourceId': 'payment-pdf-compatibility',
      'currency': 'EUR',
      'amountMinor': 4400,
      'privateRentMinor': 4000,
      'sitFeeMinor': 400,
      'ownerPayoutMinor': 0,
      'rentRefundMinor': 0,
      'sitFeeRefundMinor': 0,
      'supplierRole': 'private_owner',
      'debtorRole': 'renter',
      'taxTreatment': 'private_rent_no_sit_vat',
      'testMode': true,
      'issuedAt': '2026-08-23T12:00:00.000Z',
      'artifactSha256': 'a' * 64,
      'downloadPath':
          '/v1/financial-documents/document-pdf-compatibility/artifact',
      'sitFeeTaxLabel': 'im Testbetrieb nicht freigegeben',
      'booking': {
        'itemTitle': 'Bohrmaschine',
        'renterName': 'Mieter',
        'ownerName': 'Privater Vermieter',
        'startsAt': '2026-08-24T10:00:00.000Z',
        'endsAt': '2026-08-26T10:00:00.000Z',
        'quoteId': 'quote-pdf-compatibility',
        'quoteHash': 'b' * 64,
        'contractVersion': 'V5.2-2026-08-23',
      },
    });

    final bytes = await InvoicePdfService.buildPdf(invoice);

    expect(bytes.length, greaterThan(1000));
    expect(ascii.decode(bytes.take(5).toList()), '%PDF-');
    expect(
        ascii.decode(bytes.skip(bytes.length - 6).toList()), contains('EOF'));
  });
}
