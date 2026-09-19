/// Compile-time provider identity for legally reviewed public builds.
///
/// Internal and test builds deliberately fail closed. A public release may set
/// these values only after the provider identity has been confirmed and the
/// matching legal content has been approved.
abstract final class LegalProviderConfig {
  static const bool isApproved = bool.fromEnvironment(
    'SIT_LEGAL_PROVIDER_APPROVED',
    defaultValue: false,
  );

  static const String providerName = String.fromEnvironment(
    'SIT_LEGAL_PROVIDER_NAME',
  );
  static const String providerAddress = String.fromEnvironment(
    'SIT_LEGAL_PROVIDER_ADDRESS',
  );
  static const String representative = String.fromEnvironment(
    'SIT_LEGAL_REPRESENTATIVE',
  );
  static const String contentResponsible = String.fromEnvironment(
    'SIT_LEGAL_CONTENT_RESPONSIBLE',
  );
  static const String contactEmail = String.fromEnvironment(
    'SIT_LEGAL_CONTACT_EMAIL',
    defaultValue: 'contact@shareittoo.com',
  );
  static const String contactPhone = String.fromEnvironment(
    'SIT_LEGAL_CONTACT_PHONE',
  );

  static bool get hasCompleteApprovedIdentity =>
      isApproved &&
      providerName.trim().isNotEmpty &&
      providerAddress.trim().isNotEmpty &&
      representative.trim().isNotEmpty &&
      contentResponsible.trim().isNotEmpty &&
      contactEmail.trim().isNotEmpty;
}
