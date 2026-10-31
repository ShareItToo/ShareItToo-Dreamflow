import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
} from 'node:path';

function fail(label, message) {
  throw new Error(`${label} ${message}`);
}

/**
 * Read one regular repository file without a check-then-open symlink race.
 *
 * The final path component is opened atomically with O_NOFOLLOW and the opened
 * descriptor is then verified before bytes are read. Repository-relative path
 * traversal is rejected before the open.
 */
export function readRepositoryFile(
  repositoryRoot,
  relativePath,
  { label = 'Repository source' } = {},
) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '' || isAbsolute(relativePath)) {
    fail(label, 'must use a non-empty repository-relative path.');
  }
  const root = realpathSync(resolve(repositoryRoot));
  const absolute = resolve(root, relativePath);
  const resolvedRelative = relative(root, absolute);
  if (resolvedRelative === ''
      || resolvedRelative.startsWith('..')
      || isAbsolute(resolvedRelative)) {
    fail(label, 'must stay inside the repository.');
  }
  let parent;
  try {
    parent = realpathSync(dirname(absolute));
  } catch {
    fail(label, 'could not be opened safely.');
  }
  const parentRelative = relative(root, parent);
  if (parentRelative.startsWith('..') || isAbsolute(parentRelative)) {
    fail(label, 'must stay inside the repository.');
  }
  const canonicalCandidate = resolve(parent, basename(absolute));
  if (!Number.isInteger(constants.O_NOFOLLOW)) {
    fail(label, 'cannot be opened safely because O_NOFOLLOW is unavailable.');
  }

  let descriptor;
  try {
    descriptor = openSync(canonicalCandidate, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === 'ELOOP') fail(label, 'must not be a symbolic link.');
    fail(label, 'could not be opened safely.');
  }

  try {
    if (!fstatSync(descriptor).isFile()) fail(label, 'must be a regular file.');
    return readFileSync(descriptor, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}
