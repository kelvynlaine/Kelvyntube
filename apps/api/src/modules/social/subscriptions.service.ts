import { prisma, type Prisma } from '@kelvyntube/db';
import {
  WS_EVENTS,
  type CursorPage,
  type NotificationLevel,
  type SubscriptionDTO,
  type VideoCardDTO,
} from '@kelvyntube/shared';
import { channelRoom, emitToRoom } from '../../lib/realtime.js';
import { channelSummarySelect, toChannelSummary, toVideoCard, videoCardSelect } from '../../lib/serializers.js';
import { decodeCursor, encodeCursor } from '../../lib/http.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { enqueueNotification } from './notifications.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ABONNEMENTS
 *  `Channel.subscriberCount` est dénormalisé : il est mis à jour dans la
 *  même transaction que la ligne `Subscription`, jamais après coup.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface SubscribeResult {
  subscribed: boolean;
  level: NotificationLevel | null;
  subscriberCount: number;
}

/** Diffuse le nouveau compteur d'abonnés sur la room de la chaîne. */
async function broadcastSubscriberCount(channelId: string, subscriberCount: number) {
  await emitToRoom(channelRoom(channelId), WS_EVENTS.subscriberCount, {
    channelId,
    subscriberCount,
  });
}

export async function subscribe(
  userId: string,
  channelId: string,
  level: NotificationLevel,
): Promise<SubscribeResult> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, name: true, ownerId: true, subscriberCount: true },
  });
  if (!channel) throw notFound('Chaîne introuvable');
  if (channel.ownerId === userId) {
    throw badRequest('Impossible de s’abonner à sa propre chaîne');
  }

  const existing = await prisma.subscription.findUnique({
    where: { subscriberId_channelId: { subscriberId: userId, channelId } },
    select: { id: true, level: true },
  });

  // Idempotent : un ré-abonnement ne fait que mettre à jour le niveau de cloche.
  if (existing) {
    if (existing.level !== level) {
      await prisma.subscription.update({ where: { id: existing.id }, data: { level } });
    }
    return { subscribed: true, level, subscriberCount: channel.subscriberCount };
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.subscription.create({ data: { subscriberId: userId, channelId, level } });
    return tx.channel.update({
      where: { id: channelId },
      data: { subscriberCount: { increment: 1 } },
      select: { subscriberCount: true },
    });
  });

  await broadcastSubscriberCount(channelId, updated.subscriberCount);

  // Notification au créateur (jamais à soi-même : cas déjà écarté plus haut).
  const subscriberChannel = await prisma.channel.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, handle: true, avatarUrl: true },
  });
  const subscriberUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  });
  const actorName = subscriberChannel?.name ?? subscriberUser?.displayName ?? 'Un spectateur';

  await enqueueNotification({
    type: 'NEW_SUBSCRIBER',
    userId: channel.ownerId,
    actorChannelId: subscriberChannel?.id,
    title: `${actorName} s’est abonné à ${channel.name}`,
    body: `Vous avez maintenant ${updated.subscriberCount} abonné(s)`,
    imageUrl: subscriberChannel?.avatarUrl ?? undefined,
    link: subscriberChannel ? `/@${subscriberChannel.handle}` : `/channel/${channelId}`,
  });

  return { subscribed: true, level, subscriberCount: updated.subscriberCount };
}

export async function unsubscribe(userId: string, channelId: string): Promise<SubscribeResult> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, subscriberCount: true },
  });
  if (!channel) throw notFound('Chaîne introuvable');

  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.subscription.deleteMany({
      where: { subscriberId: userId, channelId },
    });
    if (count === 0) return { subscriberCount: channel.subscriberCount, changed: false };
    const updated = await tx.channel.update({
      where: { id: channelId },
      // `max(0, …)` de secours : le compteur ne doit jamais devenir négatif.
      data: { subscriberCount: { decrement: 1 } },
      select: { subscriberCount: true },
    });
    return { subscriberCount: Math.max(0, updated.subscriberCount), changed: true };
  });

  if (result.changed) await broadcastSubscriberCount(channelId, result.subscriberCount);

  return { subscribed: false, level: null, subscriberCount: result.subscriberCount };
}

export async function updateLevel(
  userId: string,
  channelId: string,
  level: NotificationLevel,
): Promise<SubscribeResult> {
  const existing = await prisma.subscription.findUnique({
    where: { subscriberId_channelId: { subscriberId: userId, channelId } },
    select: { id: true, channel: { select: { subscriberCount: true } } },
  });
  if (!existing) throw notFound('Abonnement introuvable');

  await prisma.subscription.update({ where: { id: existing.id }, data: { level } });
  return { subscribed: true, level, subscriberCount: existing.channel.subscriberCount };
}

// ── Liste des abonnements ─────────────────────────────────────────────────

/** Conditions communes : vidéos réellement visibles dans un feed. */
const publishedVideoWhere = {
  status: 'READY',
  visibility: 'PUBLIC',
  deletedAt: null,
  publishedAt: { not: null },
} satisfies Prisma.VideoWhereInput;

export async function listSubscriptions(userId: string): Promise<SubscriptionDTO[]> {
  const subs = await prisma.subscription.findMany({
    where: { subscriberId: userId },
    select: {
      level: true,
      createdAt: true,
      channelId: true,
      channel: { select: channelSummarySelect },
    },
  });
  if (subs.length === 0) return [];

  // `unseenCount` : vidéos publiées APRÈS l'abonnement et absentes de
  // l'historique de visionnage. Une seule requête agrégée pour tout le lot.
  const grouped = await prisma.video.groupBy({
    by: ['channelId'],
    where: {
      ...publishedVideoWhere,
      publishedAt: { lte: new Date() },
      watchHistory: { none: { userId } },
      OR: subs.map((s) => ({
        channelId: s.channelId,
        publishedAt: { gt: s.createdAt },
      })),
    },
    _count: { _all: true },
  });
  const unseen = new Map(grouped.map((g) => [g.channelId, g._count._all]));

  return subs
    .map((s) => ({
      channel: toChannelSummary(s.channel),
      level: s.level as NotificationLevel,
      createdAt: s.createdAt.toISOString(),
      unseenCount: unseen.get(s.channelId) ?? 0,
    }))
    .sort((a, b) => a.channel.name.localeCompare(b.channel.name, 'fr'));
}

// ── Feed des abonnements ──────────────────────────────────────────────────

interface FeedCursor {
  t: string;
  i: string;
}

export async function subscriptionsFeed(
  userId: string,
  params: { cursor?: string; limit: number },
): Promise<CursorPage<VideoCardDTO>> {
  const subs = await prisma.subscription.findMany({
    where: { subscriberId: userId },
    select: { channelId: true },
  });
  if (subs.length === 0) return { items: [], nextCursor: null, hasMore: false };

  const channelIds = subs.map((s) => s.channelId);
  const c = decodeCursor<FeedCursor>(params.cursor);

  const rows = await prisma.video.findMany({
    where: {
      ...publishedVideoWhere,
      channelId: { in: channelIds },
      publishedAt: { lte: new Date() },
      ...(c
        ? {
            OR: [
              { publishedAt: { lt: new Date(c.t) } },
              { publishedAt: new Date(c.t), id: { lt: c.i } },
            ],
          }
        : {}),
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: params.limit + 1,
    select: videoCardSelect,
  });

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;

  // Drapeau « Nouveau » : la vidéo n'est pas dans l'historique de visionnage.
  const watched = await prisma.watchHistory.findMany({
    where: { userId, videoId: { in: page.map((v) => v.id) } },
    select: { videoId: true },
  });
  const watchedSet = new Set(watched.map((w) => w.videoId));

  const last = page[page.length - 1];
  return {
    items: page.map((v) => toVideoCard(v, { isNew: !watchedSet.has(v.id) })),
    nextCursor:
      hasMore && last?.publishedAt
        ? encodeCursor({ t: last.publishedAt.toISOString(), i: last.id })
        : null,
    hasMore,
  };
}
