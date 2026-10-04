import { WebSocketServer, WebSocket } from 'ws';

import { pool } from './db.js';
import { verifyAccessToken } from './security.js';

const clientsByUser = new Map();

function addClient(userId, socket) {
  const sockets = clientsByUser.get(userId) ?? new Set();
  sockets.add(socket);
  clientsByUser.set(userId, sockets);
}

function removeClient(userId, socket) {
  const sockets = clientsByUser.get(userId);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) clientsByUser.delete(userId);
}

export function publishToUsers(userIds, event) {
  const payload = JSON.stringify({ ...event, sentAt: new Date().toISOString() });
  for (const userId of new Set(userIds.filter(Boolean))) {
    for (const socket of clientsByUser.get(userId) ?? []) {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload);
    }
  }
}

export function publishToAll(event) {
  publishToUsers([...clientsByUser.keys()], event);
}

export function attachRealtime(server) {
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');
    if (requestUrl.pathname !== '/v1/realtime') {
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (ws) => {
      websocketServer.emit('connection', ws, request);
    });
  });

  websocketServer.on('connection', (socket) => {
    let userId = null;
    const authTimer = setTimeout(() => socket.close(4401, 'authentication_required'), 5000);

    socket.on('message', async (raw) => {
      if (userId) return;
      try {
        const message = JSON.parse(raw.toString());
        if (message.type !== 'auth' || typeof message.token !== 'string') throw new Error('invalid auth');
        const payload = verifyAccessToken(message.token);
        const actor = await pool.query(
          `SELECT 1
           FROM users AS u
           JOIN auth_sessions AS session
             ON session.id = $2 AND session.user_id = u.id AND session.revoked_at IS NULL
           WHERE u.id = $1 AND u.account_status = 'active' AND u.deactivated_at IS NULL`,
          [payload.sub, payload.sid],
        );
        if (!actor.rowCount) throw new Error('inactive account');
        userId = payload.sub;
        clearTimeout(authTimer);
        addClient(userId, socket);
        socket.send(JSON.stringify({ type: 'ready', sentAt: new Date().toISOString() }));
      } catch {
        socket.close(4401, 'invalid_session');
      }
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      if (userId) removeClient(userId, socket);
    });

    socket.on('error', () => {
      if (userId) removeClient(userId, socket);
    });
  });

  return websocketServer;
}
