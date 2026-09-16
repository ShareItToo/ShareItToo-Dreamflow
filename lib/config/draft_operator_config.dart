/// Confirmed operator facts for the inactive internal legal draft only.
///
/// This is deliberately separate from [LegalProviderConfig]: it can never
/// authorize a public build, a commercial operation, or contractual use.
abstract final class DraftOperatorConfig {
  static const businessDesignation = 'ShareItToo – Inhaber Walid Chraibi';
  static const serviceAddress =
      'Bernhaldenweg 47, 71579 Spiegelberg, Deutschland';
  static const legalForm = 'Einzelunternehmer';

  static const publicCommercialOperationAllowed = false;
  static const realInvitationsAllowed = false;
  static const realMoneyAllowed = false;
  static const bindingContractAcceptanceAllowed = false;

  static const readinessText =
      'Bestätigte Betreiberangaben für den gesperrten Entwurf: '
      '$businessDesignation, $serviceAddress. Der Betrieb ist als '
      '$legalForm vorgesehen. Die Gewerbeanmeldung ist spätestens zum '
      'tatsächlichen Start vorzunehmen; eine Steuernummer wird nicht '
      'angegeben, solange sie nicht erteilt ist.';

  static const internalOnlyText =
      'Bis zu einer späteren ausdrücklichen Startfreigabe sind nur interne, '
      'synthetische und unverbindliche Vorbereitungen zulässig. Es gibt keine '
      'öffentliche oder kommerzielle Nutzung, keine echten Einladungen, kein '
      'Echtgeld und keine verbindliche Vertragsannahme.';
}
