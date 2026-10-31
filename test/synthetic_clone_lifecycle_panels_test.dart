import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/widgets/synthetic_clone_lifecycle_panels.dart';

void main() {
  testWidgets('clone chat emits only the two synthetic template actions',
      (tester) async {
    final sent = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SyntheticCloneChatPanel(
          messages: const <Map<String, dynamic>>[
            <String, dynamic>{
              'text': 'Synthetischer Test: Übergabe abgestimmt.',
              'actorRole': 'owner',
              'syntheticTestOnly': true,
              'externalDelivery': false,
            },
          ],
          busy: false,
          onSendTemplate: sent.add,
        ),
      ),
    ));

    expect(find.text('Synthetischer Chat · keine externe Nachricht'),
        findsOneWidget);
    expect(
        find.text('Synthetischer Test: Übergabe abgestimmt.'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('synthetic-clone-chat-return')));
    expect(sent, <String>['return_arranged']);
  });

  testWidgets(
      'clone ratings are shown as private drafts without profile actions',
      (tester) async {
    var saved = false;
    var rating = 4;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: StatefulBuilder(
          builder: (context, setState) => SyntheticCloneReviewDraftPanel(
            reviewDrafts: const <Map<String, dynamic>>[
              <String, dynamic>{
                'direction': 'owner_to_renter',
                'reviewerRole': 'owner',
                'rating': 5,
                'syntheticTestOnly': true,
                'publishable': false,
                'profileEffect': false,
              },
            ],
            ownDraftExists: false,
            busy: false,
            rating: rating,
            onRatingChanged: (value) => setState(() => rating = value),
            onSave: () => saved = true,
          ),
        ),
      ),
    ));

    expect(
        find.text('Private synthetische Bewertungsentwürfe'), findsOneWidget);
    expect(
        find.text('Keine Veröffentlichung, kein Profilwert und kein Ranking.'),
        findsOneWidget);
    expect(find.text('owner_to_renter: 5/5 · nur Entwurf'), findsOneWidget);
    await tester
        .tap(find.byKey(const ValueKey('synthetic-clone-save-review-draft')));
    expect(saved, isTrue);
    expect(find.text('Bewertung veröffentlichen'), findsNothing);
  });

  testWidgets('a role cannot create a second private clone draft',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SyntheticCloneReviewDraftPanel(
          reviewDrafts: const <Map<String, dynamic>>[
            <String, dynamic>{
              'direction': 'renter_to_owner',
              'reviewerRole': 'renter',
              'rating': 3,
              'syntheticTestOnly': true,
              'publishable': false,
              'profileEffect': false,
            },
          ],
          ownDraftExists: true,
          busy: false,
          rating: 5,
          onRatingChanged: (_) {},
          onSave: () {},
        ),
      ),
    ));

    expect(find.text('renter_to_owner: 3/5 · nur Entwurf'), findsOneWidget);
    expect(find.byKey(const ValueKey('synthetic-clone-save-review-draft')),
        findsNothing);
  });
}
