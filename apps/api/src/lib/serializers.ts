import type {
  ChannelSummaryDTO,
  ChannelDTO,
  VideoCardDTO,
  CategoryDTO,
  TagDTO,
  NotificationLevel,
} from '@kelvyntube/shared';

/**
 * Mappers Prisma -> DTO.
 * TOUS les modules doivent passer par ces fonctions pour garantir que le
 * frontend reçoit exactement les formes déclarées dans `@kelvyntube/shared`.
 */

const num = (v: bigint | number | null | undefined): number =>
  typeof v === 'bigint' ? Number(v) : (v ?? 0);

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

// ── Sélections Prisma réutilisables ───────────────────────────────────────

export const channelSummarySelect = {
  id: true,
  handle: true,
  name: true,
  avatarUrl: true,
  verified: true,
  subscriberCount: true,
} as const;

export const videoCardSelect = {
  id: true,
  title: true,
  thumbnailUrl: true,
  previewClipUrl: true,
  durationSec: true,
  viewCount: true,
  publishedAt: true,
  kind: true,
  channel: { select: channelSummarySelect },
} as const;

// ── Mappers ───────────────────────────────────────────────────────────────

export function toChannelSummary(c: {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  subscriberCount: number;
}): ChannelSummaryDTO {
  return {
    id: c.id,
    handle: c.handle,
    name: c.name,
    avatarUrl: c.avatarUrl,
    verified: c.verified,
    subscriberCount: c.subscriberCount,
  };
}

export function toChannelDTO(
  c: Parameters<typeof toChannelSummary>[0] & {
    description: string | null;
    bannerUrl: string | null;
    location: string | null;
    links: unknown;
    videoCount: number;
    totalViews: bigint | number;
    createdAt: Date;
    trailerVideoId: string | null;
    ownerId: string;
  },
  viewer: { userId?: string | null; isSubscribed: boolean; level: NotificationLevel | null },
): ChannelDTO {
  return {
    ...toChannelSummary(c),
    description: c.description,
    bannerUrl: c.bannerUrl,
    location: c.location,
    links: Array.isArray(c.links) ? (c.links as ChannelDTO['links']) : [],
    videoCount: c.videoCount,
    totalViews: num(c.totalViews),
    createdAt: c.createdAt.toISOString(),
    trailerVideoId: c.trailerVideoId,
    viewer: {
      isOwner: Boolean(viewer.userId && viewer.userId === c.ownerId),
      isSubscribed: viewer.isSubscribed,
      notificationLevel: viewer.level,
    },
  };
}

export function toVideoCard(
  v: {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    previewClipUrl: string | null;
    durationSec: number;
    viewCount: bigint | number;
    publishedAt: Date | null;
    kind: 'LONG' | 'SHORT';
    channel: Parameters<typeof toChannelSummary>[0];
  },
  extra?: { isNew?: boolean; watchedPct?: number },
): VideoCardDTO {
  return {
    id: v.id,
    title: v.title,
    thumbnailUrl: v.thumbnailUrl,
    previewClipUrl: v.previewClipUrl,
    durationSec: v.durationSec,
    viewCount: num(v.viewCount),
    publishedAt: iso(v.publishedAt),
    kind: v.kind,
    channel: toChannelSummary(v.channel),
    ...(extra?.isNew !== undefined ? { isNew: extra.isNew } : {}),
    ...(extra?.watchedPct !== undefined ? { watchedPct: extra.watchedPct } : {}),
  };
}

export function toCategoryDTO(c: {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}): CategoryDTO {
  return { id: c.id, slug: c.slug, name: c.name, icon: c.icon };
}

export function toTagDTO(t: {
  id: string;
  name: string;
  usageCount: number;
  trendingScore: number;
}): TagDTO {
  return {
    id: t.id,
    name: t.name,
    usageCount: t.usageCount,
    trending: t.trendingScore > 0.5,
  };
}

export { num as toNumber, iso as toIso };
