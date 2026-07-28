import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ROUTES,
  analyticsRangeSchema,
  offsetPaginationSchema,
  visibilitySchema,
  type OffsetPage,
  type StudioOverviewDTO,
  type StudioVideoRowDTO,
  type TimeSeriesPointDTO,
  type VideoAnalyticsDTO,
  type VideoCardDTO,
} from '@kelvyntube/shared';
import { unauthorized } from '../../lib/errors.js';
import {
  getStudioOverview,
  getSubscriberAnalytics,
  getVideoAnalytics,
  listStudioVideos,
  type StudioSubscribersDTO,
} from './analytics.service.js';
import { getChannelRealtime, hydrateLiveVideos } from './realtime.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MODULE STUDIO — analytics du dashboard créateur (Kelvyn Studio)
 *
 *  Toutes les routes sont privées : `app.authenticate` (401 si anonyme) puis
 *  `app.assertChannelOwner` (403 si l'utilisateur ne possède pas la chaîne).
 *
 *  ⚠️ `GET /studio/:channelId/comments` (modération) appartient au module
 *  SOCIAL et n'est volontairement PAS déclarée ici.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Schémas de validation ──────────────────────────────────────────────────

const channelParamsSchema = z.object({ channelId: z.string().min(1) });

const videoParamsSchema = channelParamsSchema.extend({ videoId: z.string().min(1) });

const videoStatusSchema = z.enum(['UPLOADING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED']);

/** Filtres du tableau de gestion des vidéos du Studio. */
const studioVideosQuerySchema = offsetPaginationSchema.extend({
  status: videoStatusSchema.optional(),
  visibility: visibilitySchema.optional(),
  /** Recherche plein-texte simple sur le titre. */
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(['recent', 'views', 'likes', 'comments', 'ctr']).default('recent'),
});

/** Nombre de vidéos remontées dans « en direct maintenant ». */
const TOP_VIDEOS_NOW_LIMIT = 5;

// ── Helpers ────────────────────────────────────────────────────────────────

/** `app.authenticate` garantit la présence de l'utilisateur ; ceci le prouve à TS. */
function requireUserId(req: FastifyRequest): string {
  if (!req.user) throw unauthorized();
  return req.user.sub;
}

export interface StudioRealtimeDTO {
  liveViewers: number;
  last48hViews: number;
  perHour: TimeSeriesPointDTO[];
  topVideosNow: { video: VideoCardDTO; viewers: number }[];
}

// ── Enregistrement ─────────────────────────────────────────────────────────

export async function registerStudioRoutes(app: FastifyInstance) {
  /**
   * Vue d'ensemble : totaux, séries journalières continues, top vidéos et
   * bloc temps réel. C'est l'écran d'accueil du Studio.
   */
  app.get(
    ROUTES.studio.overview(':channelId'),
    { preHandler: app.authenticate },
    async (req): Promise<StudioOverviewDTO> => {
      const { channelId } = channelParamsSchema.parse(req.params);
      await app.assertChannelOwner(requireUserId(req), channelId);
      const range = analyticsRangeSchema.parse(req.query ?? {});
      return getStudioOverview(channelId, range);
    },
  );

  /**
   * Tableau de gestion des vidéos (onglet « Contenu ») : tous les statuts,
   * avec la progression et l'erreur de traitement pour le suivi temps réel.
   */
  app.get(
    ROUTES.studio.videos(':channelId'),
    { preHandler: app.authenticate },
    async (req): Promise<OffsetPage<StudioVideoRowDTO>> => {
      const { channelId } = channelParamsSchema.parse(req.params);
      await app.assertChannelOwner(requireUserId(req), channelId);
      const query = studioVideosQuerySchema.parse(req.query ?? {});
      return listStudioVideos(channelId, query);
    },
  );

  /**
   * Analytics d'une vidéo : totaux, courbe de vues, courbe de rétention
   * d'audience, sources de trafic, appareils, pays, tranches d'âge, temps réel.
   */
  app.get(
    ROUTES.studio.videoAnalytics(':channelId', ':videoId'),
    { preHandler: app.authenticate },
    async (req): Promise<VideoAnalyticsDTO> => {
      const { channelId, videoId } = videoParamsSchema.parse(req.params);
      await app.assertChannelOwner(requireUserId(req), channelId);
      const range = analyticsRangeSchema.parse(req.query ?? {});
      return getVideoAnalytics(channelId, videoId, range);
    },
  );

  /**
   * Analytics des abonnés : solde de la période et vidéos qui ont fait gagner
   * (ou perdre) le plus d'abonnés.
   */
  app.get(
    ROUTES.studio.subscribers(':channelId'),
    { preHandler: app.authenticate },
    async (req): Promise<StudioSubscribersDTO> => {
      const { channelId } = channelParamsSchema.parse(req.params);
      await app.assertChannelOwner(requireUserId(req), channelId);
      const range = analyticsRangeSchema.parse(req.query ?? {});
      return getSubscriberAnalytics(channelId, range);
    },
  );

  /**
   * Temps réel : spectateurs en direct (SCAN Redis), vues des 48 dernières
   * heures et vidéos les plus regardées à l'instant T.
   */
  app.get(
    ROUTES.studio.realtime(':channelId'),
    { preHandler: app.authenticate },
    async (req): Promise<StudioRealtimeDTO> => {
      const { channelId } = channelParamsSchema.parse(req.params);
      await app.assertChannelOwner(requireUserId(req), channelId);

      // Un seul SCAN Redis : `byVideo` est réutilisé pour le classement.
      const realtime = await getChannelRealtime(channelId);
      const topVideosNow = await hydrateLiveVideos(realtime.byVideo, TOP_VIDEOS_NOW_LIMIT);

      return {
        liveViewers: realtime.liveViewers,
        last48hViews: realtime.last48hViews,
        perHour: realtime.perHour,
        topVideosNow,
      };
    },
  );
}
