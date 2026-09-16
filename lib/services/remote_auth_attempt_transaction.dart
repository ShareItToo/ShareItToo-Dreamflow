typedef AuthAttemptCurrent = bool Function();
typedef AuthAttemptAsyncCurrent<T> = Future<bool> Function(T value);
typedef AuthAttemptAcquire<P> = Future<P> Function();
typedef AuthAttemptRemote<P, R> = Future<R> Function(P providerResult);
typedef AuthAttemptPersist<R, S> = Future<S> Function(R remoteResult);
typedef AuthAttemptCleanup<T> = Future<void> Function(T value);

class RemoteAuthAttemptSuperseded implements Exception {
  const RemoteAuthAttemptSuperseded();
}

/// Runs a remote authentication attempt without allowing an obsolete UI
/// action or no-session epoch to invoke a provider/backend or retain a newly
/// issued session.
///
/// [preflightCurrent] combines the UI action owner with the captured local
/// session epoch. It is checked synchronously before the first await, again
/// after provider acquisition and immediately after the remote exchange.
/// Once persistence legitimately advances the session epoch,
/// [persistedCurrent] verifies the exact new session instead.
class RemoteAuthAttemptTransaction<P, R, S> {
  const RemoteAuthAttemptTransaction();

  Future<S> run({
    required AuthAttemptCurrent preflightCurrent,
    required AuthAttemptCurrent actionCurrent,
    required AuthAttemptAcquire<P> acquire,
    required AuthAttemptRemote<P, R> invokeRemote,
    required AuthAttemptPersist<R, S> persist,
    required AuthAttemptCleanup<R> discardRemote,
    required AuthAttemptAsyncCurrent<S> persistedCurrent,
    required AuthAttemptCleanup<S> discardPersisted,
  }) async {
    if (!_isCurrent(preflightCurrent)) {
      throw const RemoteAuthAttemptSuperseded();
    }

    final providerResult = await acquire();
    if (!_isCurrent(preflightCurrent)) {
      throw const RemoteAuthAttemptSuperseded();
    }

    final remoteResult = await invokeRemote(providerResult);
    if (!_isCurrent(preflightCurrent)) {
      await _bestEffort(() => discardRemote(remoteResult));
      throw const RemoteAuthAttemptSuperseded();
    }

    late final S persisted;
    try {
      persisted = await persist(remoteResult);
    } catch (_) {
      await _bestEffort(() => discardRemote(remoteResult));
      rethrow;
    }

    var exactPersistedSessionCurrent = false;
    if (_isCurrent(actionCurrent)) {
      try {
        exactPersistedSessionCurrent = await persistedCurrent(persisted);
      } catch (_) {
        exactPersistedSessionCurrent = false;
      }
    }
    if (!_isCurrent(actionCurrent) || !exactPersistedSessionCurrent) {
      await _bestEffort(() => discardPersisted(persisted));
      throw const RemoteAuthAttemptSuperseded();
    }
    return persisted;
  }

  bool _isCurrent(AuthAttemptCurrent check) {
    try {
      return check();
    } catch (_) {
      return false;
    }
  }

  Future<void> _bestEffort(Future<void> Function() cleanup) async {
    try {
      await cleanup();
    } catch (_) {
      // The obsolete result stays unusable locally even when the remote
      // provider cannot confirm best-effort session revocation.
    }
  }
}
