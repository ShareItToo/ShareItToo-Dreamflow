import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const lock = read('pubspec.lock');
const packageConfigPath = resolve(root, '.dart_tool/package_config.json');
const packageConfig = JSON.parse(readFileSync(packageConfigPath, 'utf8'));
const printingPackage = packageConfig.packages.find(({ name }) => name === 'printing');
assert.ok(printingPackage, 'printing is missing from the resolved package config');

const packageRoot = fileURLToPath(
  new URL(printingPackage.rootUri, pathToFileURL(packageConfigPath)),
);
const printingApi = readFileSync(resolve(packageRoot, 'lib/src/printing.dart'), 'utf8');
const printingWeb = readFileSync(resolve(packageRoot, 'lib/printing_web.dart'), 'utf8');

const dartSources = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? dartSources(path) : extname(path) === '.dart' ? [path] : [];
  });

const appSources = dartSources(resolve(root, 'lib')).map((path) => ({
  path,
  source: readFileSync(path, 'utf8'),
}));

const methodBlock = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing method marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing method boundary: ${endMarker}`);
  return source.slice(start, end);
};

test('Printing remains locked to the reviewed adapter implementation', () => {
  assert.match(
    lock,
    /printing:\n[\s\S]*?dependency: "direct main"[\s\S]*?sha256: "689170c9ddb1bda85826466ba80378aa8993486d3c959a71cd7d2d80cb606692"[\s\S]*?version: "5\.14\.3"/u,
  );
  assert.equal(
    sha256(printingApi),
    '8a8cdbf5662ca5471d88b69cce8f4ee9839ab2a7abd67007a4e8e71d3f74822e',
  );
  assert.equal(
    sha256(printingWeb),
    '6fbf985bf14254a8d8dde66e0f6744f8622e30cca4cb91c558209a2152f0bf38',
  );
});

test('application code cannot reach Printing PDF.js preview or raster APIs', () => {
  const calls = appSources.flatMap(({ path, source }) =>
    [...source.matchAll(/\bPrinting\.(\w+)/gu)].map((match) => ({
      path,
      method: match[1],
    })));

  assert.deepEqual(
    [...new Set(calls.map(({ method }) => method))].sort(),
    ['layoutPdf', 'sharePdf'],
  );
  assert.equal(calls.filter(({ method }) => method === 'layoutPdf').length, 3);
  assert.equal(calls.filter(({ method }) => method === 'sharePdf').length, 1);
  assert.equal(
    appSources.filter(({ source }) => source.includes("package:printing/printing.dart")).length,
    3,
  );

  const combined = appSources.map(({ source }) => source).join('\n');
  assert.doesNotMatch(combined, /\bPdfPreview\b|\bPrintingPlatform\b/u);
  assert.doesNotMatch(
    combined,
    /\bPrinting\.(?:info|raster|convertHtml|directPrintPdf|listPrinters|pickPrinter)\b/u,
  );
});

test('the approved web delivery methods do not initialize the PDF.js loader', () => {
  assert.match(printingWeb, /static const _pdfJsVersion = '3\.2\.146';/u);
  assert.equal([...printingWeb.matchAll(/await _initPlugin\(\);/gu)].length, 2);

  const layout = methodBlock(
    printingWeb,
    'Future<bool> layoutPdf(',
    '\n  @override\n  Future<bool> sharePdf(',
  );
  const share = methodBlock(
    printingWeb,
    'Future<bool> sharePdf(',
    '\n  Future<bool> _getPdf(',
  );
  const info = methodBlock(
    printingWeb,
    'Future<PrintingInfo> info()',
    '\n  @override\n  Future<bool> layoutPdf(',
  );
  const raster = methodBlock(
    printingWeb,
    'Stream<PdfRaster> raster(',
    '\n}\n\nclass _WebPdfRaster',
  );

  for (const approved of [layout, share]) {
    assert.doesNotMatch(
      approved,
      /_initPlugin|pdfjsLib|_pdfJsUrlBase|getDocument|\.raster\b/u,
    );
  }
  assert.match(info, /await _initPlugin\(\);/u);
  assert.match(raster, /await _initPlugin\(\);/u);
});

test('the complete regression retains the PDF.js reachability contract', () => {
  assert.match(
    read('scripts/technical_regression_check.sh'),
    /^node --test test\/tool\/printing_web_pdfjs_reachability\.test\.mjs$/mu,
  );
});
