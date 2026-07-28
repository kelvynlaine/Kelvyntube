import type { FastifyInstance } from 'fastify';
import { ROUTES, homeFeedSchema, shortsFeedSchema } from '@kelvyntube/shared';
import {
  getCategories,
  getHomeFeed,
  getShortsFeed,
  getTrendingFeed,
} from './recommendation.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROUTES DU FEED
 *  Toutes en `optionalAuth` : un visiteur anonyme reçoit un feed dégradé
 *  (tendances + nouveautés) mais jamais une erreur.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function registerFeedRoutes(app: FastifyInstance) {
  // ── Feed d'accueil algorithmique ───────────────────────────────────────
  app.get(ROUTES.feed.home, { preHandler: app.optionalAuth }, async (req, reply) => {
    const query = homeFeedSchema.parse(req.query);
    const feed = await getHomeFeed({
      userId: req.user?.sub ?? null,
      categorySlug: query.category,
      cursor: query.cursor,
      limit: query.limit,
    });
    return reply.send(feed);
  });

  // ── Tendances (classement global par hotScore) ─────────────────────────
  app.get(ROUTES.feed.trending, { preHandler: app.optionalAuth }, async (req, reply) => {
    const query = homeFeedSchema.parse(req.query);
    const page = await getTrendingFeed({
      userId: req.user?.sub ?? null,
      categorySlug: query.category,
      cursor: query.cursor,
      limit: query.limit,
    });
    return reply.send(page);
  });

  // ── Flux vertical de Shorts ────────────────────────────────────────────
  app.get(ROUTES.feed.shorts, { preHandler: app.optionalAuth }, async (req, reply) => {
    const query = shortsFeedSchema.parse(req.query);
    const page = await getShortsFeed({
      userId: req.user?.sub ?? null,
      cursor: query.cursor,
      limit: query.limit,
      seedVideoId: query.seedVideoId,
    });
    return reply.send(page);
  });

  // ── Catégories (chips de navigation) ───────────────────────────────────
  app.get(ROUTES.feed.categories, async (_req, reply) => {
    const categories = await getCategories();
    return reply.send(categories);
  });
}
