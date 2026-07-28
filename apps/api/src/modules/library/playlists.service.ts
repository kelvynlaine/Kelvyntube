import { Prisma, prisma } from '@kelvyntube/db';
import type {
  PlaylistSummaryDTO,
  PlaylistDetailDTO,
  VideoCardDTO,
  CursorPage,
} from '@kelvyntube/shared';
import {
  channelSummarySelect,
  videoCardSelect,
  toChannelSummary,
  toVideoCard,
} from '../../lib/serializers.js';
import { encodeCursor, decodeCursor } from '../../lib/http.js';
import { badRequest, notFound } from '../../lib/errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVICE PLAYLISTS
 *  Toute mutation d'items passe par ici : les positions restent contiguës
 *  (0..n-1) et `itemCount` / `thumbnailUrl` sont recalculés dans la même
 *  transaction que la mutation.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Nombre maximum d'items renvoyés dans un `PlaylistDetailDTO`. */
export const PLAYLIST_MAX_ITEMS = 200;

// ── Sélections & sérialiseurs ─────────────────────────────────────────────

export const playlistSummarySelect = {
  id: true,
  ownerId: true,
  title: true,
  description: true,
  visibility: true,
  kind: true,
  thumbnailUrl: true,
  itemCount: true,
  updatedAt: true,
  channel: { select: channelSummarySelect },
} as const;

type PlaylistSummaryRow = Prisma.PlaylistGetPayload<{ select: typeof playlistSummarySelect }>;

export function toPlaylistSummary(p: PlaylistSummaryRow): PlaylistSummaryDTO {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    visibility: p.visibility,
    kind: p.kind,
    thumbnailUrl: p.thumbnailUrl,
    itemCount: p.itemCount,
    updatedAt: p.updatedAt.toISOString(),
    owner: p.channel ? toChannelSummary(p.channel) : null,
  };
}

// ── Pagination par curseur (offset opaque) ────────────────────────────────

export function readOffset(cursor?: string): number {
  const decoded = decodeCursor<{ o?: number }>(cursor);
  const offset = decoded?.o;
  return typeof offset === 'number' && Number.isFinite(offset) && offset > 0
    ? Math.floor(offset)
    : 0;
}

/**
 * Construit une page à partir d'une liste sur-échantillonnée (`limit + 1`).
 * `mapper` n'est appliqué qu'aux éléments réellement renvoyés.
 */
export function buildPage<TRow, TItem>(
  rows: TRow[],
  offset: number,
  limit: number,
  mapper: (row: TRow) => TItem,
): CursorPage<TItem> {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map(mapper),
    nextCursor: hasMore ? encodeCursor({ o: offset + limit }) : null,
    hasMore,
  };
}

// ── Playlists système ─────────────────────────────────────────────────────

/**
 * Crée si nécessaire les playlists système de l'utilisateur
 * (« À regarder plus tard » et « Vidéos likées ») et les renvoie.
 */
export async function ensureSystemPlaylists(userId: string): Promise<{
  watchLater: { id: string };
  liked: { id: string };
}> {
  const existing = await prisma.playlist.findMany({
    where: { ownerId: userId, kind: { in: ['WATCH_LATER', 'LIKED'] } },
    select: { id: true, kind: true },
    orderBy: { createdAt: 'asc' },
  });

  let watchLater = existing.find((p) => p.kind === 'WATCH_LATER');
  let liked = existing.find((p) => p.kind === 'LIKED');

  if (!watchLater) {
    watchLater = await prisma.playlist.create({
      data: {
        ownerId: userId,
        title: 'À regarder plus tard',
        kind: 'WATCH_LATER',
        visibility: 'PRIVATE',
      },
      select: { id: true, kind: true },
    });
  }

  if (!liked) {
    liked = await prisma.playlist.create({
      data: {
        ownerId: userId,
        title: 'Vidéos likées',
        kind: 'LIKED',
        visibility: 'PRIVATE',
      },
      select: { id: true, kind: true },
    });
  }

  return { watchLater: { id: watchLater.id }, liked: { id: liked.id } };
}

/** Ajoute une vidéo à la playlist « À regarder plus tard » (idempotent). */
export async function addToWatchLater(userId: string, videoId: string): Promise<void> {
  const { watchLater } = await ensureSystemPlaylists(userId);
  await addVideoToPlaylist(watchLater.id, videoId);
}

// ── Mutations d'items ─────────────────────────────────────────────────────

/**
 * Recalcule `itemCount` + `thumbnailUrl` (miniature du 1er élément).
 * À appeler dans la transaction qui vient de modifier les items.
 */
async function refreshPlaylistMeta(tx: Prisma.TransactionClient, playlistId: string) {
  const [count, first] = await Promise.all([
    tx.playlistItem.count({ where: { playlistId } }),
    tx.playlistItem.findFirst({
      where: { playlistId },
      orderBy: { position: 'asc' },
      select: { video: { select: { thumbnailUrl: true } } },
    }),
  ]);

  await tx.playlist.update({
    where: { id: playlistId },
    data: { itemCount: count, thumbnailUrl: first?.video.thumbnailUrl ?? null },
  });
}

/** Renumérote les positions de 0 à n-1 sans laisser de trou. */
async function compactPositions(tx: Prisma.TransactionClient, playlistId: string) {
  const items = await tx.playlistItem.findMany({
    where: { playlistId },
    orderBy: [{ position: 'asc' }, { addedAt: 'asc' }],
    select: { id: true, position: true },
  });

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.position !== i) {
      await tx.playlistItem.update({ where: { id: item.id }, data: { position: i } });
    }
  }
}

/** Ajoute une vidéo en fin de playlist. Idempotent : rejouer ne duplique rien. */
export async function addVideoToPlaylist(playlistId: string, videoId: string): Promise<void> {
  const video = await prisma.video.findFirst({
    where: { id: videoId, deletedAt: null },
    select: { id: true },
  });
  if (!video) throw notFound('Vidéo introuvable');

  await prisma.$transaction(async (tx) => {
    const existing = await tx.playlistItem.findUnique({
      where: { playlistId_videoId: { playlistId, videoId } },
      select: { id: true },
    });

    if (!existing) {
      const last = await tx.playlistItem.findFirst({
        where: { playlistId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      await tx.playlistItem.create({
        data: { playlistId, videoId, position: (last?.position ?? -1) + 1 },
      });
    }

    await refreshPlaylistMeta(tx, playlistId);
  });
}

/** Retire une vidéo puis recompacte les positions. */
export async function removeVideoFromPlaylist(
  playlistId: string,
  videoId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.playlistItem.findUnique({
      where: { playlistId_videoId: { playlistId, videoId } },
      select: { id: true },
    });
    if (!existing) throw notFound('Vidéo absente de cette playlist');

    await tx.playlistItem.delete({ where: { id: existing.id } });
    await compactPositions(tx, playlistId);
    await refreshPlaylistMeta(tx, playlistId);
  });
}

/** Déplace une vidéo à `position` et renumérote toute la playlist. */
export async function reorderPlaylist(
  playlistId: string,
  videoId: string,
  position: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const items = await tx.playlistItem.findMany({
      where: { playlistId },
      orderBy: [{ position: 'asc' }, { addedAt: 'asc' }],
      select: { id: true, videoId: true },
    });

    const from = items.findIndex((i) => i.videoId === videoId);
    if (from === -1) throw notFound('Vidéo absente de cette playlist');

    const target = Math.min(Math.max(position, 0), items.length - 1);
    const [moved] = items.splice(from, 1);
    items.splice(target, 0, moved);

    for (let i = 0; i < items.length; i += 1) {
      await tx.playlistItem.update({ where: { id: items[i].id }, data: { position: i } });
    }

    await refreshPlaylistMeta(tx, playlistId);
  });
}

// ── Lecture ───────────────────────────────────────────────────────────────

/**
 * Charge une playlist visible par `viewerId`.
 * Une playlist privée n'est visible que de son propriétaire (404 sinon, pour
 * ne pas révéler son existence).
 */
export async function getPlaylistForViewer(playlistId: string, viewerId: string | null) {
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: playlistSummarySelect,
  });
  if (!playlist) throw notFound('Playlist introuvable');

  const isOwner = Boolean(viewerId && viewerId === playlist.ownerId);
  if (!isOwner && playlist.visibility === 'PRIVATE') throw notFound('Playlist introuvable');

  return { playlist, isOwner };
}

/** Items d'une playlist, ordonnés, filtrés selon les droits du spectateur. */
export async function getPlaylistItems(
  playlistId: string,
  isOwner: boolean,
  take = PLAYLIST_MAX_ITEMS,
): Promise<PlaylistDetailDTO['items']> {
  const rows = await prisma.playlistItem.findMany({
    where: {
      playlistId,
      video: isOwner
        ? { deletedAt: null }
        : {
            deletedAt: null,
            status: 'READY',
            visibility: { in: ['PUBLIC', 'UNLISTED'] },
          },
    },
    orderBy: { position: 'asc' },
    take,
    select: {
      position: true,
      addedAt: true,
      video: { select: videoCardSelect },
    },
  });

  return rows.map((r) => ({
    ...toVideoCard(r.video),
    position: r.position,
    addedAt: r.addedAt.toISOString(),
  }));
}

/** Vérifie que l'utilisateur est bien propriétaire (sinon 404 / 400). */
export async function assertPlaylistOwner(playlistId: string, userId: string) {
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { id: true, ownerId: true, kind: true },
  });
  if (!playlist || playlist.ownerId !== userId) throw notFound('Playlist introuvable');
  return playlist;
}

/** Refuse la suppression d'une playlist système. */
export function assertDeletable(kind: PlaylistSummaryDTO['kind']) {
  if (kind !== 'USER') {
    throw badRequest('Une playlist système ne peut pas être supprimée');
  }
}

/** Page de VideoCard à partir des items d'une playlist (bibliothèque). */
export async function pagePlaylistVideos(
  playlistId: string,
  offset: number,
  limit: number,
): Promise<CursorPage<VideoCardDTO>> {
  const rows = await prisma.playlistItem.findMany({
    where: {
      playlistId,
      video: { deletedAt: null, status: 'READY' },
    },
    orderBy: { position: 'asc' },
    skip: offset,
    take: limit + 1,
    select: { video: { select: videoCardSelect } },
  });

  return buildPage(rows, offset, limit, (r) => toVideoCard(r.video));
}
