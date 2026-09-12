class ReturnCaseEntryPointPolicy {
  ReturnCaseEntryPointPolicy._();

  static bool isEligible({
    required String bookingStatus,
    required bool simulationOnly,
    required bool needsReview,
    required Map<String, dynamic>? platformContract,
    required DateTime? returnT0,
    required DateTime? reportDeadline,
    required DateTime? returnCaseOpenedAt,
    DateTime? now,
  }) {
    if (simulationOnly || needsReview || returnCaseOpenedAt != null) {
      return false;
    }
    if (bookingStatus.trim().toLowerCase() != 'completed') return false;
    final contractVersion =
        platformContract?['contractVersion']?.toString().trim() ?? '';
    if (!contractVersion.startsWith('V5.2-') ||
        platformContract?['state'] != 'platformContractAccepted') {
      return false;
    }
    if (returnT0 == null || reportDeadline == null) return false;
    final current = now ?? DateTime.now();
    return !current.isBefore(returnT0) && !current.isAfter(reportDeadline);
  }
}
