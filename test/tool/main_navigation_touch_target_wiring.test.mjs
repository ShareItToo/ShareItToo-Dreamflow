import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../../lib/navigation/main_navigation.dart', import.meta.url),
  'utf8',
);

test('all five primary destinations use the permanent 48dp wrapper', () => {
  assert.match(
    source,
    /mainNavigationMinimumTouchTarget\s*=\s*kMinInteractiveDimension/u,
  );
  assert.match(
    source,
    /SizedBox\([\s\S]*?width:\s*mainNavigationMinimumTouchTarget,[\s\S]*?height:\s*mainNavigationMinimumTouchTarget,[\s\S]*?Center\(child:\s*child\)/u,
  );
  const itemBlocks = [...source.matchAll(
    /BottomNavigationBarItem\([\s\S]*?label:\s*l10n\.t\(mainNavigationLabelKeys\[(\d)\]\),[\s\S]*?\),/gu,
  )];
  assert.deepEqual(itemBlocks.map((match) => match[1]), ['0', '1', '2', '3', '4']);
  for (const match of itemBlocks) {
    assert.match(match[0], /icon:\s*mainNavigationTouchTarget\(/u);
    assert.match(match[0], /activeIcon:\s*mainNavigationTouchTarget\(/u);
  }
});

test('the remediation adds no timing, lint or platform workaround', () => {
  assert.doesNotMatch(source, /Future\.delayed|ignore:|kIsWeb\s*\?/u);
});
