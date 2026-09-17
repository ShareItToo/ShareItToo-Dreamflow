/// Coordinates one message persistence attempt and keeps the composer draft
/// truthful while the asynchronous write is in flight.
class MessageSendCoordinator {
  bool _inFlight = false;

  bool get inFlight => _inFlight;

  /// Returns `false` when a send is already in flight or the submitted text
  /// is empty. A failed persistence attempt is rethrown and never clears the
  /// draft. On success, the draft is cleared only when it is still byte-for-
  /// byte identical to the text that was submitted.
  Future<bool> send({
    required String submittedDraft,
    required Future<void> Function(String text) persist,
    required String Function() readDraft,
    required void Function() clearDraft,
  }) async {
    final text = submittedDraft.trim();
    if (text.isEmpty || _inFlight) return false;

    _inFlight = true;
    try {
      await persist(text);
      if (readDraft() == submittedDraft) {
        clearDraft();
      }
      return true;
    } finally {
      _inFlight = false;
    }
  }
}

enum MessageSendRefreshOutcome {
  persistenceFailed,
  persistedAndRefreshed,
  persistedRefreshFailed,
}

bool shouldShowMessageSendOutcomeToast({
  required bool mounted,
  required bool contextCurrent,
}) =>
    mounted && contextCurrent;

MessageSendRefreshOutcome classifyMessageSendRefreshOutcome({
  required bool persistenceConfirmed,
  required bool refreshSucceeded,
}) {
  if (!persistenceConfirmed) return MessageSendRefreshOutcome.persistenceFailed;
  return refreshSucceeded
      ? MessageSendRefreshOutcome.persistedAndRefreshed
      : MessageSendRefreshOutcome.persistedRefreshFailed;
}
