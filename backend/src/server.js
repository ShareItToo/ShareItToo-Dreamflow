import http from 'node:http';

import { createApp } from './app.js';
import { config } from './config.js';
import { startCredentialCleanupWorker } from './credential_cleanup.js';
import { startFirebaseIdentityCleanupWorker } from './firebase_identity_cleanup.js';
import {
  createAppleRevocationProvider,
  createAppleRevocationProviderRing,
} from './apple_revocation.js';
import { startAppleOwnershipCleanupWorker } from './apple_ownership.js';
import {
  startIdentityVerificationReconciliationWorker,
  startIdentityVerificationRedactionWorker,
} from './identity_verification_cleanup.js';
import { StripeProvider } from './stripe_provider.js';
import {
  createCrashlyticsReportDeleteClient,
  startCrashlyticsCleanupWorker,
} from './crashlytics_cleanup.js';
import { initializeDatabase, pool } from './db.js';
import { createLocalQaSyntheticImageScreeningOptions } from './local_qa_synthetic_image_screening.js';
import { attachRealtime } from './realtime.js';
import { verifyMailer } from './mailer.js';
import { drainNotificationOutbox } from './notifications.js';
import { safeOperationalErrorCode } from './observability.js';
import { reconcilePaymentLifecycle } from './payment_workflow.js';
import { recoverTechnicalSandboxPendingRuns } from './technical_sandbox_workflow.js';
import { reconcileReturnLifecycle } from './return_lifecycle_workflow.js';
import { reconcileSupportDeadlines } from './support_deadline_watchdog.js';
import {
  assertSyntheticCloneLoopbackBinding,
  createSyntheticCloneBookingLane,
  SYNTHETIC_CLONE_PRINCIPALS,
} from './synthetic_clone_booking_lane.js';
import { assertSyntheticPaymentTestEnvelope } from './synthetic_clone_payment_test.js';

async function writeIdentityVerificationWorkerAudit(client, {
  actor = null,
  action,
  resourceType,
  resourceId,
  metadata = {},
}) {
  await client.query(
    `INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actor?.id ?? null, actor?.role ?? 'system', action, resourceType, resourceId, JSON.stringify(metadata)],
  );
}

async function main() {
  const syntheticCloneEnabled = process.env.SIT_SYNTHETIC_CLONE_BOOKING_LANE === '1';
  assertSyntheticCloneLoopbackBinding({
    enabled: syntheticCloneEnabled,
    bindHost: config.bindHost,
  });
  const paymentTestEnvelope = {
    requested: process.env.SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE ?? '0',
    cloneEnabled: syntheticCloneEnabled,
    localQa: process.env.SIT_LOCAL_QA_SYNTHETIC_IMAGE_SCREENING === 'true',
    deploymentEnvironment: config.deploymentEnvironment,
    bindHost: config.bindHost,
    transport: config.payments.transport,
    livemode: config.payments.livemode,
  };
  const paymentTestEnabled = assertSyntheticPaymentTestEnvelope(paymentTestEnvelope);

  await initializeDatabase();
  await verifyMailer();

  const syntheticCloneBookingLane = syntheticCloneEnabled
    ? createSyntheticCloneBookingLane({
      enabled: true,
      paymentTestEnvelope: paymentTestEnabled ? paymentTestEnvelope : undefined,
      deploymentEnvironment: config.deploymentEnvironment,
      targetKind: process.env.SIT_SYNTHETIC_TARGET_KIND?.trim() || 'clone',
      datasetId: process.env.SIT_SYNTHETIC_DATASET_ID?.trim(),
      runId: process.env.SIT_SYNTHETIC_CLONE_RUN_ID?.trim(),
      ownerId: process.env.SIT_SYNTHETIC_CLONE_OWNER_ID?.trim(),
      renterId: process.env.SIT_SYNTHETIC_CLONE_RENTER_ID?.trim(),
      listingId: SYNTHETIC_CLONE_PRINCIPALS.listingId,
      secret: process.env.SIT_SYNTHETIC_CLONE_CONFIRMATION_SECRET?.trim(),
    })
    : null;

  const identityProvider = new StripeProvider({
    mode: config.identityVerification.transport,
    secretKey: config.identityVerification.secretKey,
    apiVersion: config.identityVerification.apiVersion,
    livemode: false,
  });

  const app = createApp({
    ...createLocalQaSyntheticImageScreeningOptions({
      configuration: config,
    }),
    identityVerificationProvider: identityProvider,
    syntheticCloneBookingLane,
  });
  const server = http.createServer(app);
  attachRealtime(server);

  server.listen(config.port, config.bindHost, () => {
    console.log(`[shareittoo-api] listening on ${config.bindHost}:${config.port}`);
  });
  const notificationTimer = setInterval(() => {
    void drainNotificationOutbox().catch((error) => {
      console.error('[notifications] worker failed', safeOperationalErrorCode(error, 'notification_worker_failed'));
    });
  }, config.notifications.workerIntervalMs);
  notificationTimer.unref();
  void drainNotificationOutbox().catch((error) => {
    console.error('[notifications] startup drain failed', safeOperationalErrorCode(error, 'notification_startup_failed'));
  });
  const returnLifecycleTimer = setInterval(() => {
    void reconcileReturnLifecycle().then(() => drainNotificationOutbox()).catch((error) => {
      console.error('[return-lifecycle] reconciliation failed', safeOperationalErrorCode(error, 'return_reconciliation_failed'));
    });
  }, config.returnLifecycle.workerIntervalMs);
  returnLifecycleTimer.unref();
  void reconcileReturnLifecycle().then(() => drainNotificationOutbox()).catch((error) => {
    console.error('[return-lifecycle] startup reconciliation failed', safeOperationalErrorCode(error, 'return_startup_failed'));
  });
  const supportDeadlineTimer = setInterval(() => {
    void reconcileSupportDeadlines().catch((error) => {
      console.error('[support-deadline-watchdog] reconciliation failed', safeOperationalErrorCode(error, 'support_deadline_reconciliation_failed'));
    });
  }, config.supportDeadlines.workerIntervalMs);
  supportDeadlineTimer.unref();
  void reconcileSupportDeadlines().catch((error) => {
    console.error('[support-deadline-watchdog] startup reconciliation failed', safeOperationalErrorCode(error, 'support_deadline_startup_failed'));
  });
  const paymentTimer = setInterval(() => {
    void reconcilePaymentLifecycle().catch((error) => {
      console.error('[payments] reconciliation failed', safeOperationalErrorCode(error, 'payment_reconciliation_failed'));
    });
  }, 30_000);
  paymentTimer.unref();
  void reconcilePaymentLifecycle().catch((error) => {
    console.error('[payments] startup reconciliation failed', safeOperationalErrorCode(error, 'payment_startup_failed'));
  });
  let technicalSandboxTimer = null;
  const runTechnicalSandboxRecovery = () => {
    void recoverTechnicalSandboxPendingRuns({ limit: 10 }).catch((error) => {
      console.error(
        '[technical-sandbox] pending recovery failed',
        safeOperationalErrorCode(error, 'technical_sandbox_recovery_failed'),
      );
    });
  };
  if (config.technicalSandbox.available && !config.technicalSandbox.killSwitch) {
    technicalSandboxTimer = setInterval(runTechnicalSandboxRecovery, 60_000);
    technicalSandboxTimer.unref();
    runTechnicalSandboxRecovery();
  }
  const stopCredentialCleanup = startCredentialCleanupWorker({ client: pool });
  const stopFirebaseIdentityCleanup = startFirebaseIdentityCleanupWorker({
    client: pool,
    appleRevocationProvider: config.appleRevocation.enabled
      ? createAppleRevocationProvider(config.appleRevocation)
      : null,
    appleRevocationKey: config.appleRevocation.encryptionKey,
  });
  const stopAppleOwnershipCleanup = startAppleOwnershipCleanupWorker({
    database: pool,
    configuration: config.appleOwnership,
    provider: config.appleOwnership.configured
      ? createAppleRevocationProviderRing(config.appleOwnership)
      : null,
  });
  const stopCrashlyticsCleanup = config.crashReportDeletion.enabled
    ? startCrashlyticsCleanupWorker({
      client: pool,
      deleteReports: createCrashlyticsReportDeleteClient({
        projectId: config.crashReportDeletion.firebaseProjectId,
        serviceAccountFile: config.crashReportDeletion.firebaseServiceAccountFile,
      }),
    })
    : () => {};
  const identityAudit = (entry) => writeIdentityVerificationWorkerAudit(entry.client, entry);
  const stopIdentityVerificationReconciliation = config.identityVerification.enabled
    ? startIdentityVerificationReconciliationWorker({
      client: pool,
      provider: identityProvider,
      audit: identityAudit,
      onError: (error) => console.error(
        '[identity-verification] reconciliation worker failed',
        safeOperationalErrorCode(error, 'identity_reconciliation_worker_failed'),
      ),
    })
    : () => {};
  const stopIdentityVerificationRedaction = config.identityVerification.enabled
    ? startIdentityVerificationRedactionWorker({
      client: pool,
      provider: identityProvider,
      onError: (error) => console.error(
        '[identity-verification] redaction worker failed',
        safeOperationalErrorCode(error, 'identity_redaction_worker_failed'),
      ),
    })
    : () => {};

  const shutdown = async (signal) => {
    console.log(`[shareittoo-api] ${signal}, shutting down`);
    clearInterval(notificationTimer);
    clearInterval(returnLifecycleTimer);
    clearInterval(supportDeadlineTimer);
    clearInterval(paymentTimer);
    if (technicalSandboxTimer) clearInterval(technicalSandboxTimer);
    stopCredentialCleanup();
    stopFirebaseIdentityCleanup();
    stopAppleOwnershipCleanup();
    stopCrashlyticsCleanup();
    stopIdentityVerificationReconciliation();
    stopIdentityVerificationRedaction();
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[shareittoo-api] startup failed', safeOperationalErrorCode(error, 'api_startup_failed'));
  process.exit(1);
});
