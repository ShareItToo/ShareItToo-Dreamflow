import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/privacy_info_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/privacy_export_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _syntheticAccountProof = 'synthetic-export-test-proof';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'auth_session_v1': jsonEncode(<String, Object>{
        'userId': 'export-account-a',
        'sessionId': 'export-session-a',
        'email': 'export-a@example.invalid',
        'createdAt': DateTime.utc(2026, 9, 4).toIso8601String(),
      }),
    });
  });

  testWidgets('A export prompt closes on session change', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: PrivacyInfoScreen()));
    await _openExport(tester);
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pumpAndSettle();
    expect(find.text('Datenexport bestätigen'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('closing A export prompt preserves an unrelated B dialog',
      (tester) async {
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(MaterialApp(
      navigatorKey: navigator,
      home: const PrivacyInfoScreen(),
    ));
    await _openExport(tester);
    navigator.currentState!.push<void>(DialogRoute<void>(
      context: navigator.currentContext!,
      builder: (_) => const AlertDialog(title: Text('Account B dialog')),
    ));
    await tester.pumpAndSettle();
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pumpAndSettle();
    expect(find.text('Account B dialog'), findsOneWidget);
    navigator.currentState!.pop();
    await tester.pumpAndSettle();
    expect(find.text('Datenexport bestätigen'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  test('stable owner exports every existing local section', () async {
    final service = _ExportService();
    final value = await service.prepare(
        owner: _ownerA, currentPassword: _syntheticAccountProof);
    expect(service.remoteCalls, 1);
    expect(service.localReads, PrivacyExportSection.values);
    expect((value['localDevice'] as Map).keys,
        PrivacyExportSection.values.map((s) => s.name));
    expect(value['accountId'], _ownerA.userId);
  });

  test('stale owner cannot start any remote or local export', () async {
    final service = _ExportService()..changeOwner();
    await expectLater(
        service.prepare(
            owner: _ownerA, currentPassword: _syntheticAccountProof),
        throwsA(isA<PrivacyExportPrincipalChanged>()));
    expect(service.remoteCalls, 0);
    expect(service.localReads, isEmpty);
  });

  test('late server response cannot collect successor local data', () async {
    final remote = Completer<Map<String, dynamic>>();
    final service = _ExportService(remote: remote);
    final future = service.prepare(
        owner: _ownerA, currentPassword: _syntheticAccountProof);
    await service.remoteStarted.future;
    service.changeOwner();
    final assertion =
        expectLater(future, throwsA(isA<PrivacyExportPrincipalChanged>()));
    remote.complete(_remote());
    await assertion;
    expect(service.localReads, isEmpty);
  });

  for (final boundary in PrivacyExportSection.values) {
    test('session switch during ${boundary.name} prevents partial export',
        () async {
      final service = _ExportService();
      service.afterLocal = (section) {
        if (section == boundary) service.changeOwner();
      };
      await expectLater(
          service.prepare(
              owner: _ownerA, currentPassword: _syntheticAccountProof),
          throwsA(isA<PrivacyExportPrincipalChanged>()));
      expect(service.localReads,
          PrivacyExportSection.values.take(boundary.index + 1));
    });
  }

  test('A to B to A with a new epoch cannot revive old export', () async {
    final service = _ExportService();
    service.afterLocal = (_) {
      service.activeOwner = AuthSessionOwner(
          userId: _ownerA.userId,
          sessionId: _ownerA.sessionId,
          email: _ownerA.email,
          createdAt: _ownerA.createdAt,
          epoch: 2);
    };
    await expectLater(
        service.prepare(
            owner: _ownerA, currentPassword: _syntheticAccountProof),
        throwsA(isA<PrivacyExportPrincipalChanged>()));
    expect(service.localReads.length, 1);
  });

  test('foreign server account is rejected before local reads', () async {
    final service =
        _ExportService(response: _remote(accountId: 'foreign-account'));
    await expectLater(
        service.prepare(
            owner: _ownerA, currentPassword: _syntheticAccountProof),
        throwsFormatException);
    expect(service.localReads, isEmpty);
  });

  for (final response in <Map<String, dynamic>>[
    {},
    {'accountId': 'export-account-a'},
    {..._remote(), 'data': null},
    {..._remote(), 'generatedAt': 'not-a-date'},
  ]) {
    test(
        'malformed server export cannot become a successful empty document ${response.keys}',
        () async {
      final service = _ExportService(response: response);
      await expectLater(
          service.prepare(
              owner: _ownerA, currentPassword: _syntheticAccountProof),
          throwsFormatException);
      expect(service.localReads, isEmpty);
    });
  }

  test('failed local section aborts instead of omitting data', () async {
    final service = _ExportService()
      ..afterLocal = (_) => throw StateError('local test failure');
    await expectLater(
        service.prepare(
            owner: _ownerA, currentPassword: _syntheticAccountProof),
        throwsStateError);
    expect(service.localReads.length, 1);
  });

  testWidgets('late A export result cannot share or show outcome in B',
      (tester) async {
    final remote = Completer<Map<String, dynamic>>();
    final service = _ExportService(remote: remote);
    var shareCalls = 0;
    await tester.pumpWidget(MaterialApp(
        home: PrivacyInfoScreen(
      exportService: service,
      shareExport: (_) async {
        shareCalls++;
        return const ShareResult('test', ShareResultStatus.success);
      },
    )));
    await _openExport(tester);
    await _confirmExport(tester);
    expect(service.remoteCalls, 1);
    service.changeOwner();
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pump();
    remote.complete(_remote());
    await tester.pumpAndSettle();
    expect(shareCalls, 0);
    expect(find.text('Datenexport erstellt'), findsNothing);
    expect(find.text('Datenexport fehlgeschlagen'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
      'same-owner complete payload is shared once and cancellation is truthful',
      (tester) async {
    final service = _ExportService();
    final payloads = <Map<String, dynamic>>[];
    await tester.pumpWidget(MaterialApp(
        home: PrivacyInfoScreen(
      exportService: service,
      shareExport: (bytes) async {
        payloads.add(jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>);
        return const ShareResult('', ShareResultStatus.dismissed);
      },
    )));
    await _openExport(tester);
    await _confirmExport(tester);
    await tester.pumpAndSettle();
    expect(payloads.length, 1);
    expect(payloads.single['accountId'], _ownerA.userId);
    expect((payloads.single['localDevice'] as Map).length, 6);
    expect(find.text('Teilen abgebrochen'), findsOneWidget);
    expect(find.textContaining('Weitergabe wurde nicht bestätigt'),
        findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });

  testWidgets('already handed-off share has no stale success after A to B',
      (tester) async {
    final service = _ExportService();
    final share = Completer<ShareResult>();
    var calls = 0;
    await tester.pumpWidget(MaterialApp(
        home: PrivacyInfoScreen(
      exportService: service,
      shareExport: (_) {
        calls++;
        return share.future;
      },
    )));
    await _openExport(tester);
    await _confirmExport(tester);
    expect(calls, 1);
    service.changeOwner();
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pump();
    share.complete(const ShareResult('test', ShareResultStatus.success));
    await tester.pumpAndSettle();
    expect(find.text('Datenexport erstellt'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

const _ownerA = AuthSessionOwner(
    userId: 'export-account-a',
    sessionId: 'export-session-a',
    email: 'export-a@example.invalid',
    createdAt: null,
    epoch: 0);

Map<String, dynamic> _remote({String accountId = 'export-account-a'}) => {
      'schemaVersion': '1.0',
      'generatedAt': '2026-09-04T00:00:00Z',
      'accountId': accountId,
      'data': <String, dynamic>{'fixture': true},
    };

class _ExportService extends PrivacyExportService {
  final Completer<Map<String, dynamic>>? remote;
  final Map<String, dynamic>? response;
  final remoteStarted = Completer<void>();
  AuthSessionOwner activeOwner = _ownerA;
  int remoteCalls = 0;
  final localReads = <PrivacyExportSection>[];
  void Function(PrivacyExportSection)? afterLocal;

  _ExportService({this.remote, this.response});

  void changeOwner() {
    activeOwner = const AuthSessionOwner(
        userId: 'export-account-b',
        sessionId: 'export-session-b',
        email: 'export-b@example.invalid',
        createdAt: null,
        epoch: 1);
  }

  @override
  int get sessionEpoch => activeOwner.epoch;
  @override
  Future<AuthSessionOwner?> loadOwner() async => activeOwner;
  @override
  Future<bool> isOwnerCurrent(AuthSessionOwner owner) async =>
      identical(owner, activeOwner);
  @override
  Future<Map<String, dynamic>> readRemote(
      AuthSessionOwner owner, String currentPassword) async {
    expect(identical(owner, activeOwner), isTrue);
    remoteCalls++;
    if (!remoteStarted.isCompleted) remoteStarted.complete();
    return remote == null ? response ?? _remote() : remote!.future;
  }

  @override
  Future<Map<String, dynamic>> readLocal(PrivacyExportSection section) async {
    localReads.add(section);
    afterLocal?.call(section);
    return {'section': section.name, 'accountId': _ownerA.userId};
  }
}

Future<void> _confirmExport(WidgetTester tester) async {
  await tester.enterText(
      find.byKey(const ValueKey('privacy-data-export-password')), 'test-only');
  await tester.tap(find.byKey(const ValueKey('privacy-data-export-confirm')));
  await tester.pump();
  // Advance the actual route transition, not wall-clock/provider timing.
  await tester.pump(const Duration(milliseconds: 350));
}

Future<void> _openExport(WidgetTester tester) async {
  await tester.pumpAndSettle();
  final button = find.byKey(const ValueKey('privacy-data-export-button'));
  await tester.scrollUntilVisible(button, 500,
      scrollable: find.byType(Scrollable).last);
  await tester.pumpAndSettle();
  await tester.ensureVisible(button);
  await tester.drag(find.byType(Scrollable).last, const Offset(0, 120));
  await tester.pumpAndSettle();
  await tester
      .tap(find.widgetWithText(FilledButton, 'Meine Daten exportieren'));
  await tester.pumpAndSettle();
  expect(find.text('Datenexport bestätigen'), findsOneWidget);
}
