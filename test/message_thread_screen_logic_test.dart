import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/message_thread_screen.dart';
import 'package:lendify/widgets/return_handover_stepper_sheet.dart';

void main() {
  test('return handover confirmation requires confirmed result', () {
    expect(didConfirmReturnHandover(null), isFalse);
    expect(
      didConfirmReturnHandover(
        const ReturnHandoverStepResult(confirmed: false, galleryUsed: true),
      ),
      isFalse,
    );
    expect(
      didConfirmReturnHandover(
        const ReturnHandoverStepResult(confirmed: true, galleryUsed: false),
      ),
      isTrue,
    );
  });

  test('completed chat closes after 48 hours even if confirmation is missing',
      () {
    final deadline = DateTime.utc(2026, 8, 22, 10);
    expect(
      isPrivatePilotBookingChatOpen(
        bookingStatus: 'completed',
        returnState: 'awaitingReturnConfirmation',
        reportDeadline: deadline,
        clarificationDeadline: DateTime.utc(2026, 8, 25, 10),
        now: deadline,
      ),
      isTrue,
    );
    expect(
      isPrivatePilotBookingChatOpen(
        bookingStatus: 'completed',
        returnState: 'awaitingReturnConfirmation',
        reportDeadline: deadline,
        clarificationDeadline: DateTime.utc(2026, 8, 25, 10),
        now: deadline.add(const Duration(milliseconds: 1)),
      ),
      isFalse,
    );
  });

  group('starter role helpers', () {
    test('handover start is only allowed for owner on confirmed chat state',
        () {
      expect(
        canStartPrimaryBookingAction(
          chatState: BookingChatState.confirmed,
          viewerIsOwner: true,
          handoverTimeConfirmed: true,
        ),
        isTrue,
      );
      expect(
        canStartPrimaryBookingAction(
          chatState: BookingChatState.confirmed,
          viewerIsOwner: false,
          handoverTimeConfirmed: true,
        ),
        isFalse,
      );
    });

    test('return start is only allowed for renter on running chat states', () {
      expect(
        canStartPrimaryBookingAction(
          chatState: BookingChatState.running,
          viewerIsOwner: false,
          returnTimeConfirmed: true,
        ),
        isTrue,
      );
      expect(
        canStartPrimaryBookingAction(
          chatState: BookingChatState.returnPlanned,
          viewerIsOwner: false,
          returnTimeConfirmed: true,
        ),
        isTrue,
      );
      expect(
        canStartPrimaryBookingAction(
          chatState: BookingChatState.running,
          viewerIsOwner: true,
          returnTimeConfirmed: true,
        ),
        isFalse,
      );
      expect(
        canStartPrimaryBookingAction(
          chatState: BookingChatState.returnPlanned,
          viewerIsOwner: true,
          returnTimeConfirmed: true,
        ),
        isFalse,
      );
    });

    test('unconfirmed times and pre-handover review holds hide actions', () {
      expect(
        canStartPrimaryBookingAction(
          chatState: BookingChatState.confirmed,
          viewerIsOwner: true,
        ),
        isFalse,
      );
      expect(
        canStartPrimaryBookingAction(
          chatState: BookingChatState.running,
          viewerIsOwner: false,
        ),
        isFalse,
      );
      expect(
        canStartPrimaryBookingAction(
          chatState: BookingChatState.confirmed,
          viewerIsOwner: true,
          handoverTimeConfirmed: true,
          needsReview: true,
        ),
        isFalse,
      );
    });

    test('other chat states never expose booking starter action', () {
      for (final state in [
        BookingChatState.requestOpen,
        BookingChatState.completed,
        BookingChatState.support,
      ]) {
        expect(
          canStartPrimaryBookingAction(chatState: state, viewerIsOwner: true),
          isFalse,
        );
        expect(
          canStartPrimaryBookingAction(chatState: state, viewerIsOwner: false),
          isFalse,
        );
      }
    });

    test('system message is sent only for successful activation result', () {
      expect(shouldSendStartSystemMessage(activationSucceeded: true), isTrue);
      expect(shouldSendStartSystemMessage(activationSucceeded: false), isFalse);
    });
  });
}
