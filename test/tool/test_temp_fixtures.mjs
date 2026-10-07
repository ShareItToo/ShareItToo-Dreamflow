import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { after } from 'node:test';

const safePrefixPattern = /^sit-[a-z0-9-]+-$/u;
const systemTempDirectory = resolve(tmpdir());

function assertSafePrefix(prefix) {
  if (!safePrefixPattern.test(prefix)) {
    throw new Error(`Test temporary directory prefix is unsafe: ${prefix}`);
  }
}

function assertSafeRoot(root) {
  const absoluteRoot = resolve(root);
  if (dirname(absoluteRoot) !== systemTempDirectory || !basename(absoluteRoot).startsWith('sit-')) {
    throw new Error(`Test temporary directory must be a direct sit-* child of ${systemTempDirectory}`);
  }
  return absoluteRoot;
}

export function createTestTempTracker({ registerAfter = true } = {}) {
  const roots = new Set();

  const tracker = {
    makeSync(prefix) {
      assertSafePrefix(prefix);
      const root = mkdtempSync(resolve(systemTempDirectory, prefix));
      roots.add(root);
      return root;
    },

    track(root) {
      const absoluteRoot = assertSafeRoot(root);
      roots.add(absoluteRoot);
      return absoluteRoot;
    },

    async cleanup() {
      const failures = [];
      for (const root of [...roots]) {
        try {
          await rm(root, { recursive: true, force: true, maxRetries: 2 });
          roots.delete(root);
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Failed to remove tracked test temporary directories');
      }
    },
  };

  if (registerAfter) {
    after(async () => tracker.cleanup());
  }

  return tracker;
}
