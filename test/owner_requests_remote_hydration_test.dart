import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('owner requests hydrate fresh backend participants and listings',
      () async {
    final source =
        await File('lib/screens/owner_requests_screen.dart').readAsString();
    final loadStart = source.indexOf('Future<void> _load() async');
    final demoStart = source.indexOf(')> _buildDemoOwnerEntries', loadStart);

    expect(loadStart, greaterThanOrEqualTo(0));
    expect(demoStart, greaterThan(loadStart));

    final loadSource = source.substring(loadStart, demoStart);
    expect(loadSource, contains('final items = await DataService.getItems()'));
    expect(loadSource, contains('final users = await DataService.getUsers()'));
    expect(loadSource, contains('DataService.getUserById(request.renterId)'));
    expect(
        loadSource, isNot(contains('DataService.getItemById(request.itemId)')));
    expect(
      'DataService.getItems()'.allMatches(loadSource),
      hasLength(1),
      reason: 'the remote catalog must be loaded once per screen refresh',
    );
    expect(
      'DataService.getUsers()'.allMatches(loadSource),
      hasLength(1),
      reason: 'the cached participant list must be loaded once per refresh',
    );
  });

  test('owner request cards render before bounded optional enrichment',
      () async {
    final source =
        await File('lib/screens/owner_requests_screen.dart').readAsString();
    final loadStart = source.indexOf('Future<void> _load() async');
    final demoStart = source.indexOf(')> _buildDemoOwnerEntries', loadStart);
    final loadSource = source.substring(loadStart, demoStart);

    final baseCommit = loadSource.indexOf('_entries = base;');
    final flowHydration =
        loadSource.indexOf('DataService.getHandoverReturnState(entry.r.id)');
    final reviewHydration =
        loadSource.indexOf('DataService.hasSubmittedReview(');

    expect(baseCommit, greaterThanOrEqualTo(0));
    expect(flowHydration, greaterThan(baseCommit));
    expect(reviewHydration, greaterThan(baseCommit));
    expect(
      loadSource,
      contains("status == 'accepted' || status == 'running'"),
      reason: 'terminal history must not trigger flow-time network reads',
    );
    expect(
      loadSource,
      contains("status == 'completed' && !entry.r.needsReview"),
      reason: 'review state is needed only for eligible completed requests',
    );
  });

  test('owner request loading is principal-bound and distinguishes UI states',
      () async {
    final source =
        await File('lib/screens/owner_requests_screen.dart').readAsString();

    expect(source, contains('LocalPrincipalActionOwner.capture()'));
    expect(source, contains('await actionOwner.assertCurrent()'));
    expect(source, contains('revision != _loadRevision'));
    expect(source, contains('Mietanfragen werden geladen'));
    expect(source, contains('Mietanfragen konnten nicht geladen werden.'));
    expect(source, contains('Erneut versuchen'));
    expect(
      source,
      contains('if (coreCommitted)'),
      reason: 'optional enrichment failure must preserve authoritative cards',
    );
  });
}
