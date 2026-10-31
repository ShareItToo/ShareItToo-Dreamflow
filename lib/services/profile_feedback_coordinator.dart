import 'package:lendify/services/auth_service.dart';

enum ProfileFeedbackSubmissionState { persisted, staleContext }

class ProfileFeedbackSubmission {
  final Map<String, dynamic> response;
  final ProfileFeedbackSubmissionState state;

  const ProfileFeedbackSubmission({
    required this.response,
    required this.state,
  });

  bool get contextCurrent => state == ProfileFeedbackSubmissionState.persisted;
}

/// Keeps profile feedback truthful across retries, double taps and account
/// transitions. The caller captures the session owner before invoking it.
class ProfileFeedbackCoordinator {
  bool _inFlight = false;

  bool get inFlight => _inFlight;

  Future<ProfileFeedbackSubmission?> submit({
    required AuthSessionOwner owner,
    required String submittedDraft,
    required String idempotencyKey,
    required Future<Map<String, dynamic>> Function(String idempotencyKey)
        persist,
    required Future<bool> Function() isCurrent,
    required String Function() readDraft,
    required void Function() clearDraft,
  }) async {
    if (_inFlight || submittedDraft.trim().isEmpty) return null;
    _inFlight = true;
    try {
      if (!await isCurrent()) {
        return const ProfileFeedbackSubmission(
          response: <String, dynamic>{},
          state: ProfileFeedbackSubmissionState.staleContext,
        );
      }
      final response = await persist(idempotencyKey);
      final current = await isCurrent();
      if (current && readDraft() == submittedDraft) clearDraft();
      return ProfileFeedbackSubmission(
        response: response,
        state: current
            ? ProfileFeedbackSubmissionState.persisted
            : ProfileFeedbackSubmissionState.staleContext,
      );
    } finally {
      _inFlight = false;
    }
  }
}
