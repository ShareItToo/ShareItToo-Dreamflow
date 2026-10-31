import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/local_safety_privacy_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';

/// Server-authoritative reporting with an explicit local QA fallback.
class UserReportsService {
  static Future<void> addReport({
    required String reporterUserId,
    required String reportedUserId,
    required String reasonCode,
    String details = '',
    List<String> evidenceNames = const [],
    List<String> evidenceUploadIds = const [],
    String? reference,
  }) async {
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      await BackendRepository.createReport(
        targetType: 'user',
        targetId: reportedUserId,
        reasonCode: reasonCode,
        details: details,
        reference: reference,
        evidenceUploadIds: evidenceUploadIds,
      );
      return;
    }
    await LocalSafetyPrivacyService.addReport(
      reporterUserId: reporterUserId,
      reportedUserId: reportedUserId,
      reasonCode: reasonCode,
      details: details,
      evidenceNames: evidenceNames,
      reference: reference,
    );
  }

  static Future<List<Map<String, dynamic>>> getLocalReports() =>
      LocalSafetyPrivacyService.getReports();

  static Future<bool> addHarassmentBlockReport({
    required String reporterUserId,
    required String reportedUserId,
    required bool immediateDanger,
    required String idempotencyKey,
    String details = '',
    List<String> evidenceNames = const [],
    List<String> evidenceUploadIds = const [],
    String? reference,
  }) async {
    if (immediateDanger) {
      throw ArgumentError.value(
        immediateDanger,
        'immediateDanger',
        'Akute Gefahr muss in den Sicherheitsweg umgeleitet werden.',
      );
    }
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final result = await BackendRepository.createHarassmentBlockReport(
        targetUserId: reportedUserId,
        immediateDanger: false,
        idempotencyKey: idempotencyKey,
        details: details,
        reference: reference,
        evidenceUploadIds: evidenceUploadIds,
      );
      final protection = result['protection'];
      return protection is Map && protection['directContactBlocked'] == true;
    }
    await LocalSafetyPrivacyService.addHarassmentReportAndBlock(
      reporterUserId: reporterUserId,
      reportedUserId: reportedUserId,
      details: details,
      evidenceNames: evidenceNames,
      reference: reference,
    );
    return true;
  }
}
