import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  inspectStagingRuntimeReadonly,
} from '../../tool/inspect_staging_runtime_readonly.mjs';

const currentCommit = '68c97a437969dc98f17eb151da3e006259ffbafa';
const previousCommit = '5d88295fa7fe313b83936783a0582a505b2ba486';
const imageId = `sha256:${'a'.repeat(64)}`;
const buildTime = '2026-09-06T05:48:02.000Z';

function runtimeFixture() {
  return {
    values: {
      APP_COMMIT: currentCommit,
      APP_VERSION: `0.1.0-${currentCommit.slice(0, 12)}`,
      APP_BUILD_TIME: buildTime,
      DEPLOYMENT_ENVIRONMENT: 'staging',
      FIREBASE_AUTH_ENABLED: 'true',
      FIREBASE_PHONE_VERIFICATION_ENABLED: 'true',
      MAIL_TRANSPORT: 'smtp',
      PUSH_TRANSPORT: 'fcm',
      PAYMENT_TRANSPORT: 'memory',
      STRIPE_LIVEMODE: 'false',
      SIT_LISTING_AI_PROVIDER: 'on_device',
      SIT_LISTING_AI_MODEL:
        'mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1',
      SIT_LISTING_AI_BUDGET_CENTS: '0',
      SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: null,
      BOOKING_PILOT_MODE: 'pilot',
      PRIVATE_PILOT_V4_ENABLED: 'true',
      BOOKING_GROUPS_ENABLED: 'true',
      PLANNER_CORE_ENABLED: 'true',
      PLANNER_INVENTORY_ENABLED: 'true',
      LISTING_SUPPLY_ENRICHMENT_ENABLED: 'true',
      LISTING_SETS_ENABLED: 'true',
    },
    firebaseProjectMatchesStaging: true,
    pilotRegionMatchesHeilbronn: true,
    credentialVariablesDeclared: {
      FIREBASE_SERVICE_ACCOUNT_FILE: true,
      SMTP_USER: true,
      SMTP_PASSWORD: true,
      STRIPE_SECRET_KEY: true,
      STRIPE_WEBHOOK_SECRET: true,
      STRIPE_CONNECT_WEBHOOK_SECRET: false,
      OPENAI_API_KEY: false,
    },
    files: {
      firebase: {
        exists: true,
        regular: true,
        symlink: false,
        nonempty: true,
        mode: '640',
      },
    },
  };
}

function releaseFixture() {
  return {
    environment: 'staging',
    commit: currentCommit,
    previousCommit,
    version: `0.1.0-${currentCommit.slice(0, 12)}`,
    buildTime,
    deployedAt: '20260906T054802Z',
    stagingFcm: true,
    stagingSmtp: true,
    stagingListingAi: true,
    stagingStripe: false,
    stagingPilotId: 'heilbronn_wave0',
    stagingReadiness: {
      status: 'passed',
      state: 'ready',
      noncriticalNextUpdateOverdue: 0,
    },
  };
}

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'sit-staging-runtime-'));
  const release = join(directory, `staging-20260906T054802Z-${currentCommit.slice(0, 12)}.json`);
  writeFileSync(release, JSON.stringify(releaseFixture()), { mode: 0o600 });
  chmodSync(release, 0o600);
  const memoryPath = join(directory, 'meminfo');
  writeFileSync(memoryPath, 'MemTotal:       8192000 kB\nMemAvailable:   4096000 kB\n');
  const runtime = runtimeFixture();

  function run(command, args) {
    if (command === 'df') {
      assert.deepEqual(args, ['-Pk', '/docker/shareittoo']);
      return 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/root 20000000 8000000 12000000 40% /';
    }
    assert.equal(command, 'docker');
    if (args[0] === 'exec') {
      assert.deepEqual(args.slice(0, 4), ['exec', 'shareittoo-staging-api', 'node', '-e']);
      return JSON.stringify(runtime);
    }
    const [, , , format, object] = args;
    if (args[0] === 'container') {
      if (format === '{{.State.Running}}') return 'true';
      if (format === '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}') {
        return 'healthy';
      }
      if (format === '{{.State.StartedAt}}') return '2026-09-06T05:48:05.000Z';
      if (format === '{{.RestartCount}}') return object.endsWith('-api') ? '0' : '1';
      if (format === '{{.Image}}') {
        return object.endsWith('-api') ? imageId : `sha256:${'b'.repeat(64)}`;
      }
    }
    if (args[0] === 'image') {
      if (format === '{{.Id}}') return imageId;
      if (format.includes('revision')) return currentCommit;
      if (format.includes('version')) return `0.1.0-${currentCommit.slice(0, 12)}`;
      if (format.includes('created')) return buildTime;
      if (format === '{{.Size}}') return '314572800';
    }
    throw new Error(`Unexpected command shape: ${args.join('|')}`);
  }

  return {
    directory,
    memoryPath,
    release,
    runtime,
    run,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test('captures only the exact healthy protected Staging runtime shape', () => {
  const fixture = setup();
  try {
    const result = inspectStagingRuntimeReadonly({
      run: fixture.run,
      now: () => new Date('2026-09-07T18:00:00.000Z'),
      releaseDirectory: fixture.directory,
      memoryPath: fixture.memoryPath,
    });
    assert.equal(result.status, 'passed-read-only');
    assert.equal(result.image.revision, currentCommit);
    assert.equal(result.containers.api.restartCount, 0);
    assert.equal(result.containers.database.restartCount, 1);
    assert.equal(result.releaseRecord.commit, currentCommit);
    assert.equal(result.resources.diskUsedPercent, 40);
    assert.equal(result.resources.memoryAvailableKiB, 4096000);
    assert.deepEqual(result.boundaries, {
      credentialContentsRead: false,
      credentialPathsEmitted: false,
      containerConfigurationDumped: false,
      deploymentChanged: false,
      stagingDataChanged: false,
      productionChanged: false,
    });
    assert.equal(result.assessment.targetImageAvailable, false);
  } finally {
    fixture.cleanup();
  }
});

test('rejects protected runtime drift and unexpected runtime output fields', () => {
  const drift = setup();
  try {
    drift.runtime.values.PAYMENT_TRANSPORT = 'stripe';
    assert.throws(() => inspectStagingRuntimeReadonly({
      run: drift.run,
      releaseDirectory: drift.directory,
      memoryPath: drift.memoryPath,
    }), /Staging runtime inventory failed/u);
  } finally {
    drift.cleanup();
  }

  const extra = setup();
  try {
    extra.runtime.unexpected = 'forbidden';
    assert.throws(() => inspectStagingRuntimeReadonly({
      run: extra.run,
      releaseDirectory: extra.directory,
      memoryPath: extra.memoryPath,
    }), /Staging runtime inventory failed/u);
  } finally {
    extra.cleanup();
  }

  const firebase = setup();
  try {
    firebase.runtime.files.firebase.unexpected = 'forbidden';
    assert.throws(() => inspectStagingRuntimeReadonly({
      run: firebase.run,
      releaseDirectory: firebase.directory,
      memoryPath: firebase.memoryPath,
    }), /Staging runtime inventory failed/u);
  } finally {
    firebase.cleanup();
  }
});

test('rejects release drift instead of presenting a rollback identity', () => {
  const fixture = setup();
  try {
    const changed = releaseFixture();
    changed.commit = previousCommit;
    changed.version = `0.1.0-${previousCommit.slice(0, 12)}`;
    writeFileSync(fixture.release, JSON.stringify(changed));
    chmodSync(fixture.release, 0o600);
    assert.throws(() => inspectStagingRuntimeReadonly({
      run: fixture.run,
      releaseDirectory: fixture.directory,
      memoryPath: fixture.memoryPath,
    }), /Staging runtime inventory failed/u);
  } finally {
    fixture.cleanup();
  }
});

test('rejects release readiness drift or unexpected nested fields', () => {
  const state = setup();
  try {
    const changed = releaseFixture();
    changed.stagingReadiness.state = 'ready';
    changed.stagingReadiness.noncriticalNextUpdateOverdue = 1;
    writeFileSync(state.release, JSON.stringify(changed));
    chmodSync(state.release, 0o600);
    assert.throws(() => inspectStagingRuntimeReadonly({
      run: state.run,
      releaseDirectory: state.directory,
      memoryPath: state.memoryPath,
    }), /Staging runtime inventory failed/u);
  } finally {
    state.cleanup();
  }

  const extra = setup();
  try {
    const changed = releaseFixture();
    changed.stagingReadiness.unexpected = 'forbidden';
    writeFileSync(extra.release, JSON.stringify(changed));
    chmodSync(extra.release, 0o600);
    assert.throws(() => inspectStagingRuntimeReadonly({
      run: extra.run,
      releaseDirectory: extra.directory,
      memoryPath: extra.memoryPath,
    }), /Staging runtime inventory failed/u);
  } finally {
    extra.cleanup();
  }
});

test('rejects a symlinked or overly permissive release record', () => {
  const linked = setup();
  try {
    const original = `${linked.release}.source`;
    writeFileSync(original, JSON.stringify(releaseFixture()), { mode: 0o600 });
    rmSync(linked.release);
    symlinkSync(original, linked.release);
    assert.throws(() => inspectStagingRuntimeReadonly({
      run: linked.run,
      releaseDirectory: linked.directory,
      memoryPath: linked.memoryPath,
    }), /Staging runtime inventory failed/u);
  } finally {
    linked.cleanup();
  }

  const permissions = setup();
  try {
    chmodSync(permissions.release, 0o644);
    assert.throws(() => inspectStagingRuntimeReadonly({
      run: permissions.run,
      releaseDirectory: permissions.directory,
      memoryPath: permissions.memoryPath,
    }), /Staging runtime inventory failed/u);
  } finally {
    permissions.cleanup();
  }
});

test('source never dumps container configuration or reads credential contents', () => {
  const source = readFileSync(
    new URL('../../tool/inspect_staging_runtime_readonly.mjs', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /\.Config\.Env|\bprintenv\b|\benv\s*\]|execSync|shell:\s*true/u);
  assert.doesNotMatch(source, /readFileSync\([^)]*firebase|readFileSync\([^)]*secret/u);
  assert.match(source, /\{\{\.State\.Running\}\}/u);
  assert.match(source, /\{\{\.Image\}\}/u);
  assert.match(source, /credentialContentsRead:\s*false/u);
  assert.match(source, /credentialPathsEmitted:\s*false/u);
  assert.match(source, /readSync\(descriptor, bytes/u);
  assert.doesNotMatch(source, /readFileSync\(descriptor/u);
});
