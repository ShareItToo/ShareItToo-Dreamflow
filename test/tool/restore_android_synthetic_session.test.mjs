import assert from 'node:assert/strict';
import test from 'node:test';

import {
  rebindSyntheticSession,
} from '../../tool/restore_android_synthetic_session.mjs';

test('rebinds the requested synthetic role instead of accepting an unrelated active session', async () => {
  const calls = [];
  const options = {
    commandRunner: () => {},
    adbPath: 'adb',
    device: { serial: 'private-device' },
    wait: async () => {},
    account: { role: 'owner' },
    ensureGuest: async (received) => {
      calls.push(['guest', received.account]);
      return true;
    },
    restore: async (received) => {
      calls.push(['restore', received.account.role]);
      return true;
    },
  };

  assert.equal(await rebindSyntheticSession(options), true);
  assert.deepEqual(calls, [
    ['guest', undefined],
    ['restore', 'owner'],
  ]);
});

test('does not enter credentials when the guest state cannot be established', async () => {
  let restoreCalled = false;
  const restored = await rebindSyntheticSession({
    commandRunner: () => {},
    adbPath: 'adb',
    device: { serial: 'private-device' },
    wait: async () => {},
    account: { role: 'owner' },
    ensureGuest: async () => false,
    restore: async () => {
      restoreCalled = true;
      return true;
    },
  });

  assert.equal(restored, false);
  assert.equal(restoreCalled, false);
});
