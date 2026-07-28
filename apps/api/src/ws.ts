import type { FastifyInstance } from 'fastify';
import { ROUTES } from '@kelvyntube/shared';
import { verifyAccessToken } from './lib/jwt.js';
import {
  joinRoom,
  leaveAllRooms,
  userRoom,
  videoRoom,
  channelRoom,
  startRealtimeBridge,
} from './lib/realtime.js';

/**
 * Point d'entrée WebSocket unique : `/ws`.
 *
 * Protocole client -> serveur (JSON) :
 *   { "type": "auth",      "token": "<access token>" }
 *   { "type": "subscribe", "room": "video:<id>" | "channel:<id>" }
 *   { "type": "unsubscribe", "room": "..." }
 *   { "type": "ping" }
 *
 * Serveur -> client :
 *   { "event": "notification" | "processing:progress" | ..., "data": {...} }
 */
export async function registerWebsocket(app: FastifyInstance) {
  await startRealtimeBridge();

  app.get(ROUTES.ws, { websocket: true }, (socket, req) => {
    let userId: string | null = null;

    // Auth possible dès la poignée de main via ?token=
    const url = new URL(req.url ?? '/ws', 'http://localhost');
    const queryToken = url.searchParams.get('token');
    if (queryToken) {
      try {
        userId = verifyAccessToken(queryToken).sub;
        joinRoom(userRoom(userId), socket);
      } catch {
        /* token invalide : le client reste anonyme */
      }
    }

    socket.on('message', (raw: Buffer) => {
      let msg: { type?: string; token?: string; room?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case 'auth': {
          if (!msg.token) return;
          try {
            userId = verifyAccessToken(msg.token).sub;
            joinRoom(userRoom(userId), socket);
            socket.send(JSON.stringify({ event: 'auth:ok', data: { userId } }));
          } catch {
            socket.send(JSON.stringify({ event: 'auth:error', data: null }));
          }
          break;
        }
        case 'subscribe': {
          const room = msg.room;
          if (!room) return;
          // Seules les rooms publiques sont librement rejoignables
          if (room.startsWith('video:')) joinRoom(videoRoom(room.slice(6)), socket);
          else if (room.startsWith('channel:')) joinRoom(channelRoom(room.slice(8)), socket);
          break;
        }
        case 'ping':
          socket.send(JSON.stringify({ event: 'pong', data: Date.now() }));
          break;
      }
    });

    socket.on('close', () => leaveAllRooms(socket));
    socket.on('error', () => leaveAllRooms(socket));
  });
}
