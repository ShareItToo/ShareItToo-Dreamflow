import fs from 'node:fs/promises';

import { cert } from 'firebase-admin/app';

import { validateFirebaseServiceAccount } from './firebase_service_account.js';

export const crashlyticsCleanupIntervalMs = 5 * 60 * 1000;

const supportedPlatforms = new Set(['android', 'ios']);

function boundedPlatform(value) {
  const platform = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return supportedPlatforms.has(platform) ? platform : '';
}

function boundedAppId(value) {
  const appId = typeof value === 'string' ? value.trim() : '';
  return appId.length >= 10 && appId.length <= 180 &&
      /^[A-Za-z0-9:._-]+$/u.test(appId) ? appId : '';
}

function safeProviderCode(value) {
  const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-z0-9_/-]{1,80}$/u.test(code) ? code : 'provider_delete_failed';
}

export async function getOrCreateCrashlyticsSubject(client, {
  userId,
  platform,
  firebaseAppId,
} = {}) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('Crashlytics subject registration requires a database client.');
  }
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  const normalizedPlatform = boundedPlatform(platform);
  const normalizedAppId = boundedAppId(firebaseAppId);
  if (!normalizedUserId || !normalizedPlatform || !normalizedAppId) {
    throw new Error('Crashlytics subject registration requires bounded inputs.');
  }
  const result = await client.query(
    `INSERT INTO crashlytics_subjects (
       user_id, platform, firebase_app_id
     ) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, platform) DO UPDATE
       SET firebase_app_id = EXCLUDED.firebase_app_id,
           updated_at = now()
     RETURNING subject_id`,
    [normalizedUserId, normalizedPlatform, normalizedAppId],
  );
  return String(result.rows[0].subject_id);
}

export async function enqueueCrashlyticsReportDeletions(client, {
  userId,
  platform = null,
} = {}) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('Crashlytics report cleanup requires a database client.');
  }
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  const normalizedPlatform = platform == null ? null : boundedPlatform(platform);
  if (!normalizedUserId || (platform != null && !normalizedPlatform)) {
    throw new Error('Crashlytics report cleanup requires bounded inputs.');
  }
  const result = await client.query(
    `WITH selected AS (
       DELETE FROM crashlytics_subjects
       WHERE user_id = $1 AND ($2::text IS NULL OR platform = $2)
       RETURNING firebase_app_id, subject_id
     )
     INSERT INTO crashlytics_report_deletion_outbox (
       firebase_app_id, subject_id, status, attempts, next_attempt_at,
       locked_at, last_error_code, target_complete_at, updated_at
     )
     SELECT firebase_app_id, subject_id, 'pending', 0, now(),
            NULL, NULL, NULL, now()
     FROM selected
     ON CONFLICT (firebase_app_id, subject_id) DO UPDATE
       SET status = 'pending', attempts = 0, next_attempt_at = now(),
           locked_at = NULL, last_error_code = NULL,
           target_complete_at = NULL, updated_at = now()
     RETURNING id`,
    [normalizedUserId, normalizedPlatform],
  );
  return result.rows.map((row) => String(row.id));
}

async function claimNext(client, ids) {
  const idFilterProvided = Array.isArray(ids);
  const boundedIds = Array.isArray(ids)
    ? ids.filter((id) => typeof id === 'string' &&
        /^[0-9a-f-]{36}$/iu.test(id)).slice(0, 50)
    : [];
  const result = await client.query(
    `UPDATE crashlytics_report_deletion_outbox AS target
     SET status = 'processing',
         attempts = target.attempts + 1,
         locked_at = now(),
         updated_at = now()
     WHERE target.id = (
       SELECT candidate.id
       FROM crashlytics_report_deletion_outbox AS candidate
       WHERE (
         (candidate.status IN ('pending', 'retry') AND candidate.next_attempt_at <= now())
         OR (candidate.status = 'processing' AND candidate.locked_at < now() - interval '15 minutes')
       )
       AND ($1::uuid[] IS NULL OR candidate.id = ANY($1::uuid[]))
       ORDER BY candidate.next_attempt_at, candidate.created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING target.id, target.firebase_app_id, target.subject_id, target.attempts`,
    [idFilterProvided ? boundedIds : null],
  );
  return result.rows[0] ?? null;
}

export function createCrashlyticsReportDeleteClient({
  projectId,
  serviceAccountFile,
  fetchImpl = fetch,
} = {}) {
  const normalizedProjectId = typeof projectId === 'string' ? projectId.trim() : '';
  const normalizedServiceAccountFile = typeof serviceAccountFile === 'string'
    ? serviceAccountFile.trim()
    : '';
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(normalizedProjectId) ||
      !normalizedServiceAccountFile || typeof fetchImpl !== 'function') {
    throw new Error('Crashlytics report deletion is not configured.');
  }
  let credentialPromise;
  const accessToken = async () => {
    credentialPromise ??= fs.readFile(normalizedServiceAccountFile, 'utf8')
      .then((raw) => cert(validateFirebaseServiceAccount(raw, normalizedProjectId)))
      .catch((error) => {
        credentialPromise = undefined;
        throw error;
      });
    const credential = await credentialPromise;
    const token = await credential.getAccessToken();
    if (!token?.access_token) throw new Error('Crashlytics access token unavailable.');
    return token.access_token;
  };
  return async ({ firebaseAppId, subjectId }) => {
    const appId = boundedAppId(firebaseAppId);
    const subject = typeof subjectId === 'string' &&
      /^[0-9a-f-]{36}$/iu.test(subjectId) ? subjectId : '';
    if (!appId || !subject) throw new Error('Crashlytics report deletion target invalid.');
    const name = `projects/${encodeURIComponent(normalizedProjectId)}` +
      `/apps/${encodeURIComponent(appId)}/users/${encodeURIComponent(subject)}/crashReports`;
    const response = await fetchImpl(
      `https://firebasecrashlytics.googleapis.com/v1alpha/${name}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await accessToken()}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (response.status === 404) return { targetCompleteTime: null };
    if (!response.ok) {
      const error = new Error('Crashlytics provider deletion failed.');
      error.code = `provider_http_${response.status}`;
      throw error;
    }
    const body = await response.json().catch(() => ({}));
    const targetCompleteTime = typeof body?.targetCompleteTime === 'string' &&
      Number.isFinite(Date.parse(body.targetCompleteTime))
      ? body.targetCompleteTime
      : null;
    return { targetCompleteTime };
  };
}

export async function drainCrashlyticsReportDeletionOutbox({
  client,
  deleteReports,
  ids = null,
  limit = 20,
} = {}) {
  if (!client || typeof client.query !== 'function' ||
      typeof deleteReports !== 'function') {
    throw new Error('Crashlytics report cleanup dependencies are unavailable.');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Crashlytics report cleanup limit must be between 1 and 100.');
  }
  if (Array.isArray(ids) && ids.length === 0) return { accepted: 0, retried: 0 };
  let accepted = 0;
  let retried = 0;
  for (let index = 0; index < limit; index += 1) {
    const row = await claimNext(client, ids);
    if (!row) break;
    try {
      const result = await deleteReports({
        firebaseAppId: String(row.firebase_app_id),
        subjectId: String(row.subject_id),
      });
      await client.query(
        'DELETE FROM crashlytics_report_deletion_outbox WHERE id = $1',
        [row.id],
      );
      accepted += 1;
      void result?.targetCompleteTime;
    } catch (error) {
      const retryMinutes = Math.min(
        24 * 60,
        2 ** Math.min(Number(row.attempts ?? 1), 10),
      );
      await client.query(
        `UPDATE crashlytics_report_deletion_outbox
         SET status = 'retry',
             next_attempt_at = now() + ($2::int * interval '1 minute'),
             locked_at = NULL,
             last_error_code = $3,
             updated_at = now()
         WHERE id = $1`,
        [row.id, retryMinutes, safeProviderCode(error?.code)],
      );
      retried += 1;
    }
  }
  return { accepted, retried };
}

export function startCrashlyticsCleanupWorker({
  client,
  deleteReports,
  intervalMs = crashlyticsCleanupIntervalMs,
  onError = (error) => console.error(
    '[privacy] Crashlytics report cleanup failed',
    safeProviderCode(error?.code),
  ),
} = {}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 60_000 ||
      intervalMs > 24 * 60 * 60 * 1000) {
    throw new Error('Crashlytics cleanup interval must be between one minute and 24 hours.');
  }
  const run = () => {
    void drainCrashlyticsReportDeletionOutbox({
      client,
      deleteReports,
    }).catch(onError);
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
