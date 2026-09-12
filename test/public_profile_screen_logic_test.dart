import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/multi_criteria_review.dart';
import 'package:lendify/models/review.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/public_profile_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  User seededReviewUser(String id) => User(
        id: id,
        displayName: 'Seed $id',
        email: '$id@example.invalid',
        preferredLanguage: 'de-DE',
        isVerified: true,
        isBanned: false,
        role: 'user',
        avgRating: 5,
        reviewCount: 0,
        createdAt: DateTime(2025, 1, 1),
      );

  test('eigenes öffentliches profil zeigt nur Profil teilen', () {
    expect(
      buildPublicProfileMenuActions(
        isOwnProfile: true,
        isOwnPreview: false,
      ),
      const ['share_profile'],
    );
  });

  test('fremdes öffentliches profil zeigt melden teilen und blockieren', () {
    expect(
      buildPublicProfileMenuActions(
        isOwnProfile: false,
        isOwnPreview: false,
      ),
      const ['report_problem', 'share_profile', 'block_user'],
    );
  });

  test('eigene vorschau zeigt kein melden und kein blockieren', () {
    expect(
      buildPublicProfileMenuActions(
        isOwnProfile: false,
        isOwnPreview: true,
      ),
      const ['share_profile'],
    );
  });

  test('bio sektion nutzt Über mich und person outline', () {
    expect(publicProfileBioSectionLabel, 'Über mich');
    expect(publicProfileBioSectionIcon, Icons.person_outline);
    expect(publicProfileBioSectionLabel, isNot('Über'));
  });

  test('review preview copy uses compact author and item lines', () {
    expect(buildPublicProfileReviewAuthorLine('Julia'), 'Bewertung von Julia');
    expect(buildPublicProfileReviewItemLine('Bohrmaschine'), 'zu Bohrmaschine');
    expect(publicProfileReviewPreviewMaxLines, 3);
    expect(
      buildPublicProfileReviewItemLine('Bosch Trockner'),
      isNot('zu einer abgeschlossenen Anzeige'),
    );
  });

  test('criterion labels map only the new four criteria', () {
    expect(publicProfileReviewCriterionLabel('communication'), 'Kommunikation');
    expect(publicProfileReviewCriterionLabel('reliability'), 'Zuverlässigkeit');
    expect(publicProfileReviewCriterionLabel('article_as_described'),
        'Artikel wie beschrieben');
    expect(publicProfileReviewCriterionLabel('handover_return'),
        'Übergabe & Rückgabe');
    expect(publicProfileReviewCriterionLabel('description_accuracy'),
        'Artikel wie beschrieben');
    expect(publicProfileReviewCriterionLabel('process'), 'Übergabe & Rückgabe');
  });

  test('all reviews list is deduplicated and sorted newest first', () {
    ReviewWithUser entry(String id, int day) => ReviewWithUser(
          review: Review(
            id: id,
            reviewerId: 'r$id',
            reviewedUserId: 'u1',
            rating: 4.0,
            comment: 'Kommentar $id',
            createdAt: DateTime(2026, 7, day),
          ),
          reviewer: null,
          multiReview: MultiCriteriaReview(
            id: 'mc_$id',
            requestId: 'req_$id',
            itemId: 'item_$id',
            reviewerId: 'r$id',
            reviewedUserId: 'u1',
            direction: 'renter_to_owner',
            criteria: const [
              ReviewCriterion(key: 'communication', stars: 5),
              ReviewCriterion(key: 'reliability', stars: 4),
              ReviewCriterion(key: 'article_as_described', stars: 5),
              ReviewCriterion(key: 'handover_return', stars: 5),
            ],
            createdAt: DateTime(2026, 7, day),
          ),
        );

    final list = buildAllPublicProfileReviews([
      entry('a', 2),
      entry('b', 5),
      entry('a', 4),
      entry('c', 3),
    ]);

    expect(list.map((e) => e.review.id).toList(), ['b', 'a', 'c']);
  });

  test(
      'criteria aggregates use only the new four keys with correct averages and counts',
      () {
    ReviewWithUser review({
      required String id,
      required int day,
      required List<ReviewCriterion> criteria,
    }) =>
        ReviewWithUser(
          review: Review(
            id: id,
            reviewerId: 'reviewer_$id',
            reviewedUserId: 'u1',
            rating: 4.5,
            comment: 'Kommentar $id',
            createdAt: DateTime(2026, 7, day),
          ),
          reviewer: null,
          item: Item(
            id: 'item_$id',
            ownerId: 'owner',
            title: 'Artikel $id',
            description: 'desc',
            categoryId: 'cat',
            subcategory: 'sub',
            tags: const [],
            condition: 'good',
            pricePerDay: 10,
            currency: 'EUR',
            locationText: 'Berlin',
            lat: 0,
            lng: 0,
            geohash: 'u33',
            photos: const [],
            createdAt: DateTime(2026, 7, day),
            isActive: true,
            verificationStatus: 'verified',
            city: 'Berlin',
            country: 'DE',
          ),
          multiReview: MultiCriteriaReview(
            id: 'mc_$id',
            requestId: 'req_$id',
            itemId: 'item_$id',
            reviewerId: 'reviewer_$id',
            reviewedUserId: 'u1',
            direction: 'renter_to_owner',
            criteria: criteria,
            createdAt: DateTime(2026, 7, day),
          ),
        );

    final aggregates = buildPublicProfileCriterionAggregates([
      review(
        id: 'one',
        day: 1,
        criteria: const [
          ReviewCriterion(key: 'communication', stars: 5),
          ReviewCriterion(key: 'reliability', stars: 4),
          ReviewCriterion(key: 'article_as_described', stars: 5),
          ReviewCriterion(key: 'handover_return', stars: 4),
        ],
      ),
      review(
        id: 'two',
        day: 3,
        criteria: const [
          ReviewCriterion(key: 'communication', stars: 4),
          ReviewCriterion(key: 'reliability', stars: 5),
          ReviewCriterion(key: 'article_as_described', stars: 4),
          ReviewCriterion(key: 'handover_return', stars: 5),
        ],
      ),
      review(
        id: 'one',
        day: 2,
        criteria: const [
          ReviewCriterion(key: 'communication', stars: 1),
          ReviewCriterion(key: 'reliability', stars: 1),
          ReviewCriterion(key: 'article_as_described', stars: 1),
          ReviewCriterion(key: 'handover_return', stars: 1),
        ],
      ),
    ]);

    expect(
      aggregates.map((e) => e.key).toList(),
      [
        'communication',
        'reliability',
        'article_as_described',
        'handover_return'
      ],
    );
    expect(aggregates[0].average, 2.5);
    expect(aggregates[0].count, 2);
    expect(aggregates[1].average, 3.0);
    expect(aggregates[1].count, 2);
    expect(aggregates[2].average, 2.5);
    expect(aggregates[2].count, 2);
    expect(aggregates[3].average, 3.0);
    expect(aggregates[3].count, 2);
  });

  test(
      'seeded classic reviews carry only the new four criteria for popup details',
      () async {
    final viewer = User(
      id: 'u2',
      displayName: 'Viewer',
      email: 'viewer@example.com',
      preferredLanguage: 'de-DE',
      isVerified: true,
      isBanned: false,
      role: 'user',
      avgRating: 5.0,
      reviewCount: 2,
      createdAt: DateTime(2025, 1, 1),
    );
    SharedPreferences.setMockInitialValues({
      'current_user': jsonEncode(viewer.toJson()),
      'users': jsonEncode([
        seededReviewUser('u1').toJson(),
        viewer.toJson(),
        seededReviewUser('u7').toJson(),
      ]),
      'reviews': jsonEncode([
        Review(
          id: 'r1',
          reviewerId: 'u1',
          reviewedUserId: 'u2',
          rating: 4.9,
          comment:
              'Werkzeug war in Top-Zustand, Übergabe super flexibel.',
          createdAt: DateTime.utc(2026, 8, 1),
        ).toJson(),
      ]),
    });

    final reviews = await DataService.getReviewSummariesForUser('u2');
    expect(reviews, isNotEmpty);
    final first = reviews.firstWhere((entry) => entry.review.id == 'r1');
    expect(first.multiReview, isNotNull);
    expect(first.multiReview!.criteria, hasLength(4));
    expect(
      first.multiReview!.criteria.map((c) => c.key),
      [
        'communication',
        'reliability',
        'article_as_described',
        'handover_return'
      ],
    );
  });

  testWidgets('compact review card keeps tap behavior', (tester) async {
    var tapped = false;

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData(
          useMaterial3: false,
          splashFactory: NoSplash.splashFactory,
        ),
        home: Scaffold(
          body: PublicProfileCompactReviewCard(
            reviewerName: 'Julia',
            avatarUrl: null,
            itemImageUrl: null,
            itemTitle: 'Bohrmaschine',
            reviewComment: 'Sehr zuverlässig und freundlich.',
            rating: 4.8,
            onTap: () => tapped = true,
          ),
        ),
      ),
    );

    await tester.tap(find.byType(PublicProfileCompactReviewCard));
    await tester.pump();

    expect(find.text('Bewertung von Julia'), findsOneWidget);
    expect(find.text('zu Bohrmaschine'), findsOneWidget);
    expect(find.text('Sehr zuverlässig und freundlich.'), findsOneWidget);
    expect(tapped, isTrue);
  });

  testWidgets('review details render directly with fallback note when needed', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PublicProfileReviewDetailsInline(
            criteria: const [],
          ),
        ),
      ),
    );

    expect(
      find.text(
          'Für diese Bewertung wurden keine einzelnen Kriterien gespeichert.'),
      findsOneWidget,
    );
  });

  testWidgets('detailansicht zeigt weiterhin alle einzelkommentare',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PublicProfileReviewDetailsInline(
            criteria: const [
              ReviewCriterion(
                key: 'communication',
                stars: 5,
                note: 'Sehr schnelle Rückmeldung',
              ),
              ReviewCriterion(
                key: 'reliability',
                stars: 4,
                note: 'Pünktlich und verbindlich',
              ),
              ReviewCriterion(
                key: 'article_as_described',
                stars: 5,
                note: 'Genau wie inseriert',
              ),
              ReviewCriterion(
                key: 'handover_return',
                stars: 5,
                note: 'Saubere Rückgabe',
              ),
            ],
          ),
        ),
      ),
    );

    expect(find.text('Sehr schnelle Rückmeldung'), findsOneWidget);
    expect(find.text('Pünktlich und verbindlich'), findsOneWidget);
    expect(find.text('Genau wie inseriert'), findsOneWidget);
    expect(find.text('Saubere Rückgabe'), findsOneWidget);
  });

  testWidgets('kompakte karte blendet leeren kommentartest aus',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData(
          useMaterial3: false,
          splashFactory: NoSplash.splashFactory,
        ),
        home: Scaffold(
          body: PublicProfileCompactReviewCard(
            reviewerName: 'Julia',
            avatarUrl: null,
            itemImageUrl: null,
            itemTitle: 'Bohrmaschine',
            reviewComment: '',
            rating: 4.8,
            onTap: () {},
          ),
        ),
      ),
    );

    expect(find.text('Bewertung von Julia'), findsOneWidget);
    expect(find.text('zu Bohrmaschine'), findsOneWidget);
    expect(find.text(''), findsNothing);
  });
}
