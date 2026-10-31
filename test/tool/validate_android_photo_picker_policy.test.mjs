import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = readFileSync(
  resolve(root, 'android/app/src/main/AndroidManifest.xml'),
  'utf8',
);
const listing = readFileSync(resolve(root, 'lib/screens/create_listing_screen.dart'), 'utf8');
const chat = readFileSync(resolve(root, 'lib/screens/message_thread_screen.dart'), 'utf8');
const handover = readFileSync(
  resolve(root, 'lib/widgets/return_handover_stepper_sheet.dart'),
  'utf8',
);

test('Android uses user-selected photos without broad media-library access', () => {
  assert.doesNotMatch(manifest, /android\.permission\.READ_MEDIA_IMAGES/);
  assert.doesNotMatch(manifest, /android\.permission\.READ_MEDIA_VIDEO/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(listing, /pickMultiImage\(/);
  assert.match(chat, /ImageSource\.gallery/);
  assert.match(handover, /FilePicker\.pickFiles\(/);
});

test('confirmed handover and return times keep the enabled start action visible', () => {
  assert.match(chat, /showPrimaryAction:\s*showActions,/);
  assert.doesNotMatch(
    chat,
    /showPrimaryAction:\s*showActions\s*&&[\s\S]{0,500}(?:handoverConfirmed|returnConfirmed)/,
  );
});
