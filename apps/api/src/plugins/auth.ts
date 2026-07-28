import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { verifyAccessToken, type AccessTokenPayload } from '../lib/jwt.js';
import { unauthorized, forbidden } from '../lib/errors.js';
import { prisma } from '@kelvyntube/db';

declare module 'fastify' {
  interface FastifyRequest {
    /** Utilisateur authentifié (null si visiteur anonyme). */
    user: AccessTokenPayload | null;
  }
  interface FastifyInstance {
    /** preHandler : exige un utilisateur connecté, sinon 401. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler : décode le token s'il existe, ne bloque jamais. */
    optionalAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Vérifie que l'utilisateur possède bien la chaîne ; renvoie 403 sinon. */
    assertChannelOwner: (userId: string, channelId: string) => Promise<void>;
  }
}

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookieToken = (req.cookies as Record<string, string | undefined>)?.kt_access;
  return cookieToken ?? null;
}

/**
 * Plugin d'authentification transverse.
 * Le module `auth` gère l'émission des tokens ; ce plugin gère leur consommation
 * par TOUS les autres modules.
 */
export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req) => {
    req.user = null;
    const token = extractToken(req);
    if (!token) return;
    try {
      req.user = verifyAccessToken(token);
    } catch {
      req.user = null;
    }
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    if (!req.user) throw unauthorized();
  });

  app.decorate('optionalAuth', async () => {
    /* le hook onRequest a déjà fait le travail */
  });

  app.decorate('assertChannelOwner', async (userId: string, channelId: string) => {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { ownerId: true },
    });
    if (!channel) throw forbidden('Chaîne introuvable');
    if (channel.ownerId !== userId) throw forbidden('Vous ne possédez pas cette chaîne');
  });
});
