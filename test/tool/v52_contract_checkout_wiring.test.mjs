import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const backendWorkflow = read('backend/src/booking_workflow.js');
const app = read('backend/src/app.js');
const clientConfig = read('lib/config/private_pilot_config.dart');
const checkout = read('lib/screens/private_pilot_checkout_screen.dart');
const model = read('lib/models/rental_request.dart');
const repository = read('lib/services/backend_repository.dart');
const bookingDetail = read('lib/screens/booking_detail_screen.dart');
const bookings = read('lib/screens/bookings_screen.dart');
const pubspec = read('pubspec.yaml');
const manifest = JSON.parse(read('assets/legal/de/legal_manifest_v52.json'));

test('V5.2 checkout has exactly two non-preselected declarations and separate privacy', () => {
  assert.equal((checkout.match(/value: _privateAndTermsConfirmed/gu) ?? []).length, 1);
  assert.equal(
    (checkout.match(/value: _earlyPerformanceAndWithdrawalConfirmed/gu) ?? [])
      .length,
    1,
  );
  assert.equal((checkout.match(/value: _simulationAcknowledged/gu) ?? []).length, 1);
  assert.match(checkout, /bool _privateAndTermsConfirmed = false;/u);
  assert.match(checkout, /bool _earlyPerformanceAndWithdrawalConfirmed = false;/u);
  assert.match(checkout, /v52PrivateAndPlatformTermsDeclaration/u);
  assert.match(checkout, /v52EarlyPerformanceAndWithdrawalDeclaration/u);
  assert.match(checkout, /Wie SIT deine Daten verarbeitet: Datenschutzerklärung/u);
  assert.doesNotMatch(checkout, /privacyConfirmed|privacyAccepted/u);
  assert.match(
    clientConfig,
    /SIT-Plattformbedingungen \[Teil A, Version V5\.2-2026-08-16\][\s\S]*Privat-Mietbedingungen[\s\S]*\[Teile B-D, Version V5\.2-2026-08-16\]/u,
  );
});

test('client declarations carry exact quote, build and document references', () => {
  for (const marker of [
    "'clientBuild': PrivatePilotConfig.v52ClientBuild",
    "'quoteId': quoteId",
    "'quoteHash': quoteHash",
    "'documentReferences': documentReferences",
    "reference('A', 'platform_terms')",
    "reference('I', 'imprint_withdrawal_shorttexts')",
  ]) {
    assert.ok(checkout.includes(marker), marker);
  }
  const sourceBuild = pubspec.match(/^version:\s*(\S+)\s*$/mu)?.[1];
  const boundBuild = clientConfig.match(
    /v52ClientBuild = String\.fromEnvironment\([\s\S]{0,160}defaultValue: '([^']+)'/u,
  )?.[1];
  assert.match(clientConfig, /'SIT_CLIENT_BUILD'/u);
  assert.equal(boundBuild, sourceBuild);
});

test('server persists acceptance and receipt before emitting the owner request', () => {
  const contract = backendWorkflow.indexOf(
    'payload.platformContract = await persistV52PlatformContract',
  );
  const acceptedEvent = backendWorkflow.indexOf(
    "'platform_contract.accepted'",
    contract,
  );
  const ownerRequest = backendWorkflow.indexOf("'booking.requested'", acceptedEvent);
  assert.ok(contract >= 0);
  assert.ok(acceptedEvent > contract);
  assert.ok(ownerRequest > acceptedEvent);
  assert.match(app, /v52ContractDocumentReadiness/u);
  assert.doesNotMatch(app, /v51ContractDocumentReadiness/u);
});

test('receipt metadata survives the client model and remains renter-only', () => {
  assert.match(model, /final Map<String, dynamic>\? platformContract;/u);
  assert.match(model, /platformContract: _parseMap\(json\['platformContract'\]\)/u);
  assert.match(bookings, /'platformContract': r\.platformContract/u);
  assert.match(repository, /downloadPlatformContractReceipt/u);
  assert.match(bookingDetail, /platform-contract-receipt-download/u);
  assert.match(bookingDetail, /x-sit-artifact-sha256/u);
  assert.match(bookingDetail, /sha256\.convert\(downloaded\.bytes\)/u);
  assert.match(
    backendWorkflow,
    /viewerUserId !== row\.renter_id[\s\S]*delete stored\.platformContract/u,
  );
  assert.match(
    backendWorkflow,
    /row\.payload\?\.platformContract[\s\S]*platform_contract_reconsent_required/u,
  );
});

test('C1D does not activate or provision the V5.2 legal draft', () => {
  assert.equal(manifest.status, 'draft-blocked');
  assert.equal(manifest.activationAllowed, false);
  assert.equal(manifest.productionProvisioningAllowed, false);
  assert.equal(manifest.boundaries.databaseProvisioned, false);
  assert.equal(manifest.documents.every((entry) => entry.publicUrl === null), true);
});
