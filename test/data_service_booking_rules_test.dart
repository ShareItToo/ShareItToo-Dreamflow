import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/message.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  String authSessionFor(User user) => jsonEncode(<String, Object>{
        'userId': user.id,
        'email': user.email,
        'createdAt': '2026-08-25T04:00:00.000Z',
      });

  Future<void> setAuthenticatedUser(User user) async {
    await DataService.setCurrentUser(user);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_session_v1', authSessionFor(user));
  }

  group('DataService refund policy', () {
    test(
      'V5.1 cancellation policy uses exact 24-hour instants',
      () {
        final start = DateTime(2026, 7, 29, 12);

        expect(
          DataService.refundRatio(
            policy: 'unified',
            start: start,
            cancelAt: DateTime(2026, 7, 27, 23, 59),
          ),
          1.0,
        );
        expect(
          DataService.refundRatio(
            policy: 'unified',
            start: start,
            cancelAt: DateTime(2026, 7, 28, 12, 0),
          ),
          1.0,
        );
        expect(
          DataService.refundRatio(
            policy: 'unified',
            start: start,
            cancelAt: DateTime(2026, 7, 28, 13, 0),
          ),
          0.5,
        );
        expect(
          DataService.refundRatio(
            policy: 'unified',
            start: start,
            cancelAt: DateTime(2026, 7, 29, 12, 0),
          ),
          isNull,
        );
      },
    );
  });

  group('DataService booking transitions', () {
    late final owner = buildTestUser('owner-1', name: 'Walid');
    late final renter = buildTestUser('renter-1', name: 'Julia');
    late final outsider = buildTestUser('outsider-1', name: 'Chris');
    late final item = buildTestItem(id: 'item-1', ownerId: 'owner-1');

    Future<void> seedBookingState({User? currentUser}) async {
      final bookingThread = MessageThread(
        id: 'thread-booking',
        requestId: 'req-pickup',
        itemId: item.id,
        itemTitle: item.title,
        user1Id: renter.id,
        user2Id: owner.id,
        messages: const [],
        createdAt: DateTime(2026, 7, 20, 10),
        lastMessageAt: DateTime(2026, 7, 20, 10),
      );

      SharedPreferences.setMockInitialValues({
        'users': jsonEncode([
          owner.toJson(),
          renter.toJson(),
          outsider.toJson(),
        ]),
        'items': jsonEncode([item.toJson()]),
        'message_threads_v1': jsonEncode([bookingThread.toJson()]),
        'rental_requests': jsonEncode([
          buildTestRequest(
            id: 'req-pickup',
            itemId: item.id,
            ownerId: owner.id,
            renterId: renter.id,
            status: 'accepted',
          ).toJson(),
          buildTestRequest(
            id: 'req-return',
            itemId: item.id,
            ownerId: owner.id,
            renterId: renter.id,
            status: 'running',
          ).toJson(),
          buildTestRequest(
            id: 'req-review',
            itemId: item.id,
            ownerId: owner.id,
            renterId: renter.id,
            status: 'running',
            needsReview: true,
          ).toJson(),
        ]),
        'handover_return_state_v1': jsonEncode({
          'req-pickup': {'handoverTimeConfirmed': true},
          'req-return': {'returnTimeConfirmed': true},
          'req-review': {'returnTimeConfirmed': true},
        }),
        if (currentUser != null)
          'currentUser': jsonEncode(currentUser.toJson()),
        if (currentUser != null) 'auth_session_v1': authSessionFor(currentUser),
      });
    }

    Future<void> seedConditionEvidence({
      required String requestId,
      required String segment,
    }) async {
      final presenter = segment == 'pickup' ? owner : renter;
      final verifier = segment == 'pickup' ? renter : owner;
      await setAuthenticatedUser(presenter);
      for (var index = 0; index < DataService.minimumRequiredPhotos; index++) {
        await DataService.addConditionEvidencePhoto(
          requestId: requestId,
          bytes: Uint8List.fromList([1, 2, 3, index]),
          filename: '$segment-$index.jpg',
          segment: segment,
          kind: 'presenter_photo',
          source: 'camera',
          semanticSlot: const [
            'overview',
            'detail',
            'accessories',
            'critical'
          ][index],
        );
      }
      await setAuthenticatedUser(verifier);
      await DataService.recordConditionConfirmation(
        requestId: requestId,
        segment: segment,
        decision: 'confirmed',
      );
    }

    setUp(() async {
      await seedBookingState(currentUser: owner);
    });

    test('thread lookup allows owner participant', () async {
      await seedBookingState(currentUser: owner);

      final thread = await DataService.getMessageThreadById('thread-booking');

      expect(thread, isNotNull);
      expect(thread!.requestId, 'req-pickup');
    });

    test('thread lookup allows renter participant', () async {
      await seedBookingState(currentUser: renter);

      final thread = await DataService.getMessageThreadById('thread-booking');

      expect(thread, isNotNull);
      expect(thread!.requestId, 'req-pickup');
    });

    test('thread lookup blocks uninvolved user on foreign thread id', () async {
      await seedBookingState(currentUser: outsider);

      final thread = await DataService.getMessageThreadById('thread-booking');

      expect(thread, isNull);
    });

    test('thread lookup blocks when no current user is logged in', () async {
      await seedBookingState();

      final thread = await DataService.getMessageThreadById('thread-booking');

      expect(thread, isNull);
    });

    test('thread creation/open allows owner for own request id', () async {
      await seedBookingState(currentUser: owner);

      final thread = await DataService.createOrGetThreadForRequest(
        'req-pickup',
      );

      expect(thread, isNotNull);
      expect(thread!.id, 'thread-booking');
    });

    test(
      'thread creation/open blocks uninvolved user on foreign request id',
      () async {
        await seedBookingState(currentUser: outsider);

        final thread = await DataService.createOrGetThreadForRequest(
          'req-pickup',
        );

        expect(thread, isNull);
      },
    );

    test('thread lookup by request id allows owner participant', () async {
      await seedBookingState(currentUser: owner);

      final thread = await DataService.getMessageThreadByRequestId(
        'req-pickup',
      );

      expect(thread, isNotNull);
      expect(thread!.id, 'thread-booking');
    });

    test('thread lookup by request id allows renter participant', () async {
      await seedBookingState(currentUser: renter);

      final thread = await DataService.getMessageThreadByRequestId(
        'req-pickup',
      );

      expect(thread, isNotNull);
      expect(thread!.id, 'thread-booking');
    });

    test(
      'thread lookup by request id blocks uninvolved user on foreign request id',
      () async {
        await seedBookingState(currentUser: outsider);

        final thread = await DataService.getMessageThreadByRequestId(
          'req-pickup',
        );

        expect(thread, isNull);
      },
    );

    test(
      'thread lookup by request id blocks when no current user is logged in',
      () async {
        await seedBookingState();

        final thread = await DataService.getMessageThreadByRequestId(
          'req-pickup',
        );

        expect(thread, isNull);
      },
    );

    test('handover start allows logged-in owner after confirmed handover time',
        () async {
      await seedBookingState(currentUser: owner);

      final result = await DataService.setHandoverActive(
        'req-pickup',
        active: true,
      );

      final state = await DataService.getHandoverReturnState('req-pickup');
      final request = await DataService.getRentalRequestById('req-pickup');

      expect(result, isTrue);
      expect(state['handoverActive'], isTrue);
      expect(state['returnActive'], isFalse);
      expect(request!.status, 'accepted');
    });

    test('handover start rejects an unconfirmed handover time', () async {
      await setAuthenticatedUser(renter);
      await DataService.requestFlowTime(
        requestId: 'req-pickup',
        isReturn: false,
        label: '10:00',
        time: DateTime(2026, 7, 29, 10),
        requestedByUserId: renter.id,
      );
      await setAuthenticatedUser(owner);
      final before = await DataService.getHandoverReturnState('req-pickup');

      final result = await DataService.setHandoverActive(
        'req-pickup',
        active: true,
      );

      final after = await DataService.getHandoverReturnState('req-pickup');
      expect(result, isFalse);
      expect(after, before);
      expect(after['handoverActive'], isFalse);
    });

    test('flow time stays on the canonical rental day after caller date drift',
        () async {
      await seedBookingState(currentUser: owner);
      final request = await DataService.getRentalRequestById('req-pickup');

      await DataService.requestFlowTime(
        requestId: 'req-pickup',
        isReturn: false,
        label: 'untrusted weekday, 10:15',
        time: DateTime(2026, 7, 28, 10, 15),
        requestedByUserId: owner.id,
      );

      final state = await DataService.getHandoverReturnState('req-pickup');
      final expected = request!.flowTimeAt(
        isReturn: false,
        hour: 10,
        minute: 15,
      );
      expect(state['handoverTimeIso'], expected.toIso8601String());
      expect(state['handoverTimeRequested'], 'Mi, 10:15');
    });

    test(
      'handover start rejects involved renter on accepted request',
      () async {
        await seedBookingState(currentUser: renter);
        final before = await DataService.getHandoverReturnState('req-pickup');

        final result = await DataService.setHandoverActive(
          'req-pickup',
          active: true,
        );

        final after = await DataService.getHandoverReturnState('req-pickup');

        expect(result, isFalse);
        expect(after, before);
        expect(after['handoverActive'], isFalse);
      },
    );

    test(
      'handover start rejects uninvolved user on accepted request',
      () async {
        await seedBookingState(currentUser: outsider);
        final before = await DataService.getHandoverReturnState('req-pickup');

        final result = await DataService.setHandoverActive(
          'req-pickup',
          active: true,
        );

        final after = await DataService.getHandoverReturnState('req-pickup');

        expect(result, isFalse);
        expect(after, before);
        expect(after['handoverActive'], isFalse);
      },
    );

    test('handover start rejects when no current user is logged in', () async {
      await seedBookingState();
      final before = await DataService.getHandoverReturnState('req-pickup');

      final result = await DataService.setHandoverActive(
        'req-pickup',
        active: true,
      );

      final after = await DataService.getHandoverReturnState('req-pickup');

      expect(result, isFalse);
      expect(after, before);
      expect(after['handoverActive'], isFalse);
    });

    test(
      'handover start rejects unknown request id without state mutation',
      () async {
        final before = await DataService.getHandoverReturnState(
          'missing-handover',
        );

        final result = await DataService.setHandoverActive(
          'missing-handover',
          active: true,
        );

        final after = await DataService.getHandoverReturnState(
          'missing-handover',
        );

        expect(result, isFalse);
        expect(before, after);
        expect(after['handoverActive'], isFalse);
        expect(after['returnActive'], isFalse);
      },
    );

    test(
      'handover start rejects non-accepted request without state mutation',
      () async {
        await DataService.updateRentalRequestStatus(
          requestId: 'req-pickup',
          status: 'running',
        );
        final before = await DataService.getHandoverReturnState('req-pickup');

        final result = await DataService.setHandoverActive(
          'req-pickup',
          active: true,
        );

        final after = await DataService.getHandoverReturnState('req-pickup');
        final request = await DataService.getRentalRequestById('req-pickup');

        expect(result, isFalse);
        expect(after, before);
        expect(after['handoverActive'], isFalse);
        expect(after['returnActive'], isFalse);
        expect(request!.status, 'running');
      },
    );

    test(
      'handover start activates accepted request without changing booking status',
      () async {
        final beforeRequest = await DataService.getRentalRequestById(
          'req-pickup',
        );

        final result = await DataService.setHandoverActive(
          'req-pickup',
          active: true,
        );

        final afterState = await DataService.getHandoverReturnState(
          'req-pickup',
        );
        final afterRequest = await DataService.getRentalRequestById(
          'req-pickup',
        );

        expect(result, isTrue);
        expect(afterState['handoverActive'], isTrue);
        expect(afterState['returnActive'], isFalse);
        expect(afterRequest!.status, 'accepted');
        expect(beforeRequest!.status, 'accepted');
      },
    );

    test(
      'handover start rejects repeated activation without state mutation',
      () async {
        await DataService.setHandoverActive('req-pickup', active: true);
        final before = await DataService.getHandoverReturnState('req-pickup');

        final result = await DataService.setHandoverActive(
          'req-pickup',
          active: true,
        );

        final after = await DataService.getHandoverReturnState('req-pickup');
        final request = await DataService.getRentalRequestById('req-pickup');

        expect(result, isFalse);
        expect(after, before);
        expect(after['handoverActive'], isTrue);
        expect(after['returnActive'], isFalse);
        expect(request!.status, 'accepted');
      },
    );

    test(
      'return start rejects unknown request id without state mutation',
      () async {
        final before = await DataService.getHandoverReturnState(
          'missing-return',
        );

        final result = await DataService.setReturnActive(
          'missing-return',
          active: true,
        );

        final after = await DataService.getHandoverReturnState(
          'missing-return',
        );

        expect(result, isFalse);
        expect(before, after);
        expect(after['handoverActive'], isFalse);
        expect(after['returnActive'], isFalse);
      },
    );

    test(
      'return start rejects non-running request without state mutation',
      () async {
        await DataService.updateRentalRequestStatus(
          requestId: 'req-return',
          status: 'accepted',
        );
        final before = await DataService.getHandoverReturnState('req-return');

        final result = await DataService.setReturnActive(
          'req-return',
          active: true,
        );

        final after = await DataService.getHandoverReturnState('req-return');
        final request = await DataService.getRentalRequestById('req-return');

        expect(result, isFalse);
        expect(after, before);
        expect(after['handoverActive'], isFalse);
        expect(after['returnActive'], isFalse);
        expect(request!.status, 'accepted');
      },
    );

    test('return start allows logged-in renter after confirmed return time',
        () async {
      await seedBookingState(currentUser: renter);

      final result = await DataService.setReturnActive(
        'req-return',
        active: true,
      );

      final state = await DataService.getHandoverReturnState('req-return');
      final request = await DataService.getRentalRequestById('req-return');

      expect(result, isTrue);
      expect(state['handoverActive'], isFalse);
      expect(state['returnActive'], isTrue);
      expect(request!.status, 'running');
    });

    test('return start rejects an unconfirmed return time', () async {
      await seedBookingState(currentUser: renter);
      await setAuthenticatedUser(owner);
      await DataService.requestFlowTime(
        requestId: 'req-return',
        isReturn: true,
        label: '18:00',
        time: DateTime(2026, 7, 31, 18),
        requestedByUserId: owner.id,
      );
      await setAuthenticatedUser(renter);
      final before = await DataService.getHandoverReturnState('req-return');

      final result = await DataService.setReturnActive(
        'req-return',
        active: true,
      );

      final after = await DataService.getHandoverReturnState('req-return');
      expect(result, isFalse);
      expect(after, before);
      expect(after['returnActive'], isFalse);
    });

    test('return start remains available while completion is held for review',
        () async {
      await seedBookingState(currentUser: renter);

      final result = await DataService.setReturnActive(
        'req-review',
        active: true,
      );

      final after = await DataService.getHandoverReturnState('req-review');
      expect(result, isTrue);
      expect(after['returnActive'], isTrue);
    });

    test('return start rejects involved owner on running request', () async {
      await seedBookingState(currentUser: owner);
      final before = await DataService.getHandoverReturnState('req-return');

      final result = await DataService.setReturnActive(
        'req-return',
        active: true,
      );

      final after = await DataService.getHandoverReturnState('req-return');

      expect(result, isFalse);
      expect(after, before);
      expect(after['returnActive'], isFalse);
    });

    test('return start rejects uninvolved user on running request', () async {
      await seedBookingState(currentUser: outsider);
      final before = await DataService.getHandoverReturnState('req-return');

      final result = await DataService.setReturnActive(
        'req-return',
        active: true,
      );

      final after = await DataService.getHandoverReturnState('req-return');

      expect(result, isFalse);
      expect(after, before);
      expect(after['returnActive'], isFalse);
    });

    test('return start rejects when no current user is logged in', () async {
      await seedBookingState();
      final before = await DataService.getHandoverReturnState('req-return');

      final result = await DataService.setReturnActive(
        'req-return',
        active: true,
      );

      final after = await DataService.getHandoverReturnState('req-return');

      expect(result, isFalse);
      expect(after, before);
      expect(after['returnActive'], isFalse);
    });

    test(
      'return start activates running request without changing booking status',
      () async {
        await seedBookingState(currentUser: renter);
        final beforeRequest = await DataService.getRentalRequestById(
          'req-return',
        );

        final result = await DataService.setReturnActive(
          'req-return',
          active: true,
        );

        final afterState = await DataService.getHandoverReturnState(
          'req-return',
        );
        final afterRequest = await DataService.getRentalRequestById(
          'req-return',
        );

        expect(result, isTrue);
        expect(afterState['handoverActive'], isFalse);
        expect(afterState['returnActive'], isTrue);
        expect(afterRequest!.status, 'running');
        expect(beforeRequest!.status, 'running');
      },
    );

    test(
      'return start rejects repeated activation without state mutation',
      () async {
        await seedBookingState(currentUser: renter);
        await DataService.setReturnActive('req-return', active: true);
        final before = await DataService.getHandoverReturnState('req-return');

        final result = await DataService.setReturnActive(
          'req-return',
          active: true,
        );

        final after = await DataService.getHandoverReturnState('req-return');
        final request = await DataService.getRentalRequestById('req-return');

        expect(result, isFalse);
        expect(after, before);
        expect(after['handoverActive'], isFalse);
        expect(after['returnActive'], isTrue);
        expect(request!.status, 'running');
      },
    );

    test(
      'pickup transition rejects requests whose status is not accepted',
      () async {
        await DataService.updateRentalRequestStatus(
          requestId: 'req-pickup',
          status: 'running',
        );
        await DataService.setHandoverActive('req-pickup', active: true);
        for (var i = 0; i < DataService.minimumRequiredPhotos; i++) {
          await DataService.incrementHandoverPhotos('req-pickup');
        }
        await setAuthenticatedUser(renter);

        final result = await DataService.confirmPickupTransition(
          requestId: 'req-pickup',
          confirmedByUserId: renter.id,
          method: 'manual',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
        );

        final request = await DataService.getRentalRequestById('req-pickup');

        expect(result.success, isFalse);
        expect(
          result.errorMessage,
          contains('Übergabe ist gerade nicht verfügbar'),
        );
        expect(request!.status, 'running');
        expect(request.handoverConfirmation, isNull);
      },
    );

    test(
      'pickup transition rejects owner because renter verifies the owner code',
      () async {
        await DataService.setHandoverActive('req-pickup', active: true);
        for (var i = 0; i < DataService.minimumRequiredPhotos; i++) {
          await DataService.incrementHandoverPhotos('req-pickup');
        }

        final result = await DataService.confirmPickupTransition(
          requestId: 'req-pickup',
          confirmedByUserId: owner.id,
          method: 'manual',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
        );

        final request = await DataService.getRentalRequestById('req-pickup');

        expect(result.success, isFalse);
        expect(result.errorMessage, contains('nur für den Mieter'));
        expect(request!.status, 'accepted');
        expect(request.handoverConfirmation, isNull);
      },
    );

    test(
      'pickup transition rejects a forged participant id from another session',
      () async {
        await DataService.setHandoverActive('req-pickup', active: true);
        for (var i = 0; i < DataService.minimumRequiredPhotos; i++) {
          await DataService.incrementHandoverPhotos('req-pickup');
        }
        await setAuthenticatedUser(outsider);

        final result = await DataService.confirmPickupTransition(
          requestId: 'req-pickup',
          confirmedByUserId: renter.id,
          method: 'manual',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
        );

        await setAuthenticatedUser(owner);
        final request = await DataService.getRentalRequestById('req-pickup');

        expect(result.success, isFalse);
        expect(result.errorMessage, contains('bestätigenden Konto'));
        expect(request!.status, 'accepted');
        expect(request.handoverConfirmation, isNull);
      },
    );

    test(
      'pickup transition rejects accepted request without active handover flow',
      () async {
        for (var i = 0; i < DataService.minimumRequiredPhotos; i++) {
          await DataService.incrementHandoverPhotos('req-pickup');
        }
        await setAuthenticatedUser(renter);

        final result = await DataService.confirmPickupTransition(
          requestId: 'req-pickup',
          confirmedByUserId: renter.id,
          method: 'manual',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
        );

        final request = await DataService.getRentalRequestById('req-pickup');

        expect(result.success, isFalse);
        expect(
          result.errorMessage,
          contains('Bitte starte die Übergabe zuerst im Chat'),
        );
        expect(request!.status, 'accepted');
        expect(request.handoverConfirmation, isNull);
      },
    );

    test(
      'ordinary local photo counters cannot replace four role-bound presenter photos',
      () async {
        await DataService.setHandoverActive('req-pickup', active: true);
        for (var i = 0; i < DataService.minimumRequiredPhotos; i++) {
          await DataService.incrementHandoverPhotos('req-pickup');
        }
        await setAuthenticatedUser(renter);

        final result = await DataService.confirmPickupTransition(
          requestId: 'req-pickup',
          confirmedByUserId: renter.id,
          method: 'qr',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
        );

        final request = await DataService.getRentalRequestById('req-pickup');

        expect(result.success, isFalse);
        expect(result.errorMessage, contains('mindestens 4 Fotos'));
        expect(request!.status, 'accepted');
      },
    );

    test(
      'pickup transition moves accepted booking to running after verified renter confirmation',
      () async {
        await DataService.setHandoverActive('req-pickup', active: true);
        await seedConditionEvidence(
          requestId: 'req-pickup',
          segment: 'pickup',
        );

        final result = await DataService.confirmPickupTransition(
          requestId: 'req-pickup',
          confirmedByUserId: renter.id,
          method: 'manual',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
        );

        final request = await DataService.getRentalRequestById('req-pickup');
        final state = await DataService.getHandoverReturnState('req-pickup');

        expect(result.success, isTrue);
        expect(request!.status, 'running');
        expect(request.handoverConfirmation?['confirmedByRole'], 'renter');
        expect(request.handoverConfirmation?['method'], 'manual');
        expect(state['handoverActive'], isFalse);
      },
    );

    test(
      'pickup transition rejects repeated confirmation after booking is already running',
      () async {
        await DataService.setHandoverActive('req-pickup', active: true);
        await seedConditionEvidence(
          requestId: 'req-pickup',
          segment: 'pickup',
        );

        final first = await DataService.confirmPickupTransition(
          requestId: 'req-pickup',
          confirmedByUserId: renter.id,
          method: 'manual',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
        );
        final afterFirst = await DataService.getRentalRequestById('req-pickup');

        final second = await DataService.confirmPickupTransition(
          requestId: 'req-pickup',
          confirmedByUserId: renter.id,
          method: 'manual',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
        );

        final afterSecond = await DataService.getRentalRequestById(
          'req-pickup',
        );

        expect(first.success, isTrue);
        expect(afterFirst!.status, 'running');
        expect(second.success, isFalse);
        expect(
          second.errorMessage,
          contains('Übergabe ist gerade nicht verfügbar'),
        );
        expect(afterSecond!.status, 'running');
        expect(afterSecond.handoverConfirmation?['confirmedByRole'], 'renter');
      },
    );

    test(
      'return transition rejects requests whose status is not running',
      () async {
        await seedBookingState(currentUser: renter);
        await DataService.updateRentalRequestStatus(
          requestId: 'req-return',
          status: 'completed',
        );
        await DataService.setReturnActive('req-return', active: true);
        for (var i = 0; i < DataService.minimumRequiredPhotos; i++) {
          await DataService.incrementReturnPhotos('req-return');
        }
        await setAuthenticatedUser(owner);

        final result = await DataService.confirmReturnTransition(
          requestId: 'req-return',
          confirmedByUserId: owner.id,
          method: 'manual',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
          reviewPauseSource: 'test',
        );

        final request = await DataService.getRentalRequestById('req-return');

        expect(result.success, isFalse);
        expect(
          result.errorMessage,
          contains('Rückgabe ist gerade nicht verfügbar'),
        );
        expect(request!.status, 'completed');
        expect(request.returnConfirmation, isNull);
      },
    );

    test(
      'return transition rejects wrong owner role even when status is running',
      () async {
        await seedBookingState(currentUser: renter);
        await DataService.setReturnActive('req-return', active: true);
        for (var i = 0; i < DataService.minimumRequiredPhotos; i++) {
          await DataService.incrementReturnPhotos('req-return');
        }

        final result = await DataService.confirmReturnTransition(
          requestId: 'req-return',
          confirmedByUserId: renter.id,
          method: 'manual',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
          reviewPauseSource: 'test',
        );

        final request = await DataService.getRentalRequestById('req-return');

        expect(result.success, isFalse);
        expect(result.errorMessage, contains('nur für den Vermieter'));
        expect(request!.status, 'running');
        expect(request.returnConfirmation, isNull);
      },
    );

    test(
      'return transition rejects running request without active return flow',
      () async {
        await seedBookingState(currentUser: renter);
        for (var i = 0; i < DataService.minimumRequiredPhotos; i++) {
          await DataService.incrementReturnPhotos('req-return');
        }
        await setAuthenticatedUser(owner);

        final result = await DataService.confirmReturnTransition(
          requestId: 'req-return',
          confirmedByUserId: owner.id,
          method: 'manual',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
          reviewPauseSource: 'test',
        );

        final request = await DataService.getRentalRequestById('req-return');

        expect(result.success, isFalse);
        expect(
          result.errorMessage,
          contains('Bitte starte die Rückgabe zuerst im Chat'),
        );
        expect(request!.status, 'running');
        expect(request.returnConfirmation, isNull);
      },
    );

    test(
      'return transition pauses completion when booking is marked needsReview',
      () async {
        await seedBookingState(currentUser: renter);
        await DataService.setReturnActive('req-review', active: true);
        await seedConditionEvidence(
          requestId: 'req-review',
          segment: 'return',
        );

        final result = await DataService.confirmReturnTransition(
          requestId: 'req-review',
          confirmedByUserId: owner.id,
          method: 'qr',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
          reviewPauseSource: 'test',
        );

        final request = await DataService.getRentalRequestById('req-review');
        final state = await DataService.getHandoverReturnState('req-review');

        expect(result.success, isFalse);
        expect(result.pausedForReview, isTrue);
        expect(request!.status, 'running');
        expect(request.returnConfirmation, isNull);
        expect(state['returnActive'], isTrue);
      },
    );

    test(
      'return transition completes running booking after owner confirmation and required photos',
      () async {
        await seedBookingState(currentUser: renter);
        await DataService.setReturnActive('req-return', active: true);
        await seedConditionEvidence(
          requestId: 'req-return',
          segment: 'return',
        );

        final result = await DataService.confirmReturnTransition(
          requestId: 'req-return',
          confirmedByUserId: owner.id,
          method: 'manual',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
          reviewPauseSource: 'test',
        );

        final request = await DataService.getRentalRequestById('req-return');
        final state = await DataService.getHandoverReturnState('req-return');

        expect(result.success, isTrue);
        expect(result.pausedForReview, isFalse);
        expect(request!.status, 'completed');
        expect(request.returnConfirmation?['confirmedByRole'], 'owner');
        expect(request.returnConfirmation?['method'], 'manual');
        expect(state['returnActive'], isFalse);
      },
    );

    test(
      'return transition rejects repeated confirmation after booking is already completed',
      () async {
        await seedBookingState(currentUser: renter);
        await DataService.setReturnActive('req-return', active: true);
        await seedConditionEvidence(
          requestId: 'req-return',
          segment: 'return',
        );

        final first = await DataService.confirmReturnTransition(
          requestId: 'req-return',
          confirmedByUserId: owner.id,
          method: 'manual',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
          reviewPauseSource: 'test',
        );
        final afterFirst = await DataService.getRentalRequestById('req-return');

        final second = await DataService.confirmReturnTransition(
          requestId: 'req-return',
          confirmedByUserId: owner.id,
          method: 'manual',
          confirmationContextVerified: true,
          galleryAcknowledged: true,
          reviewPauseSource: 'test',
        );

        final afterSecond = await DataService.getRentalRequestById(
          'req-return',
        );

        expect(first.success, isTrue);
        expect(afterFirst!.status, 'completed');
        expect(second.success, isFalse);
        expect(
          second.errorMessage,
          contains('Rückgabe ist gerade nicht verfügbar'),
        );
        expect(afterSecond!.status, 'completed');
        expect(afterSecond.returnConfirmation?['confirmedByRole'], 'owner');
      },
    );
  });

  group('DataService review reminder guards', () {
    late final owner = buildTestUser('owner-reminder', name: 'Walid');
    late final renter = buildTestUser('renter-reminder', name: 'Julia');
    late final item =
        buildTestItem(id: 'item-reminder', ownerId: 'owner-reminder');

    Future<void> seedReminderState({
      required bool needsReview,
      String requestId = 'req-reminder',
    }) async {
      SharedPreferences.setMockInitialValues({
        'users': jsonEncode([owner.toJson(), renter.toJson()]),
        'items': jsonEncode([item.toJson()]),
        'rental_requests': jsonEncode([
          buildTestRequest(
            id: requestId,
            itemId: item.id,
            ownerId: owner.id,
            renterId: renter.id,
            status: 'completed',
            needsReview: needsReview,
          ).toJson(),
        ]),
        'review_reminders_v1': '[]',
        'currentUser': jsonEncode(renter.toJson()),
        'auth_session_v1': authSessionFor(renter),
      });
    }

    test('review reminder round-trip works for completed booking without hold',
        () async {
      await seedReminderState(
          needsReview: false, requestId: 'req-reminder-open');

      final dueAt = DateTime.now().subtract(const Duration(minutes: 1));
      await DataService.scheduleReviewReminder(
        requestId: 'req-reminder-open',
        itemId: item.id,
        reviewerId: renter.id,
        reviewedUserId: owner.id,
        direction: 'renter_to_owner',
        dueAt: dueAt,
      );

      final reminder = await DataService.takeDueReviewReminder(
        reviewerId: renter.id,
      );

      expect(reminder, isNotNull);
      expect(reminder!['requestId'], 'req-reminder-open');
      expect(reminder['reviewerId'], renter.id);
    });

    test('needsReview skips review reminder scheduling centrally', () async {
      await seedReminderState(
          needsReview: true, requestId: 'req-reminder-held');

      final dueAt = DateTime.now().add(const Duration(minutes: 5));
      await DataService.scheduleReviewReminder(
        requestId: 'req-reminder-held',
        itemId: item.id,
        reviewerId: renter.id,
        reviewedUserId: owner.id,
        direction: 'renter_to_owner',
        dueAt: dueAt,
      );

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('review_reminders_v1'), anyOf(isNull, '[]'));
    });

    test('needsReview suppresses already-due reminder delivery centrally',
        () async {
      await seedReminderState(
          needsReview: true, requestId: 'req-reminder-held-due');

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        'review_reminders_v1',
        jsonEncode([
          {
            'id': 'held-reminder',
            'requestId': 'req-reminder-held-due',
            'itemId': item.id,
            'reviewerId': renter.id,
            'reviewedUserId': owner.id,
            'direction': 'renter_to_owner',
            'dueAt': DateTime.now()
                .subtract(const Duration(minutes: 1))
                .toIso8601String(),
            'createdAt': DateTime.now().toIso8601String(),
          },
        ]),
      );

      final reminder = await DataService.takeDueReviewReminder(
        reviewerId: renter.id,
      );

      expect(reminder, isNull);
      expect(prefs.getString('review_reminders_v1'), '[]');
    });
  });

  group('DataService price breakdown', () {
    test(
      'Privat-Pilot ignores delivery return and express selections',
      () {
        final item = buildTestItem(
          id: 'item-priced',
          ownerId: 'owner-1',
          pricePerDay: 20,
          lat: 52.52,
          lng: 13.405,
        );
        final request = buildTestRequest(
          id: 'req-priced',
          itemId: item.id,
          ownerId: 'owner-1',
          renterId: 'renter-1',
          expressRequested: true,
          expressStatus: 'accepted',
          ownerPicksUpAtReturnChosen: true,
          deliveryLat: 52.53,
          deliveryLng: 13.405,
          returnLat: 52.53,
          returnLng: 13.405,
        );

        final breakdown = DataService.priceBreakdownForRequest(
          item: item,
          req: request,
          deliverySel: const {
            'hinweg': true,
            'rueckweg': true,
            'express': true,
          },
        );

        expect(breakdown.dropoffFee, 0.0);
        expect(breakdown.returnFee, 0.0);
        expect(breakdown.expressApplied, 0.0);
        expect(breakdown.platformFee, 4.0);
        expect(breakdown.totalRenter, 44.0);
        expect(breakdown.payoutOwner, 40.0);
      },
    );
  });
}
