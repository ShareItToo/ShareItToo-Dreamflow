import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('backend/src/app.js', 'utf8');
const repository = fs.readFileSync('lib/services/backend_repository.dart', 'utf8');
const methods = fs.readFileSync('lib/screens/payment_methods_screen.dart', 'utf8');
const payout = fs.readFileSync('lib/screens/stripe_payout_account_screen.dart', 'utf8');
const checkout = fs.readFileSync('lib/screens/payment_checkout_screen.dart', 'utf8');
const notifications = fs.readFileSync('backend/src/notifications.js', 'utf8');
const provider = fs.readFileSync('backend/src/stripe_provider.js', 'utf8');
const workflow = fs.readFileSync('backend/src/payment_workflow.js', 'utf8');
const migration = fs.readFileSync(
  'backend/sql/migrations/071_stripe_connect_accounts_v2.up.sql',
  'utf8',
);

test('server exposes one account-bound provider capability truth', () => {
  assert.match(app, /function paymentCapabilitiesFor\(userId\)/u);
  assert.match(app, /providerBacked = config\.payments\.transport === 'stripe'/u);
  assert.match(app, /app\.get\('\/v1\/payments\/capabilities'/u);
  assert.match(
    app,
    /paymentMethodAvailable: paymentCapabilitiesFor\(req\.auth\.userId\)[\s\S]*?\.checkoutAvailable/u,
  );
  assert.match(
    app,
    /function paymentOnboardingExecutionAllowed\(userId\)[\s\S]*?deploymentEnvironment === 'test'[\s\S]*?transport === 'memory'/u,
  );
  assert.match(app, /if \(!paymentOnboardingExecutionAllowed\(req\.auth\.userId\)\)/u);
});

test('client reads capabilities instead of assuming a provider', () => {
  assert.match(repository, /getPaymentCapabilities\(\)/u);
  assert.match(repository, /path: '\/payments\/capabilities'/u);
  assert.match(methods, /BackendRepository\.getPaymentCapabilities/u);
  assert.match(methods, /_capabilities\?\['checkoutAvailable'\] == true/u);
  assert.match(methods, /Noch nicht freigeschaltet/u);
  assert.match(methods, /Zahlungstest verfügbar/u);
});

test('payout onboarding cannot render or start without server capability', () => {
  assert.match(payout, /BackendRepository\.getPaymentCapabilities/u);
  assert.match(
    payout,
    /capabilities\['payoutOnboardingAvailable'\] != true/u,
  );
  assert.match(
    payout,
    /if \(_capabilities\?\['payoutOnboardingAvailable'\] != true\) return;/u,
  );
  assert.match(payout, /if \(providerAvailable\)[\s\S]*?FilledButton\.icon/u);
  assert.match(payout, /Auszahlungen noch nicht freigeschaltet/u);
});

test('direct checkout is server- and client-gated by the same capability', () => {
  assert.match(
    app,
    /function paymentCheckoutExecutionAllowed\(userId\)[\s\S]*?deploymentEnvironment === 'test'[\s\S]*?transport === 'memory'/u,
  );
  assert.match(
    app,
    /if \(!paymentCheckoutExecutionAllowed\(req\.auth\.userId\)\)[\s\S]*?payment_provider_unavailable/u,
  );
  assert.match(checkout, /BackendRepository\.getPaymentCapabilities/u);
  assert.match(checkout, /if \(!_providerAvailable\(_capabilities\)\) return;/u);
  assert.match(
    checkout,
    /if \(providerAvailable && !captured\)[\s\S]*?FilledButton\.icon/u,
  );
  assert.match(checkout, /Zahlung noch nicht freigeschaltet/u);
  assert.match(checkout, /Test-Checkout öffnen/u);
  assert.match(checkout, /payment_checkout_reconciliation_required/u);
  assert.match(checkout, /es wird kein zweiter Zahlungsvorgang gestartet/u);
});

test('connected accounts use Accounts v2 recipient capability truth', () => {
  assert.match(provider, /client\.v2\.core\.accounts\.create/u);
  assert.match(provider, /dashboard: 'express'/u);
  assert.match(provider, /fees_collector: 'application'/u);
  assert.match(provider, /losses_collector: 'application'/u);
  assert.match(provider, /stripe_transfers: \{ requested: true \}/u);
  assert.doesNotMatch(provider, /type: 'express'/u);
  assert.match(provider, /client\.v2\.core\.accountLinks\.create/u);
  assert.match(provider, /client\.parseEventNotification/u);
  assert.match(provider, /client\.webhooks\.constructEvent/u);
  assert.match(provider, /client\.v2\.core\.accounts\.retrieve/u);
  assert.match(workflow, /account_api_version !== 'v2'/u);
  assert.match(workflow, /row\.recipient_transfers_status === 'active'/u);
  assert.match(workflow, /row\.payouts_enabled === true/u);
  assert.equal(workflow.match(/connectedAccountRowReady\(/gu)?.length >= 4, true);
  assert.match(workflow, /row\.dashboard_type === 'express'/u);
  assert.match(workflow, /row\.fees_collector === 'application'/u);
  assert.match(workflow, /row\.losses_collector === 'application'/u);
  assert.match(workflow, /event\.related_object\?\.id/u);
  assert.match(migration, /account_api_version TEXT NOT NULL DEFAULT 'v1'/u);
});

test('separate charges and transfers never use destination-refund flags', () => {
  assert.match(provider, /client\.refunds\.create/u);
  assert.doesNotMatch(provider, /reverse_transfer:/u);
  assert.doesNotMatch(provider, /refund_application_fee:/u);
  assert.match(provider, /client\.transfers\.create/u);
  assert.match(provider, /client\.transfers\.createReversal/u);
});

test('financial notification does not invent a provider name', () => {
  assert.match(notifications, /bestätigtes Auszahlungskonto/u);
  assert.doesNotMatch(notifications, /an dein Stripe-Konto übertragen/u);
});

test('push and Crashlytics boundaries remain untouched by payment truth', () => {
  const config = fs.readFileSync('backend/src/config.js', 'utf8');
  assert.match(config, /FIREBASE_CRASH_REPORT_DELETION_ENABLED/u);
  assert.match(config, /process\.env\.PUSH_TRANSPORT/u);
  assert.doesNotMatch(
    app,
    /paymentCapabilitiesFor[\s\S]{0,500}(crashReportDeletion|push\.)/u,
  );
});
