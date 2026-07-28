import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ROUTES,
  commentReactionSchema,
  createCommentSchema,
  cursorPaginationSchema,
  likeSchema,
  listCommentsSchema,
  offsetPaginationSchema,
  subscribeSchema,
  updateCommentSchema,
} from '@kelvyntube/shared';
import { unauthorized } from '../../lib/errors.js';
import { setCommentLike, setVideoLike } from './likes.service.js';
import {
  createComment,
  deleteComment,
  heartComment,
  listReplies,
  listStudioComments,
  listVideoComments,
  pinComment,
  toggleReaction,
  updateComment,
  type Viewer,
} from './comments.service.js';
import {
  listSubscriptions,
  subscribe,
  subscriptionsFeed,
  unsubscribe,
  updateLevel,
} from './subscriptions.service.js';
import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from './notifications.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MODULE SOCIAL — likes, commentaires, abonnements, notifications.
 *  Les chemins proviennent de `ROUTES` (contrat partagé) : on y injecte
 *  `:id` / `:channelId` pour obtenir le motif Fastify correspondant.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const idParams = z.object({ id: z.string().min(1) });
const channelIdParams = z.object({ channelId: z.string().min(1) });

const studioCommentsQuery = offsetPaginationSchema.extend({
  filter: z.enum(['all', 'unanswered', 'held']).default('all'),
  q: z.string().trim().min(1).max(200).optional(),
});

/** Contexte de lecture : identité + rôle du spectateur (peut être anonyme). */
function viewerOf(req: FastifyRequest): Viewer {
  return { userId: req.user?.sub ?? null, role: req.user?.role ?? null };
}

/** Identifiant de l'utilisateur connecté (les routes protégées l'exigent). */
function requireUserId(req: FastifyRequest): string {
  if (!req.user) throw unauthorized();
  return req.user.sub;
}

/** Limite anti-flood appliquée aux écritures sociales. */
const writeLimit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

export async function registerSocialRoutes(app: FastifyInstance) {
  // ═══════════════════════════════════════════════════════════════════════
  //  A. LIKES (polymorphes)
  // ═══════════════════════════════════════════════════════════════════════

  app.post(
    ROUTES.videos.like(':id'),
    { preHandler: app.authenticate, ...writeLimit },
    async (req) => {
      const { id } = idParams.parse(req.params);
      const { value } = likeSchema.parse(req.body);
      return setVideoLike(requireUserId(req), id, value);
    },
  );

  app.post(
    ROUTES.comments.like(':id'),
    { preHandler: app.authenticate, ...writeLimit },
    async (req) => {
      const { id } = idParams.parse(req.params);
      const { value } = likeSchema.parse(req.body);
      return setCommentLike(requireUserId(req), id, value);
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  B. COMMENTAIRES
  // ═══════════════════════════════════════════════════════════════════════

  app.get(ROUTES.comments.list(':id'), { preHandler: app.optionalAuth }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { cursor, limit, sort } = listCommentsSchema.parse(req.query);
    return listVideoComments(id, { cursor, limit, sort }, viewerOf(req));
  });

  app.post(
    ROUTES.comments.create(':id'),
    { preHandler: app.authenticate, config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const body = createCommentSchema.parse(req.body);
      const dto = await createComment(id, requireUserId(req), body, viewerOf(req));
      return reply.status(201).send(dto);
    },
  );

  app.get(ROUTES.comments.replies(':id'), { preHandler: app.optionalAuth }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { cursor, limit } = cursorPaginationSchema.parse(req.query);
    return listReplies(id, { cursor, limit }, viewerOf(req));
  });

  app.patch(
    ROUTES.comments.update(':id'),
    { preHandler: app.authenticate, ...writeLimit },
    async (req) => {
      const { id } = idParams.parse(req.params);
      const { text } = updateCommentSchema.parse(req.body);
      return updateComment(id, requireUserId(req), text, viewerOf(req));
    },
  );

  app.delete(
    ROUTES.comments.delete(':id'),
    { preHandler: app.authenticate, ...writeLimit },
    async (req) => {
      const { id } = idParams.parse(req.params);
      requireUserId(req);
      return deleteComment(id, viewerOf(req));
    },
  );

  app.post(
    ROUTES.comments.pin(':id'),
    { preHandler: app.authenticate, ...writeLimit },
    async (req) => {
      const { id } = idParams.parse(req.params);
      return pinComment(id, requireUserId(req), viewerOf(req));
    },
  );

  app.post(
    ROUTES.comments.heart(':id'),
    { preHandler: app.authenticate, ...writeLimit },
    async (req) => {
      const { id } = idParams.parse(req.params);
      return heartComment(id, requireUserId(req), viewerOf(req));
    },
  );

  app.post(
    ROUTES.comments.react(':id'),
    { preHandler: app.authenticate, ...writeLimit },
    async (req) => {
      const { id } = idParams.parse(req.params);
      const { emoji } = commentReactionSchema.parse(req.body);
      return toggleReaction(id, requireUserId(req), emoji, viewerOf(req));
    },
  );

  // Modération centralisée (Studio) — réservée au propriétaire de la chaîne.
  app.get(
    ROUTES.comments.moderation(':channelId'),
    { preHandler: app.authenticate },
    async (req) => {
      const { channelId } = channelIdParams.parse(req.params);
      const userId = requireUserId(req);
      await app.assertChannelOwner(userId, channelId);
      const { page, pageSize, filter, q } = studioCommentsQuery.parse(req.query);
      return listStudioComments(channelId, { page, pageSize, filter, q }, viewerOf(req));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  C. ABONNEMENTS
  // ═══════════════════════════════════════════════════════════════════════

  app.post(
    ROUTES.channels.subscribe(':id'),
    { preHandler: app.authenticate, ...writeLimit },
    async (req) => {
      const { id } = idParams.parse(req.params);
      const { level } = subscribeSchema.parse(req.body ?? {});
      return subscribe(requireUserId(req), id, level);
    },
  );

  app.delete(
    ROUTES.channels.unsubscribe(':id'),
    { preHandler: app.authenticate, ...writeLimit },
    async (req) => {
      const { id } = idParams.parse(req.params);
      return unsubscribe(requireUserId(req), id);
    },
  );

  app.patch(
    ROUTES.subscriptions.updateLevel(':channelId'),
    { preHandler: app.authenticate, ...writeLimit },
    async (req) => {
      const { channelId } = channelIdParams.parse(req.params);
      const { level } = subscribeSchema.parse(req.body ?? {});
      return updateLevel(requireUserId(req), channelId, level);
    },
  );

  app.get(ROUTES.subscriptions.list, { preHandler: app.authenticate }, async (req) =>
    listSubscriptions(requireUserId(req)),
  );

  app.get(ROUTES.subscriptions.feed, { preHandler: app.authenticate }, async (req) => {
    const { cursor, limit } = cursorPaginationSchema.parse(req.query);
    return subscriptionsFeed(requireUserId(req), { cursor, limit });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  D. NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════

  app.get(ROUTES.notifications.list, { preHandler: app.authenticate }, async (req) => {
    const { cursor, limit } = cursorPaginationSchema.parse(req.query);
    return listNotifications(requireUserId(req), { cursor, limit });
  });

  app.get(ROUTES.notifications.unreadCount, { preHandler: app.authenticate }, async (req) => ({
    count: await unreadCount(requireUserId(req)),
  }));

  app.post(
    ROUTES.notifications.markRead(':id'),
    { preHandler: app.authenticate },
    async (req) => {
      const { id } = idParams.parse(req.params);
      return markRead(requireUserId(req), id);
    },
  );

  app.post(ROUTES.notifications.markAllRead, { preHandler: app.authenticate }, async (req) => ({
    updated: await markAllRead(requireUserId(req)),
  }));
}
