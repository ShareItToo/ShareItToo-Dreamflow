import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/invoice.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/invoices_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late final owner = buildTestUser('owner-1', name: 'Walid');
  late final renter = buildTestUser('renter-1', name: 'Julia');
  late final item = buildTestItem(
    id: 'item-1',
    ownerId: 'owner-1',
    title: 'QNAP NAS',
  );

  Future<List<Invoice>> documentsFor(User user) async {
    QaRuntimeService.setRuntimeUserJson(user.toJson());
    return InvoicesService.getInvoicesForUser(user.id);
  }

  setUp(() async {
    QaRuntimeService.configureFromUri(
      Uri.parse('https://example.test/?qa=1'),
      debugMode: true,
    );
    await seedCoreBookingState(
      owner: owner,
      renter: renter,
      item: item,
      requests: [
        buildTestRequest(
          id: 'req-completed',
          itemId: item.id,
          ownerId: owner.id,
          renterId: renter.id,
          status: 'completed',
          quotedRentalSubtotalMinor: 4000,
          quotedPlatformFeeMinor: 400,
          quotedTotalMinor: 4400,
        ),
        buildTestRequest(
          id: 'req-review-hold',
          itemId: item.id,
          ownerId: owner.id,
          renterId: renter.id,
          status: 'completed',
          needsReview: true,
          quotedRentalSubtotalMinor: 4000,
          quotedPlatformFeeMinor: 400,
          quotedTotalMinor: 4400,
        ),
        buildTestRequest(
          id: 'req-cancel-owner',
          itemId: item.id,
          ownerId: owner.id,
          renterId: renter.id,
          status: 'cancelled',
          cancelledBy: 'owner',
          quotedRentalSubtotalMinor: 4000,
          quotedPlatformFeeMinor: 400,
          quotedTotalMinor: 4400,
        ),
      ],
    );
  });

  tearDown(QaRuntimeService.reset);

  test(
    'completed QA booking yields two renter documents and only one owner payout statement',
    () async {
      final renterDocs = await documentsFor(renter);
      final ownerDocs = await documentsFor(owner);

      expect(
        renterDocs.where((document) =>
            document.requestId == 'req-completed' &&
            document.type == InvoiceType.bookingPaymentReceipt),
        hasLength(1),
      );
      expect(
        renterDocs.where((document) =>
            document.requestId == 'req-completed' &&
            document.type == InvoiceType.sitFeeReceipt),
        hasLength(1),
      );
      expect(
        ownerDocs.where((document) =>
            document.requestId == 'req-completed' &&
            document.type == InvoiceType.ownerPayoutStatement),
        hasLength(1),
      );
      expect(
        ownerDocs
            .where((document) => document.type == InvoiceType.sitFeeReceipt),
        isEmpty,
      );
    },
  );

  test('needsReview does not hide already-issued undisputed documents',
      () async {
    final ownerDocs = await documentsFor(owner);
    final renterDocs = await documentsFor(renter);

    expect(
      ownerDocs.where((document) =>
          document.requestId == 'req-review-hold' &&
          document.type == InvoiceType.ownerPayoutStatement),
      isNotEmpty,
    );
    expect(
      renterDocs.where((document) =>
          document.requestId == 'req-review-hold' &&
          document.type == InvoiceType.bookingPaymentReceipt),
      isNotEmpty,
    );
  });

  test('QA receipt repeats only the persisted quote amounts', () async {
    final renterDocs = await documentsFor(renter);
    final invoice = renterDocs.singleWhere((document) =>
        document.requestId == 'req-completed' &&
        document.type == InvoiceType.bookingPaymentReceipt);

    expect(invoice.pricing.netAmount, 40.0);
    expect(invoice.pricing.platformFee, 4.0);
    expect(invoice.pricing.totalAfterTax, 44.0);
    expect(invoice.pricing.taxAmount, 0.0);
    expect(invoice.testMode, isTrue);
  });

  test('cancelled booking without a succeeded refund produces no document',
      () async {
    final renterDocs = await documentsFor(renter);
    expect(
      renterDocs.where((document) => document.requestId == 'req-cancel-owner'),
      isEmpty,
    );
  });
}
