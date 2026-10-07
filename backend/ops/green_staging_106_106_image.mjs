import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { assertLedger, digest, equal } from './green_staging_98_106_contract.mjs';
import { requireBinding as require } from './green_staging_106_106_binding.mjs';

const limit = 512 * 1024 * 1024;
const utf8 = bytes => {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { require(false, 'archive_utf8'); }
};
const canonicalPath = value => {
  const name = value.replace(/^\.\//u, '').replace(/\/$/u, '');
  require(name && !path.posix.isAbsolute(name) && path.posix.normalize(name) === name
    && !name.startsWith('../') && !/[\u0000-\u001f\u007f]/u.test(name), 'archive_path');
  return name;
};
// No extraction or filesystem writes. Unsupported encodings fail closed.
export function tarEntries(bytes) {
  require(Buffer.isBuffer(bytes) && bytes.length <= limit && bytes.length % 512 === 0, 'archive_size');
  const entries = []; let at = 0, pending = null;
  const field = (header, offset, size) => {
    const bytes = header.subarray(offset, offset + size), end = bytes.indexOf(0);
    return utf8(end < 0 ? bytes : bytes.subarray(0, end));
  };
  const octal = (header, offset, size) => {
    const text = field(header, offset, size).trim(); require(/^[0-7]+$/u.test(text), 'archive_number');
    const n = Number.parseInt(text, 8); require(Number.isSafeInteger(n), 'archive_number'); return n;
  };
  while (at + 512 <= bytes.length) {
    const header = bytes.subarray(at, at + 512); at += 512;
    if (header.every(b => b === 0)) {
      require(bytes.subarray(at).every(b => b === 0) && pending === null, 'archive_trailer'); return entries;
    }
    require(header.reduce((sum, b, i) => sum + (i >= 148 && i < 156 ? 32 : b), 0) === octal(header, 148, 8), 'archive_checksum');
    const decimal = (value, fallback) => {
      if (value === undefined) return fallback;
      require(/^[0-9]+$/u.test(value) && Number.isSafeInteger(Number(value)), 'archive_number'); return Number(value);
    };
    const type = field(header, 156, 1) || '0';
    const size = decimal(type === 'x' ? undefined : pending?.size, octal(header, 124, 12));
    require(size <= limit && at + size <= bytes.length, 'archive_size');
    const data = bytes.subarray(at, at + size); at += Math.ceil(size / 512) * 512;
    if (type === 'x') {
      require(pending === null, 'archive_pax'); pending = {};
      let offset = 0;
      while (offset < data.length) {
        const space = data.indexOf(32, offset), length = Number(data.subarray(offset, space).toString());
        require(space > offset && Number.isSafeInteger(length) && length > space - offset + 2 && offset + length <= data.length
          && data[offset + length - 1] === 10, 'archive_pax');
        const line = utf8(data.subarray(space + 1, offset + length - 1)), split = line.indexOf('=');
        const key = line.slice(0, split); require(split > 0 && !Object.hasOwn(pending, key), 'archive_pax');
        require(['path', 'linkpath', 'size', 'uid', 'gid', 'uname', 'gname', 'mtime', 'atime', 'ctime'].includes(key)
          || key.startsWith('SCHILY.xattr.'), 'archive_pax'); pending[key] = line.slice(split + 1); offset += length;
      }
      continue;
    }
    require(['0', '5', '1', '2', '3', '4', '6'].includes(type), 'archive_type');
    const prefix = field(header, 345, 155), base = field(header, 0, 100);
    const name = canonicalPath(pending?.path ?? (prefix ? `${prefix}/${base}` : base));
    const uid = decimal(pending?.uid, octal(header, 108, 8)), gid = decimal(pending?.gid, octal(header, 116, 8));
    const xattrs = Object.keys(pending ?? {}).filter(k => k.startsWith('SCHILY.xattr.')); pending = null;
    entries.push({ name, type, data, uid, gid, mode: octal(header, 100, 8), xattrs });
  }
  require(false, 'archive_trailer');
}
const relevant = name => name === 'etc' || ['etc/passwd', 'etc/group', 'app', 'app/sql', 'app/sql/migrations', 'run', 'run/secrets'].includes(name)
  || name.startsWith('app/sql/migrations/');
export function readCandidateArchive(bytes, image, { maxLayerBytes = limit } = {}) {
  // Tests may reduce the bound, never expand the operational 512 MiB ceiling.
  require(Number.isSafeInteger(maxLayerBytes) && maxLayerBytes > 0 && maxLayerBytes <= limit, 'archive_layer_size');
  const outer = new Map();
  for (const entry of tarEntries(bytes)) {
    require(!outer.has(entry.name), 'archive_duplicate'); outer.set(entry.name, entry);
  }
  const file = name => { const e = outer.get(canonicalPath(name)); require(e?.type === '0', 'archive_file'); return e.data; };
  const manifest = JSON.parse(utf8(file('manifest.json')));
  require(Array.isArray(manifest) && manifest.length === 1 && Array.isArray(manifest[0].Layers), 'archive_manifest');
  const configBytes = file(manifest[0].Config), config = JSON.parse(utf8(configBytes));
  require(`sha256:${digest(configBytes)}` === image.Id && equal(config.config, image.Config)
    && Array.isArray(config.rootfs?.diff_ids) && equal(config.rootfs.diff_ids, image.RootFS?.Layers)
    && config.rootfs.diff_ids.length === manifest[0].Layers.length, 'archive_image');
  const effective = new Map();
  for (const [index, layerName] of manifest[0].Layers.entries()) {
    const raw = file(layerName); let layer;
    try { layer = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw, { maxOutputLength: maxLayerBytes }) : raw; }
    catch { require(false, 'archive_layer_size'); }
    require(layer.length <= maxLayerBytes, 'archive_layer_size');
    require(`sha256:${digest(layer)}` === config.rootfs.diff_ids[index], 'archive_layer');
    const entries = tarEntries(layer), seen = new Set();
    // Apply whiteouts to inherited entries before installing this layer.
    for (const e of entries) {
      require(!seen.has(e.name), 'archive_duplicate'); seen.add(e.name);
      const base = path.posix.basename(e.name), parent = path.posix.dirname(e.name);
      if (base.startsWith('.wh.')) {
        const removed = base === '.wh..wh..opq' ? parent : path.posix.join(parent, base.slice(4));
        for (const name of effective.keys()) if (name === removed || name.startsWith(`${removed}/`)) effective.delete(name);
      }
    }
    for (const e of entries) if (relevant(e.name) && !path.posix.basename(e.name).startsWith('.wh.')) {
      require(['0', '5'].includes(e.type) && e.mode <= 0o7777 && e.xattrs.length === 0, 'archive_consumed_link');
      if (e.type !== '5') for (const name of effective.keys()) if (name.startsWith(`${e.name}/`)) effective.delete(name);
      effective.set(e.name, e);
    }
  }
  const content = name => { const e = effective.get(name); require(e?.type === '0', 'image_file'); return utf8(e.data); };
  const user = image.Config?.User;
  require(typeof user === 'string' && /^[a-z0-9_-]+(?::[a-z0-9_-]+)?$/u.test(user), 'image_user');
  const [userName, groupName] = user.split(':');
  const accounts = content('etc/passwd').trim().split('\n').map(l => l.split(':'));
  const groups = content('etc/group').trim().split('\n').map(l => l.split(':'));
  const users = accounts.filter(a => a[0] === userName || a[2] === userName);
  require(users.length === 1 && users[0].length === 7, 'image_user');
  const uid = Number(users[0][2]);
  const matches = groupName ? groups.filter(g => g[0] === groupName || g[2] === groupName) : groups.filter(g => g[2] === users[0][3]);
  require(matches.length === 1 && matches[0].length === 4, 'image_group');
  const gid = Number(matches[0][2]);
  require(Number.isSafeInteger(uid) && uid > 0 && Number.isSafeInteger(gid) && gid > 0, 'image_root_forbidden');
  const readable = (e, bit) => Boolean(e.mode & (e.uid === uid ? bit << 6 : e.gid === gid ? bit << 3 : bit));
  for (const name of ['app', 'app/sql', 'app/sql/migrations']) require(effective.get(name)?.type === '5'
    && readable(effective.get(name), 1), 'image_traversal');
  const migrations = [...effective.values()].filter(e => /^app\/sql\/migrations\/[^/]+\.up\.sql$/u.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  require(![...effective.keys()].some(n => n.startsWith('app/sql/migrations/') && n.slice(19).includes('/')), 'image_migration_nested');
  const rows = migrations.map(e => { require(e.type === '0' && readable(e, 4), 'image_migration_unreadable'); return { name: path.posix.basename(e.name), checksum: digest(e.data) }; });
  return { imageId: image.Id, uid, gid, user, ledger: assertLedger(rows, 106), migrations: rows,
    archiveSha256: digest(bytes), namespaceReadabilityVerified: false };
}
