import fs from 'node:fs';
import path from 'node:path';

import { validateFirebaseServiceAccount } from './firebase_service_account.js';
import { readConsumerDisputeConfiguration } from './consumer_dispute_config.js';
import { readProductSafetyConfiguration } from './product_safety_config.js';
import { evaluateGoogleMapsActivation } from './google_maps_activation.js';
import { readListingAiGatewayConfiguration } from './listing_ai_gateway_config.js';
import { evaluateOperatorReadiness } from './operator_readiness.js';
import { normalizePrivatePilotRegion } from './private_pilot_domain.js';
import { readStripeSecretConfiguration } from './stripe_secret_files.js';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function csv(value) {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters');
}

const deploymentEnvironment = (process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development')
  .trim()
  .toLowerCase();
const bindHost = (process.env.BIND_HOST ?? '0.0.0.0').trim();
if (!['0.0.0.0', '127.0.0.1', '::1'].includes(bindHost)) {
  throw new Error('BIND_HOST must be an explicit supported bind address');
}
const listingAiGateway = readListingAiGatewayConfiguration(process.env, {
  deploymentEnvironment,
});
const bookingPilotMode = (process.env.BOOKING_PILOT_MODE ?? (
  deploymentEnvironment === 'staging' || deploymentEnvironment === 'test' || deploymentEnvironment === 'development'
    ? 'pilot'
    : 'off'
)).trim().toLowerCase();
if (!['off', 'pilot', 'on'].includes(bookingPilotMode)) {
  throw new Error('BOOKING_PILOT_MODE must be off, pilot, or on');
}
const privatePilotV4Enabled = (process.env.PRIVATE_PILOT_V4_ENABLED ?? 'false')
  .trim()
  .toLowerCase() === 'true';
const nonBindingSimulationEnabled = (
  (deploymentEnvironment === 'staging' || deploymentEnvironment === 'test')
  && bookingPilotMode === 'pilot'
  && privatePilotV4Enabled
);
const bookingGroupsEnabled = (process.env.BOOKING_GROUPS_ENABLED ?? 'false')
  .trim()
  .toLowerCase() === 'true';
if (bookingGroupsEnabled && deploymentEnvironment === 'production') {
  throw new Error('booking groups cannot be enabled in production before the release gate');
}
const plannerCoreEnabled = (process.env.PLANNER_CORE_ENABLED ?? 'false')
  .trim()
  .toLowerCase() === 'true';
if (plannerCoreEnabled && deploymentEnvironment === 'production') {
  throw new Error('planner core cannot be enabled in production before the release gate');
}
const plannerInventoryEnabled = (process.env.PLANNER_INVENTORY_ENABLED ?? 'false')
  .trim()
  .toLowerCase() === 'true';
if (plannerInventoryEnabled && deploymentEnvironment === 'production') {
  throw new Error('planner inventory cannot be enabled in production before the release gate');
}
if (plannerInventoryEnabled && !plannerCoreEnabled) {
  throw new Error('planner inventory requires the planner core');
}
const listingSupplyEnrichmentEnabled = (
  process.env.LISTING_SUPPLY_ENRICHMENT_ENABLED ?? 'false'
).trim().toLowerCase() === 'true';
if (listingSupplyEnrichmentEnabled && deploymentEnvironment === 'production') {
  throw new Error('listing supply enrichment cannot be enabled in production before the release gate');
}
const listingSetsEnabled = (process.env.LISTING_SETS_ENABLED ?? 'false')
  .trim()
  .toLowerCase() === 'true';
if (listingSetsEnabled && deploymentEnvironment === 'production') {
  throw new Error('listing sets cannot be enabled in production before the release gate');
}
const privatePilotAllowedRegions = Object.freeze([
  ...new Set(
    csv(process.env.PRIVATE_PILOT_ALLOWED_REGIONS)
      .map(normalizePrivatePilotRegion)
      .filter(Boolean),
  ),
]);
const pushTransport = (process.env.PUSH_TRANSPORT ?? (
  deploymentEnvironment === 'staging' || deploymentEnvironment === 'test'
    ? 'memory'
    : 'disabled'
)).trim().toLowerCase();
if (!['disabled', 'memory', 'webhook', 'fcm'].includes(pushTransport)) {
  throw new Error('PUSH_TRANSPORT must be disabled, memory, webhook, or fcm');
}
const pushWebhookUrl = process.env.PUSH_WEBHOOK_URL?.trim() ?? '';
if (pushTransport === 'webhook') {
  let parsed;
  try {
    parsed = new URL(pushWebhookUrl);
  } catch {
    throw new Error('PUSH_WEBHOOK_URL must be a valid HTTPS URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('PUSH_WEBHOOK_URL must be a valid HTTPS URL');
  }
}
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID?.trim() ?? '';
const firebaseServiceAccountFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE?.trim() ?? '';
const firebaseAuthEnabled = (process.env.FIREBASE_AUTH_ENABLED ?? 'false')
  .trim()
  .toLowerCase() === 'true';
const firebasePhoneVerificationEnabled = (
  process.env.FIREBASE_PHONE_VERIFICATION_ENABLED ?? 'false'
).trim().toLowerCase() === 'true';
const firebaseCrashReportDeletionEnabled = (
  process.env.FIREBASE_CRASH_REPORT_DELETION_ENABLED ?? 'false'
).trim().toLowerCase() === 'true';
const firebaseAndroidAppId = process.env.FIREBASE_ANDROID_APP_ID?.trim() ?? '';
const firebaseIosAppId = process.env.FIREBASE_IOS_APP_ID?.trim() ?? '';
if (pushTransport === 'fcm' || firebaseAuthEnabled ||
    firebasePhoneVerificationEnabled || firebaseCrashReportDeletionEnabled) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(firebaseProjectId)) {
    throw new Error('FIREBASE_PROJECT_ID must be configured for Firebase services');
  }
  if (!firebaseServiceAccountFile) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_FILE must be configured for Firebase services');
  }
  const resolvedServiceAccountFile = path.resolve(firebaseServiceAccountFile);
  let serviceAccountFileIsReadable = false;
  try {
    fs.accessSync(resolvedServiceAccountFile, fs.constants.R_OK);
    serviceAccountFileIsReadable = fs.statSync(resolvedServiceAccountFile).isFile();
  } catch {
    serviceAccountFileIsReadable = false;
  }
  if (!serviceAccountFileIsReadable) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_FILE must point to a readable file');
  }
  try {
    validateFirebaseServiceAccount(
      fs.readFileSync(resolvedServiceAccountFile, 'utf8'),
      firebaseProjectId,
    );
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_FILE must contain credentials for FIREBASE_PROJECT_ID');
  }
}
if (firebaseCrashReportDeletionEnabled) {
  for (const [name, value, platform] of [
    ['FIREBASE_ANDROID_APP_ID', firebaseAndroidAppId, 'android'],
    ['FIREBASE_IOS_APP_ID', firebaseIosAppId, 'ios'],
  ]) {
    if (!new RegExp(`^1:[0-9]{6,20}:${platform}:[A-Fa-f0-9]{8,64}$`, 'u').test(value)) {
      throw new Error(`${name} must be the exact Firebase ${platform} app ID`);
    }
  }
}

const paymentTransport = (process.env.PAYMENT_TRANSPORT ?? (
  deploymentEnvironment === 'staging' || deploymentEnvironment === 'test'
    ? 'memory'
    : 'disabled'
)).trim().toLowerCase();
if (!['disabled', 'memory', 'stripe'].includes(paymentTransport)) {
  throw new Error('PAYMENT_TRANSPORT must be disabled, memory, or stripe');
}
const stripeSecrets = readStripeSecretConfiguration(process.env, {
  deploymentEnvironment,
  paymentTransport,
});
const stripeSecretKey = stripeSecrets.secretKey;
const stripeWebhookSecret = stripeSecrets.webhookSecret;
const stripeConnectWebhookSecret = stripeSecrets.connectWebhookSecret;
const stripeLivemode = (process.env.STRIPE_LIVEMODE ?? 'false').trim().toLowerCase() === 'true';
if (paymentTransport === 'stripe') {
  if (!/^(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+$/.test(stripeSecretKey)) {
    throw new Error('STRIPE_SECRET_KEY must be a valid server-side Stripe secret or restricted key');
  }
  if (!/^whsec_[A-Za-z0-9]+$/.test(stripeWebhookSecret)) {
    throw new Error('STRIPE_WEBHOOK_SECRET must be configured for Stripe transport');
  }
  if (!/^whsec_[A-Za-z0-9]+$/.test(stripeConnectWebhookSecret)
      || stripeConnectWebhookSecret === stripeWebhookSecret) {
    throw new Error('STRIPE_CONNECT_WEBHOOK_SECRET must be a distinct Accounts v2 destination secret');
  }
  if (stripeLivemode !== /^(?:sk|rk)_live_/u.test(stripeSecretKey)) {
    throw new Error('STRIPE_LIVEMODE must match STRIPE_SECRET_KEY');
  }
  if (stripeLivemode && deploymentEnvironment !== 'production') {
    throw new Error('Stripe live mode is forbidden outside production');
  }
}
const paymentCurrency = (process.env.PAYMENT_CURRENCY ?? 'EUR').trim().toUpperCase();
if (!/^[A-Z]{3}$/.test(paymentCurrency)) throw new Error('PAYMENT_CURRENCY must be an ISO 4217 code');
const connectCountry = (process.env.STRIPE_CONNECT_COUNTRY ?? 'DE').trim().toUpperCase();
if (!/^[A-Z]{2}$/.test(connectCountry)) throw new Error('STRIPE_CONNECT_COUNTRY must be an ISO country code');
const paymentPilotUserIds = csv(process.env.PAYMENT_PILOT_USER_IDS);
if (paymentTransport === 'stripe' && stripeLivemode && paymentPilotUserIds.length === 0) {
  throw new Error('PAYMENT_PILOT_USER_IDS is required for live Stripe transport');
}

const mailTransport = (process.env.MAIL_TRANSPORT ?? 'disabled').trim().toLowerCase();
if (!['disabled', 'memory', 'smtp'].includes(mailTransport)) {
  throw new Error('MAIL_TRANSPORT must be disabled, memory, or smtp');
}

const publicComplianceApproved = (process.env.PUBLIC_COMPLIANCE_APPROVED ?? 'false')
  .trim()
  .toLowerCase() === 'true';
const publicCompliance = {
  approved: publicComplianceApproved,
  supportEmail: process.env.PUBLIC_SUPPORT_EMAIL?.trim() ?? '',
  privacyEmail: process.env.PUBLIC_PRIVACY_EMAIL?.trim() ?? '',
  providerName: process.env.PUBLIC_LEGAL_PROVIDER_NAME?.trim() ?? '',
  providerAddress: process.env.PUBLIC_LEGAL_PROVIDER_ADDRESS?.trim() ?? '',
  representative: process.env.PUBLIC_LEGAL_REPRESENTATIVE?.trim() ?? '',
  contentResponsible: process.env.PUBLIC_LEGAL_CONTENT_RESPONSIBLE?.trim() ?? '',
  registerCourt: process.env.PUBLIC_LEGAL_REGISTER_COURT?.trim() ?? '',
  registerNumber: process.env.PUBLIC_LEGAL_REGISTER_NUMBER?.trim() ?? '',
  competentAuthority: process.env.PUBLIC_LEGAL_COMPETENT_AUTHORITY?.trim() ?? '',
  withdrawalUrl: process.env.PUBLIC_LEGAL_WITHDRAWAL_URL?.trim() ?? '',
  effectiveDate: process.env.PUBLIC_PRIVACY_EFFECTIVE_DATE?.trim() ?? '',
};
const consumerDispute = readConsumerDisputeConfiguration(process.env);
const productSafety = readProductSafetyConfiguration(process.env);
const financialDocumentsLiveIssuanceApproved =
  (process.env.FINANCIAL_DOCUMENTS_LIVE_ISSUANCE_APPROVED ?? 'false')
    .trim()
    .toLowerCase() === 'true';
const financialDocumentsSitFeeTaxLabel =
  process.env.FINANCIAL_DOCUMENTS_SIT_FEE_TAX_LABEL?.trim() ?? '';

const googleMapsActivation = evaluateGoogleMapsActivation(process.env);
const firebaseAnyServiceEnabled = pushTransport === 'fcm'
  || firebaseAuthEnabled
  || firebasePhoneVerificationEnabled
  || firebaseCrashReportDeletionEnabled;
const operatorReadiness = evaluateOperatorReadiness(process.env, {
  approvalRequested: publicComplianceApproved,
  mailEnabled: mailTransport === 'smtp',
  paymentProviderEnabled: paymentTransport === 'stripe',
  firebaseEnabled: firebaseAnyServiceEnabled,
  mapsEnabled: googleMapsActivation.enabled,
});
if (publicComplianceApproved && !operatorReadiness.activationAllowed) {
  const blockers = [
    ...operatorReadiness.missingFields,
    ...operatorReadiness.invalidFields,
  ];
  throw new Error(
    `PUBLIC_COMPLIANCE_APPROVED requires complete non-placeholder operator facts: ${blockers.join(', ')}`,
  );
}
if (publicComplianceApproved && !consumerDispute.isComplete) {
  throw new Error(
    'PUBLIC_COMPLIANCE_APPROVED requires a complete approved VSBG configuration',
  );
}
if (publicComplianceApproved && !productSafety.isComplete) {
  throw new Error(
    'PUBLIC_COMPLIANCE_APPROVED requires a complete approved product-safety contact and process configuration',
  );
}
if (financialDocumentsLiveIssuanceApproved) {
  if (!publicComplianceApproved) {
    throw new Error(
      'FINANCIAL_DOCUMENTS_LIVE_ISSUANCE_APPROVED requires PUBLIC_COMPLIANCE_APPROVED=true',
    );
  }
  if (paymentTransport !== 'stripe' || !stripeLivemode) {
    throw new Error(
      'FINANCIAL_DOCUMENTS_LIVE_ISSUANCE_APPROVED requires live Stripe transport',
    );
  }
  if (!financialDocumentsSitFeeTaxLabel) {
    throw new Error(
      'FINANCIAL_DOCUMENTS_SIT_FEE_TAX_LABEL is required for live financial documents',
    );
  }
}
if (paymentTransport === 'stripe' && stripeLivemode
    && !financialDocumentsLiveIssuanceApproved) {
  throw new Error(
    'Live Stripe requires approved immutable financial-document issuance',
  );
}

const supportDeadlineWorkerIntervalMs = Math.min(
  15 * 60 * 1000,
  Math.max(
    30_000,
    Number.parseInt(process.env.SUPPORT_DEADLINE_WORKER_INTERVAL_MS ?? '60000', 10),
  ),
);
const supportLegacyMigrationEnabled = (
  process.env.SUPPORT_LEGACY_MIGRATION_ENABLED ?? 'false'
).trim().toLowerCase() === 'true';
if (supportLegacyMigrationEnabled && deploymentEnvironment === 'production') {
  throw new Error(
    'support legacy migration cannot be enabled in production before the migration gate',
  );
}
const supportEvidenceIntakeEnabled = (
  process.env.SUPPORT_EVIDENCE_INTAKE_ENABLED ?? 'false'
).trim().toLowerCase() === 'true';
if (supportEvidenceIntakeEnabled && deploymentEnvironment === 'production') {
  throw new Error(
    'support evidence intake cannot be enabled in production before the evidence-security gate',
  );
}

export const config = Object.freeze({
  port: Number.parseInt(process.env.PORT ?? '8080', 10),
  bindHost,
  databaseUrl: required('DATABASE_URL'),
  jwtSecret,
  corsOrigins: csv(process.env.CORS_ORIGINS),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'https://shareittoo.com/api/v1').replace(/\/$/, ''),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? '/data/uploads'),
  accessTokenLifetime: '15m',
  accessTokenLifetimeSeconds: 15 * 60,
  refreshTokenLifetimeDays: 30,
  maximumActiveSessionsPerUser: 100,
  emailVerificationLifetimeHours: 24,
  passwordResetLifetimeMinutes: 30,
  accountDeletionLifetimeMinutes: 30,
  staffElevationMinutes: Math.min(30, Math.max(5, Number.parseInt(process.env.STAFF_ELEVATION_MINUTES ?? '10', 10))),
  minimumAccountAge: 18,
  deploymentEnvironment,
  bookingPilotMode,
  bookingPilotEnabled: bookingPilotMode !== 'off',
  bookingPilotWithoutPayment: bookingPilotMode === 'pilot',
  privatePilotV4Enabled,
  nonBindingSimulationEnabled,
  bookingGroups: Object.freeze({
    enabled: bookingGroupsEnabled,
    publicReleaseAllowed: false,
  }),
  planner: Object.freeze({
    enabled: plannerCoreEnabled,
    inventoryResolutionEnabled: plannerInventoryEnabled,
    publicReleaseAllowed: false,
    externalGenerativeAiAllowed: false,
    inventoryResolutionAllowed: false,
  }),
  listingSupplyEnrichment: Object.freeze({
    enabled: listingSupplyEnrichmentEnabled,
    publicReleaseAllowed: false,
    externalGenerativeAiAllowed: false,
  }),
  listingSets: Object.freeze({
    enabled: listingSetsEnabled,
    publicReleaseAllowed: false,
    fewerHandoversRankingAllowed: true,
    businessStatusRankingAllowed: false,
    hiddenPriceManipulationAllowed: false,
  }),
  listingAi: listingAiGateway,
  privatePilot: Object.freeze({
    allowedRegions: privatePilotAllowedRegions,
    regionsConfigured: privatePilotAllowedRegions.length > 0,
  }),
  failedLoginLimit: 10,
  failedLoginLockMinutes: 15,
  appPublicUrl: (process.env.APP_PUBLIC_URL ?? 'https://shareittoo.com').replace(/\/$/, ''),
  publicCompliance: Object.freeze(publicCompliance),
  consumerDispute,
  productSafety,
  operatorReadiness,
  financialDocuments: Object.freeze({
    liveIssuanceApproved: financialDocumentsLiveIssuanceApproved,
    sitFeeTaxLabel: financialDocumentsSitFeeTaxLabel,
  }),
  maps: Object.freeze({
    enabled: googleMapsActivation.enabled,
    activationApproved: googleMapsActivation.activationApproved,
    providerFactsComplete: googleMapsActivation.providerFactsComplete,
    serverApiKey: googleMapsActivation.serverApiKey,
  }),
  mail: Object.freeze({
    transport: mailTransport,
    host: process.env.SMTP_HOST?.trim() ?? '',
    port: Number.parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: (process.env.SMTP_SECURE ?? 'false').trim().toLowerCase() === 'true',
    requireTls: (process.env.SMTP_REQUIRE_TLS ?? 'true').trim().toLowerCase() !== 'false',
    user: process.env.SMTP_USER?.trim() ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.MAIL_FROM?.trim() ?? 'ShareItToo <contact@shareittoo.com>',
    replyTo: process.env.MAIL_REPLY_TO?.trim() ?? 'contact@shareittoo.com',
  }),
  notifications: Object.freeze({
    workerIntervalMs: Math.max(500, Number.parseInt(process.env.NOTIFICATION_WORKER_INTERVAL_MS ?? '5000', 10)),
    batchSize: Math.min(100, Math.max(1, Number.parseInt(process.env.NOTIFICATION_BATCH_SIZE ?? '25', 10))),
    maxAttempts: Math.min(20, Math.max(1, Number.parseInt(process.env.NOTIFICATION_MAX_ATTEMPTS ?? '5', 10))),
  }),
  returnLifecycle: Object.freeze({
    workerIntervalMs: Math.min(
      15 * 60 * 1000,
      Math.max(
        30_000,
        Number.parseInt(process.env.RETURN_LIFECYCLE_WORKER_INTERVAL_MS ?? '60000', 10),
      ),
    ),
  }),
  supportDeadlines: Object.freeze({
    workerIntervalMs: supportDeadlineWorkerIntervalMs,
    maxStalenessMs: Math.max(
      supportDeadlineWorkerIntervalMs * 3,
      Number.parseInt(process.env.SUPPORT_DEADLINE_MAX_STALENESS_MS ?? '180000', 10),
    ),
  }),
  supportLegacyMigration: Object.freeze({
    enabled: supportLegacyMigrationEnabled,
    operatingMode: 'simulation',
    automaticImportAllowed: false,
    externalMessagesAllowed: false,
  }),
  supportEvidence: Object.freeze({
    enabled: supportEvidenceIntakeEnabled,
    operatingMode: 'simulation',
    maxFileBytes: 8 * 1024 * 1024,
    accessGrantLifetimeSeconds: 120,
    scannerTransport: 'none',
    externalAiAllowed: false,
    originalPublicAccessAllowed: false,
  }),
  push: Object.freeze({
    transport: pushTransport,
    webhookUrl: pushWebhookUrl,
    webhookToken: process.env.PUSH_WEBHOOK_TOKEN ?? '',
    firebaseProjectId,
    firebaseServiceAccountFile: firebaseServiceAccountFile
      ? path.resolve(firebaseServiceAccountFile)
      : '',
  }),
  socialAuth: Object.freeze({
    enabled: firebaseAuthEnabled,
    firebaseProjectId,
    firebaseServiceAccountFile: firebaseServiceAccountFile
      ? path.resolve(firebaseServiceAccountFile)
      : '',
    allowedProviders: Object.freeze(['google', 'apple', 'facebook']),
  }),
  phoneVerification: Object.freeze({
    enabled: firebasePhoneVerificationEnabled,
    firebaseProjectId,
    firebaseServiceAccountFile: firebaseServiceAccountFile
      ? path.resolve(firebaseServiceAccountFile)
      : '',
  }),
  crashReportDeletion: Object.freeze({
    enabled: firebaseCrashReportDeletionEnabled,
    firebaseProjectId,
    firebaseServiceAccountFile: firebaseServiceAccountFile
      ? path.resolve(firebaseServiceAccountFile)
      : '',
    appIds: Object.freeze({
      android: firebaseAndroidAppId,
      ios: firebaseIosAppId,
    }),
  }),
  payments: Object.freeze({
    transport: paymentTransport,
    enabled: paymentTransport !== 'disabled',
    livemode: stripeLivemode,
    secretKey: stripeSecretKey,
    webhookSecret: stripeWebhookSecret,
    connectWebhookSecret: stripeConnectWebhookSecret,
    credentialSource: stripeSecrets.credentialSource,
    apiVersion: process.env.STRIPE_API_VERSION?.trim() || '2026-08-26.dahlia',
    currency: paymentCurrency,
    connectCountry,
    pilotUserIds: Object.freeze(paymentPilotUserIds),
    payoutHoldHours: Math.min(24 * 30, Math.max(0, Number.parseInt(process.env.PAYOUT_HOLD_HOURS ?? '48', 10))),
  }),
});
