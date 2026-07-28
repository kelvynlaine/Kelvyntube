import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import '@fastify/multipart';
import {
  ROUTES,
  createChannelSchema,
  cursorPaginationSchema,
  updateChannelSchema,
} from '@kelvyntube/shared';
import { badRequest, unauthorized } from '../../lib/errors.js';
import {
  applyChannelAsset,
  checkHandleAvailability,
  createChannel,
  createCommunityPost,
  getChannelById,
  getChannelByHandle,
  getChannelHome,
  listChannelDirectory,
  listChannelPlaylists,
  listChannelVideos,
  listCommunityPosts,
  listOwnedChannels,
  updateChannel,
} from './channels.service.js';
import {
  MAX_ASSET_BYTES,
  isFileTooLargeError,
  payloadTooLarge,
  processChannelAsset,
  type ChannelAssetType,
} from './assets.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MODULE CHAÎNES — routes REST
 *  Les chemins proviennent tous de `ROUTES.channels` (contrat partagé).
 *  Les routes d'abonnement sont gérées par le module SOCIAL.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Schémas de validation locaux ──────────────────────────────────────────

const idParamsSchema = z.object({ id: z.string().min(1) });
const handleParamsSchema = z.object({ handle: z.string().min(1).max(64) });

const listVideosQuerySchema = cursorPaginationSchema.extend({
  sort: z.enum(['recent', 'popular', 'oldest']).default('recent'),
});

const checkHandleQuerySchema = z.object({ handle: z.string().min(1).max(64) });

const createPostSchema = z.object({
  text: z.string().min(1, 'Publication vide').max(5000),
  imageUrl: z.string().url().nullable().optional(),
});

const assetTypeSchema = z.enum(['avatar', 'banner']);

// ── Helpers ───────────────────────────────────────────────────────────────

/** Identifiant de l'utilisateur authentifié (les routes protégées passent par `app.authenticate`). */
function requireUserId(req: FastifyRequest): string {
  if (!req.user) throw unauthorized();
  return req.user.sub;
}

/** Identifiant de l'utilisateur si connecté, `null` pour un visiteur anonyme. */
function viewerId(req: FastifyRequest): string | null {
  return req.user?.sub ?? null;
}

/** Extrait la valeur texte d'un champ multipart (`fields` mélange fichiers et valeurs). */
function multipartFieldValue(
  fields: Record<string, unknown> | undefined,
  name: string,
): string | undefined {
  const raw = fields?.[name];
  const one = Array.isArray(raw) ? raw[0] : raw;
  if (one && typeof one === 'object' && 'value' in one) {
    const value = (one as { value: unknown }).value;
    if (typeof value === 'string') return value;
  }
  return undefined;
}

// ── Enregistrement ────────────────────────────────────────────────────────

export async function registerChannelRoutes(app: FastifyInstance) {
  // ───────────────────────────────────────────────────────────────────────
  //  Annuaire public — tri par nombre d'abonnés décroissant
  // ───────────────────────────────────────────────────────────────────────
  app.get(ROUTES.channels.list, { preHandler: [app.optionalAuth] }, async (req) => {
    const { cursor, limit } = cursorPaginationSchema.parse(req.query);
    return listChannelDirectory({ cursor, limit });
  });

  // ───────────────────────────────────────────────────────────────────────
  //  Création d'une chaîne (multi-chaînes façon YouTube Studio)
  // ───────────────────────────────────────────────────────────────────────
  app.post(
    ROUTES.channels.create,
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (req, reply) => {
      const userId = requireUserId(req);
      const input = createChannelSchema.parse(req.body);
      const channel = await createChannel(userId, input);
      return reply.status(201).send(channel);
    },
  );

  // ───────────────────────────────────────────────────────────────────────
  //  Chaînes de l'utilisateur connecté
  // ───────────────────────────────────────────────────────────────────────
  app.get(ROUTES.channels.mine, { preHandler: [app.authenticate] }, async (req) => {
    return listOwnedChannels(requireUserId(req));
  });

  // ───────────────────────────────────────────────────────────────────────
  //  Disponibilité d'un handle + suggestions
  // ───────────────────────────────────────────────────────────────────────
  app.get(
    ROUTES.channels.checkHandle,
    {
      preHandler: [app.optionalAuth],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { handle } = checkHandleQuerySchema.parse(req.query);
      return checkHandleAvailability(handle);
    },
  );

  // ───────────────────────────────────────────────────────────────────────
  //  Profil de chaîne (par handle puis par id)
  // ───────────────────────────────────────────────────────────────────────
  app.get(ROUTES.channels.byHandle(':handle'), { preHandler: [app.optionalAuth] }, async (req) => {
    const { handle } = handleParamsSchema.parse(req.params);
    return getChannelByHandle(handle, viewerId(req));
  });

  app.get(ROUTES.channels.byId(':id'), { preHandler: [app.optionalAuth] }, async (req) => {
    const { id } = idParamsSchema.parse(req.params);
    return getChannelById(id, viewerId(req));
  });

  // ───────────────────────────────────────────────────────────────────────
  //  Mise à jour (propriétaire uniquement)
  // ───────────────────────────────────────────────────────────────────────
  app.patch(ROUTES.channels.update(':id'), { preHandler: [app.authenticate] }, async (req) => {
    const userId = requireUserId(req);
    const { id } = idParamsSchema.parse(req.params);
    await app.assertChannelOwner(userId, id);
    const input = updateChannelSchema.parse(req.body);
    return updateChannel(id, input, userId);
  });

  // ───────────────────────────────────────────────────────────────────────
  //  Onglet Accueil
  // ───────────────────────────────────────────────────────────────────────
  app.get(
    `${ROUTES.channels.byId(':id')}/home`,
    { preHandler: [app.optionalAuth] },
    async (req) => {
      const { id } = idParamsSchema.parse(req.params);
      return getChannelHome(id, viewerId(req));
    },
  );

  // ───────────────────────────────────────────────────────────────────────
  //  Onglets Vidéos / Shorts
  // ───────────────────────────────────────────────────────────────────────
  app.get(ROUTES.channels.videos(':id'), { preHandler: [app.optionalAuth] }, async (req) => {
    const { id } = idParamsSchema.parse(req.params);
    const { cursor, limit, sort } = listVideosQuerySchema.parse(req.query);
    return listChannelVideos({ channelId: id, viewerId: viewerId(req), kind: 'LONG', sort, cursor, limit });
  });

  app.get(ROUTES.channels.shorts(':id'), { preHandler: [app.optionalAuth] }, async (req) => {
    const { id } = idParamsSchema.parse(req.params);
    const { cursor, limit, sort } = listVideosQuerySchema.parse(req.query);
    return listChannelVideos({ channelId: id, viewerId: viewerId(req), kind: 'SHORT', sort, cursor, limit });
  });

  // ───────────────────────────────────────────────────────────────────────
  //  Onglet Playlists
  // ───────────────────────────────────────────────────────────────────────
  app.get(ROUTES.channels.playlists(':id'), { preHandler: [app.optionalAuth] }, async (req) => {
    const { id } = idParamsSchema.parse(req.params);
    return listChannelPlaylists(id, viewerId(req));
  });

  // ───────────────────────────────────────────────────────────────────────
  //  Onglet Communauté
  // ───────────────────────────────────────────────────────────────────────
  app.get(ROUTES.channels.posts(':id'), { preHandler: [app.optionalAuth] }, async (req) => {
    const { id } = idParamsSchema.parse(req.params);
    const { cursor, limit } = cursorPaginationSchema.parse(req.query);
    return listCommunityPosts(id, { cursor, limit });
  });

  app.post(
    ROUTES.channels.posts(':id'),
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
    },
    async (req, reply) => {
      const userId = requireUserId(req);
      const { id } = idParamsSchema.parse(req.params);
      await app.assertChannelOwner(userId, id);
      const input = createPostSchema.parse(req.body);
      const post = await createCommunityPost(id, input);
      return reply.status(201).send(post);
    },
  );

  // ───────────────────────────────────────────────────────────────────────
  //  Upload d'un visuel (avatar / bannière) — multipart
  // ───────────────────────────────────────────────────────────────────────
  app.post(
    ROUTES.channels.uploadAsset(':id'),
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
    },
    async (req) => {
      const userId = requireUserId(req);
      const { id } = idParamsSchema.parse(req.params);
      await app.assertChannelOwner(userId, id);

      let filePart;
      try {
        filePart = await req.file({ limits: { fileSize: MAX_ASSET_BYTES, files: 1 } });
      } catch (err) {
        if (isFileTooLargeError(err)) throw payloadTooLarge('L\'image ne doit pas dépasser 15 Mo');
        throw badRequest('Requête multipart invalide');
      }
      if (!filePart) throw badRequest('Aucun fichier reçu');

      let buffer: Buffer;
      try {
        buffer = await filePart.toBuffer();
      } catch (err) {
        if (isFileTooLargeError(err)) throw payloadTooLarge('L\'image ne doit pas dépasser 15 Mo');
        throw err;
      }
      // Filet de sécurité si le flux a été tronqué sans lever d'erreur.
      if (filePart.file.truncated) throw payloadTooLarge('L\'image ne doit pas dépasser 15 Mo');

      // `type` accepté en query (?type=avatar) ou en champ du formulaire.
      const rawType =
        (req.query as { type?: string } | undefined)?.type ??
        multipartFieldValue(filePart.fields as Record<string, unknown> | undefined, 'type');
      const parsedType = assetTypeSchema.safeParse(rawType);
      if (!parsedType.success) {
        throw badRequest('Type de visuel invalide', { type: ['Valeurs acceptées : avatar, banner'] });
      }
      const type: ChannelAssetType = parsedType.data;

      const asset = await processChannelAsset(id, type, buffer, filePart.mimetype);
      await applyChannelAsset(id, type, asset.url);

      return { url: asset.url };
    },
  );
}
