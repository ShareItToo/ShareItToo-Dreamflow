import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('read-only remote thread cache refresh stays silent', () {
    expect(
      DataService.shouldAnnounceMessageThreadCacheWrite(
        readOnlyRemoteRefresh: true,
      ),
      isFalse,
    );
    expect(
      DataService.shouldAnnounceMessageThreadCacheWrite(
        readOnlyRemoteRefresh: false,
      ),
      isTrue,
    );
  });

  final owner = buildTestUser('u1', name: 'Walid Chraibi');
  final renter = buildTestUser('u2', name: 'Max Mustermann');
  final outsider = buildTestUser('u3', name: 'Sarah Schmidt');
  final ownerB = buildTestUser('u4', name: 'Thomas Weber');
  final ownerC = buildTestUser('u5', name: 'Julia Wagner');
  final renterB = buildTestUser('u6', name: 'David König');
  final outsiderB = buildTestUser('u7', name: 'Anna Keller');
  final users = [
    owner,
    renter,
    outsider,
    ownerB,
    ownerC,
    renterB,
    outsiderB,
  ];
  final items = [
    buildTestItem(
      id: 'item-owner-main',
      ownerId: owner.id,
      title: 'Main Drill',
    ),
    buildTestItem(
      id: 'item-owner-a',
      ownerId: renter.id,
      title: 'Owner A Camera',
    ),
    buildTestItem(
      id: 'item-owner-b',
      ownerId: outsider.id,
      title: 'Owner B Monitor',
    ),
    buildTestItem(
      id: 'item-owner-c',
      ownerId: ownerB.id,
      title: 'Owner C Light',
    ),
    buildTestItem(
      id: 'item-renter-a',
      ownerId: ownerC.id,
      title: 'Renter A Bike',
    ),
    buildTestItem(
      id: 'item-renter-main',
      ownerId: renterB.id,
      title: 'Renter Main Router',
    ),
    buildTestItem(
      id: 'item-outsider',
      ownerId: outsiderB.id,
      title: 'Outsider Speaker',
    ),
  ];

  Future<void> usePersona(String userId) async {
    final user = users.singleWhere((candidate) => candidate.id == userId);
    await DataService.setCurrentUser(user);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'auth_session_v1',
      jsonEncode(<String, Object>{
        'userId': user.id,
        'email': user.email,
        'createdAt': '2026-08-25T04:00:00.000Z',
      }),
    );
    expect((await DataService.getCurrentUser())?.id, userId);
  }

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'users': jsonEncode(users.map((user) => user.toJson()).toList()),
      'items': jsonEncode(items.map((item) => item.toJson()).toList()),
      'rental_requests': '[]',
      'message_threads_v1': '[]',
      'notifications': '[]',
      'review_reminders_v1': '[]',
      'multi_reviews_v1': '[]',
      'currentUser': jsonEncode(owner.toJson()),
      'auth_session_v1': jsonEncode(<String, Object>{
        'userId': owner.id,
        'email': owner.email,
        'createdAt': '2026-08-25T04:00:00.000Z',
      }),
    });
    await usePersona(owner.id);
  });

  test('owner and renter resolve the same shared thread and message ids',
      () async {
    final ownerThread = await DataService.getMessageThreadById(
      'qa_shared_thread_u1_u2',
    );
    expect(ownerThread, isNotNull);

    await usePersona(renter.id);
    final renterThread = await DataService.getMessageThreadById(
      'qa_shared_thread_u1_u2',
    );

    expect(renterThread, isNotNull);
    expect(renterThread!.requestId, ownerThread!.requestId);
    expect(
      renterThread.messages.map((message) => message.id),
      ownerThread.messages.map((message) => message.id),
    );
    expect(
      renterThread.messages.map((message) => message.text),
      ownerThread.messages.map((message) => message.text),
    );
  });

  test('one sent message is persisted once and announces a thread refresh',
      () async {
    const text = 'QA-COMPOSER-SYNC-CHECK';
    await usePersona(renter.id);
    final change = SharedPersistenceSync.changes.firstWhere(
      (key) => key == SharedPersistenceSync.messageThreadsKey,
    );

    await DataService.addMessageToThread(
      threadId: 'qa_shared_thread_u1_u2',
      senderId: renter.id,
      text: text,
    );
    expect(await change, SharedPersistenceSync.messageThreadsKey);

    await usePersona(owner.id);
    final ownerThread = await DataService.getMessageThreadById(
      'qa_shared_thread_u1_u2',
    );
    expect(ownerThread, isNotNull);
    expect(ownerThread!.messages.where((message) => message.text == text),
        hasLength(1));
    expect(ownerThread.messages.last.senderId, renter.id);
  });

  test('outsider cannot inject a message into the shared thread', () async {
    await usePersona(owner.id);
    final before = await DataService.getMessageThreadById(
      'qa_shared_thread_u1_u2',
    );
    expect(before, isNotNull);

    await usePersona(outsider.id);
    await DataService.addMessageToThread(
      threadId: 'qa_shared_thread_u1_u2',
      senderId: outsider.id,
      text: 'UNAUTHORIZED-MESSAGE',
    );

    await usePersona(owner.id);
    final after = await DataService.getMessageThreadById(
      'qa_shared_thread_u1_u2',
    );
    expect(after, isNotNull);
    expect(after!.messages, hasLength(before!.messages.length));
    expect(
      after.messages.where((message) => message.text == 'UNAUTHORIZED-MESSAGE'),
      isEmpty,
    );
  });

  test('a participant cannot send a message as the other participant',
      () async {
    final before = await DataService.getMessageThreadById(
      'qa_shared_thread_u1_u2',
    );
    expect(before, isNotNull);

    await DataService.addMessageToThread(
      threadId: 'qa_shared_thread_u1_u2',
      senderId: renter.id,
      text: 'IMPERSONATED-MESSAGE',
    );

    final after = await DataService.getMessageThreadById(
      'qa_shared_thread_u1_u2',
    );
    expect(after, isNotNull);
    expect(after!.messages, hasLength(before!.messages.length));
    expect(
      after.messages.where((message) => message.text == 'IMPERSONATED-MESSAGE'),
      isEmpty,
    );
  });

  test('marking already-read messages does not announce another refresh',
      () async {
    final changes = <String>[];
    final subscription = SharedPersistenceSync.changes.listen(changes.add);
    addTearDown(subscription.cancel);

    await usePersona(renter.id);
    await DataService.addMessageToThread(
      threadId: 'qa_shared_thread_u1_u2',
      senderId: renter.id,
      text: 'UNREAD-FOR-OWNER',
    );
    await usePersona(owner.id);
    changes.clear();

    await DataService.markThreadMessagesAsRead(
      threadId: 'qa_shared_thread_u1_u2',
      userId: owner.id,
    );
    expect(changes, contains(SharedPersistenceSync.messageThreadsKey));

    changes.clear();
    await DataService.markThreadMessagesAsRead(
      threadId: 'qa_shared_thread_u1_u2',
      userId: owner.id,
    );
    expect(changes, isEmpty);
  });

  test('repeated reads do not duplicate seeded messages', () async {
    final first = await DataService.getMessageThreadById(
      'qa_shared_thread_u1_u2',
    );
    final second = await DataService.getMessageThreadById(
      'qa_shared_thread_u1_u2',
    );

    expect(first, isNotNull);
    expect(second, isNotNull);
    expect(second!.messages.map((message) => message.id).toSet(),
        hasLength(second.messages.length));
    expect(second.messages, hasLength(first!.messages.length));
  });
}
