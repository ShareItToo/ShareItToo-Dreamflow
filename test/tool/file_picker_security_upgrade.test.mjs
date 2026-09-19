import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const pubspec = read('pubspec.yaml');
const lock = read('pubspec.lock');
const regressionRunner = read('scripts/technical_regression_check.sh');
const pickerSources = [
  'lib/screens/create_listing_screen.dart',
  'lib/screens/message_thread_screen.dart',
  'lib/widgets/return_handover_stepper_sheet.dart',
].map(read);

test('file picker retains the reviewed security floor and exact lock', () => {
  assert.match(pubspec, /^  file_picker: \^11\.0\.3$/mu);
  assert.match(
    lock,
    /file_picker:\n[\s\S]*?dependency: "direct main"[\s\S]*?version: "11\.0\.3"/u,
  );
});

test('all SIT picker calls use the reviewed static API', () => {
  const combined = pickerSources.join('\n');
  assert.doesNotMatch(combined, /FilePicker\.platform/u);
  assert.equal(combined.match(/FilePicker\.pickFiles\(/gu)?.length, 3);
});

test('the complete regression retains the picker security contract', () => {
  assert.match(
    regressionRunner,
    /^node --test test\/tool\/file_picker_security_upgrade\.test\.mjs$/mu,
  );
});
