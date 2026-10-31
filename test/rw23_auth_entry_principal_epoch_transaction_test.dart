import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('obsolete local login cannot write or replace a session', () async {
    final password = <String>['Synthetic', 'auth', 'password', '23'].join('-');
    SharedPreferences.setMockInitialValues({
      'auth_seeded_v1': true,
      'auth_accounts_v1': jsonEncode([
        {
          'email': 'account-a@example.invalid',
          'password': password,
          'createdAt': DateTime.utc(2026, 9, 3).toIso8601String(),
        },
        {
          'email': 'account-b@example.invalid',
          'password': password,
          'createdAt': DateTime.utc(2026, 9, 3).toIso8601String(),
        },
      ]),
    });

    final emptyEpoch = AuthService.sessionEpoch;
    final obsolete = await AuthService.signInWithEmailPassword(
      email: 'account-a@example.invalid',
      password: password,
      expectedSessionEpoch: emptyEpoch,
      isActionCurrent: () => false,
    );
    expect(obsolete.failure, AuthFailure.principalChanged);
    expect(await AuthService.readSession(), isNull);

    final accountA = await AuthService.signInWithEmailPassword(
      email: 'account-a@example.invalid',
      password: password,
      expectedSessionEpoch: emptyEpoch,
      isActionCurrent: () => true,
    );
    expect(accountA.ok, isTrue);
    expect(
        (await AuthService.readSession())?.email, 'account-a@example.invalid');

    final staleAccountB = await AuthService.signInWithEmailPassword(
      email: 'account-b@example.invalid',
      password: password,
      expectedSessionEpoch: emptyEpoch,
      isActionCurrent: () => true,
    );
    expect(staleAccountB.failure, AuthFailure.principalChanged);
    expect(
        (await AuthService.readSession())?.email, 'account-a@example.invalid');
  });

  test('remote auth transaction enforces every principal boundary', () {
    final source = File(
      'lib/services/remote_auth_attempt_transaction.dart',
    ).readAsStringSync();

    final beforeAcquire =
        source.indexOf('final providerResult = await acquire()');
    final firstPreflight = source.indexOf('if (!_isCurrent(preflightCurrent))');
    final afterAcquire = source.indexOf(
      'if (!_isCurrent(preflightCurrent))',
      firstPreflight + 1,
    );
    final remote = source.indexOf('final remoteResult = await invokeRemote');
    final afterRemote = source.indexOf(
      'if (!_isCurrent(preflightCurrent))',
      afterAcquire + 1,
    );
    final persist = source.indexOf('persisted = await persist(remoteResult)');

    expect(firstPreflight, inInclusiveRange(0, beforeAcquire));
    expect(afterAcquire, inInclusiveRange(beforeAcquire, remote));
    expect(afterRemote, inInclusiveRange(remote, persist));
    expect(source, contains('discardRemote(remoteResult)'));
    expect(source, contains('persistedCurrent(persisted)'));
    expect(source, contains('discardPersisted(persisted)'));
    expect(source, contains('_isCurrent(actionCurrent)'));
  });

  test('email and social entry screens wire epoch and typed stale result', () {
    final auth = File('lib/services/auth_service.dart').readAsStringSync();
    final login = File('lib/screens/login_screen.dart').readAsStringSync();
    final register =
        File('lib/screens/register_screen.dart').readAsStringSync();

    expect(
      RegExp(r'RemoteAuthAttemptTransaction<').allMatches(auth).length,
      greaterThanOrEqualTo(2),
    );
    expect(auth, contains('expectedGeneration: expectedSessionEpoch'));
    expect(auth, contains('AuthFailure.principalChanged'));
    expect(auth, contains('_discardIssuedRemoteSession'));
    expect(auth, contains('_discardPersistedAuthResult'));

    final emailCall = _methodSlice(
      login,
      'Future<void> _submit()',
      'void _goHome',
    );
    final socialLogin = _methodSlice(
      login,
      'Future<void> _socialSignIn',
      'Future<bool> _retainSuccessfulSocialLoginOwner',
    );
    final socialRegister = _methodSlice(
      register,
      'Future<void> _socialRegister',
      'bool _isSocialActionCurrent',
    );

    for (final entry in [emailCall, socialLogin, socialRegister]) {
      expect(entry, contains('expectedSessionEpoch:'));
      expect(entry, contains('isActionCurrent:'));
      expect(entry, contains('AuthFailure.principalChanged'));
      expect(entry, contains('clearSessionOwnerIfMatches'));
      expect(entry, isNot(contains('AuthService.clearSession()')));
    }
    expect(
      socialRegister.indexOf('final noSessionEpoch = AuthService.sessionEpoch'),
      lessThan(socialRegister.indexOf('await AuthService')),
    );
    expect(
      socialLogin.indexOf('final noSessionEpoch = _confirmedNoSessionEpoch'),
      lessThan(socialLogin.indexOf('await AuthService')),
    );
  });
}

String _methodSlice(String source, String startMarker, String endMarker) {
  final start = source.indexOf(startMarker);
  final end = source.indexOf(endMarker, start + startMarker.length);
  expect(start, isNonNegative, reason: 'Missing $startMarker');
  expect(end, greaterThan(start), reason: 'Missing $endMarker');
  return source.substring(start, end);
}
