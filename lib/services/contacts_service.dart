import 'package:lendify/models/message.dart';
import 'package:lendify/models/user.dart';

class AccountContact {
  final User user;
  final MessageThread thread;

  const AccountContact({required this.user, required this.thread});
}

/// Derives contacts only from real, participant-visible communication threads.
/// It never expands the result from the global user directory.
List<AccountContact> deriveAccountContacts({
  required User currentUser,
  required Iterable<MessageThread> threads,
  required Map<String, User> usersById,
}) {
  final byUser = <String, AccountContact>{};
  for (final thread in threads) {
    if (thread.id.trim().isEmpty ||
        thread.id.startsWith('demo_') ||
        thread.id.startsWith('mock_') ||
        (thread.threadType ?? '').trim().toLowerCase() == 'support' ||
        thread.deletedForUserIds.contains(currentUser.id)) {
      continue;
    }
    final otherId = thread.user1Id == currentUser.id
        ? thread.user2Id
        : thread.user2Id == currentUser.id
            ? thread.user1Id
            : '';
    if (otherId.trim().isEmpty ||
        otherId == currentUser.id ||
        otherId == 'support') {
      continue;
    }
    final other = usersById[otherId];
    if (other == null ||
        other.id.trim().isEmpty ||
        other.isBanned ||
        other.isDeactivated) {
      continue;
    }
    final candidate = AccountContact(user: other, thread: thread);
    final existing = byUser[other.id];
    if (existing == null || _contactIsNewer(candidate, existing)) {
      byUser[other.id] = candidate;
    }
  }
  final result = byUser.values.toList(growable: false);
  result.sort((left, right) {
    final byName = left.user.displayName
        .toLowerCase()
        .compareTo(right.user.displayName.toLowerCase());
    if (byName != 0) return byName;
    return left.user.id.compareTo(right.user.id);
  });
  return result;
}

bool _contactIsNewer(AccountContact left, AccountContact right) {
  final leftTime = left.thread.lastMessageAt ?? left.thread.createdAt;
  final rightTime = right.thread.lastMessageAt ?? right.thread.createdAt;
  final comparison = leftTime.compareTo(rightTime);
  return comparison > 0 ||
      (comparison == 0 && left.thread.id.compareTo(right.thread.id) < 0);
}
