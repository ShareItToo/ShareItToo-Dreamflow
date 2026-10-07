import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export async function writeExclusiveWp250Mapping(mappingPath, bytes) {
  if (typeof mappingPath !== 'string' || !mappingPath.startsWith('/')) fail('mapping_path_invalid');
  if (!(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array)) fail('mapping_bytes_invalid');
  const absolute = resolve(mappingPath);
  const parent = dirname(absolute);
  const parentName = basename(parent);
  const expectedPrefix = join(tmpdir(), 'sit-wp250-map-');
  if (basename(absolute) !== 'mapping.json' || !parentName.startsWith('sit-wp250-map-')
      || parentName === 'sit-wp250-map-' || !parent.startsWith(expectedPrefix)) fail('mapping_path_invalid');
  let parentMeta;
  try { parentMeta = await lstat(parent); } catch { fail('mapping_directory_invalid'); }
  const ownerUid = typeof process.getuid === 'function' ? process.getuid() : parentMeta.uid;
  if (parentMeta.isSymbolicLink() || !parentMeta.isDirectory() || (parentMeta.mode & 0o777) !== 0o700 || parentMeta.uid !== ownerUid) {
    fail('mapping_directory_invalid');
  }
  const temporaryRoot = await realpath(tmpdir());
  const parentReal = await realpath(parent);
  if (!parentReal.startsWith(`${join(temporaryRoot, 'sit-wp250-map-')}`)) fail('mapping_directory_invalid');
  let handle;
  try {
    handle = await open(absolute, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(bytes);
  } catch (error) {
    if (error?.code === 'EEXIST') fail('mapping_path_exists');
    throw error;
  } finally {
    await handle?.close();
  }
  return absolute;
}
