import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/moderation_decisions_screen.dart';

Map<String, dynamic> _decision({
  Object? statement,
  Map<String, dynamic>? reviewRequest,
}) =>
    {
      'id': 'decision-1',
      'measureType': 'listing_restriction',
      'measureState': 'hidden',
      'facts': 'Die geprüfte Anzeige enthält eine unzulässige Angabe.',
      'basis': 'Community-Regel 4.2',
      'reasoning': 'Die konkrete Angabe fällt unter diese Regel.',
      'detectionMethod': 'human',
      'automatedMeans': null,
      'reviewAvailable': true,
      'reviewDeadlineAt': '2099-02-22T10:00:00.000Z',
      'createdAt': '2026-08-22T10:00:00.000Z',
      'statementOfReasons': statement,
      'reviewRequest': reviewRequest,
    };

Map<String, dynamic> _statement() => {
      'version': 'sit_dsa_statement_of_reasons_v1',
      'decisionGround': 'terms_violation',
      'decisionOrigin': 'notice',
      'territorialScope':
          'Alle SIT-Oberflächen; keine geografische Teilbeschränkung.',
      'durationType': 'until_reversed',
      'startsAt': '2026-08-22T10:00:00.000Z',
      'endsAt': null,
      'automationRole': 'none',
      'humanReviewed': true,
      'reviewChannel': 'authenticated_in_app',
      'publishedAt': '2026-08-22T10:00:00.000Z',
    };

void main() {
  testWidgets('shows an exact Statement and submits the free review request', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(900, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    String? capturedId;
    String? capturedReason;
    await tester.pumpWidget(
      MaterialApp(
        home: ModerationDecisionsScreen(
          loader: () async => [_decision(statement: _statement())],
          reviewSubmitter: (decisionId, reason) async {
            capturedId = decisionId;
            capturedReason = reason;
            return {
              'id': 'review-1',
              'decisionId': decisionId,
              'status': 'submitted',
            };
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Einschränkung einer Anzeige'), findsOneWidget);
    expect(find.text('Die Anzeige wurde ausgeblendet.'), findsOneWidget);
    expect(find.text('Community-Regel 4.2'), findsOneWidget);
    expect(
      find.textContaining('Bis zu einer dokumentierten Aufhebung'),
      findsOneWidget,
    );
    expect(find.textContaining('Keine automatisierten Mittel'), findsOneWidget);
    expect(find.text('Menschliche Prüfung beantragen'), findsOneWidget);

    await tester.tap(find.text('Menschliche Prüfung beantragen'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('moderation-review-reason')),
      'Bitte berücksichtigt den beigefügten Kontext erneut.',
    );
    await tester.tap(find.text('Kostenlos einreichen'));
    await tester.pumpAndSettle();

    expect(capturedId, 'decision-1');
    expect(
      capturedReason,
      'Bitte berücksichtigt den beigefügten Kontext erneut.',
    );
    expect(find.text('Prüfung eingereicht'), findsWidgets);
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('fails closed for an incomplete or unverified Statement', (
    tester,
  ) async {
    final incomplete = _statement()..remove('humanReviewed');
    await tester.pumpWidget(
      MaterialApp(
        home: ModerationDecisionsScreen(
          loader: () async => [_decision(statement: incomplete)],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.textContaining('keine vollständig bestätigte digitale Begründung'),
      findsOneWidget,
    );
    expect(find.text('Community-Regel 4.2'), findsNothing);
    expect(find.text('Menschliche Prüfung beantragen'), findsOneWidget);
  });

  testWidgets('does not mislabel a report resolution as a missing Statement', (
    tester,
  ) async {
    final reportResolution = _decision(statement: null)
      ..['measureType'] = 'report_resolution'
      ..['measureState'] = 'dismissed';
    await tester.pumpWidget(
      MaterialApp(
        home: ModerationDecisionsScreen(
          loader: () async => [reportResolution],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.textContaining('keine vollständig bestätigte digitale Begründung'),
      findsNothing,
    );
    expect(find.text('Community-Regel 4.2'), findsOneWidget);
    expect(find.text('Entscheidung zu einer Meldung'), findsOneWidget);
  });

  testWidgets('shows only a verified independent human review resolution', (
    tester,
  ) async {
    final reviewRequest = <String, dynamic>{
      'id': 'review-1',
      'status': 'reversed',
      'submittedAt': '2026-08-22T10:30:00.000Z',
      'resolvedAt': '2026-08-22T11:00:00.000Z',
      'resolution': 'Die Anzeige wurde wiederhergestellt.',
      'resolutionDetails': {
        'outcome': 'reversed',
        'userFacingReason': 'Die Anzeige wurde wiederhergestellt.',
        'humanReviewed': true,
        'independent': true,
        'automationRole': 'none',
        'measureChanged': true,
        'communicatedAt': '2026-08-22T11:00:00.000Z',
      },
    };
    await tester.pumpWidget(
      MaterialApp(
        home: ModerationDecisionsScreen(
          loader: () async => [
            _decision(
              statement: _statement(),
              reviewRequest: reviewRequest,
            ),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Entscheidung aufgehoben'), findsOneWidget);
    expect(find.text('Die Anzeige wurde wiederhergestellt.'), findsOneWidget);
    expect(find.textContaining('ausschließlich menschlich geprüft'),
        findsOneWidget);
    expect(find.textContaining('technisch umgesetzt'), findsOneWidget);

    reviewRequest['resolutionDetails'] = {
      ...reviewRequest['resolutionDetails'] as Map<String, dynamic>,
      'independent': false,
    };
    await tester.pumpWidget(
      MaterialApp(
        home: ModerationDecisionsScreen(
          loader: () async => [
            _decision(
              statement: _statement(),
              reviewRequest: reviewRequest,
            ),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Prüfergebnis noch nicht vollständig bestätigt'),
      findsOneWidget,
    );
    expect(find.text('Die Anzeige wurde wiederhergestellt.'), findsNothing);
  });
}
