import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertBoundSnapshotAttestation,
  boundDigest,
  boundText,
  deriveBoundSnapshotAttestation,
  readBoundSource,
  resolveBoundSnapshot,
} from '../../tool/read_bound_source.mjs';

function digest(text) {
  return createHash('sha256').update(text).digest('hex');
}

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function fixture() {
  const repo = mkdtempSync(join(tmpdir(), 'sit-bound-source-'));
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  git(repo, ['config', 'user.name', 'fixture']);
  writeFileSync(join(repo, 'stable.txt'), 'stable-v1\n');
  writeFileSync(join(repo, 'closure-evidence.json'), '{"anchor":true}\n');
  git(repo, ['add', 'stable.txt']);
  git(repo, ['add', 'closure-evidence.json']);
  git(repo, ['commit', '-qm', 'baseline']);
  const baseline = git(repo, ['rev-parse', 'HEAD']);
  mkdirSync(join(repo, 'nested'));
  writeFileSync(join(repo, 'nested/new.txt'), 'new-v1\n');
  writeFileSync(join(repo, 'stable.txt'), 'stable-v2\n');
  git(repo, ['add', '.']);
  git(repo, ['commit', '-qm', 'successor']);
  const successor = git(repo, ['rev-parse', 'HEAD']);
  return { repo, baseline, successor };
}

test('reads the exact source at the recorded closure revision', () => {
  const { repo, baseline } = fixture();
  try {
    const snapshot = resolveBoundSnapshot({
      repositoryRoot: repo,
      baselineHead: baseline,
      inventory: { 'stable.txt': digest('stable-v1\n') },
    });
    writeFileSync(join(repo, 'stable.txt'), 'working-tree-mutation\n');
    assert.equal(
      boundText({
        repositoryRoot: repo,
        path: 'stable.txt',
        revision: snapshot.revision,
        expectedDigest: digest('stable-v1\n'),
      }),
      'stable-v1\n',
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('resolves a path absent at baseline only when its immutable successor blob matches', () => {
  const { repo, baseline } = fixture();
  try {
    const snapshot = resolveBoundSnapshot({
      repositoryRoot: repo,
      baselineHead: baseline,
      inventory: { 'nested/new.txt': digest('new-v1\n') },
    });
    assert.equal(
      readBoundSource({
        repositoryRoot: repo,
        path: 'nested/new.txt',
        revision: snapshot.revision,
        expectedDigest: digest('new-v1\n'),
      }).toString('utf8'),
      'new-v1\n',
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('anchor resolution ignores unrelated descendant commits', () => {
  const { repo, baseline } = fixture();
  try {
    for (let index = 0; index < 24; index += 1) {
      writeFileSync(join(repo, `unrelated-${index}.txt`), `${index}\n`);
      git(repo, ['add', '.']);
      git(repo, ['commit', '-qm', `unrelated-${index}`]);
    }
    const snapshot = resolveBoundSnapshot({
      repositoryRoot: repo,
      baselineHead: baseline,
      anchorPath: 'closure-evidence.json',
      inventory: {
        'stable.txt': digest('stable-v1\n'),
        'closure-evidence.json': digest('{"anchor":true}\n'),
      },
    });
    assert.equal(snapshot.revision, baseline);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('rejects a wrong digest and injected source drift', () => {
  const { repo, baseline } = fixture();
  try {
    assert.throws(
      () => boundDigest({
        repositoryRoot: repo,
        path: 'stable.txt',
        revision: baseline,
        expectedDigest: digest('wrong\n'),
      }),
      /bound source digest mismatch/u,
    );
    assert.throws(
      () => boundDigest({
        repositoryRoot: repo,
        path: 'stable.txt',
        revision: baseline,
        sourceTexts: { 'stable.txt': 'tampered\n' },
        expectedDigest: digest('stable-v1\n'),
      }),
      /bound source digest mismatch/u,
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('rejects Frankenstein snapshots, off-ancestry matches, invalid revisions and unsafe paths', () => {
  const incoherent = mkdtempSync(join(tmpdir(), 'sit-bound-incoherent-'));
  git(incoherent, ['init', '-q']);
  git(incoherent, ['config', 'user.email', 'fixture@example.invalid']);
  git(incoherent, ['config', 'user.name', 'fixture']);
  writeFileSync(join(incoherent, 'a.txt'), 'a0\n');
  writeFileSync(join(incoherent, 'b.txt'), 'b0\n');
  git(incoherent, ['add', '.']);
  git(incoherent, ['commit', '-qm', 'baseline']);
  const incoherentBaseline = git(incoherent, ['rev-parse', 'HEAD']);
  writeFileSync(join(incoherent, 'a.txt'), 'a1\n');
  git(incoherent, ['add', 'a.txt']);
  git(incoherent, ['commit', '-qm', 'a']);
  writeFileSync(join(incoherent, 'b.txt'), 'b1\n');
  writeFileSync(join(incoherent, 'a.txt'), 'a0\n');
  git(incoherent, ['add', '.']);
  git(incoherent, ['commit', '-qm', 'b-and-revert-a']);
  try {
    assert.throws(
      () => resolveBoundSnapshot({
        repositoryRoot: incoherent,
        baselineHead: incoherentBaseline,
        inventory: { 'a.txt': digest('a1\n'), 'b.txt': digest('b1\n') },
      }),
      /bound snapshot unavailable/u,
    );
  } finally {
    rmSync(incoherent, { recursive: true, force: true });
  }

  const { repo, baseline } = fixture();
  const branch = git(repo, ['branch', '--show-current']);
  try {
    git(repo, ['branch', 'off-ancestry', baseline]);
    git(repo, ['switch', 'off-ancestry']);
    writeFileSync(join(repo, 'off.txt'), 'off\n');
    git(repo, ['add', 'off.txt']);
    git(repo, ['commit', '-qm', 'off']);
    git(repo, ['switch', branch]);
    assert.throws(
      () => resolveBoundSnapshot({
        repositoryRoot: repo,
        baselineHead: baseline,
        inventory: { 'off.txt': digest('off\n') },
      }),
      /bound snapshot unavailable/u,
    );
    assert.throws(
      () => boundText({ repositoryRoot: repo, path: 'stable.txt', revision: 'HEAD' }),
      /bound source revision invalid/u,
    );
    assert.throws(
      () => boundText({ repositoryRoot: repo, path: '../stable.txt', revision: baseline }),
      /bound source path invalid/u,
    );
    assert.throws(() => resolveBoundSnapshot({
      repositoryRoot: repo,
      baselineHead: baseline,
      inventory: { 'missing.txt': digest('missing\n') },
    }), /bound snapshot unavailable/u);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('requires a genuine outer attestation and exact same-revision nested inventory', () => {
  const { repo, baseline } = fixture();
  const stableV1 = digest('stable-v1\n');
  const stableV2 = digest('stable-v2\n');
  try {
    const snapshot = resolveBoundSnapshot({
      repositoryRoot: repo,
      baselineHead: baseline,
      inventory: { 'stable.txt': stableV1 },
    });
    assert.doesNotThrow(() => assertBoundSnapshotAttestation({ repositoryRoot: repo, snapshot }));
    assert.throws(
      () => assertBoundSnapshotAttestation({
        repositoryRoot: repo,
        snapshot: { ...snapshot, inventory: { 'stable.txt': stableV1 } },
      }),
      /bound snapshot attestation invalid/u,
    );
    assert.throws(
      () => assertBoundSnapshotAttestation({
        repositoryRoot: repo,
        snapshot,
        inventory: {},
      }),
      /bound snapshot inventory digest mismatch|bound snapshot inventory mismatch/u,
    );
    assert.throws(
      () => deriveBoundSnapshotAttestation({
        repositoryRoot: repo,
        snapshot,
        inventory: {},
      }),
      /bound snapshot inventory empty/u,
    );
    assert.throws(
      () => deriveBoundSnapshotAttestation({
        repositoryRoot: repo,
        snapshot,
        inventory: { 'stable.txt': stableV2 },
      }),
      /bound source digest mismatch/u,
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
