// Disposable PostgreSQL acceptance child, never a deployment entrypoint.
import http from 'node:http';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { drainNotificationOutbox } from '../src/notifications.js';

assert.ok(process.send, 'notification acceptance requires its parent IPC channel');
assert.equal(config.deploymentEnvironment, 'test');
assert.equal(config.push.transport, 'memory');
assert.equal(config.mail.transport, 'memory');
assert.equal(config.payments.transport, 'memory');
assert.equal(config.payments.livemode, false);
const server = http.createServer(createApp());
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
process.send({ kind: 'ready', port: server.address().port });
process.on('message', async (message) => {
  try {
    if (message.kind === 'drain') {
      const processed = await drainNotificationOutbox({ limit: 100 });
      process.send({ kind: 'drained', processed });
    } else if (message.kind === 'stop') {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
      process.disconnect();
    }
  } catch {
    process.send({ kind: 'failed' });
    process.exitCode = 1;
  }
});
