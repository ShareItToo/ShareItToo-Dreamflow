import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('release UI has no runtime Google Fonts dependency', async () => {
  const [pubspec, theme, teaser] = await Promise.all([
    read('pubspec.yaml'),
    read('lib/theme.dart'),
    read('lib/widgets/monetize_teaser_card.dart'),
  ]);

  assert.doesNotMatch(pubspec, /^\s+google_fonts:/m);
  assert.doesNotMatch(theme, /package:google_fonts|GoogleFonts\./);
  assert.doesNotMatch(teaser, /package:google_fonts|GoogleFonts\./);
  assert.match(theme, /Theme\.of\(context\)\s*\.textTheme\s*\.apply/);
  assert.match(teaser, /final TextStyle base = TextStyle\(/);
});

test('transient realtime failures stay non-fatal in both error paths', async () => {
  const runtime = await read('lib/services/firebase_runtime.dart');

  assert.match(
    runtime,
    /bool shouldRecordUnhandledErrorAsFatal\(Object error\)[\s\S]*?error is! WebSocketChannelException/,
  );
  assert.match(
    runtime,
    /recordFlutterFatalError\(FlutterErrorDetails details\)[\s\S]*?!shouldRecordUnhandledErrorAsFatal\(details\.exception\)[\s\S]*?fatal: false[\s\S]*?Transient realtime connectivity failure/,
  );
  assert.match(
    runtime,
    /recordUnhandledError\(Object error, StackTrace stack\)[\s\S]*?fatal: shouldRecordUnhandledErrorAsFatal\(error\)/,
  );
});
