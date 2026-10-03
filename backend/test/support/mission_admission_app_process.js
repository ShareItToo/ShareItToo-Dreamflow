// Test-only isolated process. No provider credentials are inherited by its caller.
import http from 'node:http';
import assert from 'node:assert/strict';

async function main() {
  const { createApp } = await import('../../src/app.js');
  const { config } = await import('../../src/config.js');
  const { pool } = await import('../../src/db.js');
  const { signAccessToken } = await import('../../src/security.js');

  let resolverCalls = 0;
  for (const transport of [config.mail.transport, config.push.transport, config.payments.transport]) {
    assert.equal(transport, 'memory');
  }
  const fixture = JSON.parse(process.env.SIT_D8_SYNTHETIC_FIXTURE);
  const server = http.createServer(createApp({
    resolveMissionSupplyRecipient: async (_client, input) => {
      resolverCalls += 1;
      return { recipientOwnerId: fixture.owner, shelfItemId: fixture.shelfItemId,
        needKey: input.needKey, purpose: input.purpose, eligibilityVersion: 'd8-synthetic-v1' };
    },
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.send({ type: 'ready', port: server.address().port, pid: process.pid,
    admission: config.planner.newEntriesEnabled,
    tokens: fixture.users.map((id, index) => signAccessToken(
      { id, email: `${id}@example.invalid` }, { sessionId: fixture.sessions[index] },
    )),
  });
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    server.closeIdleConnections();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
    process.disconnect();
  }
  process.on('message', (message) => {
    if (message === 'metrics') process.send({ type: 'metrics', resolverCalls });
    if (message === 'stop') void stop();
  });
  process.on('SIGTERM', () => void stop());
}

// Node's default test discovery may load support files: never boot then.
if (process.send && process.env.SIT_D8_SYNTHETIC_FIXTURE) await main();
