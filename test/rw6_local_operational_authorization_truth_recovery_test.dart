import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/message.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/message_thread_screen.dart';
import 'package:lendify/screens/messages_screen.dart';
import 'package:lendify/screens/notifications_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final accountA = buildTestUser(
    'rw6-account-a',
    name: 'RW6 Account A',
    email: 'rw6-account-a@example.invalid',
  );
  final accountB = buildTestUser(
    'rw6-account-b',
    name: 'RW6 Account B',
    email: 'rw6-account-b@example.invalid',
  );
  final outsider = buildTestUser(
    'rw6-outsider',
    name: 'RW6 Outsider',
    email: 'rw6-outsider@example.invalid',
  );

  MessageThread threadFor(User first, User second) => MessageThread(
        id: 'rw6-thread-a-b',
        requestId: 'rw6-request-a-b',
        itemId: 'rw6-item',
        itemTitle: 'RW6 Werkzeug',
        user1Id: first.id,
        user2Id: second.id,
        messages: <Message>[
          Message(
            id: 'rw6-message',
            senderId: first.id,
            text: 'Synthetic RW6 message',
            timestamp: DateTime.utc(2026, 8, 25, 4),
          ),
        ],
        createdAt: DateTime.utc(2026, 8, 25, 4),
      );

  Future<void> useAccount(User user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('currentUser', jsonEncode(user.toJson()));
    await prefs.setString(
      'auth_session_v1',
      jsonEncode(<String, Object>{
        'userId': user.id,
        'email': user.email,
        'createdAt': '2026-08-25T04:00:00.000Z',
      }),
    );
  }

  Future<void> useGuest() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('currentUser');
    await prefs.remove('auth_session_v1');
  }

  Map<String, Object> baseState({Map<String, Object> extra = const {}}) =>
      <String, Object>{
        'users': jsonEncode(<Object>[
          accountA.toJson(),
          accountB.toJson(),
          outsider.toJson(),
        ]),
        'items': '[]',
        ...extra,
      };

  test('message reads and archive mutations reject a foreign requested user',
      () async {
    final thread = threadFor(accountA, accountB);
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'message_threads_v1': jsonEncode(<Object>[thread.toJson()]),
    }));
    await useAccount(accountA);

    await expectLater(
      DataService.getMessageThreadsForUser(accountB.id),
      throwsStateError,
    );
    final prefs = await SharedPreferences.getInstance();
    final before = prefs.getString('message_threads_v1');
    await expectLater(
      DataService.archiveMessageThreadForUser(
        threadId: thread.id,
        userId: accountB.id,
      ),
      throwsStateError,
    );
    expect(prefs.getString('message_threads_v1'), before);
  });

  test('stale cached profile without a matching auth session is rejected',
      () async {
    final thread = threadFor(accountA, accountB);
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'currentUser': jsonEncode(accountA.toJson()),
      'message_threads_v1': jsonEncode(<Object>[thread.toJson()]),
    }));

    await expectLater(
      DataService.getMessageThreadsForUser(accountA.id),
      throwsStateError,
    );
    expect(await DataService.getMessageThreadById(thread.id), isNull);
  });

  test('thread deletion is current-user-only and preserves the counterparty',
      () async {
    final thread = threadFor(accountA, accountB);
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'message_threads_v1': jsonEncode(<Object>[thread.toJson()]),
    }));
    await useAccount(accountA);

    await DataService.deleteMessageThreadForUser(
      threadId: thread.id,
      userId: accountA.id,
    );
    expect(await DataService.getMessageThreadsForUser(accountA.id), isEmpty);

    await useAccount(accountB);
    expect(
      await DataService.getMessageThreadsForUser(accountB.id),
      hasLength(1),
    );
    final raw = (jsonDecode((await SharedPreferences.getInstance())
        .getString('message_threads_v1')!) as List<dynamic>);
    expect(raw, hasLength(1));
  });

  test('corrupt message storage fails closed without rewriting raw bytes',
      () async {
    const corrupt = '{corrupt-message-store';
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'message_threads_v1': corrupt,
    }));
    await useAccount(accountA);

    await expectLater(
      DataService.getMessageThreadsForUser(accountA.id),
      throwsA(isA<FormatException>()),
    );
    expect(
      (await SharedPreferences.getInstance()).getString('message_threads_v1'),
      corrupt,
    );
  });

  test('notification reads and mutations reject a foreign requested user',
      () async {
    final notification = <String, Object>{
      'id': 'rw6-notification-b',
      'userId': accountB.id,
      'category': 'messages',
      'priority': 3,
      'title': 'Synthetic B',
      'body': 'Only B',
      'archived': false,
      'critical': false,
      'read': false,
      'ts': '2026-08-25T04:00:00.000Z',
    };
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'notifications': jsonEncode(<Object>[notification]),
    }));
    await useAccount(accountA);

    await expectLater(
      DataService.getNotificationFeedForUser(accountB.id),
      throwsStateError,
    );
    final prefs = await SharedPreferences.getInstance();
    final before = prefs.getString('notifications');
    await expectLater(
      DataService.markNotificationRead(
        userId: accountB.id,
        notificationId: 'rw6-notification-b',
      ),
      throwsStateError,
    );
    expect(prefs.getString('notifications'), before);
  });

  test('unattributed notification is preserved but never claimed by an account',
      () async {
    final legacy = <String, Object>{
      'id': 'rw6-legacy-notification',
      'title': 'Unattributed',
      'body': 'Must not be assigned',
      'ts': '2026-08-25T04:00:00.000Z',
      'read': false,
    };
    final encoded = jsonEncode(<Object>[legacy]);
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'notifications': encoded,
    }));
    await useAccount(accountA);

    expect(
      await DataService.getNotificationFeedForUser(accountA.id),
      isEmpty,
    );
    expect(
      (await SharedPreferences.getInstance()).getString('notifications'),
      encoded,
    );
  });

  test('rental request reads reject a foreign principal and corruption',
      () async {
    final request = buildTestRequest(
      id: 'rw6-request-a-b',
      itemId: 'rw6-item',
      ownerId: accountB.id,
      renterId: accountA.id,
    );
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'rental_requests': jsonEncode(<Object>[request.toJson()]),
    }));
    await useAccount(accountA);

    await expectLater(
      DataService.getRentalRequestsForOwner(accountB.id),
      throwsStateError,
    );

    const corrupt = '{corrupt-rental-request-store';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('rental_requests', corrupt);
    await expectLater(
      DataService.getRentalRequestsForRenter(accountA.id),
      throwsA(isA<FormatException>()),
    );
    expect(prefs.getString('rental_requests'), corrupt);
  });

  test('timeline and read markers require a participant current session',
      () async {
    final request = buildTestRequest(
      id: 'rw6-request-a-b',
      itemId: 'rw6-item',
      ownerId: accountB.id,
      renterId: accountA.id,
    );
    final timeline = <String, Object>{
      'requestId': request.id,
      'type': 'synthetic',
      'note': '',
      'ts': '2026-08-25T04:00:00.000Z',
    };
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'rental_requests': jsonEncode(<Object>[request.toJson()]),
      'timeline_events': jsonEncode(<Object>[timeline]),
    }));
    await useAccount(outsider);

    await expectLater(
      DataService.getTimelineForRequest(request.id),
      throwsStateError,
    );
    await expectLater(
      DataService.markRequestAsRead(
        userId: accountA.id,
        requestId: request.id,
      ),
      throwsStateError,
    );
  });

  test(
      'booking selections survive recreation without crossing account or guest principals',
      () async {
    SharedPreferences.setMockInitialValues(baseState());
    await useAccount(accountA);
    final startA = DateTime.utc(2026, 9, 1);
    final endA = DateTime.utc(2026, 9, 3);
    await DataService.setSavedDateRange(
      'rw6-item-shared',
      start: startA,
      end: endA,
    );
    await DataService.setSavedDeliverySelection(
      'rw6-item-shared',
      hinweg: true,
      rueckweg: false,
      addressCity: 'Berlin',
    );
    await Future.wait(<Future<void>>[
      for (var index = 0; index < 12; index++)
        DataService.setSavedDateRange(
          'rw6-item-$index',
          start: startA.add(Duration(days: index)),
          end: endA.add(Duration(days: index)),
        ),
    ]);

    await useAccount(accountB);
    expect(
      await DataService.getSavedDateRange('rw6-item-shared'),
      (null, null),
    );
    await DataService.setSavedDateRange(
      'rw6-item-shared',
      start: DateTime.utc(2026, 10, 1),
      end: DateTime.utc(2026, 10, 2),
    );

    await useGuest();
    expect(
      await DataService.getSavedDateRange('rw6-item-shared'),
      (null, null),
    );

    await useAccount(accountA);
    expect(
      await DataService.getSavedDateRange('rw6-item-shared'),
      (startA, endA),
    );
    expect(
      await DataService.getSavedDeliverySelection('rw6-item-shared'),
      containsPair('city', 'Berlin'),
    );

    final prefs = await SharedPreferences.getInstance();
    final persisted = <String, Object>{
      for (final key in prefs.getKeys())
        if (prefs.get(key) is String) key: prefs.getString(key)!,
    };
    expect(persisted['booking_selections_v2'], isNot(contains(accountA.id)));
    expect(persisted['booking_selections_v2'], isNot(contains(accountB.id)));

    SharedPreferences.setMockInitialValues(persisted);
    expect(
      await DataService.getSavedDateRange('rw6-item-shared'),
      (startA, endA),
    );
    final registry = jsonDecode(
      (await SharedPreferences.getInstance())
          .getString('booking_selections_v2')!,
    ) as Map<String, dynamic>;
    expect(registry['principals'], isA<Map>());
    expect((registry['principals'] as Map).length, 2);
  });

  test('corrupt legacy booking selection remains quarantined and unchanged',
      () async {
    const corrupt = '{corrupt-booking-selection';
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'booking_selections': corrupt,
    }));
    await useGuest();

    await expectLater(
      DataService.getSavedDateRange('rw6-item'),
      throwsA(isA<FormatException>()),
    );
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('booking_selections'), corrupt);
    expect(prefs.getString('booking_selections_v2'), isNull);

    await useAccount(accountA);
    expect(await DataService.getSavedDateRange('rw6-item'), (null, null));
    await DataService.setSavedDateRange(
      'rw6-item',
      start: DateTime.utc(2026, 9, 1),
      end: DateTime.utc(2026, 9, 2),
    );
    expect(prefs.getString('booking_selections'), corrupt);
    expect(
      jsonDecode(
          prefs.getString('booking_selections_v2')!)['legacyGuestQuarantined'],
      isTrue,
    );
  });

  test('concurrent operational mutations retain every accepted update',
      () async {
    final request = buildTestRequest(
      id: 'rw6-request-a-b',
      itemId: 'rw6-item',
      ownerId: accountB.id,
      renterId: accountA.id,
    );
    final thread = threadFor(accountA, accountB);
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'rental_requests': jsonEncode(<Object>[request.toJson()]),
      'message_threads_v1': jsonEncode(<Object>[thread.toJson()]),
    }));
    await useAccount(accountA);

    await Future.wait(<Future<void>>[
      for (var index = 0; index < 16; index++) ...<Future<void>>[
        DataService.addMessageToThread(
          threadId: thread.id,
          senderId: accountA.id,
          text: 'RW6 concurrent message $index',
        ),
        DataService.addTimelineEvent(
          requestId: request.id,
          type: 'rw6_concurrent_$index',
        ),
        DataService.addNotification(
          title: 'RW6 concurrent $index',
          body: 'Accepted update $index',
        ),
      ],
    ]);

    final updatedThread = await DataService.getMessageThreadById(thread.id);
    expect(updatedThread, isNotNull);
    expect(updatedThread!.messages, hasLength(17));
    expect(
      updatedThread.messages.map((message) => message.id).toSet(),
      hasLength(17),
    );
    expect(await DataService.getTimelineForRequest(request.id), hasLength(16));
    final notifications =
        await DataService.getNotificationFeedForUser(accountA.id);
    expect(notifications, hasLength(16));
    expect(
      notifications.map((notification) => notification['id']).toSet(),
      hasLength(16),
    );
  });

  test('corrupt operational stores fail closed and preserve exact raw bytes',
      () async {
    final request = buildTestRequest(
      id: 'rw6-request-a-b',
      itemId: 'rw6-item',
      ownerId: accountB.id,
      renterId: accountA.id,
    );
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'rental_requests': jsonEncode(<Object>[request.toJson()]),
    }));
    await useAccount(accountA);
    final prefs = await SharedPreferences.getInstance();

    const corruptNotifications = '{corrupt-notifications';
    await prefs.setString('notifications', corruptNotifications);
    await expectLater(
      DataService.getNotificationFeedForUser(accountA.id),
      throwsA(isA<FormatException>()),
    );
    expect(prefs.getString('notifications'), corruptNotifications);
    await prefs.remove('notifications');

    const corruptTimeline = '{corrupt-timeline';
    await prefs.setString('timeline_events', corruptTimeline);
    await expectLater(
      DataService.getTimelineForRequest(request.id),
      throwsA(isA<FormatException>()),
    );
    expect(prefs.getString('timeline_events'), corruptTimeline);
    await prefs.remove('timeline_events');

    const corruptHandover = '{corrupt-handover';
    await prefs.setString('handover_return_state_v1', corruptHandover);
    await expectLater(
      DataService.getHandoverReturnState(request.id),
      throwsA(isA<FormatException>()),
    );
    expect(prefs.getString('handover_return_state_v1'), corruptHandover);
  });

  test('handover counters and one-time banners require a request participant',
      () async {
    final request = buildTestRequest(
      id: 'rw6-request-a-b',
      itemId: 'rw6-item',
      ownerId: accountB.id,
      renterId: accountA.id,
    );
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'rental_requests': jsonEncode(<Object>[request.toJson()]),
    }));
    await useAccount(accountA);
    final counts = await Future.wait(<Future<int>>[
      for (var index = 0; index < 10; index++)
        DataService.incrementPickupFailForBooking(request.id),
    ]);
    expect(counts.toSet(), containsAll(<int>{1, 10}));
    expect(await DataService.getPickupFailCountForBooking(request.id), 10);
    await DataService.setHandoverBanner(
      requestId: request.id,
      message: 'Shared participant banner',
    );

    final prefs = await SharedPreferences.getInstance();
    final failBefore = prefs.getString('handover_fail_counts');
    final bannerBefore = prefs.getString('handover_banners');
    await useAccount(outsider);
    await expectLater(
      DataService.getPickupFailCountForBooking(request.id),
      throwsStateError,
    );
    await expectLater(
      DataService.takeHandoverBanner(request.id),
      throwsStateError,
    );
    expect(prefs.getString('handover_fail_counts'), failBefore);
    expect(prefs.getString('handover_banners'), bannerBefore);

    await useAccount(accountB);
    expect(await DataService.getPickupFailCountForBooking(request.id), 10);
    expect(
      await DataService.takeHandoverBanner(request.id),
      'Shared participant banner',
    );
    expect(await DataService.takeHandoverBanner(request.id), isNull);
  });

  test('corrupt handover helper stores are never reset by a mutation',
      () async {
    final request = buildTestRequest(
      id: 'rw6-request-a-b',
      itemId: 'rw6-item',
      ownerId: accountB.id,
      renterId: accountA.id,
    );
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'rental_requests': jsonEncode(<Object>[request.toJson()]),
      'handover_fail_counts': '{corrupt-fail-counts',
      'handover_banners': '{corrupt-banners',
    }));
    await useAccount(accountA);
    final prefs = await SharedPreferences.getInstance();

    await expectLater(
      DataService.incrementPickupFailForBooking(request.id),
      throwsA(isA<FormatException>()),
    );
    await expectLater(
      DataService.setHandoverBanner(
        requestId: request.id,
        message: 'Must not reset',
      ),
      throwsA(isA<FormatException>()),
    );
    expect(prefs.getString('handover_fail_counts'), '{corrupt-fail-counts');
    expect(prefs.getString('handover_banners'), '{corrupt-banners');
  });

  test('full local stores reject new writes without pruning retained history',
      () async {
    final request = buildTestRequest(
      id: 'rw6-request-a-b',
      itemId: 'rw6-item',
      ownerId: accountB.id,
      renterId: accountA.id,
    );
    final messages = <Message>[
      for (var index = 0; index < 5000; index++)
        Message(
          id: 'rw6-message-$index',
          senderId: accountA.id,
          text: 'Retained $index',
          timestamp: DateTime.utc(2026, 8, 25, 4).add(
            Duration(microseconds: index),
          ),
        ),
    ];
    final fullThread = threadFor(accountA, accountB).copyWith(
      messages: messages,
    );
    final fullNotifications = <Map<String, Object>>[
      for (var index = 0; index < 5000; index++)
        <String, Object>{
          'id': 'rw6-notification-$index',
          'userId': accountA.id,
          'title': 'Retained $index',
          'body': 'Retained body',
          'ts': DateTime.utc(2026, 8, 25, 4)
              .add(Duration(microseconds: index))
              .toIso8601String(),
          'read': false,
        },
    ];
    final fullTimeline = <Map<String, Object>>[
      for (var index = 0; index < 5000; index++)
        <String, Object>{
          'requestId': request.id,
          'type': 'retained',
          'note': '$index',
          'ts': DateTime.utc(2026, 8, 25, 4)
              .add(Duration(microseconds: index))
              .toIso8601String(),
        },
    ];
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'rental_requests': jsonEncode(<Object>[request.toJson()]),
      'message_threads_v1': jsonEncode(<Object>[fullThread.toJson()]),
      'notifications': jsonEncode(fullNotifications),
      'timeline_events': jsonEncode(fullTimeline),
    }));
    await useAccount(accountA);
    final prefs = await SharedPreferences.getInstance();
    final messageRaw = prefs.getString('message_threads_v1');
    final notificationRaw = prefs.getString('notifications');
    final timelineRaw = prefs.getString('timeline_events');

    await expectLater(
      DataService.addMessageToThread(
        threadId: fullThread.id,
        senderId: accountA.id,
        text: 'Must not prune',
      ),
      throwsStateError,
    );
    await expectLater(
      DataService.addNotification(
        title: 'Must not prune',
        body: 'Capacity is explicit',
      ),
      throwsStateError,
    );
    await expectLater(
      DataService.addTimelineEvent(
        requestId: request.id,
        type: 'must_not_prune',
      ),
      throwsStateError,
    );
    expect(prefs.getString('message_threads_v1'), messageRaw);
    expect(prefs.getString('notifications'), notificationRaw);
    expect(prefs.getString('timeline_events'), timelineRaw);
  });

  test('privacy export and account deletion remain scoped and auditable',
      () async {
    final request = buildTestRequest(
      id: 'rw6-request-a-b',
      itemId: 'rw6-item',
      ownerId: accountB.id,
      renterId: accountA.id,
    );
    final thread = threadFor(accountA, accountB);
    final notificationA = <String, Object>{
      'id': 'rw6-notification-a',
      'userId': accountA.id,
      'title': 'A only',
      'body': 'A body',
      'ts': '2026-08-25T04:00:00.000Z',
      'read': false,
    };
    final notificationB = <String, Object>{
      'id': 'rw6-notification-b',
      'userId': accountB.id,
      'title': 'B only',
      'body': 'B body',
      'ts': '2026-08-25T04:00:01.000Z',
      'read': false,
    };
    final unattributed = <String, Object>{
      'id': 'rw6-notification-legacy',
      'title': 'Legacy',
      'body': 'Unattributed',
      'ts': '2026-08-25T04:00:02.000Z',
      'read': false,
    };
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'rental_requests': jsonEncode(<Object>[request.toJson()]),
      'message_threads_v1': jsonEncode(<Object>[thread.toJson()]),
      'notifications':
          jsonEncode(<Object>[notificationA, notificationB, unattributed]),
      'timeline_events': jsonEncode(<Object>[
        <String, Object>{
          'requestId': request.id,
          'type': 'rw6_audit',
          'note': 'Retained shared event',
          'ts': '2026-08-25T04:00:00.000Z',
        },
      ]),
      'read_requests_v1': jsonEncode(<String, Object>{
        accountA.id: <String>[request.id],
        accountB.id: <String>[request.id],
      }),
      'requests_last_seen_by_owner': jsonEncode(<String, Object>{
        accountA.id: '2026-08-25T04:00:00.000Z',
        accountB.id: '2026-08-25T04:00:01.000Z',
      }),
      'handover_return_state_v1': jsonEncode(<String, Object>{
        request.id: <String, Object>{'handoverActive': false},
      }),
    }));
    await useAccount(accountA);
    await DataService.setSavedDateRange(
      request.itemId,
      start: request.start,
      end: request.end,
    );
    await DataService.incrementPickupFailForBooking(request.id);
    await DataService.setHandoverBanner(
      requestId: request.id,
      message: 'Retained shared banner',
    );

    final exported = await DataService.exportOperationalRecordsForPrivacy();
    expect(exported['accountId'], accountA.id);
    expect(exported['rentalRequests'], hasLength(1));
    expect(exported['messageThreads'], hasLength(1));
    expect(exported['timeline'], hasLength(1));
    expect(exported['handoverReturnState'], contains(request.id));
    expect(exported['pickupFailCounts'], containsPair(request.id, 1));
    expect(exported['handoverBanners'], contains(request.id));
    expect(exported['bookingSelections'], contains(request.itemId));
    expect(
      (exported['notifications'] as List)
          .map((entry) => (entry as Map)['id'])
          .toList(),
      <String>['rw6-notification-a'],
    );

    await DataService.clearOperationalRecordsForAccountDeletion(accountA.id);
    final prefs = await SharedPreferences.getInstance();
    final storedThreads =
        jsonDecode(prefs.getString('message_threads_v1')!) as List<dynamic>;
    expect(
      ((storedThreads.single as Map)['deletedForUserIds'] as List),
      contains(accountA.id),
    );
    final storedNotifications =
        jsonDecode(prefs.getString('notifications')!) as List<dynamic>;
    expect(
      storedNotifications.map((entry) => (entry as Map)['id']).toSet(),
      <String>{'rw6-notification-b', 'rw6-notification-legacy'},
    );
    expect(
      (jsonDecode(prefs.getString('read_requests_v1')!) as Map)
          .containsKey(accountA.id),
      isFalse,
    );
    expect(
      (jsonDecode(prefs.getString('requests_last_seen_by_owner')!) as Map)
          .containsKey(accountA.id),
      isFalse,
    );
    expect(prefs.getString('rental_requests'), isNotNull);
    expect(prefs.getString('timeline_events'), isNotNull);
    expect(prefs.getString('handover_return_state_v1'), isNotNull);
    expect(prefs.getString('handover_fail_counts'), isNotNull);
    expect(prefs.getString('handover_banners'), isNotNull);

    await useAccount(accountB);
    expect(
        await DataService.getMessageThreadsForUser(accountB.id), hasLength(1));
    expect(
      await DataService.getNotificationFeedForUser(accountB.id),
      hasLength(1),
    );
  });

  testWidgets('open thread clears sensitive UI after account switch',
      (tester) async {
    final request = buildTestRequest(
      id: 'rw6-request-a-b',
      itemId: 'rw6-item',
      ownerId: accountB.id,
      renterId: accountA.id,
    );
    final thread = threadFor(accountA, accountB);
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'rental_requests': jsonEncode(<Object>[request.toJson()]),
      'message_threads_v1': jsonEncode(<Object>[thread.toJson()]),
    }));
    await useAccount(accountA);

    await tester.pumpWidget(
      MaterialApp(home: MessageThreadScreen(threadId: thread.id)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Synthetic RW6 message'), findsOneWidget);

    await useAccount(outsider);
    SharedPersistenceSync.notify(SharedPersistenceSync.messageThreadsKey);
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('message-thread-unavailable')),
        findsOneWidget);
    expect(find.text('Synthetic RW6 message'), findsNothing);
    expect(find.byKey(const ValueKey('message-composer-input')), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('message list refresh removes foreign account content',
      (tester) async {
    final thread = threadFor(accountA, accountB);
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'message_threads_v1': jsonEncode(<Object>[thread.toJson()]),
    }));
    await useAccount(accountA);
    await tester.pumpWidget(const MaterialApp(home: MessagesScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Synthetic RW6 message'), findsOneWidget);

    await useAccount(outsider);
    SharedPersistenceSync.notify(
      SharedPersistenceSync.localSafetyPrivacyStateKey,
    );
    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.text('Synthetic RW6 message'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('notification list replaces account A with account B only',
      (tester) async {
    SharedPreferences.setMockInitialValues(baseState(extra: <String, Object>{
      'notifications': jsonEncode(<Object>[
        <String, Object>{
          'id': 'rw6-ui-notification-a',
          'userId': accountA.id,
          'title': 'RW6 A notification',
          'body': 'Only account A',
          'ts': '2026-08-25T04:00:00.000Z',
          'read': false,
        },
        <String, Object>{
          'id': 'rw6-ui-notification-b',
          'userId': accountB.id,
          'title': 'RW6 B notification',
          'body': 'Only account B',
          'ts': '2026-08-25T04:00:01.000Z',
          'read': false,
        },
      ]),
    }));
    await useAccount(accountA);
    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: const MaterialApp(home: NotificationsScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('RW6 A notification'), findsOneWidget);
    expect(find.text('RW6 B notification'), findsNothing);

    await useAccount(accountB);
    SharedPersistenceSync.notify(
      SharedPersistenceSync.localSafetyPrivacyStateKey,
    );
    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.text('RW6 A notification'), findsNothing);
    expect(find.text('RW6 B notification'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
