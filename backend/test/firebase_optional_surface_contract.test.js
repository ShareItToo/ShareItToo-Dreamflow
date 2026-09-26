import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const backendRoot = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(backendRoot, '..');

test('unused Firebase Storage and Firestore optional trees stay excluded', async () => {
  const [workspace, lockfile, packageJson, workflow] = await Promise.all([
    readFile(path.join(backendRoot, 'pnpm-workspace.yaml'), 'utf8'),
    readFile(path.join(backendRoot, 'pnpm-lock.yaml'), 'utf8'),
    readFile(path.join(backendRoot, 'package.json'), 'utf8'),
    readFile(path.join(repositoryRoot, '.github/workflows/regression.yml'), 'utf8'),
  ]);
  assert.match(
    workspace,
    /ignoredOptionalDependencies:\n  - '@google-cloud\/firestore'\n  - '@google-cloud\/storage'/u,
  );
  assert.doesNotMatch(lockfile, /  '@google-cloud\/(?:firestore|storage)@/u);
  assert.doesNotMatch(lockfile, /  uuid@9\.0\.1:/u);
  assert.match(
    packageJson,
    /"security:audit": "pnpm audit --prod --audit-level=moderate"/u,
  );
  assert.match(workflow, /pnpm run security:audit/u);
});

test('Backend runtime uses only the installed Firebase Auth and Messaging surfaces', async () => {
  const sourceFiles = (await readdir(path.join(backendRoot, 'src')))
    .filter((file) => file.endsWith('.js'));
  const sources = await Promise.all(sourceFiles.map(async (file) => ({
    file,
    source: await readFile(path.join(backendRoot, 'src', file), 'utf8'),
  })));
  for (const { file, source } of sources) {
    assert.doesNotMatch(source, /firebase-admin\/(?:storage|firestore)/u, file);
    assert.doesNotMatch(source, /\bget(?:Storage|Firestore)\s*\(/u, file);
  }
  assert.ok(sources.some(({ source }) => source.includes("firebase-admin/auth")));
  assert.ok(sources.some(({ source }) => source.includes("firebase-admin/messaging")));
});
