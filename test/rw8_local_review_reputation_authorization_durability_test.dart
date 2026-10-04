import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/multi_criteria_review.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final owner = buildTestUser(
    'rw8-owner',
    name: 'RW8 Owner',
    email: 'rw8-owner@example.invalid',
  );
  final renter = buildTestUser(
    'rw8-renter',
    name: 'RW8 Renter',
    email: 'rw8-renter@example.invalid',
  );
  final outsider = buildTestUser(
    'rw8-outsider',
    name: 'RW8 Outsider',
    email: 'rw8-outsider@example.invalid',
  );

  setUp(QaRuntimeService.reset);
  tearDown(QaRuntimeService.reset);

  Future<void> useAccount(User user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('currentUser', jsonEncode(user.toJson()));
    await prefs.setString(
      'auth_session_v1',
      jsonEncode(<String, Object>{
        'userId': user.id,
        'email': user.email,
        'createdAt': '2026-08-25T12:00:00.000Z',
      }),
    );
  }

  RentalRequest request({
    String id = 'rw8-request',
    bool needsReview = false,
    String status = 'completed',
  }) =>
      buildTestRequest(
        id: id,
        itemId: 'rw8-item-$id',
        ownerId: owner.id,
        renterId: renter.id,
        status: status,
        needsReview: needsReview,
      );

  const criteria = <ReviewCriterion>[
    ReviewCriterion(key: 'communication', stars: 5, note: 'Schnell'),
    ReviewCriterion(key: 'reliability', stars: 4, note: 'Pünktlich'),
    ReviewCriterion(
      key: 'article_as_described',
      stars: 5,
      note: 'Wie beschrieben',
    ),
    ReviewCriterion(key: 'handover_return', stars: 5, note: 'Sauber'),
  ];

  Map<String, Object> state(
    List<RentalRequest> requests, {
    Object multiReviews = '[]',
    Object? classicReviews,
  }) =>
      <String, Object>{
        'users': jsonEncode(<Object>[
          owner.toJson(),
          renter.toJson(),
          outsider.toJson(),
        ]),
        'items': '[]',
        'rental_requests':
            jsonEncode(requests.map((entry) => entry.toJson()).toList()),
        'multi_reviews_v1': multiReviews,
        if (classicReviews != null) 'reviews': classicReviews,
      };

  Future<MultiCriteriaReview> submit(
    RentalRequest booking, {
    String? reviewerId,
    String? reviewedUserId,
    String direction = 'renter_to_owner',
  }) =>
      DataService.addMultiReview(
        requestId: booking.id,
        itemId: booking.itemId,
        reviewerId: reviewerId ?? renter.id,
        reviewedUserId: reviewedUserId ?? owner.id,
        direction: direction,
        criteria: criteria,
      );

  test('guest, outsider and stale sessions cannot submit for a participant',
      () async {
    final booking = request();
    final raw = '[]';
    SharedPreferences.setMockInitialValues(
      state(<RentalRequest>[booking], multiReviews: raw),
    );

    await expectLater(submit(booking), throwsStateError);
    await useAccount(outsider);
    await expectLater(submit(booking), throwsStateError);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('currentUser', jsonEncode(renter.toJson()));
    await prefs.setString(
      'auth_session_v1',
      jsonEncode(<String, Object>{
        'userId': outsider.id,
        'email': outsider.email,
        'createdAt': '2026-08-25T12:00:00.000Z',
      }),
    );
    await expectLater(submit(booking), throwsStateError);
    expect(prefs.getString('multi_reviews_v1'), raw);
  });

  test('direction, counterparty, item, completion and needsReview are exact',
      () async {
    final held = request(id: 'rw8-held', needsReview: true);
    final pending = request(id: 'rw8-pending', status: 'accepted');
    final good = request(id: 'rw8-good');
    SharedPreferences.setMockInitialValues(
      state(<RentalRequest>[held, pending, good]),
    );
    await useAccount(renter);

    await expectLater(submit(held), throwsStateError);
    await expectLater(submit(pending), throwsStateError);
    await expectLater(
      submit(good, reviewedUserId: outsider.id),
      throwsStateError,
    );
    await expectLater(
      submit(good, direction: 'owner_to_renter'),
      throwsStateError,
    );
    await expectLater(
      DataService.addMultiReview(
        requestId: good.id,
        itemId: 'foreign-item',
        reviewerId: renter.id,
        reviewedUserId: owner.id,
        direction: 'renter_to_owner',
        criteria: criteria,
      ),
      throwsStateError,
    );
  });

  test('missing classic reviews stay empty and are never silently seeded',
      () async {
    SharedPreferences.setMockInitialValues(state(const <RentalRequest>[]));

    expect(await DataService.getReviewsForUser(owner.id), isEmpty);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.containsKey('reviews'), isFalse);
  });

  test('corrupt classic and multi-review documents fail closed unchanged',
      () async {
    const corruptClassic = '[{"id":"broken"}]';
    const corruptMulti = '{"not":"a-list"}';
    SharedPreferences.setMockInitialValues(
      state(
        const <RentalRequest>[],
        multiReviews: corruptMulti,
        classicReviews: corruptClassic,
      ),
    );

    await expectLater(
      DataService.getReviewsForUser(owner.id),
      throwsFormatException,
    );
    await expectLater(
      DataService.getMultiReviewsForUser(owner.id),
      throwsFormatException,
    );
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('reviews'), corruptClassic);
    expect(prefs.getString('multi_reviews_v1'), corruptMulti);
  });

  test('parallel same-context submissions persist exactly one review',
      () async {
    final booking = request(id: 'rw8-race');
    SharedPreferences.setMockInitialValues(state(<RentalRequest>[booking]));
    await useAccount(renter);

    final outcomes = await Future.wait<Object>(
      <Future<MultiCriteriaReview>>[submit(booking), submit(booking)]
          .map((future) => future.then<Object>((value) => value).catchError(
                (Object error) => error,
              )),
    );

    expect(outcomes.whereType<MultiCriteriaReview>(), hasLength(1));
    expect(outcomes.whereType<StateError>(), hasLength(1));
    final prefs = await SharedPreferences.getInstance();
    expect(
      jsonDecode(prefs.getString('multi_reviews_v1')!) as List,
      hasLength(1),
    );
  });

  test('parallel distinct submissions are serialized without lost updates',
      () async {
    final first = request(id: 'rw8-first');
    final second = request(id: 'rw8-second');
    SharedPreferences.setMockInitialValues(
      state(<RentalRequest>[first, second]),
    );
    await useAccount(renter);

    await Future.wait(<Future<MultiCriteriaReview>>[
      submit(first),
      submit(second),
    ]);

    final prefs = await SharedPreferences.getInstance();
    final persisted = jsonDecode(prefs.getString('multi_reviews_v1')!) as List;
    expect(persisted, hasLength(2));
    expect(
      persisted.map((entry) => (entry as Map)['requestId']).toSet(),
      <String>{first.id, second.id},
    );
  });

  test('failed verified write restores exact bytes and the queue recovers',
      () async {
    final first = request(id: 'rw8-write-fail');
    final second = request(id: 'rw8-write-recover');
    const original = '[]';
    SharedPreferences.setMockInitialValues(
      state(<RentalRequest>[first, second], multiReviews: original),
    );
    await useAccount(renter);
    DataService.failNextReviewPersistenceForTesting();

    await expectLater(submit(first), throwsStateError);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('multi_reviews_v1'), original);

    await submit(second);
    final persisted = jsonDecode(prefs.getString('multi_reviews_v1')!) as List;
    expect(persisted, hasLength(1));
    expect((persisted.single as Map)['requestId'], second.id);
  });

  test('bounded review capacity fails closed without pruning history',
      () async {
    final booking = request(id: 'rw8-capacity');
    final full = <Object>[
      for (var index = 1;
          index <= DataService.maxLocalReviewsForTesting;
          index++)
        <String, Object>{
          'id': '$index',
          'requestId': 'historical-$index',
          'itemId': 'item-$index',
          'reviewerId': 'reviewer-$index',
          'reviewedUserId': 'reviewed-$index',
          'direction': 'renter_to_owner',
          'criteria': <Object>[
            for (final criterion in criteria) criterion.toJson(),
          ],
          'createdAt': '2026-08-25T12:00:00.000Z',
        },
    ];
    final original = jsonEncode(full);
    SharedPreferences.setMockInitialValues(
      state(<RentalRequest>[booking], multiReviews: original),
    );
    await useAccount(renter);

    await expectLater(submit(booking), throwsStateError);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('multi_reviews_v1'), original);
  });

  test('privacy export is current-account scoped and records retention truth',
      () async {
    final renterBooking = request(id: 'rw8-export');
    final outsiderReview = <String, Object>{
      'id': '1',
      'requestId': 'other-request',
      'itemId': 'other-item',
      'reviewerId': outsider.id,
      'reviewedUserId': owner.id,
      'direction': 'renter_to_owner',
      'criteria': <Object>[
        for (final criterion in criteria) criterion.toJson(),
      ],
      'createdAt': '2026-08-25T10:00:00.000Z',
    };
    SharedPreferences.setMockInitialValues(
      state(
        <RentalRequest>[renterBooking],
        multiReviews: jsonEncode(<Object>[outsiderReview]),
      ),
    );
    await useAccount(renter);
    await submit(renterBooking);

    final export = await DataService.exportReviewRecordsForPrivacy();
    expect(export['accountId'], renter.id);
    expect(export['authoredMultiReviews'], hasLength(1));
    expect(export['receivedMultiReviews'], isEmpty);
    expect(export['otherAccountsPublicReviewsExcluded'], isTrue);
    expect(export['sharedPublicReviewsRetainedAfterDeletion'], isTrue);
  });

  test('verified review survives process-style preference recreation',
      () async {
    final booking = request(id: 'rw8-recreation');
    SharedPreferences.setMockInitialValues(state(<RentalRequest>[booking]));
    await useAccount(renter);
    final created = await submit(booking);
    final prefs = await SharedPreferences.getInstance();
    final persistedReview = prefs.getString('multi_reviews_v1')!;
    final persistedRequests = prefs.getString('rental_requests')!;
    final persistedUser = prefs.getString('currentUser')!;
    final persistedSession = prefs.getString('auth_session_v1')!;

    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': jsonEncode(<Object>[
        owner.toJson(),
        renter.toJson(),
        outsider.toJson(),
      ]),
      'items': '[]',
      'multi_reviews_v1': persistedReview,
      'rental_requests': persistedRequests,
      'currentUser': persistedUser,
      'auth_session_v1': persistedSession,
    });

    expect(
      await DataService.hasSubmittedReview(
        requestId: booking.id,
        reviewerId: renter.id,
      ),
      isTrue,
    );
    final restored = await DataService.getMultiReviewsForUser(owner.id);
    expect(restored.single.id, created.id);
    expect(restored.single.requestId, booking.id);
  });
}
