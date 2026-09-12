import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/booking_group_technical_config.dart';
import 'package:lendify/models/booking_group.dart';
import 'package:lendify/models/rental_cart.dart';
import 'package:lendify/screens/booking_group_technical_screen.dart';
import 'package:lendify/services/booking_group_gateway.dart';

void main() {
  test('G3E feature flag fails closed for release builds', () {
    expect(
      BookingGroupTechnicalConfig.availableForMode(releaseMode: true),
      isFalse,
    );
    expect(BookingGroupTechnicalConfig.publicReleaseAllowed, isFalse);
    expect(
      BookingGroupTechnicalConfig.availableForConfiguration(
        featureEnabled: true,
        releaseMode: true,
        signedStageAInternalEnvelope: false,
      ),
      isFalse,
    );
    expect(
      BookingGroupTechnicalConfig.availableForConfiguration(
        featureEnabled: true,
        releaseMode: true,
        signedStageAInternalEnvelope: true,
      ),
      isTrue,
    );
  });

  test('same-owner cart candidates keep project, period and currency isolated',
      () {
    final cart = RentalCart(items: <RentalCartItem>[
      _cartItem('one', ownerId: 'owner-a', sortOrder: 1),
      _cartItem('two', ownerId: 'owner-a', sortOrder: 0),
      _cartItem('other-owner', ownerId: 'owner-b'),
      _cartItem('unavailable', ownerId: 'owner-a', quoteStatus: 'unavailable'),
      _cartItem('other-project', ownerId: 'owner-a', projectId: 'project-b'),
    ]);

    final candidates = RentalCartGroupCandidate.fromCart(cart);

    expect(candidates, hasLength(1));
    expect(candidates.single.ownerId, 'owner-a');
    expect(candidates.single.projectId, 'project-a');
    expect(candidates.single.listingIds, <String>['two', 'one']);
  });

  test('server quote parsing rejects a client-visible total mismatch', () {
    final json = _quoteJson(
      id: 'booking_group_quote_initial',
      revision: 1,
      itemIds: const <String>['one', 'two'],
    );
    json['totalMinor'] = 9999;

    expect(
      () => BookingGroupQuote.fromJson(json),
      throwsA(isA<FormatException>()),
    );
  });

  test('shared appointment parser accepts IANA timezones but no address leak',
      () {
    final appointment = BookingGroupAppointment.fromJson(<String, dynamic>{
      'id': 'booking_group_appointment_test',
      'type': 'pickup',
      'scheduledAt': '2026-09-01T09:00:00.000Z',
      'timezone': 'Europe/Berlin',
      'exactAddressDisclosed': false,
    });
    expect(appointment.timezone, 'Europe/Berlin');
    expect(
      () => BookingGroupAppointment.fromJson(<String, dynamic>{
        'id': 'booking_group_appointment_test',
        'type': 'pickup',
        'scheduledAt': '2026-09-01T09:00:00.000Z',
        'timezone': 'Europe/Berlin',
        'exactAddressDisclosed': true,
      }),
      throwsA(isA<FormatException>()),
    );
  });

  testWidgets(
      'counteroffer requires exact consent and then shows item evidence independently',
      (tester) async {
    tester.view.physicalSize = const Size(1200, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final candidate = _candidate();
    final previous = _quote(
      id: 'booking_group_quote_initial',
      revision: 1,
      itemIds: const <String>['one', 'two'],
      totals: const <int>[1100, 2200],
    );
    final counter = _quote(
      id: 'booking_group_quote_counter',
      revision: 2,
      predecessorQuoteId: previous.id,
      proposalKind: 'owner_counteroffer',
      itemIds: const <String>['one'],
      totals: const <int>[1200],
    );
    final gateway = _FakeGateway(
      requested: BookingGroupSnapshot(
        id: 'booking_group_test',
        state: 'counteroffered',
        quote: counter,
        previousQuote: previous,
      ),
      accepted: BookingGroupSnapshot(
        id: 'booking_group_test',
        state: 'counteroffer_accepted',
        quote: counter,
        previousQuote: previous,
      ),
      handover: _handover(),
    );

    await tester.pumpWidget(MaterialApp(
      home: BookingGroupTechnicalScreen(
        candidate: candidate,
        gateway: gateway,
        enableForTesting: true,
      ),
    ));

    expect(find.textContaining('Keine Reservierung'), findsOneWidget);
    expect(find.text('Kamera'), findsOneWidget);
    expect(find.text('Objektiv'), findsOneWidget);

    await tester.tap(find.text('Gemeinsame Anfrage technisch prüfen'));
    await tester.pumpAndSettle();

    expect(gateway.requestedListingIds, <String>['one', 'two']);
    expect(find.text('Gegenangebot – Revision 2'), findsOneWidget);
    expect(find.textContaining('Vorher 33,00 EUR → jetzt 12,00 EUR'),
        findsOneWidget);
    expect(find.textContaining('1 entfernt'), findsOneWidget);
    expect(find.text('Entfernt: Objektiv'), findsOneWidget);

    final acceptButton = find.text('Exaktes Gegenangebot akzeptieren');
    await tester.ensureVisible(acceptButton);
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(
                FilledButton, 'Exaktes Gegenangebot akzeptieren'),
          )
          .onPressed,
      isNull,
    );

    await tester.tap(find.byType(Checkbox));
    await tester.pump();
    await tester.tap(acceptButton);
    await tester.pumpAndSettle();

    expect(gateway.acceptedQuoteId, counter.id);
    expect(gateway.acceptedQuoteHash, counter.quoteHash);
    expect(find.text('Gemeinsame Übergabe und Rückgabe'), findsOneWidget);
    expect(find.textContaining('exakte Adresse bleibt'), findsOneWidget);
    expect(find.text('Nur dieser Artikel: Prüfung nötig'), findsNothing);

    final handoverCamera = find.text('Kamera').last;
    await tester.ensureVisible(handoverCamera);
    await tester.tap(handoverCamera);
    await tester.pumpAndSettle();
    expect(find.text('Übergabe'), findsOneWidget);
    expect(find.text('Rückgabe'), findsOneWidget);
    expect(find.textContaining('Bestätigung der Gegenseite'), findsWidgets);
  });
}

class _FakeGateway implements BookingGroupGateway {
  final BookingGroupSnapshot requested;
  final BookingGroupSnapshot accepted;
  final BookingGroupHandover handover;
  List<String>? requestedListingIds;
  String? acceptedQuoteId;
  String? acceptedQuoteHash;

  _FakeGateway({
    required this.requested,
    required this.accepted,
    required this.handover,
  });

  @override
  Future<BookingGroupSnapshot> requestGroup(
      RentalCartGroupCandidate candidate) async {
    requestedListingIds = candidate.listingIds;
    return requested;
  }

  @override
  Future<BookingGroupSnapshot> loadGroup(String bookingGroupId) async =>
      requested;

  @override
  Future<BookingGroupSnapshot> acceptCounteroffer(
      BookingGroupSnapshot snapshot) async {
    acceptedQuoteId = snapshot.quote.id;
    acceptedQuoteHash = snapshot.quote.quoteHash;
    return accepted;
  }

  @override
  Future<BookingGroupHandover> loadHandover(String bookingGroupId) async =>
      handover;
}

RentalCartGroupCandidate _candidate() => RentalCartGroupCandidate(
      ownerId: 'owner-a',
      projectId: 'project-a',
      startDate: DateTime(2026, 9, 1),
      endDate: DateTime(2026, 9, 4),
      currency: 'EUR',
      items: <RentalCartItem>[
        _cartItem('one', ownerId: 'owner-a', title: 'Kamera'),
        _cartItem('two', ownerId: 'owner-a', title: 'Objektiv'),
      ],
    );

RentalCartItem _cartItem(
  String id, {
  required String ownerId,
  String title = 'Artikel',
  String? projectId = 'project-a',
  int sortOrder = 0,
  String quoteStatus = 'current',
}) =>
    RentalCartItem(
      id: 'cart-$id',
      listingId: id,
      projectId: projectId,
      startDate: DateTime(2026, 9, 1),
      endDate: DateTime(2026, 9, 4),
      sortOrder: sortOrder,
      quoteStatus: quoteStatus,
      listing: <String, dynamic>{
        'id': id,
        'ownerId': ownerId,
        'title': title,
        'currency': 'EUR',
      },
    );

BookingGroupQuote _quote({
  required String id,
  required int revision,
  String? predecessorQuoteId,
  String proposalKind = 'initial',
  required List<String> itemIds,
  required List<int> totals,
}) {
  final items = <BookingGroupQuoteItem>[
    for (var index = 0; index < itemIds.length; index++)
      BookingGroupQuoteItem(
        groupPositionId: 'position-${itemIds[index]}',
        listingId: itemIds[index],
        bookingQuoteId: 'quote-${itemIds[index]}',
        bookingQuoteHash: String.fromCharCode(97 + index) * 64,
        currency: 'EUR',
        rentalSubtotalMinor: totals[index] - 100,
        platformFeeMinor: 100,
        totalMinor: totals[index],
        ownerPayoutMinor: totals[index] - 100,
        securityDepositMinor: 0,
        sortOrder: index,
      ),
  ];
  return BookingGroupQuote(
    id: id,
    revision: revision,
    predecessorQuoteId: predecessorQuoteId,
    proposalKind: proposalKind,
    currency: 'EUR',
    rentalSubtotalMinor:
        items.fold(0, (sum, item) => sum + item.rentalSubtotalMinor),
    platformFeeMinor: items.fold(0, (sum, item) => sum + item.platformFeeMinor),
    totalMinor: items.fold(0, (sum, item) => sum + item.totalMinor),
    ownerPayoutMinor: items.fold(0, (sum, item) => sum + item.ownerPayoutMinor),
    securityDepositMinor: 0,
    quoteHash: revision == 1 ? 'a' * 64 : 'b' * 64,
    expiresAt: DateTime.utc(2027, 1, 1),
    items: items,
  );
}

Map<String, dynamic> _quoteJson({
  required String id,
  required int revision,
  required List<String> itemIds,
}) {
  final items = <Map<String, dynamic>>[
    for (var index = 0; index < itemIds.length; index++)
      <String, dynamic>{
        'groupPositionId': 'position-${itemIds[index]}',
        'listingId': itemIds[index],
        'bookingQuoteId': 'quote-${itemIds[index]}',
        'bookingQuoteHash': String.fromCharCode(97 + index) * 64,
        'currency': 'EUR',
        'rentalSubtotalMinor': 1000,
        'platformFeeMinor': 100,
        'totalMinor': 1100,
        'ownerPayoutMinor': 1000,
        'securityDepositMinor': 0,
        'sortOrder': index,
      },
  ];
  return <String, dynamic>{
    'id': id,
    'revision': revision,
    'predecessorQuoteId': null,
    'proposalKind': 'initial',
    'itemCount': items.length,
    'currency': 'EUR',
    'rentalSubtotalMinor': items.length * 1000,
    'platformFeeMinor': items.length * 100,
    'totalMinor': items.length * 1100,
    'ownerPayoutMinor': items.length * 1000,
    'securityDepositMinor': 0,
    'quoteHash': 'f' * 64,
    'expiresAt': '2027-01-01T00:00:00.000Z',
    'items': items,
  };
}

BookingGroupHandover _handover() {
  const emptySegment = BookingGroupEvidenceSegment(
    completedPresenterSlots: <String>{},
    accessoriesRequired: true,
    accessoriesEvidenceId: null,
    confirmed: false,
  );
  return BookingGroupHandover(
    bookingGroupId: 'booking_group_test',
    operationalState: 'ready',
    systemRiskHold: false,
    sharedAppointments: <BookingGroupAppointment>[
      BookingGroupAppointment(
        id: 'appointment-pickup',
        type: 'pickup',
        scheduledAt: DateTime.utc(2026, 9, 1, 9),
        timezone: 'Europe/Berlin',
      ),
      BookingGroupAppointment(
        id: 'appointment-return',
        type: 'return',
        scheduledAt: DateTime.utc(2026, 9, 4, 9),
        timezone: 'Europe/Berlin',
      ),
    ],
    items: const <BookingGroupHandoverItem>[
      BookingGroupHandoverItem(
        groupPositionId: 'position-one',
        listingId: 'one',
        bookingId: 'booking-one',
        bindingState: 'bound_v52',
        operationalState: 'independent',
        pickup: emptySegment,
        returnEvidence: emptySegment,
        needsReview: false,
        chatThreadId: 'thread-one',
      ),
    ],
  );
}
