import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const service = read('lib/services/invoices_service.dart');
const renter = read('lib/screens/booking_detail_screen.dart');
const owner = read('lib/screens/ongoing_owner_detail_screen.dart');
const detail = read('lib/screens/invoice_detail_screen.dart');

test('release invoices come from the authenticated financial document endpoint', () => {
  assert.match(service, /BackendRepository\.getFinancialDocuments\(\)/u);
  assert.match(service, /BackendRepository\.downloadFinancialDocument\(invoice\.id\)/u);
  assert.match(service, /x-sit-artifact-sha256/u);
  assert.match(service, /observed != invoice\.artifactSha256\.toLowerCase\(\)/u);
  assert.match(service, /BackendConfig\.enabled && !QaRuntimeService\.isEnabled/u);
  assert.match(service, /if \(!QaRuntimeService\.isEnabled\) return const \[\]/u);
  assert.doesNotMatch(service, /quoteForItem|platformFeeMinor\(|pricePerDay/u);
});

test('renter receipt download never recomputes tax, delivery or express amounts', () => {
  const start = renter.indexOf('Future<void> _downloadReceiptPdf()');
  const end = renter.indexOf(
    'Future<void> _startScanRenterQrForReturn()',
    start,
  );
  assert.ok(start >= 0 && end > start);
  const section = renter.slice(start, end);
  assert.match(section, /InvoicesService\.getInvoicesForCurrentUser/u);
  assert.match(section, /InvoiceType\.bookingPaymentReceipt/u);
  assert.match(section, /InvoicesService\.verifyDownloadArtifact\(invoice\)/u);
  assert.doesNotMatch(section, /1\.19|estimateDistance|expressFee|platformContributionForRental/u);
});

test('owner receives only a paid payout statement and no client-side receipt HTML', () => {
  const start = owner.indexOf('Future<void> _downloadReceiptPdf(');
  const end = owner.indexOf('String _formatRange(', start);
  assert.ok(start >= 0 && end > start);
  const section = owner.slice(start, end);
  assert.match(section, /InvoiceType\.ownerPayoutStatement/u);
  assert.match(section, /InvoicesService\.verifyDownloadArtifact\(invoice\)/u);
  assert.match(section, /tatsächlich ausgeführten Auszahlung/u);
  assert.doesNotMatch(section, /Uri\.dataFromString|Quittung ohne Gewähr|expressApplied|dropoffFee/u);
});

test('financial document UI separates private rent, SIT fee and refund debtors', () => {
  assert.match(detail, /Privater Mietpreis – Vermieter/u);
  assert.match(detail, /SIT-Plattformgebühr/u);
  assert.match(detail, /Mietpreis – Schuldner Vermieter/u);
  assert.match(detail, /SIT-Gebühr – Schuldner SIT/u);
  assert.match(detail, /TESTBELEG – kein Echtgeld/u);
  assert.doesNotMatch(detail, /10 % des Gesamtbetrags nach Steuern/u);
});
