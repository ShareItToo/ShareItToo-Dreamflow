import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const migrationPath = resolve(
  import.meta.dirname,
  '../sql/migrations/016_v51_booking_quotes.up.sql',
);
const workflowPath = resolve(import.meta.dirname, '../src/booking_workflow.js');
const contractWorkflowPath = resolve(import.meta.dirname, '../src/v52_contract_workflow.js');
const appPath = resolve(import.meta.dirname, '../src/app.js');
const dataServicePath = resolve(import.meta.dirname, '../../lib/services/data_service.dart');
const checkoutScreenPath = resolve(
  import.meta.dirname,
  '../../lib/screens/private_pilot_checkout_screen.dart',
);
const privacyExportPath = resolve(import.meta.dirname, '../src/privacy_export.js');
const retentionInventoryPath = resolve(import.meta.dirname, '../src/retention_inventory.js');

test('V5.1 booking quotes are immutable, expiring, and actor-bound', async () => {
  const migration = await readFile(migrationPath, 'utf8');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS booking_quotes/u);
  assert.match(migration, /renter_id TEXT NOT NULL REFERENCES users\(id\) ON DELETE RESTRICT/u);
  assert.match(migration, /listing_id TEXT NOT NULL REFERENCES listings\(id\) ON DELETE RESTRICT/u);
  assert.match(migration, /quote_hash TEXT NOT NULL CHECK \(quote_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/u);
  assert.match(migration, /CHECK \(issued_at < expires_at\)/u);
  assert.match(
    migration,
    /CREATE TRIGGER booking_quotes_append_only[\s\S]*sit_reject_append_only_mutation\(\)/u,
  );
});

test('quote endpoint persists the exact server quote with a ten-minute lifetime', async () => {
  const source = await readFile(workflowPath, 'utf8');

  assert.match(source, /function quoteBindingPayload\(/u);
  assert.match(source, /const quoteHash = hashCommand\(binding\)/u);
  assert.match(source, /issuedAt\.getTime\(\) \+ \(10 \* 60 \* 1000\)/u);
  assert.match(source, /INSERT INTO booking_quotes/u);
  assert.match(source, /quoteId,[\s\S]*quoteHash,[\s\S]*quotedAt:[\s\S]*expiresAt:/u);
});

test('private-pilot creation fails closed without the stored fresh quote', async () => {
  const source = await readFile(workflowPath, 'utf8');

  assert.match(source, /throw new BookingWorkflowError\(409, 'fresh_booking_quote_required'\)/u);
  assert.match(source, /throw new BookingWorkflowError\(409, 'booking_quote_not_found'\)/u);
  assert.match(source, /throw new BookingWorkflowError\(409, 'booking_quote_expired'\)/u);
  assert.match(source, /throw new BookingWorkflowError\(409, 'booking_quote_changed'\)/u);
  assert.match(
    source,
    /const quoteBinding = privatePilot[\s\S]*await requireFreshBookingQuote/u,
  );
  assert.match(source, /hashCommand\(currentBinding\) === quoteHash/u);
});

test('V5.2 discount identity and amounts overwrite every client scalar', async () => {
  const source = await readFile(workflowPath, 'utf8');

  assert.match(source, /function quoteSnapshotPayload\(quote\)/u);
  for (const field of [
    'quotedQuoteVersion',
    'quotedDiscountId',
    'quotedDiscountLabel',
    'quotedDiscountFundingSource',
    'quotedDiscountThresholdDays',
    'quotedDiscountMinor',
    'quotedRentalSubtotalMinor',
    'quotedPlatformFeeMinor',
    'quotedTotalMinor',
  ]) {
    assert.match(
      source,
      new RegExp(`${field}: quote\\.`, 'u'),
      `${field} must come from the server quote`,
    );
  }
  assert.match(
    source,
    /\.\.\.candidate,[\s\S]*?\.\.\.quoteSnapshotPayload\(quote\),[\s\S]*?quote,/u,
  );
});

test('booking request is not emitted before the immutable platform contract exists', async () => {
  const [source, contractSource] = await Promise.all([
    readFile(workflowPath, 'utf8'),
    readFile(contractWorkflowPath, 'utf8'),
  ]);
  const contractIndex = source.indexOf('persistV52PlatformContract(client');
  const requestedEventIndex = source.indexOf("'booking.requested'", contractIndex);
  const notificationIndex = source.indexOf('enqueueBookingNotifications(client', contractIndex);

  assert.ok(contractIndex > 0);
  assert.ok(requestedEventIndex > contractIndex);
  assert.ok(requestedEventIndex > contractIndex);
  assert.ok(notificationIndex > contractIndex);
  assert.match(
    source,
    /persistV52PlatformContract\(client, \{[\s\S]*userId: actor\.id,[\s\S]*bookingId: id,[\s\S]*quoteId: quoteBinding\.quoteId,[\s\S]*quoteHash: quoteBinding\.quoteHash,[\s\S]*declarations: candidate\.legalDeclarations/u,
  );
  assert.match(source, /payload\.platformContract = await persistV52PlatformContract/u);
  assert.match(
    contractSource,
    /INSERT INTO platform_contract_declarations[\s\S]*INSERT INTO platform_contracts[\s\S]*persistV51ContractReceipt\(client,[\s\S]*receipt,/u,
  );
  assert.match(source, /createdAt\.getTime\(\) \+ \(30 \* 60 \* 1000\)/u);
});

test('owner acceptance is rejected after the stored 30-minute binding deadline', async () => {
  const source = await readFile(workflowPath, 'utf8');

  assert.match(
    source,
    /createdAt\.getTime\(\) \+ \(30 \* 60 \* 1000\)/u,
  );
  assert.match(
    source,
    /current === 'requested' && steps\[0\] === 'accepted'[\s\S]*?row\.payload\?\.bindingExpiresAt/u,
  );
  assert.match(
    source,
    /Date\.now\(\) >= bindingExpiresAt\.getTime\(\)[\s\S]*?booking_request_expired/u,
  );
});

test('the app fetches a fresh quote immediately before remote creation', async () => {
  const source = await readFile(dataServicePath, 'utf8');
  const remoteBlock = source.match(
    /if \(BackendConfig\.enabled && !QaRuntimeService\.isEnabled\) \{[\s\S]*?BackendRepository\.createBooking\([\s\S]*?\n    \} else \{/u,
  )?.[0] ?? '';

  assert.notEqual(remoteBlock, '');
  assert.match(remoteBlock, /BackendRepository\.quoteBooking\(createPayload\)/u);
  assert.match(remoteBlock, /createPayload\['quoteId'\] = quoteId/u);
  assert.match(remoteBlock, /createPayload\['quoteHash'\] = quoteHash/u);
  assert.match(remoteBlock, /BackendRepository\.createBooking\([\s\S]*createPayload/u);
});

test('checkout renders the server quote and stays locked without real payment transport', async () => {
  const [app, checkout] = await Promise.all([
    readFile(appPath, 'utf8'),
    readFile(checkoutScreenPath, 'utf8'),
  ]);

  assert.match(
    app,
    /contractDocumentsAvailable = config\.payments\.transport === 'stripe'[\s\S]*v52ContractDocumentReadiness/u,
  );
  assert.match(
    app,
    /paymentMethodAvailable: paymentCapabilitiesFor\(req\.auth\.userId\)[\s\S]*?\.checkoutAvailable && contractDocumentsAvailable/u,
  );
  assert.match(checkout, /PrivatePilotQuote\.fromServerJson/u);
  assert.match(checkout, /_checkoutQuote = Map<String, dynamic>\.from\(envelope\)/u);
  assert.match(checkout, /_freshQuoteAvailable/u);
  assert.match(checkout, /_paymentMethodAvailable/u);
  assert.match(checkout, /checkoutQuote: _checkoutQuote/u);
  assert.match(checkout, /Bestätigen und bezahlen/u);
});

test('contract receipt download is authenticated, integrity-bound and non-cacheable', async () => {
  const app = await readFile(appPath, 'utf8');
  assert.match(
    app,
    /app\.get\('\/v1\/platform-contracts\/:id\/receipt', requireAuth, requireActiveAccount/u,
  );
  assert.match(app, /getV51ContractReceipt\(client,[\s\S]*userId: req\.auth\.userId/u);
  assert.match(app, /Content-Disposition': 'attachment; filename="shareittoo-plattformvertrag\.html"'/u);
  assert.match(app, /'Cache-Control': 'private, no-store'/u);
  assert.match(app, /'X-SIT-Artifact-SHA256': receipt\.artifactSha256/u);
});

test('user export and retention inventory include the new quote records', async () => {
  const [privacyExport, retentionInventory] = await Promise.all([
    readFile(privacyExportPath, 'utf8'),
    readFile(retentionInventoryPath, 'utf8'),
  ]);

  assert.match(privacyExport, /FROM booking_quotes WHERE renter_id = \$1 ORDER BY issued_at/u);
  assert.match(
    privacyExport,
    /marketplace: \{[\s\S]*bookingQuotes,[\s\S]*platformContracts,[\s\S]*platformContractDeclarations,[\s\S]*platformContractReceiptEvents/u,
  );
  assert.match(
    retentionInventory,
    /SELECT 'transactions', 'booking_quotes',[\s\S]*FROM booking_quotes/u,
  );
});
