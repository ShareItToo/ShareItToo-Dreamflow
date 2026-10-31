import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/create_listing_screen.dart';

void main() {
  test('late autocomplete completion is ignored after the query changes',
      () async {
    final response = Completer<String>();
    var currentEpoch = 1;
    var currentQuery = 'Heilbronn';
    String? appliedResult;
    final pending = () async {
      final result = await response.future;
      if (canApplyListingAddressQueryResult(
        mounted: true,
        requestEpoch: 1,
        currentEpoch: currentEpoch,
        requestQuery: 'Heilbronn',
        currentQuery: currentQuery,
      )) {
        appliedResult = result;
      }
    }();

    currentEpoch++;
    currentQuery = 'Mannheim';
    response.complete('stale Heilbronn suggestion');
    await pending;

    expect(appliedResult, isNull);
  });

  test('empty-query debounce after dispose cannot update state', () async {
    var mounted = true;
    var currentEpoch = 1;
    var updates = 0;
    final timer = Timer(Duration.zero, () {
      if (canApplyListingAddressQueryResult(
        mounted: mounted,
        requestEpoch: 1,
        currentEpoch: currentEpoch,
        requestQuery: '',
        currentQuery: '',
      )) {
        updates++;
      }
    });

    mounted = false;
    currentEpoch++;
    await Future<void>.delayed(const Duration(milliseconds: 1));
    timer.cancel();

    expect(updates, 0);
  });

  testWidgets(
      'async place suggestions appear and selection retains coordinates',
      (tester) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    final hostKey = GlobalKey<_AsyncAutocompleteHostState>();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: _AsyncAutocompleteHost(key: hostKey, controller: controller),
      ),
    ));

    await tester.enterText(find.byType(TextFormField), 'Heilbronn');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    await tester.pump();

    expect(find.text('Heilbronn, Deutschland'), findsOneWidget);
    expect(hostKey.currentState!.queries, ['Heilbronn']);

    await tester.tap(find.text('Heilbronn, Deutschland'));
    await tester.pumpAndSettle();

    expect(
        hostKey.currentState!.selected?.description, 'Heilbronn, Deutschland');
    expect(hostKey.currentState!.selected?.lat, 49.1427);
    expect(hostKey.currentState!.selected?.lng, 9.2109);
    expect(controller.text, 'Heilbronn, Deutschland');
    expect(hostKey.currentState!.queries, ['Heilbronn']);
  });

  testWidgets('late place details cannot overwrite a newer query',
      (tester) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    final hostKey = GlobalKey<_AsyncAutocompleteHostState>();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: _AsyncAutocompleteHost(
          key: hostKey,
          controller: controller,
          deferPlaceDetails: true,
        ),
      ),
    ));
    await tester.enterText(find.byType(TextFormField), 'Heilbronn');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    await tester.pump();
    await tester.tap(find.text('Heilbronn, Deutschland'));
    await tester.pump();

    await tester.enterText(find.byType(TextFormField), 'Mannheim');
    await tester.pump();
    hostKey.currentState!.detailsCompleter.complete(const ListingPlaceDetails(
      formattedAddress: 'Heilbronn, Deutschland',
      lat: 49.1427,
      lng: 9.2109,
      description: 'Heilbronn, Deutschland',
    ));
    await tester.pumpAndSettle();

    expect(controller.text, 'Mannheim');
    expect(hostKey.currentState!.selected, isNull);
  });
}

class _AsyncAutocompleteHost extends StatefulWidget {
  final TextEditingController controller;
  final bool deferPlaceDetails;
  const _AsyncAutocompleteHost({
    super.key,
    required this.controller,
    this.deferPlaceDetails = false,
  });

  @override
  State<_AsyncAutocompleteHost> createState() => _AsyncAutocompleteHostState();
}

class _AsyncAutocompleteHostState extends State<_AsyncAutocompleteHost> {
  List<ListingPlaceSuggestion> suggestions = const [];
  final List<String> queries = [];
  ListingPlaceDetails? selected;
  final detailsCompleter = Completer<ListingPlaceDetails?>();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(24),
        child: AddressAutocompleteField(
          controller: widget.controller,
          suggestions: suggestions,
          onQueryChanged: (query) {
            queries.add(query);
            setState(() => suggestions = const []);
            Future<void>.delayed(const Duration(milliseconds: 10), () {
              if (!mounted) return;
              setState(() {
                suggestions = const [
                  ListingPlaceSuggestion(
                    description: 'Heilbronn, Deutschland',
                    placeId: 'synthetic-heilbronn',
                  )
                ];
              });
            });
          },
          loadPlaceDetails: (placeId) async {
            expect(placeId, 'synthetic-heilbronn');
            if (widget.deferPlaceDetails) return detailsCompleter.future;
            return const ListingPlaceDetails(
              formattedAddress: 'Heilbronn, Deutschland',
              lat: 49.1427,
              lng: 9.2109,
              description: 'Heilbronn, Deutschland',
            );
          },
          onPlaceChosen: (value) => setState(() => selected = value),
        ),
      );
}
