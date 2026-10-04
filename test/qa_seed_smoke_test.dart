import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/invoices_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final ownerMain = buildTestUser('u1', name: 'Walid Chraibi');
  final ownerA = buildTestUser('u2', name: 'Max Mustermann');
  final ownerB = buildTestUser('u3', name: 'Sarah Schmidt');
  final ownerC = buildTestUser('u4', name: 'Thomas Weber');
  final renterA = buildTestUser('u5', name: 'Julia Wagner');
  final renterMain = buildTestUser('u6', name: 'David König');
  final outsider = buildTestUser('u7', name: 'Anna Keller');

  final baseUsers = [
    ownerMain,
    ownerA,
    ownerB,
    ownerC,
    renterA,
    renterMain,
    outsider,
  ];

  final baseItems = [
    buildTestItem(
      id: 'item-owner-main',
      ownerId: ownerMain.id,
      title: 'Main Drill',
    ),
    buildTestItem(
      id: 'item-owner-a',
      ownerId: ownerA.id,
      title: 'Owner A Camera',
    ),
    buildTestItem(
      id: 'item-owner-b',
      ownerId: ownerB.id,
      title: 'Owner B Monitor',
    ),
    buildTestItem(
      id: 'item-owner-c',
      ownerId: ownerC.id,
      title: 'Owner C Light',
    ),
    buildTestItem(
      id: 'item-renter-a',
      ownerId: renterA.id,
      title: 'Renter A Bike',
    ),
    buildTestItem(
      id: 'item-renter-main',
      ownerId: renterMain.id,
      title: 'Renter Main Router',
    ),
    buildTestItem(
      id: 'item-outsider',
      ownerId: outsider.id,
      title: 'Outsider Speaker',
    ),
  ];

  Future<void> seedQaBase({required String currentUserId}) async {
    final currentUser = baseUsers.singleWhere((u) => u.id == currentUserId);
    SharedPreferences.setMockInitialValues({
      'users': jsonEncode(baseUsers.map((u) => u.toJson()).toList()),
      'items': jsonEncode(baseItems.map((i) => i.toJson()).toList()),
      'rental_requests': '[]',
      'message_threads_v1': '[]',
      'notifications': '[]',
      'review_reminders_v1': '[]',
      'multi_reviews_v1': '[]',
      'currentUser': jsonEncode(currentUser.toJson()),
    });
  }

  Future<void> triggerQaSeed(String currentUserId) async {
    await DataService.setCurrentUser(
      baseUsers.singleWhere((u) => u.id == currentUserId),
    );
    final me = await DataService.getCurrentUser();
    expect(me, isNotNull);
    expect(me!.id, currentUserId);
  }

  setUp(() {
    QaRuntimeService.configureFromUri(
      Uri.parse('https://example.test/?qa=1'),
      debugMode: true,
    );
  });

  tearDown(QaRuntimeService.reset);

  test(
    'qa renter lane seeds accepted/running/completed/needsReview smoke set',
    () async {
      await seedQaBase(currentUserId: renterMain.id);
      await triggerQaSeed(renterMain.id);

      final requests = await DataService.getRentalRequestsForRenter(
        renterMain.id,
      );
      final ids = requests.map((r) => r.id).toSet();

      expect(ids, contains('qa_req_accepted_${renterMain.id}'));
      expect(ids, contains('qa_req_running_${renterMain.id}'));
      expect(ids, contains('qa_req_completed_${renterMain.id}'));
      expect(ids, contains('qa_req_review_${renterMain.id}'));
      expect(ids, contains('qa_req_pending_${renterMain.id}'));

      final acceptedThread = await DataService.getMessageThreadByRequestId(
        'qa_req_accepted_${renterMain.id}',
      );
      expect(acceptedThread, isNotNull);

      final invoices = await InvoicesService.getInvoicesForCurrentUser();
      expect(
        invoices.where(
          (d) =>
              d.requestId == 'qa_req_completed_${renterMain.id}' &&
              d.type.name == 'bookingPaymentReceipt',
        ),
        isNotEmpty,
      );
      expect(
        invoices.where((d) => d.requestId == 'qa_req_review_${renterMain.id}'),
        isNotEmpty,
      );
    },
  );

  test(
    'qa owner lane supports handover pickup return completion and review-doc smoke',
    () async {
      await seedQaBase(currentUserId: ownerMain.id);
      await triggerQaSeed(ownerMain.id);

      final ownerRequests = await DataService.getRentalRequestsForOwner(
        ownerMain.id,
      );
      final ownerIds = ownerRequests.map((r) => r.id).toSet();
      expect(ownerIds, contains('qa_owner_pending_${ownerMain.id}'));
      expect(ownerIds, contains('qa_owner_upcoming_pickup_${ownerMain.id}'));
      expect(ownerIds, contains('qa_owner_upcoming_delivery_${ownerMain.id}'));
      expect(ownerIds, contains('qa_owner_running_${ownerMain.id}'));
      expect(ownerIds, contains('qa_owner_completed_clean_${ownerMain.id}'));
      expect(ownerIds, contains('qa_owner_completed_problem_${ownerMain.id}'));

      final pickupRequestId = 'qa_owner_upcoming_pickup_${ownerMain.id}';
      await triggerQaSeed(ownerA.id);
      await DataService.requestFlowTime(
        requestId: pickupRequestId,
        isReturn: false,
        label: '10:00',
        time: DateTime.now().add(const Duration(days: 1)),
        requestedByUserId: ownerA.id,
      );
      await triggerQaSeed(ownerMain.id);
      await DataService.confirmFlowTime(
        requestId: pickupRequestId,
        isReturn: false,
        confirmedByUserId: ownerMain.id,
      );
      expect(
        await DataService.setHandoverActive(
          pickupRequestId,
          active: true,
        ),
        isTrue,
      );
      for (var i = 0; i < DataService.minimumRequiredPhotos; i++) {
        await DataService.addConditionEvidencePhoto(
          requestId: pickupRequestId,
          bytes: Uint8List.fromList([1, 2, 3, i]),
          filename: 'pickup-$i.jpg',
          segment: 'pickup',
          kind: 'presenter_photo',
          source: 'camera',
          semanticSlot: const [
            'overview',
            'detail',
            'accessories',
            'critical'
          ][i],
        );
      }

      await triggerQaSeed(ownerA.id);
      await DataService.recordConditionConfirmation(
        requestId: pickupRequestId,
        segment: 'pickup',
        decision: 'confirmed',
      );
      final pickup = await DataService.confirmPickupTransition(
        requestId: pickupRequestId,
        confirmedByUserId: ownerA.id,
        method: 'manual',
        confirmationContextVerified: true,
        galleryAcknowledged: true,
      );
      expect(pickup.success, isTrue);
      expect(
        (await DataService.getRentalRequestById(
          pickupRequestId,
        ))!
            .status,
        'running',
      );

      final returnRequestId = 'qa_owner_running_${ownerMain.id}';
      await triggerQaSeed(ownerMain.id);
      await DataService.requestFlowTime(
        requestId: returnRequestId,
        isReturn: true,
        label: '18:00',
        time: DateTime.now().add(const Duration(days: 1, hours: 8)),
        requestedByUserId: ownerMain.id,
      );
      await triggerQaSeed(ownerC.id);
      await DataService.confirmFlowTime(
        requestId: returnRequestId,
        isReturn: true,
        confirmedByUserId: ownerC.id,
      );
      expect(
        await DataService.setReturnActive(
          returnRequestId,
          active: true,
        ),
        isTrue,
      );
      for (var i = 0; i < DataService.minimumRequiredPhotos; i++) {
        await DataService.addConditionEvidencePhoto(
          requestId: returnRequestId,
          bytes: Uint8List.fromList([4, 5, 6, i]),
          filename: 'return-$i.jpg',
          segment: 'return',
          kind: 'presenter_photo',
          source: 'camera',
          semanticSlot: const [
            'overview',
            'detail',
            'accessories',
            'critical'
          ][i],
        );
      }

      await triggerQaSeed(ownerMain.id);
      await DataService.recordConditionConfirmation(
        requestId: returnRequestId,
        segment: 'return',
        decision: 'confirmed',
      );
      final completion = await DataService.confirmReturnTransition(
        requestId: returnRequestId,
        confirmedByUserId: ownerMain.id,
        method: 'manual',
        confirmationContextVerified: true,
        galleryAcknowledged: true,
        reviewPauseSource: 'qa_smoke_test',
      );
      expect(completion.success, isTrue);
      expect(
        (await DataService.getRentalRequestById(
          returnRequestId,
        ))!
            .status,
        'completed',
      );

      final ownerInvoices = await InvoicesService.getInvoicesForUser(
        ownerMain.id,
      );
      expect(
        ownerInvoices.where(
          (d) =>
              d.requestId == 'qa_owner_completed_clean_${ownerMain.id}' &&
              d.type.name == 'ownerPayoutStatement',
        ),
        isNotEmpty,
      );
      expect(
        ownerInvoices.where(
          (d) => d.requestId == 'qa_owner_completed_problem_${ownerMain.id}',
        ),
        isNotEmpty,
      );
    },
  );

  test(
    'shared owner renter fixture exposes the same request and thread to both participants',
    () async {
      await seedQaBase(currentUserId: ownerMain.id);
      await triggerQaSeed(ownerMain.id);

      final ownerRequest = await DataService.getRentalRequestById(
        'qa_shared_request_u1_u2',
      );
      final ownerThread = await DataService.getMessageThreadByRequestId(
        'qa_shared_request_u1_u2',
      );

      expect(ownerRequest, isNotNull);
      expect(ownerRequest!.ownerId, ownerMain.id);
      expect(ownerRequest.renterId, ownerA.id);
      expect(ownerRequest.status, 'accepted');
      expect(ownerRequest.ownerDeliversAtDropoffChosen, isFalse);
      expect(ownerThread, isNotNull);
      expect(ownerThread!.id, 'qa_shared_thread_u1_u2');
      expect(ownerThread.requestId, ownerRequest.id);
      expect(ownerThread.user1Id, ownerMain.id);
      expect(ownerThread.user2Id, ownerA.id);

      await triggerQaSeed(ownerA.id);
      final renterRequest = await DataService.getRentalRequestById(
        'qa_shared_request_u1_u2',
      );
      final renterThread = await DataService.getMessageThreadByRequestId(
        'qa_shared_request_u1_u2',
      );

      expect(renterRequest, isNotNull);
      expect(renterRequest!.id, ownerRequest.id);
      expect(renterRequest.ownerId, ownerMain.id);
      expect(renterRequest.renterId, ownerA.id);
      expect(renterRequest.status, 'accepted');
      expect(renterThread, isNotNull);
      expect(renterThread!.id, ownerThread.id);
      expect(renterThread.requestId, ownerRequest.id);
    },
  );

  test(
    'shared owner renter fixture blocks outsider while preserving standard qa seeds',
    () async {
      await seedQaBase(currentUserId: ownerMain.id);
      await triggerQaSeed(ownerMain.id);
      await triggerQaSeed(ownerA.id);
      await triggerQaSeed(ownerB.id);

      final foreignThreadById = await DataService.getMessageThreadById(
        'qa_shared_thread_u1_u2',
      );
      final foreignThreadByRequest =
          await DataService.getMessageThreadByRequestId(
        'qa_shared_request_u1_u2',
      );
      final outsiderInvoices =
          await InvoicesService.getInvoicesForCurrentUser();

      expect(foreignThreadById, isNull);
      expect(foreignThreadByRequest, isNull);
      expect(
        outsiderInvoices.where((d) => d.requestId == 'qa_shared_request_u1_u2'),
        isEmpty,
      );

      await triggerQaSeed(ownerMain.id);
      final ownerRequests = await DataService.getRentalRequestsForOwner(
        ownerMain.id,
      );
      await triggerQaSeed(ownerA.id);
      final renterRequests = await DataService.getRentalRequestsForRenter(
        ownerA.id,
      );

      expect(
        ownerRequests.map((r) => r.id),
        contains('qa_shared_request_u1_u2'),
      );
      expect(
        renterRequests.map((r) => r.id),
        contains('qa_shared_request_u1_u2'),
      );
    },
  );
}
