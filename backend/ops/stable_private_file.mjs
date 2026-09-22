import {
  closeSync,
  constants,
  createReadStream,
  fchmodSync,
  fchownSync,
  fstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function assertMetadata(metadata, {
  mode,
  expectedMode,
  expectedUid,
  expectedGid,
  minBytes,
  maxBytes,
  code = 'private_file_invalid',
} = {}) {
  const forbiddenModeBits = mode ?? (expectedMode === undefined ? 0o077 : 0);
  if (!metadata.isFile()
      || (metadata.mode & forbiddenModeBits) !== 0
      || (expectedMode !== undefined && (metadata.mode & 0o777) !== expectedMode)
      || (expectedUid !== undefined && metadata.uid !== expectedUid)
      || (expectedGid !== undefined && metadata.gid !== expectedGid)
      || (minBytes !== undefined && metadata.size < minBytes)
      || (maxBytes !== undefined && metadata.size > maxBytes)) {
    fail(code);
  }
  return metadata;
}

export function openStablePrivateFile(filePath, options = {}) {
  let descriptor;
  try {
    descriptor = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC);
    const metadata = fstatSync(descriptor);
    assertMetadata(metadata, options);
    return Object.freeze({ descriptor, metadata });
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    throw error;
  }
}

export function readStablePrivateFile(filePath, { encoding = 'utf8', ...options } = {}) {
  const opened = openStablePrivateFile(filePath, options);
  try {
    return readFileSync(opened.descriptor, encoding);
  } finally {
    closeSync(opened.descriptor);
  }
}

export function createStablePrivateReadStream(filePath, options = {}) {
  const opened = openStablePrivateFile(filePath, options);
  const stream = createReadStream(null, { fd: opened.descriptor, autoClose: true });
  stream.once('error', () => {
    // The stream owns the descriptor and closes it on error.
  });
  return stream;
}

export function writeExclusivePrivateFile(filePath, bytes, {
  mode = 0o600,
  uid,
  gid,
} = {}) {
  let descriptor;
  try {
    descriptor = openSync(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_CLOEXEC, mode);
    writeFileSync(descriptor, bytes);
    if (uid !== undefined || gid !== undefined) {
      fchownSync(descriptor, uid ?? -1, gid ?? -1);
    }
    fchmodSync(descriptor, mode);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function closeStablePrivateFile(opened) {
  if (opened?.descriptor !== undefined) closeSync(opened.descriptor);
}
