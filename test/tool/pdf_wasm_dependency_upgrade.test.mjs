import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const pubspec = read('pubspec.yaml');
const lock = read('pubspec.lock');
const regressionRunner = read('scripts/technical_regression_check.sh');
const pdfService = read('lib/services/invoice_pdf_service.dart');

const sha256 = (path) => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');

const lockedVersion = (packageName) => {
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = lock.match(
    new RegExp(
      `^  ${escapedName}:\\n(?:(?!^  [^ ]).)*?^    version: "([^"]+)"$`,
      'msu',
    ),
  );
  assert.ok(match, `missing lock entry for ${packageName}`);
  return match[1];
};

test('PDF dependencies retain the reviewed WebAssembly-compatible floor and lock', () => {
  assert.match(pubspec, /^  printing: \^5\.14\.3$/mu);
  assert.match(pubspec, /^  pdf: \^3\.12\.0$/mu);
  assert.equal(lockedVersion('printing'), '5.14.3');
  assert.equal(lockedVersion('pdf'), '3.12.0');
  assert.equal(lockedVersion('image'), '4.9.2');
});

test('the release regression keeps the WebAssembly dry run enabled', () => {
  assert.match(
    regressionRunner,
    /^node --test test\/tool\/pdf_wasm_dependency_upgrade\.test\.mjs$/mu,
  );
  assert.match(
    regressionRunner,
    /web_build_output="\$\(flutter build web --debug 2>&1\)"/u,
  );
  assert.match(
    regressionRunner,
    /Wasm dry run findings\|avoid_double_and_int_checks/u,
  );
  assert.doesNotMatch(regressionRunner, /--no-wasm-dry-run/u);
});

test('financial PDFs use versioned offline fonts with the reviewed license', () => {
  assert.match(pubspec, /^    - assets\/fonts\/$/mu);
  assert.match(pubspec, /^    - assets\/licenses\/$/mu);
  assert.match(pdfService, /rootBundle\.load\(_regularFontAsset\)/u);
  assert.match(pdfService, /rootBundle\.load\(_boldFontAsset\)/u);
  assert.doesNotMatch(pdfService, /PdfGoogleFonts|http\.|https?:\/\//u);
  assert.equal(
    sha256('assets/fonts/Roboto-Regular.ttf'),
    '1ee8483b140ddfbbb8548838935a9878a6eda018aa1c39f4bf29d65b14a052db',
  );
  assert.equal(
    sha256('assets/fonts/Roboto-Bold.ttf'),
    '28874d37d069dc482e8486d5db06a3fcb31ab9c38b37c210afaf14bc7b550535',
  );
  assert.equal(
    sha256('assets/licenses/Roboto-OFL.txt'),
    'ee94f8704aa81e9a3bf4271e8320e99d975a3ee08ea45a088b494b918476ec12',
  );
});
