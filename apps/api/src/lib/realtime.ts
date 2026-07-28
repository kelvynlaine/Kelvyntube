import type { WebSocket } from 'ws';
import { WS_EVENTS, REDIS_KEYS } from '@kelvyntube/shared';
import { redisPub, redisSub } from './redis.js';

/**
 * Hub WebSocket temps réel.
 *
 * Deux canaux de diffusion :
 *  - `user:<userId>`   → notifications personnelles (nouvel abonné, réponse…)
 *  - `video:<videoId>` → compteur de vues live, progression de traitement, nouveaux commentaires
 *
 * Le fan-out passe par Redis Pub/Sub pour rester correct avec plusieurs
 * instances d'API derrière un load balancer.
 */

type Room = string;

const rooms = new Map<Room, Set<WebSocket>>();

export function joinRoom(room: Room, socket: WebSocket) {
  let set = rooms.get(room);
  if (!set) {
    set = new Set();
    rooms.set(room, set);
  }
  set.add(socket);
}

export function leaveAllRooms(socket: WebSocket) {
  for (const [room, set] of rooms) {
    set.delete(socket);
    if (set.size === 0) rooms.delete(room);
  }
}

export function userRoom(userId: string): Room {
  return `user:${userId}`;
}

export function videoRoom(videoId: string): Room {
  return `video:${videoId}`;
}

export function channelRoom(channelId: string): Room {
  return `channel:${channelId}`;
}

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

interface Envelope {
  room: Room;
  event: WsEventName;
  data: unknown;
}

/** Diffuse à tous les sockets locaux abonnés à la room. */
function deliverLocal(envelope: Envelope) {
  const set = rooms.get(envelope.room);
  if (!set?.size) return;
  const payload = JSON.stringify({ event: envelope.event, data: envelope.data });
  for (const socket of set) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

/**
 * Publie un événement à toutes les instances (via Redis) puis localement.
 * C'est LA fonction que les autres modules doivent appeler.
 */
export async function emitToRoom(room: Room, event: WsEventName, data: unknown) {
  const envelope: Envelope = { room, event, data };
  await redisPub.publish(REDIS_KEYS.notificationChannel, JSON.stringify(envelope));
  // (le handler d'abonnement ci-dessous se chargera de la livraison locale)
}

/** Démarre l'écoute Redis -> sockets locaux. À appeler une fois au boot. */
export async function startRealtimeBridge() {
  await redisSub.subscribe(REDIS_KEYS.notificationChannel);
  redisSub.on('message', (_channel, message) => {
    try {
      deliverLocal(JSON.parse(message) as Envelope);
    } catch {
      /* message malformé — ignoré */
    }
  });
}

/** Nombre de sockets actuellement connectés à une room (debug / metrics). */
export function roomSize(room: Room): number {
  return rooms.get(room)?.size ?? 0;
}
