import assert from 'node:assert/strict';
import test from 'node:test';
import { assetName, checkMatrix } from '../support/notification_release_probe.mjs';

const origin = 'http://127.0.0.1:49152';
const files = new Set(['index.html', 'main.dart.js', 'canvaskit/canvaskit.wasm']);

test('only exact loopback-origin inventoried assets are admitted', () => {
  assert.equal(assetName(`${origin}/`, origin, files), 'index.html');
  assert.equal(assetName(`${origin}/main.dart.js`, origin, files), 'main.dart.js');
  assert.equal(assetName(`${origin}/canvaskit/canvaskit.wasm`, origin, files), 'canvaskit/canvaskit.wasm');
  for (const value of [
    'https://shareittoo.com/api/v1/notifications', 'https://outside.invalid/',
    'http://127.0.0.1:49153/main.dart.js', `${origin}/main.dart.js?token=synthetic`,
    `${origin}/main.dart.js#fragment`, `${origin}/api/v1/notifications`,
    `${origin}/%6dain.dart.js`, `${origin}/.env`, 'data:text/plain,synthetic',
    'http://user@127.0.0.1:49152/main.dart.js',
  ]) assert.equal(assetName(value, origin, files), null);
});

test('release/relaunch matrix requires every ordered pass, not partial completion', () => {
  const rows = ['initial-owner', 'current-cta-opens-chat', 'page-reload-read', 'process-relaunch-read',
    'renter-after-switch', 'old-row-rejected', 'owner-new-session',
    'same-owner-session-detail-closed', 'old-cta-rejected', 'logout-empty',
    'logout-page-reload-empty', 'logout-process-relaunch-empty'].map(phase => ({ phase, passed: true }));
  assert.doesNotThrow(() => checkMatrix(rows));
  assert.throws(() => checkMatrix(rows.slice(0, -1)), /matrix-phases/);
  assert.throws(() => checkMatrix([...rows].reverse()), /matrix-phases/);
  assert.throws(() => checkMatrix(rows.map((r, i) => i === 2 ? { ...r, passed: false } : r)), /matrix-failure/);
});
