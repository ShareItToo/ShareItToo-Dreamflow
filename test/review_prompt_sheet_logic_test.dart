import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/review_metrics_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/widgets/review_prompt_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  test('formular zeigt nur vier kriteriendefinitionen', () {
    final criteria = buildReviewFormCriteria();

    expect(criteria.length, 4);
    expect(criteria.map((c) => c.key).toList(), [
      ReviewMetricsService.communication,
      ReviewMetricsService.reliability,
      ReviewMetricsService.articleAsDescribed,
      ReviewMetricsService.handoverReturn,
    ]);
  });

  test('formular-hilfetexte enthalten die neuen fachlichen erklärungen', () {
    final criteria = {for (final c in buildReviewFormCriteria()) c.key: c};

    expect(
      criteria[ReviewMetricsService.articleAsDescribed]!.helpText,
      contains('nicht, ob der Artikel neu oder hochwertig war'),
    );
    expect(
      criteria[ReviewMetricsService.handoverReturn]!.helpText,
      contains(
          'Pünktlichkeit, Sauberkeit, Funktionsfähigkeit, Zubehör und Rückgabe'),
    );
  });

  test('button-logik bleibt bei 0 bis 3 bewerteten kriterien deaktiviert', () {
    expect(areAllReviewCriteriaRated(const [0, 0, 0, 0]), isFalse);
    expect(areAllReviewCriteriaRated(const [1, 0, 0, 0]), isFalse);
    expect(areAllReviewCriteriaRated(const [1, 1, 1, 0]), isFalse);
  });

  test('button-logik wird erst bei allen 4 kriterien aktiv', () {
    expect(areAllReviewCriteriaRated(const [1, 1, 1, 1]), isTrue);
    expect(areAllReviewCriteriaRated(const [5, 4, 5, 5]), isTrue);
  });

  testWidgets('needsReview blockiert prompt-anzeige mit SIT-popup', (
    tester,
  ) async {
    final owner = buildTestUser('owner-review-sheet', name: 'Walid');
    final renter = buildTestUser('renter-review-sheet', name: 'Julia');
    final item = buildTestItem(
      id: 'item-review-sheet',
      ownerId: owner.id,
    );
    final request = buildTestRequest(
      id: 'req-review-sheet',
      itemId: item.id,
      ownerId: owner.id,
      renterId: renter.id,
      status: 'completed',
      needsReview: true,
    );

    SharedPreferences.setMockInitialValues({
      'users': jsonEncode([owner.toJson(), renter.toJson()]),
      'items': jsonEncode([item.toJson()]),
      'rental_requests': jsonEncode([request.toJson()]),
      'multi_reviews_v1': '[]',
      'currentUser': jsonEncode(renter.toJson()),
      'auth_session_v1': jsonEncode(<String, Object>{
        'userId': renter.id,
        'email': renter.email,
        'createdAt': '2026-08-25T04:00:00.000Z',
      }),
    });

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                await ReviewPromptSheet.show(
                  context,
                  requestId: request.id,
                  itemId: item.id,
                  reviewerId: renter.id,
                  reviewedUserId: owner.id,
                  direction: 'renter_to_owner',
                );
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('open'));
    await tester.pump();

    expect(find.byType(ReviewPromptSheet), findsNothing);
    expect(
      find.text(
        'Bewertungen sind blockiert, solange dieser Fall geprüft wird.',
      ),
      findsOneWidget,
    );
  });

  testWidgets(
      'lokaler speicherfehler behält sheet und eingaben für retry offen',
      (tester) async {
    final owner = buildTestUser('owner-review-retry', name: 'Owner');
    final renter = buildTestUser('renter-review-retry', name: 'Renter');
    final item = buildTestItem(id: 'item-review-retry', ownerId: owner.id);
    final request = buildTestRequest(
      id: 'req-review-retry',
      itemId: item.id,
      ownerId: owner.id,
      renterId: renter.id,
      status: 'completed',
    );
    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': jsonEncode(<Object>[owner.toJson(), renter.toJson()]),
      'items': jsonEncode(<Object>[item.toJson()]),
      'rental_requests': jsonEncode(<Object>[request.toJson()]),
      'multi_reviews_v1': '[]',
      'currentUser': jsonEncode(renter.toJson()),
      'auth_session_v1': jsonEncode(<String, Object>{
        'userId': renter.id,
        'email': renter.email,
        'createdAt': '2026-08-25T12:00:00.000Z',
      }),
    });
    DataService.failNextReviewPersistenceForTesting();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ReviewPromptSheet(
          requestId: request.id,
          itemId: item.id,
          reviewerId: renter.id,
          reviewedUserId: owner.id,
          direction: ReviewMetricsService.renterToOwner,
        ),
      ),
    ));
    await tester.pump();

    for (final definition in buildReviewFormCriteria()) {
      final stars = find.byKey(ValueKey('review_${definition.key}_stars_5'));
      await tester.ensureVisible(stars);
      await tester.tap(stars);
      await tester.pump();
    }
    final note = find.byKey(const ValueKey('review_communication_note'));
    await tester.ensureVisible(note);
    await tester.enterText(note, 'Diese Eingabe bleibt erhalten');
    final submit = find.byKey(const ValueKey('review_submit_button'));
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();

    expect(find.byType(ReviewPromptSheet), findsOneWidget);
    expect(
        find.textContaining('Deine Eingaben bleiben erhalten'), findsOneWidget);
    expect(find.text('Diese Eingabe bleibt erhalten'), findsOneWidget);
    expect(find.text('Erneut versuchen'), findsOneWidget);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('multi_reviews_v1'), '[]');
  });
}
