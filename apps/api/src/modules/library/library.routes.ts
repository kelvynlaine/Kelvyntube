import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@kelvyntube/db';
import {
  ROUTES,
  cursorPaginationSchema,
  createPlaylistSchema,
  updatePlaylistSchema,
  playlistItemSchema,
  reorderPlaylistSchema,
} from '@kelvyntube/shared';
import type {
  CursorPage,
  VideoCardDTO,
  PlaylistSummaryDTO,
  PlaylistDetailDTO,
} from '@kelvyntube/shared';
import { videoCardSelect, toVideoCard } from '../../lib/serializers.js';
import { encodeCursor } from '../../lib/http.js';
import { notFound, unauthorized } from '../../lib/errors.js';
import {
  addVideoToPlaylist,
  assertDeletable,
  assertPlaylistOwner,
  buildPage,
  ensureSystemPlaylists,
  getPlaylistForViewer,
  getPlaylistItems,
  pagePlaylistVideos,
  playlistSummarySelect,
  readOffset,
  removeVideoFromPlaylist,
  reorderPlaylist,
  toPlaylistSummary,
} from './playlists.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MODULE BIBLIOTHÈQUE
 *  /library/*   : historique, vidéos likées, à regarder plus tard (auth)
 *  /playlists/* : CRUD complet + gestion ordonnée des items
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Élément d'historique : une VideoCard enrichie de la progression. */
type HistoryItemDTO = VideoCardDTO & {
  watchedAt: string;
  positionSec: number;
  watchedPct: number;
};

const historySchema = cursorPaginationSchema.extend({
  /** Filtre plein texte sur le titre. */
  q: z.string().max(200).optional(),
});

const clearHistorySchema = z.object({
  /** Si fourni, ne supprime que cette entrée. */
  videoId: z.string().min(1).optional(),
});

function watchedPct(positionSec: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.min(100, Math.round((positionSec / durationSec) * 100));
}

/** Identifiant de l'utilisateur courant (les routes sont derrière `authenticate`). */
function requireUserId(req: { user: { sub: string } | null }): string {
  if (!req.user) throw unauthorized();
  return req.user.sub;
}

export async function registerLibraryRoutes(app: FastifyInstance) {
  // ═══════════════════════════════════════════════════════════════════════
  //  BIBLIOTHÈQUE
  // ═══════════════════════════════════════════════════════════════════════

  // ── GET /library/history ────────────────────────────────────────────────
  app.get(
    ROUTES.library.history,
    { preHandler: app.authenticate },
    async (req): Promise<CursorPage<HistoryItemDTO>> => {
      const userId = requireUserId(req);
      const { cursor, limit, q } = historySchema.parse(req.query);
      const offset = readOffset(cursor);
      const search = q?.trim();

      const rows = await prisma.watchHistory.findMany({
        where: {
          userId,
          video: {
            deletedAt: null,
            status: 'READY',
            ...(search ? { title: { contains: search, mode: 'insensitive' as const } } : {}),
          },
        },
        orderBy: { watchedAt: 'desc' },
        skip: offset,
        take: limit + 1,
        select: {
          positionSec: true,
          watchedAt: true,
          video: { select: videoCardSelect },
        },
      });

      return buildPage(rows, offset, limit, (row) => {
        const pct = watchedPct(row.positionSec, row.video.durationSec);
        return {
          ...toVideoCard(row.video, { watchedPct: pct }),
          watchedAt: row.watchedAt.toISOString(),
          positionSec: row.positionSec,
          watchedPct: pct,
        };
      });
    },
  );

  // ── DELETE /library/history[?videoId=] ──────────────────────────────────
  app.delete(
    ROUTES.library.clearHistory,
    { preHandler: app.authenticate },
    async (req): Promise<{ deleted: number }> => {
      const userId = requireUserId(req);
      const { videoId } = clearHistorySchema.parse(req.query);

      const { count } = await prisma.watchHistory.deleteMany({
        where: { userId, ...(videoId ? { videoId } : {}) },
      });
      return { deleted: count };
    },
  );

  // ── GET /library/liked ──────────────────────────────────────────────────
  app.get(
    ROUTES.library.liked,
    { preHandler: app.authenticate },
    async (req): Promise<CursorPage<VideoCardDTO>> => {
      const userId = requireUserId(req);
      const { cursor, limit } = cursorPaginationSchema.parse(req.query);
      const offset = readOffset(cursor);

      const likes = await prisma.like.findMany({
        where: { userId, targetType: 'VIDEO', value: 1 },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit + 1,
        select: { targetId: true },
      });

      const hasMore = likes.length > limit;
      const ids = (hasMore ? likes.slice(0, limit) : likes).map((l) => l.targetId);

      const videos = ids.length
        ? await prisma.video.findMany({
            where: { id: { in: ids }, deletedAt: null, status: 'READY' },
            select: videoCardSelect,
          })
        : [];
      const byId = new Map(videos.map((v) => [v.id, v]));

      return {
        items: ids
          .map((id) => byId.get(id))
          .filter((v): v is (typeof videos)[number] => v !== undefined)
          .map((v) => toVideoCard(v)),
        nextCursor: hasMore ? encodeCursor({ o: offset + limit }) : null,
        hasMore,
      };
    },
  );

  // ── GET /library/watch-later ────────────────────────────────────────────
  app.get(
    ROUTES.library.watchLater,
    { preHandler: app.authenticate },
    async (req): Promise<CursorPage<VideoCardDTO>> => {
      const userId = requireUserId(req);
      const { cursor, limit } = cursorPaginationSchema.parse(req.query);
      const offset = readOffset(cursor);

      const { watchLater } = await ensureSystemPlaylists(userId);
      return pagePlaylistVideos(watchLater.id, offset, limit);
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  PLAYLISTS
  // ═══════════════════════════════════════════════════════════════════════

  // ── GET /playlists ──────────────────────────────────────────────────────
  app.get(
    ROUTES.playlists.list,
    { preHandler: app.authenticate },
    async (req): Promise<PlaylistSummaryDTO[]> => {
      const userId = requireUserId(req);
      await ensureSystemPlaylists(userId);

      const rows = await prisma.playlist.findMany({
        where: { ownerId: userId },
        orderBy: { updatedAt: 'desc' },
        select: playlistSummarySelect,
      });

      // Les playlists système restent en tête de liste.
      const weight = (kind: PlaylistSummaryDTO['kind']) =>
        kind === 'WATCH_LATER' ? 0 : kind === 'LIKED' ? 1 : 2;

      return rows
        .map(toPlaylistSummary)
        .sort((a, b) => weight(a.kind) - weight(b.kind));
    },
  );

  // ── POST /playlists ─────────────────────────────────────────────────────
  app.post(
    ROUTES.playlists.create,
    { preHandler: app.authenticate },
    async (req, reply): Promise<PlaylistSummaryDTO> => {
      const userId = requireUserId(req);
      const body = createPlaylistSchema.parse(req.body);

      // Vérifié AVANT création pour ne pas laisser de playlist orpheline.
      if (body.videoId) {
        const video = await prisma.video.findFirst({
          where: { id: body.videoId, deletedAt: null },
          select: { id: true },
        });
        if (!video) throw notFound('Vidéo introuvable');
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { activeChannelId: true },
      });

      const created = await prisma.playlist.create({
        data: {
          ownerId: userId,
          channelId: user?.activeChannelId ?? null,
          title: body.title,
          description: body.description ?? null,
          visibility: body.visibility,
          kind: 'USER',
        },
        select: { id: true },
      });

      if (body.videoId) await addVideoToPlaylist(created.id, body.videoId);

      const playlist = await prisma.playlist.findUniqueOrThrow({
        where: { id: created.id },
        select: playlistSummarySelect,
      });

      reply.status(201);
      return toPlaylistSummary(playlist);
    },
  );

  // ── GET /playlists/:id ──────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    ROUTES.playlists.byId(':id'),
    { preHandler: app.optionalAuth },
    async (req): Promise<PlaylistDetailDTO> => {
      const viewerId = req.user?.sub ?? null;
      const { playlist, isOwner } = await getPlaylistForViewer(req.params.id, viewerId);
      const items = await getPlaylistItems(playlist.id, isOwner);
      return { ...toPlaylistSummary(playlist), items };
    },
  );

  // ── PATCH /playlists/:id ────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    ROUTES.playlists.update(':id'),
    { preHandler: app.authenticate },
    async (req): Promise<PlaylistSummaryDTO> => {
      const userId = requireUserId(req);
      await assertPlaylistOwner(req.params.id, userId);
      const body = updatePlaylistSchema.parse(req.body);

      const updated = await prisma.playlist.update({
        where: { id: req.params.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
        },
        select: playlistSummarySelect,
      });
      return toPlaylistSummary(updated);
    },
  );

  // ── DELETE /playlists/:id ───────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    ROUTES.playlists.delete(':id'),
    { preHandler: app.authenticate },
    async (req): Promise<{ deleted: true }> => {
      const userId = requireUserId(req);
      const playlist = await assertPlaylistOwner(req.params.id, userId);
      // Une playlist système ne se supprime pas -> 400.
      assertDeletable(playlist.kind);

      await prisma.playlist.delete({ where: { id: playlist.id } });
      return { deleted: true };
    },
  );

  // ── POST /playlists/:id/items ───────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    ROUTES.playlists.addItem(':id'),
    { preHandler: app.authenticate },
    async (req): Promise<PlaylistDetailDTO> => {
      const userId = requireUserId(req);
      await assertPlaylistOwner(req.params.id, userId);
      const { videoId } = playlistItemSchema.parse(req.body);

      await addVideoToPlaylist(req.params.id, videoId);
      return loadDetail(req.params.id);
    },
  );

  // ── DELETE /playlists/:id/items/:videoId ────────────────────────────────
  app.delete<{ Params: { id: string; videoId: string } }>(
    ROUTES.playlists.removeItem(':id', ':videoId'),
    { preHandler: app.authenticate },
    async (req): Promise<PlaylistDetailDTO> => {
      const userId = requireUserId(req);
      await assertPlaylistOwner(req.params.id, userId);

      await removeVideoFromPlaylist(req.params.id, req.params.videoId);
      return loadDetail(req.params.id);
    },
  );

  // ── POST /playlists/:id/reorder ─────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    ROUTES.playlists.reorder(':id'),
    { preHandler: app.authenticate },
    async (req): Promise<PlaylistDetailDTO> => {
      const userId = requireUserId(req);
      await assertPlaylistOwner(req.params.id, userId);
      const { videoId, position } = reorderPlaylistSchema.parse(req.body);

      await reorderPlaylist(req.params.id, videoId, position);
      return loadDetail(req.params.id);
    },
  );
}

/** Recharge la playlist complète après une mutation d'items (vue propriétaire). */
async function loadDetail(playlistId: string): Promise<PlaylistDetailDTO> {
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: playlistSummarySelect,
  });
  if (!playlist) throw notFound('Playlist introuvable');

  const items = await getPlaylistItems(playlistId, true);
  return { ...toPlaylistSummary(playlist), items };
}
