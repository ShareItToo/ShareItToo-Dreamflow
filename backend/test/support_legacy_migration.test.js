import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  supportIntakeScopeVersion,
  supportPacketVersion,
  supportSafetyGuidanceVersion,
  supportSafetyTriageVersion,
} from '../src/support_case_domain.js';
import {
  previewLegacySupportMigration,
  publicLegacyMigrationPreview,
} from '../src/support_legacy_migration.js';

const now = new Date('2026-08-22T08:00:00.000Z');

function request(overrides = {}) {
  return {
    schemaVersion: 1,
    source: {
      system: 'local_shared_preferences_message_threads_v1',
      thread: {
        id: 'thread_support_legacy_1',
        threadType: 'support',
        user1Id: 'user-a',
        user2Id: 'support',
        archivedForUserIds: [],
        createdAt: '2026-08-20T10:00:00.000',
        lastMessageAt: '2026-08-20T10:05:00.000Z',
        legacyStatus: 'open',
        messages: [
          {
            id: 'legacy-message-1',
            senderId: 'user-a',
            text: 'Ich brauche Hilfe mit einer älteren App-Anzeige.',
            timestamp: '2026-08-20T10:00:00.000',
            isRead: true,
          },
          {
            id: 'legacy-message-2',
            senderId: 'support',
            text: 'Der Verlauf wurde damals lokal angezeigt.',
            timestamp: '2026-08-20T10:05:00.000Z',
            isRead: false,
          },
        ],
      },
    },
    intake: {
      caseType: 'general_help',
      caseSubType: 'app_error_or_display',
      summary: 'Ein vorhandener lokaler Supportverlauf soll geprüft werden.',
      immediateDanger: false,
      safetyTriage: {
        version: supportSafetyTriageVersion,
        packetVersion: supportPacketVersion,
        guidanceVersion: supportSafetyGuidanceVersion,
        immediateDanger: false,
        guidanceShown: false,
      },
      issueScope: {
        version: supportIntakeScopeVersion,
        singleIssueConfirmed: true,
        separationGuidanceShown: true,
      },
    },
    ...overrides,
  };
}

test('legacy preview is aggregate-only, unverified, deterministic and preserves timezone uncertainty', () => {
  const first = publicLegacyMigrationPreview(request(), { actorId: 'user-a', now });
  const second = publicLegacyMigrationPreview(request(), { actorId: 'user-a', now });

  assert.equal(first.eligible, true);
  assert.equal(first.dataMutation, false);
  assert.equal(first.externalMessagesSent, false);
  assert.equal(first.requiresExplicitCommit, true);
  assert.equal(first.operatingMode, 'simulation');
  assert.equal(first.templateState, 'historical_disabled');
  assert.equal(first.verificationState, 'unverified_user_device_source');
  assert.equal(first.usableAsDecisionEvidence, false);
  assert.equal(first.historyEntryCount, 2);
  assert.equal(first.unresolvedLocalTimestampCount, 1);
  assert.equal(first.mappedStatus, 'acknowledged');
  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  assert.match(first.sourceFingerprint, /^[0-9a-f]{64}$/u);
  assert.equal('source' in first, false);
  assert.equal('intake' in first, false);
  assert.doesNotMatch(JSON.stringify(first), /älteren App-Anzeige/u);
});

test('canonical case references block a duplicate legacy import', () => {
  const candidate = request();
  candidate.source.thread.messages[1].text =
    'Support-Fall SIT-ABCDEFGHJKLM ist bereits serverseitig bestätigt.';
  const preview = publicLegacyMigrationPreview(candidate, {
    actorId: 'user-a',
    now,
  });
  assert.equal(preview.eligible, false);
  assert.deepEqual(preview.blockers, ['canonical_case_reference_present']);
});

test('archived threads are not silently represented as open cases', () => {
  const candidate = request();
  candidate.source.thread.archivedForUserIds = ['user-a'];
  const preview = publicLegacyMigrationPreview(candidate, {
    actorId: 'user-a',
    now,
  });
  assert.equal(preview.eligible, false);
  assert.deepEqual(preview.blockers, ['archived_thread_not_open']);
});

test('paused legacy state requires a concrete supported mapping and reason', () => {
  const candidate = request();
  candidate.source.thread.legacyStatus = 'paused';
  candidate.source.thread.pausedMapping = 'waiting_for_user';
  candidate.source.thread.pauseReason =
    'Eine konkret benannte Nutzerantwort war im Altverlauf noch offen.';
  const preview = publicLegacyMigrationPreview(candidate, {
    actorId: 'user-a',
    now,
  });
  assert.equal(preview.eligible, true);
  assert.equal(preview.mappedStatus, 'waiting_for_user');

  delete candidate.source.thread.pauseReason;
  assert.throws(
    () => previewLegacySupportMigration(candidate, { actorId: 'user-a', now }),
    (error) => error.code === 'support_legacy_pause_reason_required',
  );
});

test('participant and sender ownership are fail-closed', () => {
  const foreignParticipant = request();
  foreignParticipant.source.thread.user1Id = 'other-user';
  assert.throws(
    () => previewLegacySupportMigration(foreignParticipant, {
      actorId: 'user-a',
      now,
    }),
    (error) => error.code === 'support_legacy_thread_participants_forbidden',
  );

  const foreignSender = request();
  foreignSender.source.thread.messages[0].senderId = 'other-user';
  assert.throws(
    () => previewLegacySupportMigration(foreignSender, {
      actorId: 'user-a',
      now,
    }),
    (error) => error.code === 'support_legacy_message_sender_forbidden',
  );
});

test('duplicate message IDs and oversized history fail before persistence', () => {
  const duplicate = request();
  duplicate.source.thread.messages[1].id = duplicate.source.thread.messages[0].id;
  assert.throws(
    () => previewLegacySupportMigration(duplicate, { actorId: 'user-a', now }),
    (error) => error.code === 'support_legacy_message_id_invalid',
  );

  const oversized = request();
  oversized.source.thread.messages = Array.from({ length: 500 }, (_, index) => ({
    id: `legacy-${index}`,
    senderId: 'user-a',
    text: 'x'.repeat(600),
    timestamp: '2026-08-20T10:00:00.000Z',
    isRead: true,
  }));
  assert.throws(
    () => previewLegacySupportMigration(oversized, { actorId: 'user-a', now }),
    (error) => error.code === 'support_legacy_history_too_large',
  );
});

test('migration schema is append-only and destructive rollback refuses stored history', () => {
  const up = fs.readFileSync(
    new URL('../sql/migrations/050_support_legacy_history_import.up.sql', import.meta.url),
    'utf8',
  );
  const down = fs.readFileSync(
    new URL('../sql/migrations/050_support_legacy_history_import.down.sql', import.meta.url),
    'utf8',
  );
  const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');

  assert.match(up, /support_legacy_imports_append_only/u);
  assert.match(up, /support_legacy_history_entries_append_only/u);
  assert.match(up, /template_state = 'historical_disabled'/u);
  assert.match(up, /verification_state = 'unverified_user_device_source'/u);
  assert.match(up, /source_trust = 'unverified_user_device_source'/u);
  assert.match(down, /rollback would lose history/u);
  assert.match(config, /SUPPORT_LEGACY_MIGRATION_ENABLED/u);
  assert.match(config, /deploymentEnvironment === 'production'/u);
  assert.match(config, /automaticImportAllowed: false/u);
  assert.match(config, /externalMessagesAllowed: false/u);
});
