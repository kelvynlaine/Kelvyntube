import { prisma, type Prisma } from '@kelvyntube/db';
import {
  WS_EVENTS,
  type CursorPage,
  type NotificationDTO,
  type NotificationType,
} from '@kelvyntube/shared';
import { emitToRoom, userRoom } from '../../lib/realtime.js';
import { notificationQueue, type NotificationJob } from '../../lib/queue.js';
import { channelSummarySelect, toChannelSummary } from '../../lib/serializers.js';
import { decodeCursor, encodeCursor } from '../../lib/http.js';
import { notFound } from '../../lib/errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NOTIFICATIONS
 *  Écriture en base PUIS diffusion temps réel (`user:<id>` via Redis Pub/Sub).
 *  Les producteurs (commentaires, abonnements…) passent par la file BullMQ
 *  `enqueueNotification` pour ne jamais bloquer la requête HTTP.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  imageUrl: true,
  link: true,
  readAt: true,
  createdAt: true,
  actorChannel: { select: channelSummarySelect },
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

export function toNotificationDTO(n: NotificationRow): NotificationDTO {
  return {
    id: n.id,
    type: n.type as NotificationType,
    title: n.title,
    body: n.body,
    imageUrl: n.imageUrl,
    link: n.link,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
    actorChannel: n.actorChannel ? toChannelSummary(n.actorChannel) : null,
  };
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  link: string;
  body?: string | null;
  imageUrl?: string | null;
  actorChannelId?: string | null;
  videoId?: string | null;
  commentId?: string | null;
  payload?: Prisma.InputJsonValue;
}

/**
 * Crée une notification en base puis la pousse en temps réel au destinataire.
 * L'écriture fait foi : si la diffusion WebSocket échoue, la cloche se
 * mettra à jour au prochain `GET /notifications`.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationDTO> {
  const row = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      imageUrl: input.imageUrl ?? null,
      link: input.link,
      actorChannelId: input.actorChannelId ?? null,
      videoId: input.videoId ?? null,
      commentId: input.commentId ?? null,
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    },
    select: notificationSelect,
  });

  const dto = toNotificationDTO(row);
  await emitToRoom(userRoom(input.userId), WS_EVENTS.notification, dto);
  return dto;
}

/**
 * Diffuse en temps réel des notifications DÉJÀ écrites en base.
 * Utilisé par le fan-out (`createMany` + diffusion par lots).
 */
export async function broadcastNotifications(
  rows: (NotificationRow & { userId: string })[],
): Promise<void> {
  await Promise.all(
    rows.map((row) =>
      emitToRoom(userRoom(row.userId), WS_EVENTS.notification, toNotificationDTO(row)),
    ),
  );
}

/** Met un job de notification en file (jamais d'écriture synchrone en HTTP). */
export async function enqueueNotification(job: NotificationJob): Promise<void> {
  await notificationQueue.add(job.type, job);
}

// ── Lecture ───────────────────────────────────────────────────────────────

interface ListParams {
  cursor?: string;
  limit: number;
}

interface NotificationCursor {
  t: string;
  i: string;
}

export async function listNotifications(
  userId: string,
  { cursor, limit }: ListParams,
): Promise<CursorPage<NotificationDTO>> {
  const c = decodeCursor<NotificationCursor>(cursor);
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      ...(c
        ? {
            OR: [
              { createdAt: { lt: new Date(c.t) } },
              { createdAt: new Date(c.t), id: { lt: c.i } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: notificationSelect,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return {
    items: page.map(toNotificationDTO),
    nextCursor:
      hasMore && last ? encodeCursor({ t: last.createdAt.toISOString(), i: last.id }) : null,
    hasMore,
  };
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, notificationId: string): Promise<NotificationDTO> {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
    select: { id: true },
  });
  if (!existing) throw notFound('Notification introuvable');

  const row = await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
    select: notificationSelect,
  });
  return toNotificationDTO(row);
}

export async function markAllRead(userId: string): Promise<number> {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return count;
}
