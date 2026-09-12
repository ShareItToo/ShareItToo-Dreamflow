import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const removedDemoFiles = [
  'lib/screens/sit_wallet_screen.dart',
  'lib/services/sit_credit_service.dart',
  'lib/models/sit_credit_transaction.dart',
  'lib/screens/verification_intro_screen.dart',
];

const account = fs.readFileSync('lib/screens/account_settings_screen.dart', 'utf8');
const booking = fs.readFileSync('lib/screens/booking_detail_screen.dart', 'utf8');
const checkout = fs.readFileSync('lib/screens/payment_checkout_screen.dart', 'utf8');

test('local wallet and demo verification sources are absent', () => {
  for (const path of removedDemoFiles) {
    assert.equal(fs.existsSync(path), false, `${path} must stay removed`);
  }
});

test('no runtime source imports the removed demo surfaces', () => {
  const runtimePaths = fs.readdirSync('lib', { recursive: true })
    .filter((path) => typeof path === 'string' && path.endsWith('.dart'));
  for (const relativePath of runtimePaths) {
    const source = fs.readFileSync(`lib/${relativePath}`, 'utf8');
    assert.doesNotMatch(
      source,
      /(sit_wallet_screen|sit_credit_service|sit_credit_transaction|verification_intro_screen|SitWalletScreen|SitCreditService|SitCreditTransaction|VerificationIntroScreen)/u,
      `removed demo reference found in lib/${relativePath}`,
    );
  }
});

test('account payments route only to capability-bound truthful screens', () => {
  assert.match(account, /const PaymentMethodsScreen\(\)/u);
  assert.match(account, /const StripePayoutAccountScreen\(\)/u);
  assert.doesNotMatch(account, /Wallet|Guthaben|VerificationIntroScreen/u);
});

test('booking menu names status rather than promising payment', () => {
  assert.match(
    booking,
    /label: 'Zahlungsstatus',[\s\S]*?value: 'payment'/u,
  );
  assert.doesNotMatch(booking, /label: 'Zahlung',[\s\S]*?value: 'payment'/u);
  assert.match(checkout, /Zahlung noch nicht freigeschaltet/u);
  assert.match(checkout, /if \(providerAvailable && !captured\)/u);
});
