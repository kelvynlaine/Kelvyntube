import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  ROUTES,
  API_PREFIX,
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  onboardingSchema,
  updateProfileSchema,
} from '@kelvyntube/shared';
import { env } from '../../config/env.js';
import { AppError, unauthorized } from '../../lib/errors.js';
import { REFRESH_COOKIE, randomToken, accessTtlSeconds, type AccessTokenPayload } from '../../lib/jwt.js';
import { getClientIp } from '../../lib/http.js';
import { toAuthResponse, toAuthUser } from './auth.mapper.js';
import {
  registerUser,
  loginUser,
  rotateSession,
  revokeRefreshToken,
  issueSession,
  getAuthUserOrThrow,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  onboardUser,
  updateProfile,
  activateChannel,
  loginWithGoogle,
  type RequestMeta,
  type IssuedSession,
} from './auth.service.js';
import { assertGoogleEnabled, buildGoogleAuthUrl, resolveGoogleProfile } from './oauth.google.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MODULE AUTH — routes REST
 *  Chemins : exactement ceux déclarés dans `ROUTES.auth` (@kelvyntube/shared).
 *  Ce fichier ne contient que : validation Zod -> service -> cookies -> DTO.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Cookies ────────────────────────────────────────────────────────────────

/** Cookie d'access token : lu par `plugins/auth.ts` en repli du header Bearer. */
const ACCESS_COOKIE = 'kt_access';
/** Anti-CSRF du flow OAuth, signé et à durée de vie très courte. */
const OAUTH_STATE_COOKIE = 'kt_oauth_state';
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

/** Le refresh token n'est jamais envoyé ailleurs que sur les routes d'auth. */
const REFRESH_COOKIE_PATH = `${API_PREFIX}/auth`;

const baseCookie = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.COOKIE_SECURE,
} as const;

function setSessionCookies(reply: FastifyReply, session: IssuedSession): void {
  reply.setCookie(REFRESH_COOKIE, session.refreshToken, {
    ...baseCookie,
    path: REFRESH_COOKIE_PATH,
    maxAge: env.JWT_REFRESH_TTL_DAYS * 86_400,
  });
  setAccessCookie(reply, session.accessToken);
}

function setAccessCookie(reply: FastifyReply, accessToken: string): void {
  reply.setCookie(ACCESS_COOKIE, accessToken, {
    ...baseCookie,
    path: '/',
    maxAge: accessTtlSeconds(),
  });
}

function clearSessionCookies(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, { ...baseCookie, path: REFRESH_COOKIE_PATH });
  reply.clearCookie(ACCESS_COOKIE, { ...baseCookie, path: '/' });
}

// ── Utilitaires ────────────────────────────────────────────────────────────

const meta = (req: FastifyRequest): RequestMeta => ({
  ip: getClientIp(req),
  userAgent: req.headers['user-agent']?.slice(0, 255) ?? null,
});

/** `app.authenticate` garantit la présence de `req.user` ; TS ne le sait pas. */
function currentUser(req: FastifyRequest): AccessTokenPayload {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Redirection finale du flow OAuth vers le front (fragment, jamais de query). */
const webCallbackUrl = (params: Record<string, string>): string =>
  `${env.WEB_PUBLIC_URL}/auth/callback#${new URLSearchParams(params).toString()}`;

/** Le corps de /resend-verification est optionnel (utilisateur connecté ou non). */
const resendVerificationSchema = z.object({ email: z.string().email().optional() });

// ── Enregistrement des routes ──────────────────────────────────────────────

export async function registerAuthRoutes(app: FastifyInstance) {
  // ── POST /auth/register ─────────────────────────────────────────────────
  app.post(
    ROUTES.auth.register,
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes', keyGenerator: (req) => req.ip } } },
    async (req, reply) => {
      const input = registerSchema.parse(req.body);
      const session = await registerUser(input, meta(req));
      setSessionCookies(reply, session);
      return reply.status(201).send(toAuthResponse(session.user, session.accessToken));
    },
  );

  // ── POST /auth/login — 10 tentatives / 15 min / IP ──────────────────────
  app.post(
    ROUTES.auth.login,
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes', keyGenerator: (req) => req.ip } } },
    async (req, reply) => {
      const input = loginSchema.parse(req.body);
      const session = await loginUser(input, meta(req));
      setSessionCookies(reply, session);
      return reply.send(toAuthResponse(session.user, session.accessToken));
    },
  );

  // ── POST /auth/refresh — rotation + détection de réutilisation ──────────
  app.post(ROUTES.auth.refresh, async (req, reply) => {
    const raw = req.cookies[REFRESH_COOKIE];
    if (!raw) throw unauthorized('Aucune session à rafraîchir');

    try {
      const session = await rotateSession(raw, meta(req));
      setSessionCookies(reply, session);
      return reply.send(toAuthResponse(session.user, session.accessToken));
    } catch (err) {
      // Session compromise ou expirée : on nettoie le navigateur.
      clearSessionCookies(reply);
      throw err;
    }
  });

  // ── POST /auth/logout ───────────────────────────────────────────────────
  app.post(ROUTES.auth.logout, async (req, reply) => {
    await revokeRefreshToken(req.cookies[REFRESH_COOKIE]);
    clearSessionCookies(reply);
    return reply.status(204).send();
  });

  // ── GET /auth/me ────────────────────────────────────────────────────────
  app.get(ROUTES.auth.me, { preHandler: app.authenticate }, async (req) => {
    const user = await getAuthUserOrThrow(currentUser(req).sub);
    return toAuthUser(user);
  });

  // ── POST /auth/verify-email ─────────────────────────────────────────────
  // Le lien provient de la boîte mail : on ouvre directement une session.
  app.post(ROUTES.auth.verifyEmail, async (req, reply) => {
    const { token } = verifyEmailSchema.parse(req.body);
    const user = await verifyEmail(token);
    const session = await issueSession(user, meta(req));
    setSessionCookies(reply, session);
    return reply.send(toAuthResponse(session.user, session.accessToken));
  });

  // ── POST /auth/resend-verification — 204 systématique ───────────────────
  app.post(
    ROUTES.auth.resendVerification,
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const { email } = resendVerificationSchema.parse(req.body ?? {});
      await resendVerification({ userId: req.user?.sub ?? null, email: email ?? null });
      return reply.status(204).send();
    },
  );

  // ── POST /auth/password/request-reset — 204 même si l'email est inconnu ─
  app.post(
    ROUTES.auth.requestPasswordReset,
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes', keyGenerator: (req) => req.ip } } },
    async (req, reply) => {
      const { email } = requestPasswordResetSchema.parse(req.body);
      await requestPasswordReset(email);
      return reply.status(204).send();
    },
  );

  // ── POST /auth/password/reset ───────────────────────────────────────────
  app.post(ROUTES.auth.resetPassword, async (req, reply) => {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await resetPassword(token, password);
    // Toutes les sessions ont sauté : le navigateur courant aussi.
    clearSessionCookies(reply);
    return reply.status(204).send();
  });

  // ── POST /auth/onboarding — création de la première chaîne ──────────────
  app.post(ROUTES.auth.onboarding, { preHandler: app.authenticate }, async (req, reply) => {
    const input = onboardingSchema.parse(req.body);
    const { user, accessToken } = await onboardUser(currentUser(req).sub, input);
    // Nouveau token : il porte désormais `cid` (chaîne active).
    setAccessCookie(reply, accessToken);
    return reply.send(toAuthResponse(user, accessToken));
  });

  // ── PATCH /auth/profile ─────────────────────────────────────────────────
  app.patch(ROUTES.auth.profile, { preHandler: app.authenticate }, async (req) => {
    const input = updateProfileSchema.parse(req.body);
    const user = await updateProfile(currentUser(req).sub, input);
    return toAuthUser(user);
  });

  // ── POST /auth/channels/:channelId/activate ─────────────────────────────
  app.post<{ Params: { channelId: string } }>(
    ROUTES.auth.switchChannel(':channelId'),
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { user, accessToken } = await activateChannel(
        currentUser(req).sub,
        req.params.channelId,
      );
      setAccessCookie(reply, accessToken);
      return reply.send(toAuthResponse(user, accessToken));
    },
  );

  // ── GET /auth/oauth/google ──────────────────────────────────────────────
  app.get(ROUTES.auth.googleStart, async (_req, reply) => {
    assertGoogleEnabled(); // 501 explicite si non configuré

    const state = randomToken(16);
    reply.setCookie(OAUTH_STATE_COOKIE, state, {
      ...baseCookie,
      path: REFRESH_COOKIE_PATH,
      maxAge: OAUTH_STATE_TTL_SECONDS,
      signed: true, // signé avec le secret de @fastify/cookie
    });

    return reply.redirect(buildGoogleAuthUrl(state));
  });

  // ── GET /auth/oauth/google/callback ─────────────────────────────────────
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    ROUTES.auth.googleCallback,
    async (req, reply) => {
      assertGoogleEnabled();

      const { code, state, error } = req.query;
      const signedState = req.cookies[OAUTH_STATE_COOKIE];
      reply.clearCookie(OAUTH_STATE_COOKIE, { ...baseCookie, path: REFRESH_COOKIE_PATH });

      if (error) return reply.redirect(webCallbackUrl({ error }));
      if (!code || !state || !signedState) {
        return reply.redirect(webCallbackUrl({ error: 'invalid_request' }));
      }

      const unsigned = req.unsignCookie(signedState);
      if (!unsigned.valid || unsigned.value !== state) {
        return reply.redirect(webCallbackUrl({ error: 'state_mismatch' }));
      }

      try {
        const profile = await resolveGoogleProfile(code);
        const session = await loginWithGoogle(profile, meta(req));
        setSessionCookies(reply, session);
        // Le front lit le token dans le fragment (jamais dans la query string).
        return reply.redirect(webCallbackUrl({ token: session.accessToken }));
      } catch (err) {
        req.log.error({ err }, 'Échec de la connexion Google');
        const message = err instanceof AppError ? err.message : 'Connexion Google impossible';
        return reply.redirect(webCallbackUrl({ error: message }));
      }
    },
  );
}
