import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/support_flow_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _context = SupportFlowContext(
  itemTitle: 'Testartikel',
  itemId: 'listing-1',
  requestId: 'booking-1',
  bookingStatus: 'active',
  source: SupportFlowSource.bookingDetail,
  role: SupportFlowRole.renter,
);

Map<String, dynamic> _canonicalCase({
  String caseType = 'general_help',
  String caseSubType = 'app_error_or_display',
  String? dsaNoticeNumber,
  String dsaNoticeLocatorStatus = 'complete',
  String? productSafetyNoticeNumber,
  Map<String, dynamic>? feedbackContext,
}) =>
    {
      'id': 'case-1',
      'caseNumber': 'SIT-ABCDEFGHJKLM',
      'caseType': caseType,
      'caseSubType': caseSubType,
      if (dsaNoticeNumber != null) 'dsaNoticeNumber': dsaNoticeNumber,
      if (dsaNoticeNumber != null)
        'dsaNoticeLocatorStatus': dsaNoticeLocatorStatus,
      if (dsaNoticeNumber != null &&
          dsaNoticeLocatorStatus == 'needs_clarification')
        'dsaNoticeLocatorPrompt': 'Bitte ergänze einen exakten Fundort.',
      if (dsaNoticeNumber != null)
        'dsaNoticeLocatorMaySubmit':
            dsaNoticeLocatorStatus == 'needs_clarification',
      if (productSafetyNoticeNumber != null)
        'productSafetyNoticeNumber': productSafetyNoticeNumber,
      if (productSafetyNoticeNumber != null)
        'productSafetyTriageDueAt': '2026-08-21T15:00:00.000Z',
      if (productSafetyNoticeNumber != null)
        'productSafetyTriageDueDisplay': '21.08.2026, 17:00',
      if (feedbackContext != null) 'feedbackContext': feedbackContext,
      'status': 'received',
      'nextUpdateAt': '2026-08-21T16:00:00.000Z',
      'nextUpdateDisplay': '21.08.2026, 18:00',
      'timezone': 'Europe/Berlin',
      'operatingMode': 'simulation',
    };

Future<void> _pumpFlow(WidgetTester tester) async {
  tester.view.physicalSize = const Size(900, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    const MaterialApp(home: SupportFlowScreen(context: _context)),
  );
  await tester.pumpAndSettle();
}

Future<void> _selectTechnicalSubmission(WidgetTester tester) async {
  await tester
      .tap(find.byKey(const ValueKey('support_safety_answer_no_danger')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('support_issue_scope_single')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Technisches Problem'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('App lädt nicht'));
  await tester.pumpAndSettle();
  await tester.enterText(
      find.byType(TextField), 'Die App bleibt im Ladezustand.');
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({
        'auth_session_v1': jsonEncode({
          'userId': 'support-fixture-a',
          'sessionId': 'support-session-a',
          'email': 'support-a@example.invalid',
          'createdAt': '2026-09-04T00:00:00Z',
        }),
      }));
  testWidgets('immediate danger shows emergency guidance before categories',
      (tester) async {
    await _pumpFlow(tester);

    expect(
        find.byKey(const ValueKey('support_safety_question')), findsOneWidget);
    expect(find.text('Problem mit Übergabe'), findsNothing);

    await tester.tap(
      find.byKey(const ValueKey('support_safety_answer_danger')),
    );
    await tester.pumpAndSettle();

    expect(
        find.byKey(const ValueKey('support_safety_guidance')), findsOneWidget);
    expect(find.textContaining('Polizei 110'), findsOneWidget);
    expect(find.textContaining('Rettungsdienst/Feuerwehr 112'), findsOneWidget);
    expect(find.textContaining('SIT ist kein Notfalldienst'), findsWidgets);
    expect(find.text('Problem mit Übergabe'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('support_safety_continue')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('support_issue_scope_question')),
        findsOneWidget);
    expect(find.text('Problem mit Übergabe'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('support_issue_scope_single')));
    await tester.pumpAndSettle();
    expect(find.text('Problem mit Übergabe'), findsOneWidget);
  });

  testWidgets('no immediate danger continues without emergency guidance',
      (tester) async {
    await _pumpFlow(tester);

    await tester.tap(
      find.byKey(const ValueKey('support_safety_answer_no_danger')),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('support_safety_guidance')), findsNothing);
    expect(find.byKey(const ValueKey('support_issue_scope_question')),
        findsOneWidget);
    expect(find.text('Problem mit Übergabe'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('support_issue_scope_single')));
    await tester.pumpAndSettle();
    expect(find.text('Problem mit Übergabe'), findsOneWidget);
  });

  testWidgets('booking-bound handover exceptions stay hidden without a booking',
      (tester) async {
    const generalContext = SupportFlowContext(
      itemTitle: '',
      itemId: '',
      requestId: '',
      bookingStatus: 'general',
      source: SupportFlowSource.helpCenter,
      role: SupportFlowRole.renter,
    );
    tester.view.physicalSize = const Size(900, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      const MaterialApp(home: SupportFlowScreen(context: generalContext)),
    );
    await tester
        .tap(find.byKey(const ValueKey('support_safety_answer_no_danger')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('support_issue_scope_single')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Problem mit Übergabe'));
    await tester.pumpAndSettle();

    expect(find.text('QR-Code funktioniert nicht'), findsOneWidget);
    expect(find.text('Mieter ist nicht erschienen'), findsNothing);
    expect(find.text('Artikel ist nicht wie beschrieben'), findsNothing);
    expect(find.text('Kaution oder Sicherheitszahlung wird verlangt'),
        findsNothing);
  });

  testWidgets('multiple independent problems require separation first',
      (tester) async {
    await _pumpFlow(tester);
    await tester.tap(
      find.byKey(const ValueKey('support_safety_answer_no_danger')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('support_issue_scope_multiple')),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('support_issue_separation_guidance')),
        findsOneWidget);
    expect(find.text('Problem mit Übergabe'), findsNothing);

    await tester.tap(
      find.byKey(const ValueKey('support_issue_separation_continue')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Problem mit Übergabe'), findsOneWidget);
  });

  test('safety evidence uses the backend-bound immutable versions', () {
    const triage = SupportSafetyTriage(
      immediateDanger: true,
      guidanceShown: true,
    );

    expect(triage.toMap(), {
      'version': 'sit_support_safety_triage_v1',
      'packetVersion': 'SIT_SUPPORT_PACKET_V1_2026-08-20',
      'guidanceVersion': 'T-003@1.0.0',
      'immediateDanger': true,
      'guidanceShown': true,
    });
  });

  test('intake maps user categories and linked context to backend taxonomy',
      () {
    const result = SupportFlowResult(
      mainCategory: 'handover',
      subCategory: 'QR-Code funktioniert nicht',
      userDescription: 'Der Code wird in der App nicht angenommen.',
      context: _context,
      safetyTriage: SupportSafetyTriage(
        immediateDanger: false,
        guidanceShown: false,
      ),
      issueScope: SupportIssueScope(
        singleIssueConfirmed: true,
        separationGuidanceShown: false,
      ),
    );

    expect(result.toBackendInput(), {
      'caseType': 'active_handover',
      'caseSubType': 'qr_or_code_failure',
      'summary':
          'Problem mit Übergabe: QR-Code funktioniert nicht. Der Code wird in der App nicht angenommen.',
      'immediateDanger': false,
      'safetyTriage': {
        'version': 'sit_support_safety_triage_v1',
        'packetVersion': 'SIT_SUPPORT_PACKET_V1_2026-08-20',
        'guidanceVersion': 'T-003@1.0.0',
        'immediateDanger': false,
        'guidanceShown': false,
      },
      'issueScope': {
        'version': 'sit_support_single_issue_scope_v1',
        'singleIssueConfirmed': true,
        'separationGuidanceShown': false,
      },
      'linkedBookingId': 'booking-1',
      'linkedListingId': 'listing-1',
    });
  });

  test('handover exceptions produce only the exact specialized payload', () {
    const result = SupportFlowResult(
      mainCategory: 'handover',
      subCategory: 'Kaution oder Sicherheitszahlung wird verlangt',
      userDescription:
          'Die Gegenpartei verlangt vor Ort eine zusätzliche Barzahlung.',
      context: _context,
      safetyTriage: SupportSafetyTriage(
        immediateDanger: false,
        guidanceShown: false,
      ),
      issueScope: SupportIssueScope(
        singleIssueConfirmed: true,
        separationGuidanceShown: false,
      ),
      handoverDoNotPayAcknowledged: true,
    );

    expect(result.handoverExceptionKind, 'offplatform_deposit_request');
    expect(result.backendRoute.caseType, 'trust_safety');
    expect(result.backendRoute.caseSubType, 'offplatform_deposit_request');
    expect(result.toHandoverExceptionInput(), {
      'kind': 'offplatform_deposit_request',
      'details':
          'Die Gegenpartei verlangt vor Ort eine zusätzliche Barzahlung.',
      'immediateDanger': false,
      'safeAbortGuidanceAcknowledged': false,
      'doNotPayGuidanceAcknowledged': true,
      'contactAttemptAcknowledged': false,
    });
  });

  test('non-urgent feedback uses exact P4 context and suppresses entity links',
      () {
    const result = SupportFlowResult(
      mainCategory: 'feedback',
      subCategory: 'Verbesserung für App und Bedienung',
      userDescription: 'Die Navigation könnte einen kürzeren Weg anbieten.',
      context: _context,
      safetyTriage: SupportSafetyTriage(
        immediateDanger: false,
        guidanceShown: false,
      ),
      issueScope: SupportIssueScope(
        singleIssueConfirmed: true,
        separationGuidanceShown: false,
      ),
    );
    const feedbackContext = {
      'version': 'sit_support_feedback_context_v1',
      'feedbackKind': 'improvement_suggestion',
      'productArea': 'app_experience',
      'nonUrgentConfirmed': true,
    };

    final intake = result.toBackendInput();
    expect(intake['caseType'], 'general_help');
    expect(intake['caseSubType'], 'feedback_or_improvement');
    expect(intake['feedbackContext'], feedbackContext);
    expect(intake.containsKey('linkedBookingId'), isFalse);
    expect(intake.containsKey('linkedListingId'), isFalse);

    final confirmed = result.withCanonicalCase(_canonicalCase(
      caseType: 'general_help',
      caseSubType: 'feedback_or_improvement',
      feedbackContext: feedbackContext,
    ));
    expect(confirmed.canonicalReceiptMessage,
        contains('keine künstliche Eskalation'));
    expect(
      () => result.withCanonicalCase(_canonicalCase(
        caseType: 'general_help',
        caseSubType: 'feedback_or_improvement',
      )),
      throwsFormatException,
    );
  });

  test('immediate danger overrides the normal category route', () {
    const result = SupportFlowResult(
      mainCategory: 'technical',
      subCategory: 'App lädt nicht',
      userDescription:
          'Ich bin unsicher und brauche zuerst Sicherheitshinweise.',
      context: _context,
      safetyTriage: SupportSafetyTriage(
        immediateDanger: true,
        guidanceShown: true,
      ),
      issueScope: SupportIssueScope(
        singleIssueConfirmed: true,
        separationGuidanceShown: true,
      ),
    );

    final intake = result.toBackendInput();
    expect(intake['caseType'], 'trust_safety');
    expect(intake['caseSubType'], 'immediate_physical_danger');
  });

  test('privacy category maps to the dedicated privacy owner route', () {
    const result = SupportFlowResult(
      mainCategory: 'privacy',
      subCategory: 'Auskunft oder Kopie meiner Daten',
      userDescription: 'Ich möchte eine Kopie meiner gespeicherten Daten.',
      context: _context,
      safetyTriage: SupportSafetyTriage(
        immediateDanger: false,
        guidanceShown: false,
      ),
      issueScope: SupportIssueScope(
        singleIssueConfirmed: true,
        separationGuidanceShown: false,
      ),
    );

    final intake = result.toBackendInput();
    expect(intake['caseType'], 'privacy_security');
    expect(intake['caseSubType'], 'access_or_copy_request');
    expect(intake['privacyRightsRequest'], {
      'version': 'sit_privacy_rights_request_v1',
      'requestKind': 'access',
    });
    final confirmed = result.withCanonicalCase(_canonicalCase(
      caseType: 'privacy_security',
      caseSubType: 'access_or_copy_request',
    ));
    expect(
      confirmed.canonicalReceiptMessage,
      contains('eigener Datenschutz-Fall'),
    );
    expect(
      confirmed.canonicalReceiptMessage,
      contains('Nächstes Update spätestens'),
    );
  });

  test('product-safety category maps structured evidence to the rapid route',
      () {
    const result = SupportFlowResult(
      mainCategory: 'product_safety',
      subCategory: 'Unfall oder Verletzung durch Produkt',
      userDescription:
          'Beim Einschalten trat Rauch aus und eine Hand wurde verletzt.',
      context: _context,
      safetyTriage: SupportSafetyTriage(
        immediateDanger: false,
        guidanceShown: false,
      ),
      issueScope: SupportIssueScope(
        singleIssueConfirmed: true,
        separationGuidanceShown: false,
      ),
      productSafetyNotice: SupportProductSafetyNotice(
        issueKind: 'accident_or_injury',
        productIdentification: 'Bohrmaschine Modell X',
        riskDescription:
            'Beim Einschalten trat Rauch aus und eine Hand wurde verletzt.',
        injuryOccurred: true,
        safetyGuidanceAcknowledged: true,
      ),
    );

    final intake = result.toBackendInput();
    expect(intake['caseType'], 'trust_safety');
    expect(intake['caseSubType'], 'dangerous_item_or_injury');
    expect(intake['productSafetyNotice'], {
      'version': 'sit_product_safety_intake_v1',
      'contactPointVersion': 'sit_product_safety_contact_point_v1',
      'issueKind': 'accident_or_injury',
      'productIdentification': 'Bohrmaschine Modell X',
      'riskDescription':
          'Beim Einschalten trat Rauch aus und eine Hand wurde verletzt.',
      'injuryOccurred': true,
      'safetyGuidanceAcknowledged': true,
    });

    final confirmed = result.withCanonicalCase(_canonicalCase(
      caseType: 'trust_safety',
      caseSubType: 'dangerous_item_or_injury',
      productSafetyNoticeNumber: 'SIT-P-ABCDEFGHJKLM',
    ));
    expect(confirmed.canonicalReceiptMessage,
        contains('Produktsicherheitsmeldung SIT-P-ABCDEFGHJKLM'));
    expect(confirmed.canonicalReceiptMessage,
        contains('keine technische oder rechtliche Bewertung'));
  });

  test(
      'DSA category creates an exact notice payload and requires its own server receipt',
      () {
    const result = SupportFlowResult(
      mainCategory: 'dsa_notice',
      subCategory: 'Anzeige / Artikel',
      userDescription:
          'Diese konkrete Anzeige verletzt nach meiner Einschätzung geltendes Recht.',
      context: _context,
      safetyTriage: SupportSafetyTriage(
        immediateDanger: false,
        guidanceShown: false,
      ),
      issueScope: SupportIssueScope(
        singleIssueConfirmed: true,
        separationGuidanceShown: false,
      ),
      dsaNotice: SupportDsaNotice(
        contentType: 'listing',
        contentLocator: 'listing:listing-1',
        illegalityStatement:
            'Diese konkrete Anzeige verletzt nach meiner Einschätzung geltendes Recht.',
        jurisdictionOrLegalBasis: 'Deutschland',
        goodFaithConfirmed: true,
      ),
    );

    final intake = result.toBackendInput();
    expect(intake['caseType'], 'moderation_content');
    expect(intake['caseSubType'], 'illegal_content_notice');
    expect(intake['dsaNotice'], {
      'version': 'sit_dsa_notice_intake_v1',
      'contentType': 'listing',
      'contentLocator': 'listing:listing-1',
      'illegalityStatement':
          'Diese konkrete Anzeige verletzt nach meiner Einschätzung geltendes Recht.',
      'jurisdictionOrLegalBasis': 'Deutschland',
      'goodFaithConfirmed': true,
    });

    expect(
      () => result.withCanonicalCase(_canonicalCase(
        caseType: 'moderation_content',
        caseSubType: 'illegal_content_notice',
      )),
      throwsFormatException,
    );
    final confirmed = result.withCanonicalCase(_canonicalCase(
      caseType: 'moderation_content',
      caseSubType: 'illegal_content_notice',
      dsaNoticeNumber: 'SIT-N-ABCDEFGHJKLM',
    ));
    expect(
        confirmed.canonicalReceiptMessage, contains('gesonderten DSA-Prüfweg'));
    expect(confirmed.canonicalReceiptMessage, contains('SIT-N-ABCDEFGHJKLM'));
    expect(
      confirmed.canonicalReceiptMessage,
      contains('noch keine Entscheidung über die Rechtswidrigkeit'),
    );
  });

  test(
      'DSA route fails closed on a mismatched content type or missing good-faith confirmation',
      () {
    SupportFlowResult result(SupportDsaNotice notice) => SupportFlowResult(
          mainCategory: 'dsa_notice',
          subCategory: 'Profil',
          userDescription:
              'Dieses konkrete Profil verletzt nach meiner Einschätzung geltendes Recht.',
          context: _context,
          safetyTriage: const SupportSafetyTriage(
            immediateDanger: false,
            guidanceShown: false,
          ),
          issueScope: const SupportIssueScope(
            singleIssueConfirmed: true,
            separationGuidanceShown: false,
          ),
          dsaNotice: notice,
        );

    expect(
      () => result(const SupportDsaNotice(
        contentType: 'listing',
        contentLocator: 'profile:user-1',
        illegalityStatement:
            'Dieses konkrete Profil verletzt nach meiner Einschätzung geltendes Recht.',
        goodFaithConfirmed: true,
      )).toBackendInput(),
      throwsFormatException,
    );
    expect(
      () => result(const SupportDsaNotice(
        contentType: 'profile',
        contentLocator: 'profile:user-1',
        illegalityStatement:
            'Dieses konkrete Profil verletzt nach meiner Einschätzung geltendes Recht.',
        goodFaithConfirmed: false,
      )).toBackendInput(),
      throwsFormatException,
    );
  });

  test('DSA category may be submitted without an exact locator', () {
    const result = SupportFlowResult(
      mainCategory: 'dsa_notice',
      subCategory: 'Nachricht / Chat',
      userDescription:
          'Diese konkrete Nachricht verletzt nach meiner Einschätzung geltendes Recht.',
      context: _context,
      safetyTriage: SupportSafetyTriage(
        immediateDanger: false,
        guidanceShown: false,
      ),
      issueScope: SupportIssueScope(
        singleIssueConfirmed: true,
        separationGuidanceShown: false,
      ),
      dsaNotice: SupportDsaNotice(
        contentType: 'message',
        contentLocator: '',
        illegalityStatement:
            'Diese konkrete Nachricht verletzt nach meiner Einschätzung geltendes Recht.',
        goodFaithConfirmed: true,
      ),
    );

    expect(result.toBackendInput()['dsaNotice']['contentLocator'], '');
    final confirmed = result.withCanonicalCase(_canonicalCase(
      caseType: 'moderation_content',
      caseSubType: 'illegal_content_notice',
      dsaNoticeNumber: 'SIT-N-ABCDEFGHJKLM',
      dsaNoticeLocatorStatus: 'needs_clarification',
    ));
    expect(confirmed.canonicalReceiptMessage, contains('bleibt gespeichert'));
  });

  testWidgets(
      'DSA category presents structured locator, reason and declaration fields',
      (tester) async {
    await _pumpFlow(tester);
    await tester.tap(
      find.byKey(const ValueKey('support_safety_answer_no_danger')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('support_issue_scope_single')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Rechtswidrigen Inhalt melden'),
      300,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('Rechtswidrigen Inhalt melden'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Anzeige / Artikel'));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('support_dsa_notice_fields')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('support_dsa_content_locator')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('support_dsa_illegality_statement')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('support_dsa_good_faith')),
      findsOneWidget,
    );
    expect(
      find.textContaining('auch ohne exakten Fundort absenden'),
      findsOneWidget,
    );
    expect(
        find.textContaining('keine automatische Entfernung'), findsOneWidget);
  });

  testWidgets(
      'product-safety contact requires structured safety acknowledgement',
      (tester) async {
    await _pumpFlow(tester);
    await tester.tap(
      find.byKey(const ValueKey('support_safety_answer_no_danger')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('support_issue_scope_single')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Produktsicherheit melden'),
      300,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('Produktsicherheit melden'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Möglicherweise gefährliches Produkt'));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('support_product_safety_fields')),
        findsOneWidget);
    expect(
      find.byKey(const ValueKey('support_product_safety_identification')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('support_product_safety_risk_description')),
      findsOneWidget,
    );
    expect(
      find.byKey(
          const ValueKey('support_product_safety_guidance_acknowledged')),
      findsOneWidget,
    );
    expect(find.textContaining('keine automatische Sperre'), findsOneWidget);
  });

  test('canonical receipt rejects unconfirmed or non-simulation responses', () {
    const result = SupportFlowResult(
      mainCategory: 'technical',
      subCategory: 'App lädt nicht',
      userDescription: '',
      context: _context,
      safetyTriage: SupportSafetyTriage(
        immediateDanger: false,
        guidanceShown: false,
      ),
      issueScope: SupportIssueScope(
        singleIssueConfirmed: true,
        separationGuidanceShown: false,
      ),
    );

    expect(
      () => result.withCanonicalCase({
        ..._canonicalCase(),
        'operatingMode': 'live',
      }),
      throwsFormatException,
    );
    expect(
      () => result.withCanonicalCase({
        ..._canonicalCase(),
        'caseType': 'privacy_security',
        'caseSubType': 'access_or_copy_request',
      }),
      throwsFormatException,
    );
    expect(
      () => result.withCanonicalCase({
        ..._canonicalCase(),
        'caseNumber': 'SIT-not-canonical',
      }),
      throwsFormatException,
    );
    final confirmed = result.withCanonicalCase(_canonicalCase());
    expect(confirmed.canonicalCaseNumber, 'SIT-ABCDEFGHJKLM');
    expect(confirmed.canonicalReceiptMessage, contains('Status: Eingegangen'));
    expect(
      confirmed.canonicalReceiptMessage,
      contains('21.08.2026, 18:00 Uhr (Europe/Berlin)'),
    );
    expect(
        confirmed.canonicalReceiptMessage, contains('keine externe Nachricht'));
  });

  testWidgets('submission creates a canonical case before returning a result',
      (tester) async {
    SupportFlowResult? captured;
    Map<String, dynamic>? capturedIntake;
    String? capturedKey;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
          builder: (context) => FilledButton(
                onPressed: () async {
                  captured =
                      await Navigator.of(context).push<SupportFlowResult>(
                    MaterialPageRoute(
                      builder: (_) => SupportFlowScreen(
                        context: _context,
                        submitter: (intake, idempotencyKey) async {
                          capturedIntake = intake;
                          capturedKey = idempotencyKey;
                          return _canonicalCase();
                        },
                      ),
                    ),
                  );
                },
                child: const Text('Support öffnen'),
              )),
    ));
    tester.view.physicalSize = const Size(900, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.tap(find.text('Support öffnen'));
    await tester.pumpAndSettle();
    await _selectTechnicalSubmission(tester);
    await tester.tap(find.text('An Support schicken'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byKey(const ValueKey('support_case_receipt')), findsOneWidget);
    expect(find.textContaining('SIT-ABCDEFGHJKLM'), findsWidgets);
    expect(capturedIntake?['caseType'], 'general_help');
    expect(capturedIntake?['caseSubType'], 'app_error_or_display');
    expect(capturedKey, startsWith('support_intake_'));
    expect(captured, isNull);

    await tester
        .tap(find.byKey(const ValueKey('support_case_receipt_continue')));
    await tester.pumpAndSettle();
    expect(captured?.canonicalCaseNumber, 'SIT-ABCDEFGHJKLM');
  });

  testWidgets('normal support intake creates a separate privacy case',
      (tester) async {
    Map<String, dynamic>? capturedIntake;
    await tester.pumpWidget(MaterialApp(
      home: SupportFlowScreen(
        context: _context,
        submitter: (intake, idempotencyKey) async {
          capturedIntake = intake;
          return _canonicalCase(
            caseType: 'privacy_security',
            caseSubType: 'correction_or_deletion_request',
          );
        },
      ),
    ));
    tester.view.physicalSize = const Size(900, 1500);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester
        .tap(find.byKey(const ValueKey('support_safety_answer_no_danger')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('support_issue_scope_single')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Datenschutz & Daten'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Daten berichtigen'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField),
      'Bitte prüft die Berichtigung meiner Profildaten.',
    );
    await tester.tap(find.text('An Support schicken'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(capturedIntake?['caseType'], 'privacy_security');
    expect(
      capturedIntake?['caseSubType'],
      'correction_or_deletion_request',
    );
    expect(capturedIntake?['privacyRightsRequest'], {
      'version': 'sit_privacy_rights_request_v1',
      'requestKind': 'rectification',
    });
    expect(find.byKey(const ValueKey('support_case_receipt')), findsOneWidget);
    expect(find.textContaining('eigener Datenschutz-Fall'), findsOneWidget);
  });

  testWidgets(
      'deposit request requires do-not-pay acknowledgement and uses dedicated endpoint',
      (tester) async {
    String? capturedBookingId;
    Map<String, dynamic>? capturedIntake;
    String? capturedKey;
    await tester.pumpWidget(MaterialApp(
      home: SupportFlowScreen(
        context: _context,
        handoverExceptionSubmitter: (bookingId, intake, idempotencyKey) async {
          capturedBookingId = bookingId;
          capturedIntake = intake;
          capturedKey = idempotencyKey;
          return _canonicalCase(
            caseType: 'trust_safety',
            caseSubType: 'offplatform_deposit_request',
          );
        },
      ),
    ));
    tester.view.physicalSize = const Size(900, 1700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester
        .tap(find.byKey(const ValueKey('support_safety_answer_no_danger')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('support_issue_scope_single')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Problem mit Übergabe'));
    await tester.pumpAndSettle();
    await tester
        .tap(find.text('Kaution oder Sicherheitszahlung wird verlangt'));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('support_handover_exception_fields')),
        findsOneWidget);
    expect(find.textContaining('keine automatische Sperre'), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('support_handover_exception_details')),
      'Die Gegenpartei verlangt vor Ort eine zusätzliche Barzahlung.',
    );
    await tester.pump();
    await tester.tap(find.text('An Support schicken'));
    await tester.pump();
    expect(capturedIntake, isNull);
    await tester.tap(
        find.byKey(const ValueKey('support_handover_do_not_pay_acknowledged')));
    await tester.pump();
    await tester.tap(find.text('An Support schicken'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(capturedBookingId, 'booking-1');
    expect(capturedIntake?['kind'], 'offplatform_deposit_request');
    expect(capturedIntake?['doNotPayGuidanceAcknowledged'], true);
    expect(capturedIntake?.containsKey('caseType'), isFalse);
    expect(capturedKey, startsWith('support_intake_'));
    expect(find.byKey(const ValueKey('support_case_receipt')), findsOneWidget);
  });

  testWidgets('failed submission stays open and retry reuses the same key',
      (tester) async {
    final keys = <String>[];
    var attempts = 0;
    await tester.pumpWidget(MaterialApp(
      home: SupportFlowScreen(
        context: _context,
        submitter: (intake, idempotencyKey) async {
          keys.add(idempotencyKey);
          attempts += 1;
          if (attempts == 1) throw StateError('controlled_failure');
          return _canonicalCase();
        },
      ),
    ));
    tester.view.physicalSize = const Size(900, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _selectTechnicalSubmission(tester);
    await tester.tap(find.text('An Support schicken'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.textContaining('wurde nicht bestätigt'), findsOneWidget);
    expect(find.byKey(const ValueKey('support_case_receipt')), findsNothing);

    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('An Support schicken'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byKey(const ValueKey('support_case_receipt')), findsOneWidget);
    expect(keys, hasLength(2));
    expect(keys[1], keys[0]);
  });
}
