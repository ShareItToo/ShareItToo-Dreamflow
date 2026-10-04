import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/message.dart';
import 'package:lendify/services/contacts_service.dart';

import 'support/test_builders.dart';

MessageThread _thread({
  required String id,
  required String me,
  required String other,
  DateTime? lastMessageAt,
  String? threadType,
  List<String> deletedForUserIds = const <String>[],
}) {
  final now = DateTime(2026, 1, 1);
  return MessageThread(
    id: id,
    requestId: 'request-$id',
    itemId: 'item-$id',
    itemTitle: 'Artikel $id',
    user1Id: me,
    user2Id: other,
    threadType: threadType,
    messages: const <Message>[],
    createdAt: now,
    lastMessageAt: lastMessageAt,
    deletedForUserIds: deletedForUserIds,
  );
}

void main() {
  test(
      'derives only real thread participants and excludes support/deleted/demo',
      () {
    final me = buildTestUser('me', name: 'Me');
    final alice = buildTestUser('alice', name: 'Alice');
    final bob = buildTestUser('bob', name: 'Bob');
    final users = {me.id: me, alice.id: alice, bob.id: bob};
    final contacts = deriveAccountContacts(
      currentUser: me,
      usersById: users,
      threads: [
        _thread(id: 'real', me: me.id, other: alice.id),
        _thread(
            id: 'support', me: me.id, other: 'support', threadType: 'support'),
        _thread(
            id: 'deleted',
            me: me.id,
            other: bob.id,
            deletedForUserIds: [me.id]),
        _thread(id: 'demo_translation_thread', me: me.id, other: bob.id),
      ],
    );

    expect(contacts.map((entry) => entry.user.id), ['alice']);
  });

  test('dedupes one contact to the newest eligible thread deterministically',
      () {
    final me = buildTestUser('me', name: 'Me');
    final alice = buildTestUser('alice', name: 'Alice');
    final older = _thread(
      id: 'older',
      me: me.id,
      other: alice.id,
      lastMessageAt: DateTime(2026, 1, 2),
    );
    final newer = _thread(
      id: 'newer',
      me: me.id,
      other: alice.id,
      lastMessageAt: DateTime(2026, 1, 3),
    );

    final contacts = deriveAccountContacts(
      currentUser: me,
      usersById: {me.id: me, alice.id: alice},
      threads: [older, newer],
    );

    expect(contacts, hasLength(1));
    expect(contacts.single.thread.id, 'newer');
  });

  test('never invents a contact for a missing or banned user', () {
    final me = buildTestUser('me', name: 'Me');
    final banned = buildTestUser('banned', name: 'Banned');
    final contacts = deriveAccountContacts(
      currentUser: me,
      usersById: {me.id: me, banned.id: banned.copyWith(isBanned: true)},
      threads: [
        _thread(id: 'missing', me: me.id, other: 'missing-user'),
        _thread(id: 'banned', me: me.id, other: banned.id),
      ],
    );

    expect(contacts, isEmpty);
  });
}
