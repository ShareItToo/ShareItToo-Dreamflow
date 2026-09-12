import http from 'node:http';

import { createApp } from './app.js';
import { config } from './config.js';
import { startCredentialCleanupWorker } from './credential_cleanup.js';
import { startFirebaseIdentityCleanupWorker } from './firebase_identity_cleanup.js';
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
import { reconcileReturnLifecycle } from './return_lifecycle_workflow.js';
import { reconcileSupportDeadlines } from './support_deadline_watchdog.js';

async function main() {
  await initializeDatabase();
  await verifyMailer();

  const app = createApp(createLocalQaSyntheticImageScreeningOptions({
    configuration: config,
  }));
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
  const stopCredentialCleanup = startCredentialCleanupWorker({ client: pool });
  const stopFirebaseIdentityCleanup = startFirebaseIdentityCleanupWorker({
    client: pool,
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

  const shutdown = async (signal) => {
    console.log(`[shareittoo-api] ${signal}, shutting down`);
    clearInterval(notificationTimer);
    clearInterval(returnLifecycleTimer);
    clearInterval(supportDeadlineTimer);
    clearInterval(paymentTimer);
    stopCredentialCleanup();
    stopFirebaseIdentityCleanup();
    stopCrashlyticsCleanup();
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
