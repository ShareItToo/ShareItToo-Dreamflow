bool canStartHandover({
  required String requestStatus,
  required bool viewerIsOwner,
  required bool handoverTimeConfirmed,
  required bool handoverActive,
  required bool needsReview,
  bool hasBoundTimeSnapshot = false,
  bool timeOverridePending = false,
}) {
  final timeReady =
      hasBoundTimeSnapshot ? !timeOverridePending : handoverTimeConfirmed;
  return requestStatus.trim().toLowerCase() == 'accepted' &&
      viewerIsOwner &&
      timeReady &&
      !handoverActive &&
      !needsReview;
}

bool canStartReturn({
  required String requestStatus,
  required bool viewerIsOwner,
  required bool returnTimeConfirmed,
  required bool returnActive,
  bool hasBoundTimeSnapshot = false,
  bool timeOverridePending = false,
}) {
  final timeReady =
      hasBoundTimeSnapshot ? !timeOverridePending : returnTimeConfirmed;
  return requestStatus.trim().toLowerCase() == 'running' &&
      !viewerIsOwner &&
      timeReady &&
      !returnActive;
}
