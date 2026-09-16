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

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('analyzer-confirmed legacy message-thread widgets stay absent', () => {
  for (const name of [
    '_MetaPill',
    '_InfoRow',
    '_TrustBanner',
    '_ActionBar',
    '_SITButton',
    '_InputBar',
    '_ComposerIconButton',
    '_TimeAgreementButtons',
    '_CompactTransactionCTA',
    '_InlineIconButton',
    '_StickyTransactionCTA',
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`, 'u'));
  }
  assert.doesNotMatch(source, /ignore:\s*(unused_element|unused_element_parameter)/u);
});

test('active transaction composer retains booking and time gates', () => {
  const composer = between(
    'class _TransactionComposer extends StatefulWidget',
    'class _CombinedActionRow extends StatelessWidget',
  );
  assert.match(composer, /class _TransactionComposerState/u);
  assert.match(composer, /showHandoverTimeButton/u);
  assert.match(composer, /showReturnTimeButton/u);
  assert.match(composer, /child: _CombinedActionRow\(/u);
  assert.match(composer, /primaryEnabled:[\s\S]*widget\.handoverConfirmed[\s\S]*widget\.returnConfirmed/u);
  assert.match(composer, /child: _HandoverCountdown\(/u);
  assert.match(composer, /_GlassInputBar\([\s\S]*onSend: widget\.onSend/u);
});

test('active composer keeps text photo file location and time actions', () => {
  const input = between(
    'class _GlassInputBar extends StatefulWidget',
    'class _InlineFocusedIcon extends StatelessWidget',
  );
  for (const action of [
    'onSend',
    'onShareLocation',
    'onSendPhoto',
    'onPickFile',
    'onChangeTime',
  ]) {
    assert.match(input, new RegExp(`widget\\.${action}\\b`, 'u'));
  }
  assert.match(source, /Future<void> _applyPrimaryAction\(\)/u);
  assert.match(source, /Future<void> _applySecondaryAction\(\)/u);
  assert.match(source, /Future<void> _handleTimeProposal\(/u);
});

test('active booking summary and interaction primitives remain', () => {
  assert.match(source, /class _CompactBookingCard extends StatelessWidget/u);
  assert.match(source, /class _StatusBadge extends StatelessWidget/u);
  assert.match(source, /class _PressScale extends StatefulWidget/u);
  assert.match(source, /class _GlassIconButton extends StatelessWidget/u);
});

test('message-thread legacy UI ratchet is permanently registered', () => {
  assert.match(
    regression,
    /node --test test\/tool\/message_thread_legacy_ui_ratchet_wiring\.test\.mjs/u,
  );
});
