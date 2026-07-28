import type { FastifyInstance } from 'fastify';
import {
  ROUTES,
  bulkUpdateVideosSchema,
  cursorPaginationSchema,
  updateVideoSchema,
} from '@kelvyntube/shared';
import { badRequest, unauthorized } from '../../lib/errors.js';
import { getRelatedVideos } from '../feed/recommendation.service.js';
import {
  bulkUpdateVideos,
  deleteVideo,
  getVideoDetail,
  setCustomThumbnail,
  updateVideo,
} from './videos.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROUTES VIDÉOS
 *  NB : `POST /videos/:id/like` appartient au module SOCIAL.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Taille maximale d'une miniature personnalisée (YouTube : 2 Mo). */
const MAX_THUMBNAIL_BYTES = 4 * 1024 * 1024;

export async function registerVideoRoutes(app: FastifyInstance) {
  // ── Édition en masse (Studio) — déclarée avant les routes paramétrées ──
  app.post(ROUTES.videos.bulkUpdate, { preHandler: app.authenticate }, async (req, reply) => {
    if (!req.user) throw unauthorized();
    const input = bulkUpdateVideosSchema.parse(req.body);
    const result = await bulkUpdateVideos(req.user.sub, input);
    return reply.send(result);
  });

  // ── Détail d'une vidéo (page de visionnage) ────────────────────────────
  app.get(ROUTES.videos.byId(':id'), { preHandler: app.optionalAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const video = await getVideoDetail(id, req.user?.sub ?? null);
    return reply.send(video);
  });

  // ── Vidéos suggérées (sidebar) ─────────────────────────────────────────
  app.get(ROUTES.videos.related(':id'), { preHandler: app.optionalAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { cursor, limit } = cursorPaginationSchema.parse(req.query ?? {});
    const page = await getRelatedVideos({
      videoId: id,
      userId: req.user?.sub ?? null,
      cursor,
      limit,
    });
    return reply.send(page);
  });

  // ── Mise à jour (propriétaire) ─────────────────────────────────────────
  app.patch(ROUTES.videos.update(':id'), { preHandler: app.authenticate }, async (req, reply) => {
    if (!req.user) throw unauthorized();
    const { id } = req.params as { id: string };
    const input = updateVideoSchema.parse(req.body);
    const video = await updateVideo(id, req.user.sub, input);
    return reply.send(video);
  });

  // ── Suppression logique (propriétaire) ─────────────────────────────────
  app.delete(ROUTES.videos.delete(':id'), { preHandler: app.authenticate }, async (req, reply) => {
    if (!req.user) throw unauthorized();
    const { id } = req.params as { id: string };
    await deleteVideo(id, req.user.sub);
    return reply.status(204).send();
  });

  // ── Miniature personnalisée (multipart) ────────────────────────────────
  app.put(
    ROUTES.videos.thumbnail(':id'),
    { preHandler: app.authenticate },
    async (req, reply) => {
      if (!req.user) throw unauthorized();
      const { id } = req.params as { id: string };

      const file = await req.file();
      if (!file) throw badRequest('Aucun fichier reçu');
      if (!/^image\//.test(file.mimetype)) throw badRequest('Une image est attendue');

      const buffer = await file.toBuffer();
      if (buffer.byteLength > MAX_THUMBNAIL_BYTES) {
        throw badRequest('Miniature trop lourde (4 Mo maximum)');
      }

      const result = await setCustomThumbnail(id, req.user.sub, buffer);
      return reply.send(result);
    },
  );
}
