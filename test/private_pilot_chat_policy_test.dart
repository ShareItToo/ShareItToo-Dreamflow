import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/message.dart';
import 'package:lendify/screens/message_thread_screen.dart';

void main() {
  final now = DateTime.utc(2026, 8, 14, 12);

  test('active booking chat remains open', () {
    expect(
      isPrivatePilotBookingChatOpen(
        bookingStatus: 'running',
        returnState: 'not_started',
        now: now,
      ),
      isTrue,
    );
  });

  test('completed booking chat stays open during report window', () {
    expect(
      isPrivatePilotBookingChatOpen(
        bookingStatus: 'completed',
        returnState: 'reportWindowOpen',
        reportDeadline: now.add(const Duration(hours: 1)),
        now: now,
      ),
      isTrue,
    );
    expect(
      isPrivatePilotBookingChatOpen(
        bookingStatus: 'completed',
        returnState: 'reportWindowOpen',
        reportDeadline: now.subtract(const Duration(seconds: 1)),
        now: now,
      ),
      isFalse,
    );
  });

  test('substantiated case keeps chat open only until case closure', () {
    expect(
      isPrivatePilotBookingChatOpen(
        bookingStatus: 'completed',
        returnState: 'needsReview',
        now: now,
      ),
      isTrue,
    );
    expect(
      isPrivatePilotBookingChatOpen(
        bookingStatus: 'completed',
        returnState: 'needsReview',
        caseClosedAt: now,
        now: now,
      ),
      isFalse,
    );
  });

  test('declined and cancelled bookings do not open chat', () {
    for (final status in ['declined', 'cancelled']) {
      expect(
        isPrivatePilotBookingChatOpen(
          bookingStatus: status,
          returnState: 'needsReview',
          now: now,
        ),
        isFalse,
      );
    }
  });

  test('read receipt is sent only for an unread incoming user message', () {
    Message message({
      required String id,
      required String senderId,
      required bool isRead,
    }) =>
        Message(
          id: id,
          senderId: senderId,
          text: id,
          timestamp: now,
          isRead: isRead,
        );

    expect(
      shouldMarkThreadMessagesAsRead(
        messages: [
          message(id: 'own', senderId: 'owner', isRead: false),
          message(id: 'system', senderId: 'system', isRead: false),
          message(id: 'read', senderId: 'renter', isRead: true),
        ],
        userId: 'owner',
      ),
      isFalse,
    );

    expect(
      shouldMarkThreadMessagesAsRead(
        messages: [
          message(id: 'incoming', senderId: 'renter', isRead: false),
        ],
        userId: 'owner',
      ),
      isTrue,
    );
  });

  test('message thread ignores self-generated cache events during load', () {
    for (final key in <String>[
      'rental_requests',
      'message_threads_v1',
      'handover_return_state_v1',
    ]) {
      expect(
        shouldReloadMessageThreadForPersistenceChange(
          key: key,
          loadInProgress: true,
        ),
        isFalse,
      );
    }
  });

  test('message thread reloads only for relevant events after load', () {
    expect(
      shouldReloadMessageThreadForPersistenceChange(
        key: 'message_threads_v1',
        loadInProgress: false,
      ),
      isTrue,
    );
    expect(
      shouldReloadMessageThreadForPersistenceChange(
        key: 'unrelated-key',
        loadInProgress: false,
      ),
      isFalse,
    );
  });
}
