/// Compile-time configuration for the general and case-specific German
/// consumer-dispute information.
///
/// Values remain unavailable unless the complete configuration has been
/// explicitly approved. Store submission is independently blocked by the
/// release preflight when this configuration is incomplete.
abstract final class ConsumerDisputeConfig {
  static const String policyVersion = 'V52-VSBG-2026-08-22.1';
  static const String _approvedParticipationStatus =
      'not_willing_or_obliged_except_mandatory_case';

  static const bool isApproved = bool.fromEnvironment(
    'SIT_CONSUMER_DISPUTE_APPROVED',
    defaultValue: false,
  );
  static const String configurationVersion = String.fromEnvironment(
    'SIT_CONSUMER_DISPUTE_CONFIGURATION_VERSION',
  );
  static const String conciliationBodyName = String.fromEnvironment(
    'SIT_CONSUMER_DISPUTE_BODY_NAME',
  );
  static const String conciliationBodyAddress = String.fromEnvironment(
    'SIT_CONSUMER_DISPUTE_BODY_ADDRESS',
  );
  static const String conciliationBodyWebsite = String.fromEnvironment(
    'SIT_CONSUMER_DISPUTE_BODY_WEBSITE',
  );
  static const String participationStatus = String.fromEnvironment(
    'SIT_CONSUMER_DISPUTE_PARTICIPATION_STATUS',
  );

  static bool get hasCompleteApprovedConfiguration {
    final website = Uri.tryParse(conciliationBodyWebsite.trim());
    final host = website?.host.toLowerCase() ?? '';
    final path = website?.path.toLowerCase() ?? '';
    final oldOdrLink =
        (host == 'ec.europa.eu' && path.startsWith('/consumers/odr')) ||
            host == 'consumer-redress.ec.europa.eu' ||
            (host == 'webgate.ec.europa.eu' && path.startsWith('/odr'));
    return isApproved &&
        configurationVersion.trim().isNotEmpty &&
        conciliationBodyName.trim().isNotEmpty &&
        conciliationBodyAddress.trim().isNotEmpty &&
        website != null &&
        website.scheme == 'https' &&
        website.host.isNotEmpty &&
        !oldOdrLink &&
        participationStatus == _approvedParticipationStatus;
  }

  static String get participationStatusPlain =>
      'nicht bereit und nicht verpflichtet, soweit keine gesetzliche '
      'Verpflichtung im Einzelfall besteht';

  static String get generalInformationText => hasCompleteApprovedConfiguration
      ? 'ShareItToo ist nicht bereit und nicht verpflichtet, an '
          'Streitbeilegungsverfahren vor einer '
          'Verbraucherschlichtungsstelle teilzunehmen, soweit keine '
          'gesetzliche Verpflichtung im Einzelfall besteht.'
      : 'Die Erklärung zur Verbraucherstreitbeilegung wird zusammen mit '
          'der Anbieterkennzeichnung vor der Veröffentlichung geprüft.';
}
