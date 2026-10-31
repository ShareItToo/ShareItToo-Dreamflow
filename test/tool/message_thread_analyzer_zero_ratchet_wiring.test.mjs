import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/message_thread_screen.dart', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);
const baseline = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/release-readiness/flutter-analyzer-debt-baseline.json',
    import.meta.url,
  ),
  'utf8',
));

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('message input cannot regain its disconnected animation-controller chain', () => {
  const input = between(
    'class _GlassInputBar extends StatefulWidget',
    'class _InlineFocusedIcon extends StatelessWidget',
  );
  for (const name of [
    'SingleTickerProviderStateMixin',
    '_animController',
    '_animDuration',
    '_fadeOuterIcons',
    '_fadeInnerIcons',
    'isComposing',
  ]) {
    assert.doesNotMatch(input, new RegExp(`\\b${name}\\b`, 'u'));
  }
});

test('active focus transitions and listener lifecycle remain', () => {
  const input = between(
    'class _GlassInputBar extends StatefulWidget',
    'class _InlineFocusedIcon extends StatelessWidget',
  );
  assert.match(input, /_focusAnimDuration/u);
  assert.match(input, /AnimatedSwitcher\(/u);
  assert.match(input, /AnimatedContainer\(/u);
  assert.match(input, /widget\.focusNode\.addListener\(_onFocusChanged\)/u);
  assert.match(input, /widget\.controller\.addListener\(_onTextChanged\)/u);
  assert.match(input, /widget\.focusNode\.removeListener\(_onFocusChanged\)/u);
  assert.match(input, /widget\.controller\.removeListener\(_onTextChanged\)/u);
  assert.match(source, /final isComposing = value\.text\.trim\(\)\.isNotEmpty \|\| _inputFocused/u);
});

test('location fallback permanently represents the only selected non-loading state', () => {
  const fallback = between(
    'class _LocationMapFallback extends StatelessWidget',
    'class _SheetActionTile extends StatelessWidget',
  );
  assert.match(fallback, /const _LocationMapFallback\(\);/u);
  assert.match(fallback, /CustomPaint\(painter: _LocationGridPainter\(\)\)/u);
  assert.doesNotMatch(fallback, /\bloading\b/u);
  assert.doesNotMatch(fallback, /CircularProgressIndicator/u);
});

test('committed analyzer baseline is exactly empty', () => {
  assert.equal(baseline.total, 0);
  assert.deepEqual(baseline.byCode, {});
  assert.deepEqual(baseline.byPathCode, {});
});

test('message-thread analyzer-zero ratchet is permanently registered', () => {
  assert.match(
    regression,
    /node --test test\/tool\/message_thread_analyzer_zero_ratchet_wiring\.test\.mjs/u,
  );
});
