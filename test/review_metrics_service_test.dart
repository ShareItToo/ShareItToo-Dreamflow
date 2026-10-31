import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/multi_criteria_review.dart';
import 'package:lendify/models/review.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/public_profile_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/review_metrics_service.dart';
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

  Map<String, Object> reviewSession(String userId) {
    final user = seededReviewUser(userId);
    return <String, Object>{
      'currentUser': jsonEncode(user.toJson()),
      'auth_session_v1': jsonEncode(<String, Object>{
        'userId': user.id,
        'email': user.email,
        'createdAt': '2026-08-25T12:00:00.000Z',
      }),
    };
  }

  MultiCriteriaReview buildReview({
    required String id,
    required String reviewedUserId,
    required DateTime createdAt,
    required String direction,
    required List<ReviewCriterion> criteria,
  }) {
    return MultiCriteriaReview(
      id: id,
      requestId: 'req_$id',
      itemId: 'item_$id',
      reviewerId: 'reviewer_$id',
      reviewedUserId: reviewedUserId,
      direction: direction,
      criteria: criteria,
      createdAt: createdAt,
    );
  }

  ReviewWithUser buildEntry(MultiCriteriaReview review) {
    final rating = ReviewMetricsService.calculateReviewScore(review) ?? 0.0;
    return ReviewWithUser(
      review: Review(
        id: review.id,
        reviewerId: review.reviewerId,
        reviewedUserId: review.reviewedUserId,
        rating: rating,
        comment: 'Kommentar ${review.id}',
        createdAt: review.createdAt,
      ),
      reviewer: null,
      requestId: review.requestId,
      multiReview: review,
    );
  }

  test(
      'single review score is calculated from exactly four criteria and rounded to one decimal',
      () {
    final review = buildReview(
      id: 'one',
      reviewedUserId: 'u1',
      createdAt: DateTime(2026, 7, 24),
      direction: 'renter_to_owner',
      criteria: const [
        ReviewCriterion(key: 'communication', stars: 5),
        ReviewCriterion(key: 'reliability', stars: 4),
        ReviewCriterion(key: 'article_as_described', stars: 5),
        ReviewCriterion(key: 'handover_return', stars: 5),
      ],
    );

    expect(ReviewMetricsService.calculateReviewScore(review), 4.8);
  });

  test('legacy fields are migrated into the new four-criteria calculation', () {
    final legacyReview = buildReview(
      id: 'legacy',
      reviewedUserId: 'u1',
      createdAt: DateTime(2026, 7, 24),
      direction: 'renter_to_owner',
      criteria: const [
        ReviewCriterion(key: 'communication', stars: 5),
        ReviewCriterion(key: 'condition_dropoff', stars: 2),
        ReviewCriterion(key: 'description_accuracy', stars: 4),
        ReviewCriterion(key: 'reliability', stars: 4),
        ReviewCriterion(key: 'value_for_money', stars: 1),
        ReviewCriterion(key: 'process', stars: 5),
      ],
    );

    final normalized = ReviewMetricsService.normalizeReview(legacyReview);

    expect(
      normalized.criteria.map((criterion) => criterion.key).toList(),
      [
        'communication',
        'reliability',
        'article_as_described',
        'handover_return',
      ],
    );
    expect(ReviewMetricsService.calculateReviewScore(normalized), 4.5);
  });

  test(
      'user summary average, criterion averages, count, and dedupe are consistent',
      () {
    final olderDuplicate = buildEntry(buildReview(
      id: 'dup',
      reviewedUserId: 'u1',
      createdAt: DateTime(2026, 7, 20),
      direction: 'renter_to_owner',
      criteria: const [
        ReviewCriterion(key: 'communication', stars: 1),
        ReviewCriterion(key: 'reliability', stars: 1),
        ReviewCriterion(key: 'article_as_described', stars: 1),
        ReviewCriterion(key: 'handover_return', stars: 1),
      ],
    ));
    final newerDuplicate = buildEntry(buildReview(
      id: 'dup',
      reviewedUserId: 'u1',
      createdAt: DateTime(2026, 7, 22),
      direction: 'renter_to_owner',
      criteria: const [
        ReviewCriterion(key: 'communication', stars: 5),
        ReviewCriterion(key: 'reliability', stars: 4),
        ReviewCriterion(key: 'article_as_described', stars: 5),
        ReviewCriterion(key: 'handover_return', stars: 5),
      ],
    ));
    final second = buildEntry(buildReview(
      id: 'two',
      reviewedUserId: 'u1',
      createdAt: DateTime(2026, 7, 23),
      direction: 'renter_to_owner',
      criteria: const [
        ReviewCriterion(key: 'communication', stars: 5),
        ReviewCriterion(key: 'reliability', stars: 5),
        ReviewCriterion(key: 'article_as_described', stars: 5),
        ReviewCriterion(key: 'handover_return', stars: 5),
      ],
    ));
    final incomplete = ReviewWithUser(
      review: Review(
        id: 'bad',
        reviewerId: 'reviewer_bad',
        reviewedUserId: 'u1',
        rating: 2.0,
        comment: 'bad',
        createdAt: DateTime(2026, 7, 24),
      ),
      reviewer: null,
      multiReview: buildReview(
        id: 'bad',
        reviewedUserId: 'u1',
        createdAt: DateTime(2026, 7, 24),
        direction: 'renter_to_owner',
        criteria: const [
          ReviewCriterion(key: 'communication', stars: 5),
          ReviewCriterion(key: 'reliability', stars: 5),
        ],
      ),
    );

    final summary = ReviewMetricsService.calculateUserSummary([
      olderDuplicate,
      newerDuplicate,
      second,
      incomplete,
    ]);

    expect(summary.reviewCount, 2);
    expect(summary.reviews.map((entry) => entry.review.id).toList(),
        ['two', 'dup']);
    expect(summary.averageRating, 4.9);

    final byKey = {
      for (final item in summary.criterionAverages) item.key: item
    };
    expect(byKey['communication']!.average, 5.0);
    expect(byKey['communication']!.count, 2);
    expect(byKey['article_as_described']!.average, 5.0);
    expect(byKey['article_as_described']!.count, 2);
    expect(byKey['handover_return']!.average, 5.0);
    expect(byKey['handover_return']!.count, 2);
  });

  test('validation rejects incomplete or invalid reviews', () {
    final invalid = buildReview(
      id: 'x',
      reviewedUserId: 'u1',
      createdAt: DateTime(2026, 7, 24),
      direction: 'owner_to_renter',
      criteria: const [
        ReviewCriterion(key: 'communication', stars: 5),
        ReviewCriterion(key: 'reliability', stars: 5),
      ],
    );

    expect(ReviewMetricsService.isRegularCompleteReview(invalid), isFalse);
  });

  test('qa seeds are consistent and all summary surfaces use the same values',
      () async {
    final viewer = User(
      id: 'u2',
      displayName: 'Viewer',
      email: 'viewer@example.com',
      preferredLanguage: 'de-DE',
      isVerified: true,
      isBanned: false,
      role: 'user',
      avgRating: 0,
      reviewCount: 0,
      createdAt: DateTime(2025, 1, 1),
    );
    SharedPreferences.setMockInitialValues({
      'current_user': jsonEncode(viewer.toJson()),
      'users': jsonEncode([
        seededReviewUser('u1').toJson(),
        viewer.toJson(),
        seededReviewUser('u7').toJson(),
      ]),
      'reviews': jsonEncode(<Object>[
        Review(
          id: 'r1',
          reviewerId: 'u1',
          reviewedUserId: 'u2',
          rating: 5,
          comment: 'Explizites QA-Fixture 1',
          createdAt: DateTime.utc(2026, 7, 23),
        ).toJson(),
        Review(
          id: 'r2',
          reviewerId: 'u7',
          reviewedUserId: 'u2',
          rating: 5,
          comment: 'Explizites QA-Fixture 2',
          createdAt: DateTime.utc(2026, 7, 24),
        ).toJson(),
      ]),
    });

    final reviews = await DataService.getReviewSummariesForUser('u2');
    final summary = ReviewMetricsService.calculateUserSummary(reviews);
    final cardSummary = buildAllPublicProfileReviews(reviews);
    final criteriaSummary = buildPublicProfileCriterionAggregates(reviews);

    expect(summary.reviewCount, 2);
    expect(summary.averageRating, 5.0);
    expect(cardSummary.length, 2);
    expect(cardSummary.first.review.rating, 5.0);
    expect(cardSummary.last.review.rating, 5.0);
    expect(
      criteriaSummary.map((entry) => entry.key).toList(),
      [
        'communication',
        'reliability',
        'article_as_described',
        'handover_return'
      ],
    );
  });

  test(
      'review submission is allowed only for completed bookings and prevented twice per reviewer',
      () async {
    final request = RentalRequest(
      id: 'req_live',
      itemId: 'item_live',
      ownerId: 'owner_live',
      renterId: 'renter_live',
      start: DateTime(2026, 7, 1),
      end: DateTime(2026, 7, 2),
      status: 'completed',
      createdAt: DateTime(2026, 7, 1),
    );
    SharedPreferences.setMockInitialValues({
      'rental_requests': jsonEncode([request.toJson()]),
      'multi_reviews_v1': jsonEncode([]),
      ...reviewSession('renter_live'),
    });

    final created = await DataService.addMultiReview(
      requestId: 'req_live',
      itemId: 'item_live',
      reviewerId: 'renter_live',
      reviewedUserId: 'owner_live',
      direction: 'renter_to_owner',
      criteria: const [
        ReviewCriterion(key: 'communication', stars: 5),
        ReviewCriterion(key: 'reliability', stars: 4),
        ReviewCriterion(key: 'article_as_described', stars: 5),
        ReviewCriterion(key: 'handover_return', stars: 5),
      ],
    );

    expect(created.criteria.map((c) => c.key).toList(), [
      'communication',
      'reliability',
      'article_as_described',
      'handover_return',
    ]);

    await expectLater(
      () => DataService.addMultiReview(
        requestId: 'req_live',
        itemId: 'item_live',
        reviewerId: 'renter_live',
        reviewedUserId: 'owner_live',
        direction: 'renter_to_owner',
        criteria: const [
          ReviewCriterion(key: 'communication', stars: 5),
          ReviewCriterion(key: 'reliability', stars: 5),
          ReviewCriterion(key: 'article_as_described', stars: 5),
          ReviewCriterion(key: 'handover_return', stars: 5),
        ],
      ),
      throwsA(isA<StateError>()),
    );
  });

  test('review submission rejects non-completed booking contexts', () async {
    final request = RentalRequest(
      id: 'req_pending',
      itemId: 'item_pending',
      ownerId: 'owner_live',
      renterId: 'renter_live',
      start: DateTime(2026, 7, 1),
      end: DateTime(2026, 7, 2),
      status: 'accepted',
      createdAt: DateTime(2026, 7, 1),
    );
    SharedPreferences.setMockInitialValues({
      'rental_requests': jsonEncode([request.toJson()]),
      'multi_reviews_v1': jsonEncode([]),
      ...reviewSession('renter_live'),
    });

    await expectLater(
      () => DataService.addMultiReview(
        requestId: 'req_pending',
        itemId: 'item_pending',
        reviewerId: 'renter_live',
        reviewedUserId: 'owner_live',
        direction: 'renter_to_owner',
        criteria: const [
          ReviewCriterion(key: 'communication', stars: 5),
          ReviewCriterion(key: 'reliability', stars: 4),
          ReviewCriterion(key: 'article_as_described', stars: 5),
          ReviewCriterion(key: 'handover_return', stars: 5),
        ],
      ),
      throwsA(isA<StateError>()),
    );
  });

  test('needsReview blockiert review-erstellung auch per service-pfad',
      () async {
    final request = RentalRequest(
      id: 'req_review_hold',
      itemId: 'item_review_hold',
      ownerId: 'owner_review_hold',
      renterId: 'renter_review_hold',
      start: DateTime(2026, 7, 1),
      end: DateTime(2026, 7, 2),
      status: 'completed',
      needsReview: true,
      createdAt: DateTime(2026, 7, 1),
    );
    SharedPreferences.setMockInitialValues({
      'rental_requests': jsonEncode([request.toJson()]),
      'multi_reviews_v1': jsonEncode([]),
      ...reviewSession('renter_review_hold'),
    });

    await expectLater(
      () => DataService.addMultiReview(
        requestId: 'req_review_hold',
        itemId: 'item_review_hold',
        reviewerId: 'renter_review_hold',
        reviewedUserId: 'owner_review_hold',
        direction: 'renter_to_owner',
        criteria: const [
          ReviewCriterion(key: 'communication', stars: 5, note: 'Schnell'),
          ReviewCriterion(key: 'reliability', stars: 4, note: 'Pünktlich'),
          ReviewCriterion(
            key: 'article_as_described',
            stars: 5,
            note: 'Wie beschrieben',
          ),
          ReviewCriterion(
            key: 'handover_return',
            stars: 5,
            note: 'Sauber zurück',
          ),
        ],
      ),
      throwsA(
        isA<StateError>().having(
          (e) => e.message,
          'message',
          contains('under review'),
        ),
      ),
    );
  });

  test(
      'vollständige review wird gespeichert und unvollständige technisch blockiert',
      () async {
    final request = RentalRequest(
      id: 'req_save',
      itemId: 'item_save',
      ownerId: 'owner_save',
      renterId: 'renter_save',
      start: DateTime(2026, 7, 1),
      end: DateTime(2026, 7, 2),
      status: 'completed',
      createdAt: DateTime(2026, 7, 1),
    );
    SharedPreferences.setMockInitialValues({
      'rental_requests': jsonEncode([request.toJson()]),
      'multi_reviews_v1': jsonEncode([]),
      ...reviewSession('renter_save'),
    });

    await expectLater(
      () => DataService.addMultiReview(
        requestId: 'req_save',
        itemId: 'item_save',
        reviewerId: 'renter_save',
        reviewedUserId: 'owner_save',
        direction: 'renter_to_owner',
        criteria: const [
          ReviewCriterion(key: 'communication', stars: 5),
          ReviewCriterion(key: 'reliability', stars: 4),
          ReviewCriterion(key: 'article_as_described', stars: 5),
        ],
      ),
      throwsA(isA<ArgumentError>()),
    );

    final created = await DataService.addMultiReview(
      requestId: 'req_save',
      itemId: 'item_save',
      reviewerId: 'renter_save',
      reviewedUserId: 'owner_save',
      direction: 'renter_to_owner',
      criteria: const [
        ReviewCriterion(key: 'communication', stars: 5, note: 'Schnell'),
        ReviewCriterion(key: 'reliability', stars: 4, note: 'Pünktlich'),
        ReviewCriterion(
            key: 'article_as_described', stars: 5, note: 'Wie beschrieben'),
        ReviewCriterion(
            key: 'handover_return', stars: 5, note: 'Sauber zurück'),
      ],
    );

    expect(created.id, isNotEmpty);
    expect(created.criteria, hasLength(4));
  });

  test('zuverlässigkeitskommentar wird in der kartenvorschau bevorzugt',
      () async {
    final request = RentalRequest(
      id: 'req_preview',
      itemId: 'item_preview',
      ownerId: 'owner_preview',
      renterId: 'renter_preview',
      start: DateTime(2026, 7, 1),
      end: DateTime(2026, 7, 2),
      status: 'completed',
      createdAt: DateTime(2026, 7, 1),
    );
    final review = MultiCriteriaReview(
      id: '501',
      requestId: 'req_preview',
      itemId: 'item_preview',
      reviewerId: 'renter_preview',
      reviewedUserId: 'owner_preview',
      direction: 'renter_to_owner',
      criteria: const [
        ReviewCriterion(
            key: 'communication', stars: 5, note: 'Schnelle Abstimmung'),
        ReviewCriterion(
            key: 'reliability', stars: 4, note: 'Pünktlich vor Ort'),
        ReviewCriterion(
            key: 'article_as_described',
            stars: 5,
            note: 'Genau wie beschrieben'),
        ReviewCriterion(
            key: 'handover_return', stars: 5, note: 'Alles sauber zurück'),
      ],
      createdAt: DateTime(2026, 7, 2),
    );
    final owner = User(
      id: 'owner_preview',
      displayName: 'Owner',
      email: 'owner@example.com',
      preferredLanguage: 'de-DE',
      isVerified: true,
      isBanned: false,
      role: 'user',
      avgRating: 0,
      reviewCount: 0,
      createdAt: DateTime(2025, 1, 1),
    );
    final reviewer = User(
      id: 'renter_preview',
      displayName: 'Reviewer',
      email: 'reviewer@example.com',
      preferredLanguage: 'de-DE',
      isVerified: true,
      isBanned: false,
      role: 'user',
      avgRating: 0,
      reviewCount: 0,
      createdAt: DateTime(2025, 1, 1),
    );

    SharedPreferences.setMockInitialValues({
      'rental_requests': jsonEncode([request.toJson()]),
      'multi_reviews_v1': jsonEncode([review.toJson()]),
      'users_v2': jsonEncode([owner.toJson(), reviewer.toJson()]),
      'items_v3': jsonEncode([]),
    });

    final summaries =
        await DataService.getReviewSummariesForUser('owner_preview');
    final entry = summaries.singleWhere((item) => item.review.id == 'mc_501');

    expect(entry.review.comment, 'Pünktlich vor Ort');
    expect(entry.review.comment, isNot(contains('Zuverlässigkeit:')));
    expect(entry.review.comment, isNot(contains(' · ')));
  });

  test('fallback-reihenfolge der kartenvorschau funktioniert', () async {
    final request = RentalRequest(
      id: 'req_preview_fallback',
      itemId: 'item_preview_fallback',
      ownerId: 'owner_preview_fallback',
      renterId: 'renter_preview_fallback',
      start: DateTime(2026, 7, 1),
      end: DateTime(2026, 7, 2),
      status: 'completed',
      createdAt: DateTime(2026, 7, 1),
    );
    final review = MultiCriteriaReview(
      id: '502',
      requestId: 'req_preview_fallback',
      itemId: 'item_preview_fallback',
      reviewerId: 'renter_preview_fallback',
      reviewedUserId: 'owner_preview_fallback',
      direction: 'renter_to_owner',
      criteria: const [
        ReviewCriterion(
            key: 'communication', stars: 5, note: 'Kommunikation zuletzt'),
        ReviewCriterion(key: 'reliability', stars: 4),
        ReviewCriterion(
            key: 'article_as_described', stars: 5, note: 'Artikel fallback'),
        ReviewCriterion(
            key: 'handover_return', stars: 5, note: 'Übergabe fallback'),
      ],
      createdAt: DateTime(2026, 7, 2),
    );
    final owner = User(
      id: 'owner_preview_fallback',
      displayName: 'Owner',
      email: 'owner2@example.com',
      preferredLanguage: 'de-DE',
      isVerified: true,
      isBanned: false,
      role: 'user',
      avgRating: 0,
      reviewCount: 0,
      createdAt: DateTime(2025, 1, 1),
    );
    final reviewer = User(
      id: 'renter_preview_fallback',
      displayName: 'Reviewer',
      email: 'reviewer2@example.com',
      preferredLanguage: 'de-DE',
      isVerified: true,
      isBanned: false,
      role: 'user',
      avgRating: 0,
      reviewCount: 0,
      createdAt: DateTime(2025, 1, 1),
    );

    SharedPreferences.setMockInitialValues({
      'rental_requests': jsonEncode([request.toJson()]),
      'multi_reviews_v1': jsonEncode([review.toJson()]),
      'users_v2': jsonEncode([owner.toJson(), reviewer.toJson()]),
      'items_v3': jsonEncode([]),
    });

    final summaries =
        await DataService.getReviewSummariesForUser('owner_preview_fallback');
    final entry = summaries.singleWhere((item) => item.review.id == 'mc_502');

    expect(entry.review.comment, 'Artikel fallback');
  });

  test('bei leeren kommentaren entsteht kein künstlicher vorschautext',
      () async {
    final request = RentalRequest(
      id: 'req_preview_empty',
      itemId: 'item_preview_empty',
      ownerId: 'owner_preview_empty',
      renterId: 'renter_preview_empty',
      start: DateTime(2026, 7, 1),
      end: DateTime(2026, 7, 2),
      status: 'completed',
      createdAt: DateTime(2026, 7, 1),
    );
    final review = MultiCriteriaReview(
      id: '503',
      requestId: 'req_preview_empty',
      itemId: 'item_preview_empty',
      reviewerId: 'renter_preview_empty',
      reviewedUserId: 'owner_preview_empty',
      direction: 'renter_to_owner',
      criteria: const [
        ReviewCriterion(key: 'communication', stars: 5),
        ReviewCriterion(key: 'reliability', stars: 4),
        ReviewCriterion(key: 'article_as_described', stars: 5),
        ReviewCriterion(key: 'handover_return', stars: 5),
      ],
      createdAt: DateTime(2026, 7, 2),
    );
    final owner = User(
      id: 'owner_preview_empty',
      displayName: 'Owner',
      email: 'owner3@example.com',
      preferredLanguage: 'de-DE',
      isVerified: true,
      isBanned: false,
      role: 'user',
      avgRating: 0,
      reviewCount: 0,
      createdAt: DateTime(2025, 1, 1),
    );
    final reviewer = User(
      id: 'renter_preview_empty',
      displayName: 'Reviewer',
      email: 'reviewer3@example.com',
      preferredLanguage: 'de-DE',
      isVerified: true,
      isBanned: false,
      role: 'user',
      avgRating: 0,
      reviewCount: 0,
      createdAt: DateTime(2025, 1, 1),
    );

    SharedPreferences.setMockInitialValues({
      'rental_requests': jsonEncode([request.toJson()]),
      'multi_reviews_v1': jsonEncode([review.toJson()]),
      'users_v2': jsonEncode([owner.toJson(), reviewer.toJson()]),
      'items_v3': jsonEncode([]),
    });

    final summaries =
        await DataService.getReviewSummariesForUser('owner_preview_empty');
    final entry = summaries.singleWhere((item) => item.review.id == 'mc_503');

    expect(entry.review.comment, isEmpty);
  });
}
