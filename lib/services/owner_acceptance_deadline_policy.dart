/// Shared rule for whether a remote owner may accept a pending request.
/// Local/QA and explicit simulation requests retain their non-remote behavior.
class OwnerAcceptanceDeadlinePolicy {
  const OwnerAcceptanceDeadlinePolicy._();

  static bool isValid({
    required bool simulationOnly,
    required bool requiresRemoteDeadline,
    required DateTime? deadline,
    required DateTime now,
  }) {
    if (simulationOnly || !requiresRemoteDeadline) return true;
    return deadline != null && deadline.isAfter(now);
  }

  static String? blockedMessage({
    required bool simulationOnly,
    required bool requiresRemoteDeadline,
    required DateTime? deadline,
    required DateTime now,
  }) {
    if (isValid(
      simulationOnly: simulationOnly,
      requiresRemoteDeadline: requiresRemoteDeadline,
      deadline: deadline,
      now: now,
    )) {
      return null;
    }
    return deadline == null
        ? 'Die verbindliche Annahmefrist fehlt. Diese Anfrage kann nicht angenommen werden; bitte lade die Ansicht neu.'
        : 'Die 30-Minuten-Annahmefrist ist abgelaufen. Diese Anfrage kann nicht mehr angenommen werden.';
  }
}
