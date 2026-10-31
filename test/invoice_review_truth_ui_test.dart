import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/invoice.dart';
import 'package:lendify/screens/invoice_detail_screen.dart';

Invoice reviewOnlyRefund() => Invoice.fromJson({
      'id': 'document-review-only',
      'documentNumber': 'SIT-ERSTATTUNG-202609-REVIEW000001',
      'bookingId': 'booking-review-only',
      'type': 'refund_receipt',
      'title': 'Historischer Erstattungsbeleg – Prüfung erforderlich',
      'sourceKind': 'refund',
      'sourceId': 'refund-review-only',
      'sourceTruthStatus': 'historical_unverified',
      'needsReview': true,
      'currency': 'EUR',
      'amountMinor': 2200,
      'privateRentMinor': 0,
      'sitFeeMinor': 0,
      'ownerPayoutMinor': 0,
      'rentRefundMinor': 2000,
      'sitFeeRefundMinor': 200,
      'supplierRole': 'payment_provider',
      'debtorRole': 'payment_provider',
      'taxTreatment': 'not_applicable',
      'testMode': true,
      'issuedAt': '2026-09-14T12:00:00.000Z',
      'artifactSha256': 'a' * 64,
      'downloadPath': null,
      'sitFeeTaxLabel': 'im Testbetrieb nicht freigegeben',
      'booking': {
        'itemTitle': 'Bohrmaschine',
        'renterName': 'Mieter',
        'ownerName': 'Privater Vermieter',
        'startsAt': '2026-09-15T10:00:00.000Z',
        'endsAt': '2026-09-17T10:00:00.000Z',
        'quoteId': 'quote-review-only',
        'quoteHash': 'b' * 64,
        'contractVersion': 'V5.2-2026-08-23',
      },
    });

void main() {
  testWidgets(
      'review-only refund hides money and removes download and share actions',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: ThemeData.dark(),
      home: InvoiceDetailScreen(invoice: reviewOnlyRefund()),
    ));
    await tester.pump();

    expect(find.textContaining('Provider-Wahrheit'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -500));
    await tester.pump();
    expect(find.text('Beträge werden geprüft'), findsOneWidget);
    expect(find.textContaining('keine Geldbeträge'), findsOneWidget);
    expect(find.text('PDF herunterladen'), findsNothing);
    expect(find.text('Beleg teilen'), findsNothing);
    expect(find.textContaining('22,00 €'), findsNothing);
    expect(find.textContaining('20,00 €'), findsNothing);
    expect(find.textContaining('2,00 €'), findsNothing);
  });
}
