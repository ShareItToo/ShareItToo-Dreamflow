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
// Containerd may report the manifest digest as image.Id instead of the config
// digest. Accept only the observed single-manifest OCI layout; every edge is
// bound to the same exported bytes, never inferred from annotation/tag text.
function bindDescriptorArchive(outer, file, legacy, image, configBytes) {
  const keys = (value, required, optional = []) => {
    require(value && typeof value === 'object' && !Array.isArray(value)
      && required.every(k => Object.hasOwn(value, k))
      && Object.keys(value).every(k => [...required, ...optional].includes(k)), 'archive_descriptor_shape');
    if (Object.hasOwn(value, 'annotations')) require(value.annotations && typeof value.annotations === 'object'
      && !Array.isArray(value.annotations) && Object.values(value.annotations).every(v => typeof v === 'string'), 'archive_annotations');
  };
  const media = { manifest: 'application/vnd.docker.distribution.manifest.v2+json',
    config: 'application/vnd.docker.container.image.v1+json', layer: 'application/vnd.docker.image.rootfs.diff.tar.gzip' };
  const blobPath = descriptor => {
    keys(descriptor, ['mediaType', 'digest', 'size']);
    require(/^sha256:[a-f0-9]{64}$/u.test(descriptor.digest) && Number.isSafeInteger(descriptor.size)
      && descriptor.size > 0 && descriptor.size <= limit, 'archive_descriptor');
    return `blobs/sha256/${descriptor.digest.slice(7)}`;
  };
  const consumed = new Set(['manifest.json', 'index.json', 'oci-layout']);
  const blob = (descriptor, type, expectedPath) => {
    const name = blobPath(descriptor);
    require(descriptor.mediaType === type && (expectedPath === undefined || expectedPath === name), 'archive_descriptor_path');
    const bytes = file(name);
    require(bytes.length === descriptor.size && `sha256:${digest(bytes)}` === descriptor.digest, 'archive_descriptor_bytes');
    consumed.add(name); return bytes;
  };
  require(image.Descriptor?.digest === image.Id && Array.isArray(image.RepoDigests)
    && image.RepoDigests.some(value => typeof value === 'string' && value.endsWith(`@${image.Id}`)), 'archive_descriptor_identity');
  const manifestBytes = blob(image.Descriptor, media.manifest);
  const index = JSON.parse(utf8(file('index.json'))), layout = JSON.parse(utf8(file('oci-layout')));
  keys(layout, ['imageLayoutVersion']); require(layout.imageLayoutVersion === '1.0.0', 'archive_layout');
  keys(index, ['schemaVersion', 'mediaType', 'manifests'], ['annotations']);
  require(index.schemaVersion === 2 && index.mediaType === 'application/vnd.oci.image.index.v1+json'
    && Array.isArray(index.manifests) && index.manifests.length === 1, 'archive_index');
  const indexed = index.manifests[0];
  keys(indexed, ['digest', 'size', 'mediaType'], ['annotations']);
  require(['digest', 'size', 'mediaType'].every(k => indexed[k] === image.Descriptor[k]), 'archive_index_binding');
  const manifest = JSON.parse(utf8(manifestBytes));
  keys(manifest, ['schemaVersion', 'mediaType', 'config', 'layers']);
  require(manifest.schemaVersion === 2 && manifest.mediaType === media.manifest
    && Array.isArray(manifest.layers) && manifest.layers.length === legacy.Layers.length, 'archive_descriptor_manifest');
  require(blob(manifest.config, media.config, legacy.Config).equals(configBytes), 'archive_config_binding');
  for (const [i, descriptor] of manifest.layers.entries()) {
    const raw = blob(descriptor, media.layer, legacy.Layers[i]);
    require(raw[0] === 0x1f && raw[1] === 0x8b, 'archive_layer_encoding');
  }
  // Directory headers carry no descriptors. Every regular member must belong
  // to this exact closure; surplus blobs/manifests cannot hide another image.
  for (const entry of outer.values()) require(consumed.has(entry.name)
    || (entry.type === '5' && ['blobs', 'blobs/sha256'].includes(entry.name) && entry.data.length === 0), 'archive_ambiguous_member');
}
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
  if (`sha256:${digest(configBytes)}` !== image.Id) bindDescriptorArchive(outer, file, manifest[0], image, configBytes);
  require(equal(config.config, image.Config)
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
