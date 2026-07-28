import { env, googleOAuthEnabled } from '../../config/env.js';
import { AppError, badRequest } from '../../lib/errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  OAUTH 2.0 GOOGLE — implémentation minimale avec `fetch` natif.
 *  Aucune librairie OAuth : on se contente du flow "authorization code".
 *  L'anti-CSRF (`state`) est géré côté routes via un cookie signé court.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

const SCOPES = ['openid', 'email', 'profile'];

/** Profil normalisé renvoyé au service d'authentification. */
export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
}

/** 501 explicite quand les identifiants Google ne sont pas configurés. */
export function assertGoogleEnabled(): void {
  if (!googleOAuthEnabled) {
    throw new AppError(
      501,
      'NOT_IMPLEMENTED',
      "La connexion Google n'est pas configurée sur ce serveur (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants).",
    );
  }
}

/** URL de consentement Google vers laquelle rediriger l'utilisateur. */
export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
    access_type: 'online',
    include_granted_scopes: 'true',
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

/** Échange le `code` d'autorisation contre un access token Google. */
async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code',
    }).toString(),
  });

  const payload = (await res.json().catch(() => ({}))) as GoogleTokenResponse;

  if (!res.ok || !payload.access_token) {
    throw badRequest(
      `Échec de l'échange du code Google : ${payload.error_description ?? payload.error ?? res.status}`,
    );
  }
  return payload.access_token;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
}

/** Récupère le profil OpenID Connect associé à l'access token. */
async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw badRequest('Impossible de récupérer le profil Google');

  const info = (await res.json()) as GoogleUserInfo;

  if (!info.sub || !info.email) {
    throw badRequest("Le profil Google ne contient ni identifiant ni adresse email");
  }

  return {
    googleId: info.sub,
    email: info.email.toLowerCase(),
    emailVerified: info.email_verified === true,
    displayName: info.name ?? info.given_name ?? info.email.split('@')[0],
    avatarUrl: info.picture ?? null,
  };
}

/** Flow complet : code d'autorisation -> profil normalisé. */
export async function resolveGoogleProfile(code: string): Promise<GoogleProfile> {
  assertGoogleEnabled();
  const accessToken = await exchangeCode(code);
  return fetchProfile(accessToken);
}
