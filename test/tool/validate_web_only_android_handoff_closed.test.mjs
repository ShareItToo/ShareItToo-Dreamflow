import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWebOnlyAndroidHandoffClosed } from '../../tool/validate_web_only_android_handoff_closed.mjs';
import { checkCurrentConsumerClosure } from '../../tool/check_current_consumer_closure.mjs';

test('Web-only current source requires the exact historical Android rejection', () => {
  assert.deepEqual(validateWebOnlyAndroidHandoffClosed(), {
    status: 'web-only-android-handoff-blocked', androidCompatible: false,
    expectedFailure: 'Android compatibility file bytes changed: backend/src/app.js.',
  });
});
test('unexpected compatibility PASS cannot close the Web-only consumer', () => {
  assert.throws(() => validateWebOnlyAndroidHandoffClosed({ validate: () => [] }),
    /^Error: web_only_android_handoff_unexpected_pass$/u);
});
test('unrelated handoff failures cannot masquerade as expected incompatibility', () => {
  for (const message of ['missing source', 'Android compatibility file bytes changed: backend/src/other.js.']) {
    const failure = Error(message);
    assert.throws(() => validateWebOnlyAndroidHandoffClosed({ validate: () => { throw failure; } }),
      (error) => error === failure);
  }
});
test('consumer closure includes the negative Android gate for app changes', () => {
  const result = checkCurrentConsumerClosure({ changedPaths: ['backend/src/app.js'] });
  assert.ok(result.consumerTests.includes('test/tool/validate_web_only_android_handoff_closed.test.mjs'));
});
