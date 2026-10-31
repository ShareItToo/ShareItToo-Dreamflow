import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourcePath = new URL('../../lib/services/data_service.dart', import.meta.url);
const source = await readFile(sourcePath, 'utf8');

test('backend session hydration refreshes the cached profile once per exact session', () => {
  assert.match(source, /_lastBackendProfileHydrationSessionKey/u);
  assert.match(
    source,
    /syncCurrentUserForSessionOwner\(\s*AuthService\.captureSessionOwner\(session\),/u,
  );
  assert.match(
    source,
    /if \(hydrated != null\) \{\s*userJson = jsonEncode\(hydrated\.toJson\(\)\);/u,
  );
  assert.match(
    source,
    /_lastBackendProfileHydrationSessionKey != sessionKey/u,
  );
});

test('authoritative hydration uses the read-only owner-bound profile endpoint', () => {
  assert.match(
    source,
    /BackendRepository\.getCurrentProfileForOwner\(owner\)/u,
  );
  assert.match(
    source,
    /if \(BackendConfig\.enabled && !QaRuntimeService\.isEnabled\) \{\s*\n\s*final hydrated = await syncCurrentUserForSessionOwner/u,
  );
  assert.doesNotMatch(
    source,
    /BackendConfig\.enabled && !QaRuntimeService\.isEnabled\) \{[\s\S]{0,220}syncCurrentUserForSessionEmail\(session\.email\)/u,
  );
});
