import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAnalyzerDebtSnapshot,
  validateAnalyzerDebt,
} from '../../tool/validate_flutter_analyzer_debt.mjs';

function analyzerLog(lines) {
  return [
    'Analyzing fixture...',
    ...lines,
    `${lines.length} issues found.`,
  ].join('\n');
}

const first = "warning • The field is unused • lib/first.dart:10:2 • unused_field";
const second = "info • Do not retain context • lib/second.dart:20:4 • use_build_context_synchronously";

test('accepts only the exact analyzer diagnostic fingerprint', () => {
  const logText = analyzerLog([first, second]);
  const baseline = buildAnalyzerDebtSnapshot(logText);

  const result = validateAnalyzerDebt({ logText, baseline });

  assert.equal(result.total, 2);
  assert.equal(result.byCode.unused_field, 1);
  assert.equal(result.byCode.use_build_context_synchronously, 1);
});

test('accepts the native Flutter zero-issue summary as an exact empty snapshot', () => {
  const logText = [
    'Analyzing fixture...',
    'No issues found! (ran in 1.0s)',
  ].join('\n');
  const baseline = buildAnalyzerDebtSnapshot(logText);

  const result = validateAnalyzerDebt({ logText, baseline });

  assert.equal(result.total, 0);
  assert.deepEqual(result.byCode, {});
  assert.deepEqual(result.byPathCode, {});
});

test('rejects an unratcheted improvement so the old ceiling cannot return', () => {
  const baseline = buildAnalyzerDebtSnapshot(analyzerLog([first, second]));

  assert.throws(
    () => validateAnalyzerDebt({ logText: analyzerLog([first]), baseline }),
    /expected 2, actual 1/u,
  );
});

test('rejects a replacement issue even when the total stays unchanged', () => {
  const baseline = buildAnalyzerDebtSnapshot(analyzerLog([first, second]));
  const replacement = "warning • A different field is unused • lib/first.dart:11:2 • unused_field";

  assert.throws(
    () => validateAnalyzerDebt({ logText: analyzerLog([replacement, second]), baseline }),
    /diagnostic message fingerprint changed/u,
  );
});

test('rejects output whose summary and parsed diagnostics disagree', () => {
  assert.throws(
    () => buildAnalyzerDebtSnapshot([
      'Analyzing fixture...',
      first,
      '2 issues found.',
    ].join('\n')),
    /reported 2 issues but 1 diagnostics were parsed/u,
  );
});
