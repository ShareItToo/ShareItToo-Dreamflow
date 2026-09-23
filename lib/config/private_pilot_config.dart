class PilotOpenDecision {
  final String id;
  final String status;
  final String title;
  final String interimRule;
  final String updateAuthority;
  final bool blocksLiveActivation;
  final bool activeForInternalTesting;

  const PilotOpenDecision({
    required this.id,
    required this.status,
    required this.title,
    required this.interimRule,
    required this.updateAuthority,
    required this.blocksLiveActivation,
    this.activeForInternalTesting = true,
  });
}

class PrivatePilotConfig {
  PrivatePilotConfig._();

  static const bool enabled = true;
  static const bool deliveryEnabled = false;

  /// The publish action carries this server-validated image-truth assertion;
  /// it deliberately adds no separate checkbox to the listing flow.
  static const String listingPhotoTruthPolicyVersion = 'listing-photo-truth-v1';
  static const String listingPhotoTruthPolicyAttestation =
      'Ich veröffentliche nur aktuelle echte Artikelbilder. Zuschneiden, Belichtung und das Schwärzen privater Details sind erlaubt, wenn Artikel, Zustand und Umfang wahr bleiben. KI-generierte oder materiell veränderte Bilder dürfen nicht veröffentlicht werden.';

  /// The reachable listing helpers are now available as bounded local rules
  /// plus an explicit authenticated server price action. This does not enable
  /// direct client provider traffic, auto-publication or live money.
  static const bool aiFeaturesEnabled = true;

  /// N6 technical pilot gate. It is false in every ordinary build and must
  /// only be enabled together with the non-production backend mock lane.
  static const bool blueOceanListingAssistantEnabled = bool.fromEnvironment(
    'SIT_BLUE_OCEAN_LISTING_ASSISTANT',
    defaultValue: false,
  );
  static const String blueOceanStageANonBindingNotice =
      'Pilot-Simulation: Es entsteht keine verbindliche SIT-Miete. '
      'Es erfolgen keine echten Zahlungen, Erstattungen oder Auszahlungen. '
      'Nichts ist öffentlich; Anzeigen bleiben im geschlossenen Pilot.';

  /// Every Blue Ocean/Internal Stage-A candidate sets this build-time gate.
  /// It permits only a clearly labelled server-persistent simulation while
  /// binding checkout, contract, reservation and every money effect stay off.
  static const bool stageANonBindingPilotEnabled = bool.fromEnvironment(
    'SIT_STAGE_A_NON_BINDING_PILOT',
    defaultValue: false,
  );

  /// Exact closed-pilot identity carried only by the signed Internal/Staging
  /// Wave-0 candidate. A feature flag on its own is never enough to expose
  /// the G3-G5 technical surfaces from a release build.
  static const String stageAPilotId = String.fromEnvironment(
    'SIT_STAGE_A_PILOT_ID',
    defaultValue: '',
  );
  static const String supportedStageAPilotId = 'heilbronn_wave0';
  static const String _releaseChannel = String.fromEnvironment(
    'SIT_RELEASE_CHANNEL',
    defaultValue: 'development',
  );
  static const String _apiBaseUrl = String.fromEnvironment(
    'SIT_API_BASE_URL',
    defaultValue: 'https://shareittoo.com/api/v1',
  );

  static bool signedStageAInternalEnvelopeFor({
    required bool listingAssistantEnabled,
    required bool nonBindingPilotEnabled,
    required String pilotId,
    required String releaseChannel,
    required String apiBaseUrl,
  }) {
    return listingAssistantEnabled &&
        nonBindingPilotEnabled &&
        pilotId == supportedStageAPilotId &&
        releaseChannel == 'internal' &&
        apiBaseUrl == 'https://staging.shareittoo.com/api/v1';
  }

  static bool get signedStageAInternalEnvelopeEnabled =>
      signedStageAInternalEnvelopeFor(
        listingAssistantEnabled: blueOceanListingAssistantEnabled,
        nonBindingPilotEnabled: stageANonBindingPilotEnabled,
        pilotId: stageAPilotId,
        releaseChannel: _releaseChannel,
        apiBaseUrl: _apiBaseUrl,
      );

  static bool technicalSurfaceAvailableFor({
    required bool featureEnabled,
    required bool releaseMode,
    required bool signedStageAInternalEnvelope,
  }) {
    return featureEnabled && (!releaseMode || signedStageAInternalEnvelope);
  }

  static bool bindingCheckoutAvailableFor({
    required bool stageANonBindingPilot,
  }) =>
      !stageANonBindingPilot;

  /// Ordinary V5.2 development keeps the binding contract path testable.
  /// A Stage-A candidate always fails closed before binding checkout.
  static bool get bindingCheckoutEnabled => bindingCheckoutAvailableFor(
        stageANonBindingPilot: stageANonBindingPilotEnabled,
      );

  /// V5.1 product model. External legal/provider approval remains a separate
  /// launch gate and real money stays disabled until that evidence exists.
  static const bool interimLegalModelEnabled = true;
  static const String interimPolicyVersion = 'V5.1-2026-08-16';
  static const String interimPolicyScope = 'internal-and-closed-testing-only';
  static const bool replaceInterimRulesOnUserInstruction = true;
  static const bool realPaymentsEnabled = false;
  static const String plannedMarketplacePaymentProvider =
      'Stripe Connect (Testkonfiguration; Vertragspartner und Geldfluss vor Livegang erneut verifizieren)';
  static const String bindingRequestDeclaration =
      'Ich gebe eine verbindliche zahlungspflichtige Buchungsanfrage zu den angezeigten Daten, Preisen und Dokumentversionen ab.';
  static const String platformTermsDeclaration =
      'Ich akzeptiere die Plattform-Nutzungsbedingungen und den angezeigten Plattformbeitrag.';
  static const String earlyPerformanceDeclaration =
      'Ich verlange, dass ShareItToo vor Ablauf der Widerrufsfrist mit der Vermittlung und technischen Buchungsbestätigung beginnt.';
  static const String withdrawalKnowledgeDeclaration =
      'Mir ist bekannt, dass mein Widerrufsrecht bei vollständiger Vertragserfüllung unter den gesetzlichen Voraussetzungen erlöschen kann.';
  static const String ownerAcceptanceDeclaration =
      'Du nimmst die Buchungsanfrage zu den angezeigten Konditionen und den Privat-Mietbedingungen an.';
  static const String platformWithdrawalDeclaration =
      'Ich widerrufe die kostenpflichtige Plattformleistung von ShareItToo für die ausgewählte Buchung.';
  static const String v51DocumentName = 'ShareItToo Rechtsmappe Privat-Launch';
  static const String v51DocumentVersion = 'V5.1-2026-08-16';
  static const String v51PrivateAndPlatformTermsDeclaration =
      'Ich handle bei dieser Buchung ausschließlich privat und akzeptiere die SIT-Plattformbedingungen sowie die Privat-Mietbedingungen einschließlich Storno-, Übergabe- und Schadenregeln.';
  static const String v51EarlyPerformanceAndWithdrawalDeclaration =
      'Ich verlange ausdrücklich, dass ShareItToo unmittelbar nach Abschluss des Plattformvertrags und vor Ablauf der 14-tägigen Widerrufsfrist mit der Plattformleistung beginnt. Mir ist bekannt, dass mein gesetzliches Widerrufsrecht erlischt, sobald SIT die vereinbarte Plattformleistung vollständig erbracht hat. Mein zusätzliches vertragliches 14-Tage-Lösungsrecht bleibt unberührt.';
  static const String v52DocumentName =
      'ShareItToo Rechtsmappe Privat-Launch V5.2';
  static const String v52DocumentVersion = 'V5.2-2026-08-16';
  static const String v52ClientBuild = String.fromEnvironment(
    'SIT_CLIENT_BUILD',
    defaultValue: '1.0.0+2026092203',
  );
  static const String v52PrivateAndPlatformTermsDeclaration =
      'Ich handle bei dieser Buchung ausschließlich privat und akzeptiere die SIT-Plattformbedingungen [Teil A, Version V5.2-2026-08-16] sowie die Privat-Mietbedingungen einschließlich Storno-, Übergabe- und Schadenregeln [Teile B-D, Version V5.2-2026-08-16].';
  static const String v52EarlyPerformanceAndWithdrawalDeclaration =
      'Ich verlange ausdrücklich, dass ShareItToo unmittelbar nach Abschluss des Plattformvertrags und vor Ablauf der 14-tägigen Widerrufsfrist mit der Plattformleistung beginnt. Mir ist bekannt, dass mein gesetzliches Widerrufsrecht erlischt, sobald SIT die vereinbarte Plattformleistung vollständig erbracht hat. Mein zusätzliches vertragliches 14-Tage-Lösungsrecht bleibt unberührt.';
  static const int bookingRequestBindingMinutes = 30;

  static const int platformFeeBasisPoints = 1000; // 10.00%
  static const int returnReportWindowHours = 48;
  static const int missingReturnConfirmationDays = 5;
  static const int shortNoticeThresholdHours = 24;
  static const int shortNoticeGraceMinutes = 60;

  /// V5.1 test parameters. External legal review remains a separate launch
  /// gate and no fixed post-start/no-show refund percentage is configured.
  static const int shortNoticeRemainingBasisPoints = 5000;

  static const String documentName = 'ShareItToo Rechtsmappe Privat-Launch';
  static const String documentVersion = 'V5.1-2026-08-16';
  static const String language = 'de';

  /// Central register mapping the former V4 questions to their explicit V5.1
  /// successors. Product rules are decided for closed testing, while legal,
  /// provider and live-payment approval remain separate launch gates.
  static const List<PilotOpenDecision> openDecisions = [
    PilotOpenDecision(
      id: 'platform_contract_and_withdrawal_timing',
      status: 'superseded_by_v51',
      title: 'Plattformvertrag und Widerrufserklärungen',
      interimRule:
          'Der buchungsbezogene Plattformvertrag entsteht bei der verbindlichen Buchungsanfrage mit exakt zwei getrennten, nicht vorausgewählten V5.1-Erklärungen und unveränderlicher Eingangsbestätigung.',
      updateAuthority: 'V5.1 Teil A Nr. 11-13 und Umsetzungsauftrag Nr. 2-5',
      blocksLiveActivation: true,
    ),
    PilotOpenDecision(
      id: 'withdrawal_effect_on_private_rental',
      status: 'superseded_by_v51',
      title: 'Wirkung des Widerrufs auf den privaten Mietvertrag',
      interimRule:
          'Innerhalb des garantierten 14-Tage-Fensters gelten die dokumentierten Folgen vor beziehungsweise nach Übergabe; danach wird die Erklärung empfangen, aber mögliche längere Rechte werden ohne automatische Buchungs- oder Geldänderung geprüft.',
      updateAuthority: 'V5.1 Teil A Nr. 13 und Umsetzungsauftrag Nr. 5',
      blocksLiveActivation: true,
    ),
    PilotOpenDecision(
      id: 'cancellation_50_100_or_30_50',
      status: 'superseded_by_v51',
      title: 'Stornoparameter 50/100 oder 30/50',
      interimRule:
          'Mindestens 24 Stunden vollständig; unter 24 Stunden grundsätzlich 50 % Mietpreis plus 10 % des verbleibenden Mietpreises als Gebührenanteil; bei kurzfristigem Vertrag 60 Minuten Karenz, spätestens bis Mietbeginn; ab Beginn/No-Show keine starre Pauschale.',
      updateAuthority: 'V5.1 Teil C und Umsetzungsauftrag Nr. 6',
      blocksLiveActivation: true,
    ),
    PilotOpenDecision(
      id: 'marketplace_psp_mechanics',
      status: 'superseded_by_v51',
      title: 'PSP- und Geldflussmechanik',
      interimRule:
          'Nur lizenzierter Marketplace-PSP; bis Vertrag, Produktkonfiguration und Testabnahme belegt sind, bleiben Testmodus und kein Echtgeld verbindlich.',
      updateAuthority: 'V5.1 Teil E und PSP-Vertrag/Testabnahme',
      blocksLiveActivation: true,
    ),
    PilotOpenDecision(
      id: 'missing_return_confirmation_window',
      status: 'superseded_by_v51',
      title: 'Klärungsfenster bei fehlender Rückgabebestätigung',
      interimRule:
          'Neutraler Zustand awaitingReturnConfirmation bis T0 plus 5 Kalendertage; keine automatische needsReview-Eskalation.',
      updateAuthority: 'V5.1 Teil E Nr. 2',
      blocksLiveActivation: false,
    ),
    PilotOpenDecision(
      id: 'handover_photo_workflow',
      status: 'superseded_by_v51',
      title: 'Fotoablauf bei Übergabe und Rückgabe',
      interimRule:
          'Die übergebende Partei erstellt vier Pflichtfotos; die Gegenpartei bestätigt oder ergänzt mindestens ein aktuelles Gegen-/Abweichungsfoto. Danach folgt getrennt QR- oder Fallback-Code-Bestätigung.',
      updateAuthority: 'V5.1 Teil D Nr. 2 und Umsetzungsauftrag Nr. 9',
      blocksLiveActivation: false,
    ),
  ];

  static const String accountPrivateDeclaration =
      'Ich bin mindestens 18 Jahre alt, handle als natuerliche Person und nutze ShareItToo im Privat-Pilot ausschliesslich privat.';
  static const String listingPrivateDeclaration =
      'Ich biete diesen Gegenstand als Privatperson an, bin zur Vermietung berechtigt und handle weder gewerblich noch beruflich.';
  static const String bookingPrivateDeclaration =
      'Ich buche als Privatperson fuer private Zwecke und akzeptiere, dass ShareItToo keine Kaution, Versicherung oder Schadengarantie anbietet.';

  static const String riskNotice =
      'ShareItToo prueft Gegenstand, Eigentum, Sicherheit, Zeitwert und Versicherungsschutz nicht. ShareItToo bietet keine Kaution, Versicherung oder Schadengarantie. Vermieter und Mieter pruefen ihr Risiko und ihren Versicherungsschutz selbst.';

  /// Technical positive list for the first private pilot. Broad categories
  /// containing vehicles, medical goods or living things remain excluded
  /// fail-closed. `Sonstiges` is only a bounded fallback inside an already
  /// allowed category; it is not a free-standing category escape hatch.
  static const Set<String> allowedCategoryIds = {
    'cat1', // Elektronik
    'cat2', // Computer & IT
    'cat3', // Kameras & Foto; Drohnen sind nicht freigeschaltet
    'cat4', // Gaming & VR
    'cat5', // Haushaltsgeraete
    'cat6', // Moebel & Wohnen
    'cat7', // Garten & Heimwerken
    'cat8', // Werkzeuge & Maschinen
    'cat12', // Mode & Accessoires
    'cat14', // Musikinstrumente & DJ
    'cat15', // Buecher, Filme & Medien
    'cat16', // Schmuck & Uhren
    'cat17', // Kunst & Sammlerstuecke
    'cat20', // Bueroausstattung
    'cat22', // Eventausstattung
    'cat23', // Reise- und Campingausstattung
  };

  static const Map<String, Set<String>> allowedSubcategories = {
    'cat1': {
      'Smartphones',
      'Tablets',
      'Wearables',
      'Audio',
      'Zubehör',
      'Sonstiges'
    },
    'cat2': {
      'Laptops',
      'Desktops',
      'Monitore',
      'Drucker',
      'Netzwerk',
      'Sonstiges'
    },
    'cat3': {'Kameras', 'Objektive', 'Stative', 'Licht', 'Sonstiges'},
    'cat4': {'Konsolen', 'Gaming-PC', 'VR', 'Lenkräder', 'Retro', 'Sonstiges'},
    'cat5': {
      'Staubsauger',
      'Mixer',
      'Kaffeemaschinen',
      'Waschmaschinen',
      'Trockner',
      'Sonstiges',
    },
    'cat6': {'Sofas', 'Tische', 'Stühle', 'Beleuchtung', 'Deko', 'Sonstiges'},
    'cat7': {
      'Rasenmäher',
      'Heckenscheren',
      'Gartengeräte',
      'Bewässerung',
      'Pflanzkisten',
      'Sonstiges',
    },
    'cat8': {
      'Handwerkzeuge',
      'Elektrowerkzeuge',
      'Bohrmaschinen',
      'Sägen',
      'Schleifer',
      'Sonstiges',
    },
    'cat12': {'Kleidung', 'Taschen', 'Schuhe', 'Schmuck', 'Uhren', 'Sonstiges'},
    'cat14': {
      'Gitarren',
      'Tastaturen',
      'Schlagzeug',
      'Blasinstrumente',
      'Studio',
      'Sonstiges',
    },
    'cat15': {
      'Bücher',
      'Filme',
      'Spiele',
      'Hörbücher',
      'Magazine',
      'Sonstiges'
    },
    'cat16': {'Ringe', 'Ketten', 'Uhren', 'Ohrringe', 'Sets', 'Sonstiges'},
    'cat17': {
      'Gemälde',
      'Skulpturen',
      'Drucke',
      'Figuren',
      'Seltenes',
      'Sonstiges'
    },
    'cat20': {
      'Bürotechnik',
      'Präsentation',
      'Werkstatt',
      'Lager',
      'Zubehör',
      'Sonstiges'
    },
    'cat22': {
      'Party-Deko',
      'Eventtechnik',
      'Tische & Stühle',
      'Pavillons',
      'Buffet & Catering',
      'Sonstiges',
    },
    'cat23': {
      'Zelte',
      'Schlafsäcke',
      'Rucksäcke & Koffer',
      'Campingküche',
      'Outdoor-Zubehör',
      'Sonstiges',
    },
  };

  static bool categoryAllowed(String categoryId) =>
      allowedCategoryIds.contains(categoryId.trim());

  static bool subcategoryAllowed(String categoryId, String subcategory) =>
      allowedSubcategories[categoryId.trim()]?.contains(subcategory.trim()) ==
      true;
}
