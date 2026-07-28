import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ROUTES,
  clickSchema,
  impressionBatchSchema,
  watchHeartbeatSchema,
} from '@kelvyntube/shared';
import { env } from '../../config/env.js';
import { SESSION_COOKIE, hashIp } from '../../lib/jwt.js';
import { detectDevice, getClientIp, getCountry, getSessionId } from '../../lib/http.js';
import {
  countLiveViewers,
  recordClick,
  recordHeartbeat,
  recordImpressions,
  type ViewerContext,
} from './views.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROUTES DE COMPTAGE — heartbeat, impressions, clics, audience live.
 *  Toutes sont anonymes (`optionalAuth`) : un visiteur non connecté compte
 *  comme un spectateur à part entière, identifié par le cookie `kt_session`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Identifiant de session anonyme retenu (cookie), posé s'il manque. */
function ensureSession(req: FastifyRequest, reply: FastifyReply, fallback?: string): string {
  const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
  const existing = cookies[SESSION_COOKIE];
  if (existing) return existing;

  // Le lecteur génère un identifiant stable pour la session de lecture ;
  // on l'accepte s'il respecte le format, sinon on en fabrique un.
  const candidate =
    fallback && /^[A-Za-z0-9_-]{8,64}$/.test(fallback) ? fallback : getSessionId(req);

  reply.setCookie(SESSION_COOKIE, candidate, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    domain: env.COOKIE_DOMAIN,
    maxAge: 60 * 60 * 24 * 400, // ~13 mois
  });
  return candidate;
}

function buildViewerContext(
  req: FastifyRequest,
  reply: FastifyReply,
  fallbackSession?: string,
): ViewerContext {
  return {
    userId: req.user?.sub ?? null,
    sessionId: ensureSession(req, reply, fallbackSession),
    ipHash: hashIp(getClientIp(req)),
    device: detectDevice(req.headers['user-agent'] ?? ''),
    country: getCountry(req),
  };
}

export async function registerViewRoutes(app: FastifyInstance) {
  // ── Heartbeat du lecteur (~1 requête / 10 s / spectateur) ──────────────
  app.post(
    ROUTES.views.heartbeat,
    {
      preHandler: app.optionalAuth,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const input = watchHeartbeatSchema.parse(req.body);
      const ctx = buildViewerContext(req, reply, input.sessionId);
      const result = await recordHeartbeat(input, ctx);
      return reply.send(result);
    },
  );

  // ── Impressions de miniatures (batch envoyé par le feed) ───────────────
  app.post(
    ROUTES.views.impressions,
    {
      preHandler: app.optionalAuth,
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const input = impressionBatchSchema.parse(req.body);
      const ctx = buildViewerContext(req, reply);
      const result = await recordImpressions(input.videoIds, ctx.sessionId);
      return reply.send(result);
    },
  );

  // ── Clic sur une miniature (numérateur du CTR) ─────────────────────────
  app.post(
    ROUTES.views.click,
    {
      preHandler: app.optionalAuth,
      config: { rateLimit: { max: 240, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const input = clickSchema.parse(req.body);
      buildViewerContext(req, reply);
      await recordClick(input.videoId);
      return reply.send({ ok: true });
    },
  );

  // ── Audience en direct ─────────────────────────────────────────────────
  app.get(ROUTES.views.live(':videoId'), async (req, reply) => {
    const { videoId } = req.params as { videoId: string };
    const liveViewers = await countLiveViewers(videoId);
    return reply.send({ liveViewers });
  });
}
