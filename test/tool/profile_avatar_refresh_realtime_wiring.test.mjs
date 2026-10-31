import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const realtime = readFileSync('lib/services/backend_realtime_service.dart', 'utf8');
const publicProfile = readFileSync('lib/screens/public_profile_screen.dart', 'utf8');

test('backend profile events invalidate the cached owner before notifying profile readers', () => {
  assert.match(
    realtime,
    /case 'profiles':\s+return const \{SharedPersistenceSync\.profileStateKey\};/u,
  );
  const handlerStart = realtime.indexOf('static Future<void> _handleMessage');
  const handlerEnd = realtime.indexOf('static void _scheduleReconnect', handlerStart);
  const handler = realtime.slice(handlerStart, handlerEnd);
  const clearCachedOwner = handler.indexOf("await prefs.remove('currentUser')");
  const notifyReaders = handler.indexOf('SharedPersistenceSync.notify(key)');
  assert.ok(clearCachedOwner >= 0 && notifyReaders > clearCachedOwner,
    'cross-tab readers must reload after the stale owner cache is cleared');
});

test('mounted public profile reloads on profile state while retaining security invalidation', () => {
  assert.match(
    publicProfile,
    /if \(!mounted\) return;[\s\S]*?if \(key == SharedPersistenceSync\.accountSecurityStateKey\) \{[\s\S]*?_safetyActions\.invalidate\(\);[\s\S]*?unawaited\(_load\(\)\);[\s\S]*?\} else if \(key == SharedPersistenceSync\.profileStateKey\) \{[\s\S]*?unawaited\(_load\(\)\);/u,
  );
});
