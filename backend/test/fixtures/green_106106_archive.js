import fs from 'node:fs';
import { digest, migrationInventory, repositoryRoot } from '../../ops/green_staging_98_106_contract.mjs';

export function tar(entries) {
  const buffers = [];
  for (const e of entries) {
    const bytes = Buffer.from(e.data ?? ''), h = Buffer.alloc(512);
    const field = (value, offset, size) => h.write(value, offset, size, 'utf8');
    const number = (value, offset, size) => field(value.toString(8).padStart(size - 1, '0') + '\0', offset, size);
    field(e.name, 0, 100); number(e.mode ?? 0o644, 100, 8); number(e.uid ?? 10001, 108, 8);
    number(e.gid ?? 10001, 116, 8); number(bytes.length, 124, 12); number(0, 136, 12);
    h.fill(32, 148, 156); field(e.type ?? '0', 156, 1); field('ustar\0', 257, 6); field('00', 263, 2);
    const sum = h.reduce((a, b) => a + b, 0); field(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    buffers.push(h, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return Buffer.concat([...buffers, Buffer.alloc(1024)]);
}
export function candidateArchive(env, { changeEntries = () => {}, extraLayers = [] } = {}) {
  const entries = ['app', 'app/sql', 'app/sql/migrations', 'etc'].map(name => ({ name, type: '5', mode: 0o755 }));
  entries.push({ name: 'etc/passwd', data: 'root:x:0:0:root:/root:/bin/sh\nsitworker:x:10001:10001:worker:/app:/bin/false\n' },
    { name: 'etc/group', data: 'root:x:0:\nsitworker:x:10001:\n' });
  for (const row of migrationInventory()) entries.push({ name: `app/sql/migrations/${row.name}`,
    data: fs.readFileSync(`${repositoryRoot}/backend/sql/migrations/${row.name}`) });
  changeEntries(entries);
  const layers = [tar(entries), ...extraLayers.map(tar)];
  const config = { config: { User: 'sitworker', Env: [...env, `APP_COMMIT=${'a'.repeat(40)}`, 'APP_VERSION=synthetic', 'APP_BUILD_TIME=2020-01-01T00:00:00.000Z'],
    Labels: { 'org.opencontainers.image.revision': 'a'.repeat(40), 'org.opencontainers.image.version': 'synthetic', 'org.opencontainers.image.created': '2020-01-01T00:00:00.000Z' } },
    rootfs: { type: 'layers', diff_ids: layers.map(l => `sha256:${digest(l)}`) } };
  const configBytes = Buffer.from(JSON.stringify(config));
  const image = { Id: `sha256:${digest(configBytes)}`, Config: config.config, RootFS: { Type: 'layers', Layers: config.rootfs.diff_ids },
    RepoDigests: [`ghcr.io/shareittoo/shareittoo-api@sha256:${'33'.padStart(64, '0')}`] };
  const archive = tar([{ name: 'manifest.json', data: JSON.stringify([{ Config: 'config.json', Layers: layers.map((_, i) => `layer${i}.tar`) }]) },
    { name: 'config.json', data: configBytes }, ...layers.map((data, i) => ({ name: `layer${i}.tar`, data }))]);
  return { image, archive };
}
