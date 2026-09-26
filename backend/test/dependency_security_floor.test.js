import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJsonUrl = new URL('../package.json', import.meta.url);
const lockfileUrl = new URL('../pnpm-lock.yaml', import.meta.url);
const mailerSourceUrl = new URL('../src/mailer.js', import.meta.url);

function parseVersion(value, label) {
  const match = String(value).match(/(\d+)\.(\d+)\.(\d+)/u);
  assert.ok(match, `${label} must contain a semantic version`);
  return match.slice(1).map(Number);
}

function atLeast(actual, minimum) {
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
  }
  return true;
}

function lockfileVersions(lockfile, packageName) {
  const escapedName = packageName.replaceAll('/', '\\/');
  const matcher = new RegExp(`^  ${escapedName}@(\\d+\\.\\d+\\.\\d+):`, 'gmu');
  return [...lockfile.matchAll(matcher)].map((match) => match[1]);
}

test('backend image and mail dependencies retain the reviewed advisory floors', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
  const lockfile = await readFile(lockfileUrl, 'utf8');
  const requirements = [
    {
      packageName: 'sharp',
      minimum: '0.35.4',
      advisory: 'GHSA-rgj7-g3m4-5g8c',
    },
    {
      packageName: 'nodemailer',
      minimum: '9.1.1',
      advisory: 'GHSA-8m3c-c648-2xjj',
    },
    {
      packageName: 'multer',
      minimum: '2.3.0',
      advisory: 'GHSA-wc9g-mqfw-jrwm / GHSA-qfvm-cv95-jqjf / GHSA-535w-7cp7-47q4',
    },
  ];

  for (const requirement of requirements) {
    const declared = packageJson.dependencies[requirement.packageName];
    assert.ok(
      atLeast(
        parseVersion(declared, `${requirement.packageName} declaration`),
        parseVersion(requirement.minimum, `${requirement.packageName} minimum`),
      ),
      `${requirement.packageName} must remain at or above ${requirement.minimum} (${requirement.advisory})`,
    );
    const resolved = lockfileVersions(lockfile, requirement.packageName);
    assert.ok(resolved.length > 0, `${requirement.packageName} must be present in the lockfile`);
    for (const version of resolved) {
      assert.ok(
        atLeast(parseVersion(version, requirement.packageName), parseVersion(requirement.minimum, requirement.packageName)),
        `${requirement.packageName}@${version} regresses ${requirement.advisory}`,
      );
    }
  }
});

test('the SIT mailer does not use the affected legacy resolveContent plugin path', async () => {
  const mailerSource = await readFile(mailerSourceUrl, 'utf8');
  assert.doesNotMatch(mailerSource, /\.resolveContent\s*\(/u);
  assert.doesNotMatch(mailerSource, /\bcompile\s*:/u);
});
