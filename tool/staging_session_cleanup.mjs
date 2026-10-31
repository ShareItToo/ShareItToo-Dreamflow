import { AsyncLocalStorage } from 'node:async_hooks';

const sessionScope = new AsyncLocalStorage();

export function registerStagingSessionForCleanup(refreshToken) {
  const sessions = sessionScope.getStore();
  if (!sessions || typeof refreshToken !== 'string' || refreshToken.length < 20) {
    throw new Error('A revocable Staging session requires an active cleanup scope.');
  }
  sessions.push(refreshToken);
}

export async function withStagingSessionCleanup(revokeSession, operation) {
  if (typeof revokeSession !== 'function' || typeof operation !== 'function') {
    throw new TypeError('A Staging session cleanup scope requires revocation and operation functions.');
  }
  if (sessionScope.getStore()) return operation();

  const sessions = [];
  return sessionScope.run(sessions, async () => {
    let operationFailed = false;
    try {
      return await operation();
    } catch (error) {
      operationFailed = true;
      throw error;
    } finally {
      const results = await Promise.allSettled(
        [...sessions].reverse().map((refreshToken) => revokeSession(refreshToken)),
      );
      if (results.some((result) => result.status === 'rejected')) {
        throw new Error(operationFailed
          ? 'The Staging operation failed and a created session could not be revoked.'
          : 'A created Staging session could not be revoked.');
      }
    }
  });
}
