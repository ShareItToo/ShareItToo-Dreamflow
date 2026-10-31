import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/remote_auth_attempt_transaction.dart';

void main() {
  const transaction = RemoteAuthAttemptTransaction<String, String, String>();

  test('obsolete owner stops before the first provider await', () async {
    var providerCalled = false;
    var remoteCalled = false;

    await expectLater(
      transaction.run(
        preflightCurrent: () => false,
        actionCurrent: () => false,
        acquire: () async {
          providerCalled = true;
          return 'provider';
        },
        invokeRemote: (_) async {
          remoteCalled = true;
          return 'remote';
        },
        persist: (_) async => 'persisted',
        discardRemote: (_) async {},
        persistedCurrent: (_) async => true,
        discardPersisted: (_) async {},
      ),
      throwsA(isA<RemoteAuthAttemptSuperseded>()),
    );
    expect(providerCalled, isFalse);
    expect(remoteCalled, isFalse);
  });

  test('epoch change in provider chooser stops before remote exchange',
      () async {
    var current = true;
    var remoteCalled = false;

    await expectLater(
      transaction.run(
        preflightCurrent: () => current,
        actionCurrent: () => current,
        acquire: () async {
          current = false;
          return 'provider';
        },
        invokeRemote: (_) async {
          remoteCalled = true;
          return 'remote';
        },
        persist: (_) async => 'persisted',
        discardRemote: (_) async {},
        persistedCurrent: (_) async => true,
        discardPersisted: (_) async {},
      ),
      throwsA(isA<RemoteAuthAttemptSuperseded>()),
    );
    expect(remoteCalled, isFalse);
  });

  test('epoch change during remote exchange revokes before persistence',
      () async {
    var current = true;
    var remoteDiscarded = false;
    var persisted = false;

    await expectLater(
      transaction.run(
        preflightCurrent: () => current,
        actionCurrent: () => current,
        acquire: () async => 'provider',
        invokeRemote: (_) async {
          current = false;
          return 'remote';
        },
        persist: (_) async {
          persisted = true;
          return 'persisted';
        },
        discardRemote: (_) async => remoteDiscarded = true,
        persistedCurrent: (_) async => true,
        discardPersisted: (_) async {},
      ),
      throwsA(isA<RemoteAuthAttemptSuperseded>()),
    );
    expect(remoteDiscarded, isTrue);
    expect(persisted, isFalse);
  });

  test('persistence failure best-effort revokes the issued remote session',
      () async {
    var remoteDiscarded = false;

    await expectLater(
      transaction.run(
        preflightCurrent: () => true,
        actionCurrent: () => true,
        acquire: () async => 'provider',
        invokeRemote: (_) async => 'remote',
        persist: (_) async => throw StateError('storage unavailable'),
        discardRemote: (_) async => remoteDiscarded = true,
        persistedCurrent: (_) async => true,
        discardPersisted: (_) async {},
      ),
      throwsStateError,
    );
    expect(remoteDiscarded, isTrue);
  });

  test('late UI owner loss removes only the exact newly persisted session',
      () async {
    var actionCurrent = true;
    var persistedDiscarded = false;

    await expectLater(
      transaction.run(
        preflightCurrent: () => actionCurrent,
        actionCurrent: () => actionCurrent,
        acquire: () async => 'provider',
        invokeRemote: (_) async => 'remote',
        persist: (_) async {
          actionCurrent = false;
          return 'persisted-a';
        },
        discardRemote: (_) async {},
        persistedCurrent: (_) async => true,
        discardPersisted: (value) async {
          expect(value, 'persisted-a');
          persistedDiscarded = true;
        },
      ),
      throwsA(isA<RemoteAuthAttemptSuperseded>()),
    );
    expect(persistedDiscarded, isTrue);
  });

  test('success requires exact persisted-session currentness', () async {
    var persistedDiscarded = false;

    await expectLater(
      transaction.run(
        preflightCurrent: () => true,
        actionCurrent: () => true,
        acquire: () async => 'provider',
        invokeRemote: (_) async => 'remote',
        persist: (_) async => 'persisted-a',
        discardRemote: (_) async {},
        persistedCurrent: (_) async => false,
        discardPersisted: (_) async => persistedDiscarded = true,
      ),
      throwsA(isA<RemoteAuthAttemptSuperseded>()),
    );
    expect(persistedDiscarded, isTrue);
  });

  test('current owner retains the exact successful remote session', () async {
    var remoteDiscarded = false;
    var persistedDiscarded = false;

    final result = await transaction.run(
      preflightCurrent: () => true,
      actionCurrent: () => true,
      acquire: () async => 'provider',
      invokeRemote: (_) async => 'remote',
      persist: (_) async => 'persisted-a',
      discardRemote: (_) async => remoteDiscarded = true,
      persistedCurrent: (value) async => value == 'persisted-a',
      discardPersisted: (_) async => persistedDiscarded = true,
    );

    expect(result, 'persisted-a');
    expect(remoteDiscarded, isFalse);
    expect(persistedDiscarded, isFalse);
  });
}
