import argon2 from 'argon2';
import { prisma, Prisma, EmailTokenType } from '@kelvyntube/db';
import {
  handleSchema,
  type RegisterInput,
  type LoginInput,
  type OnboardingInput,
  type UpdateProfileInput,
} from '@kelvyntube/shared';
import { env } from '../../config/env.js';
import { badRequest, unauthorized, forbidden, conflict, notFound } from '../../lib/errors.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  randomToken,
  type RefreshTokenPayload,
} from '../../lib/jwt.js';
import { emailQueue, type EmailJob } from '../../lib/queue.js';
import { authUserSelect, type AuthUserRow } from './auth.mapper.js';
import { verificationEmail, passwordResetEmail, welcomeEmail } from './templates.js';
import type { GoogleProfile } from './oauth.google.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVICE D'AUTHENTIFICATION
 *  Toute la logique métier vit ici ; `auth.routes.ts` ne fait que valider les
 *  entrées, poser les cookies et sérialiser les réponses.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Constantes ─────────────────────────────────────────────────────────────

/** Paramètres argon2id alignés sur les recommandations OWASP (19 Mio, t=2). */
const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 h

/** Métadonnées de la requête, stockées avec le refresh token (audit). */
export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export interface IssuedSession {
  user: AuthUserRow;
  accessToken: string;
  refreshToken: string;
}

// ── Mots de passe ──────────────────────────────────────────────────────────

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(digest, password, {});
  } catch {
    return false;
  }
}

/**
 * Hash factice vérifié lorsqu'aucun compte ne correspond : le temps de réponse
 * reste identique, ce qui évite d'énumérer les comptes par mesure de latence.
 */
let decoyHash: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword('kelvyntube::decoy::password');
  return decoyHash;
}

// ── Lecture d'utilisateur ──────────────────────────────────────────────────

export function getAuthUser(userId: string): Promise<AuthUserRow | null> {
  return prisma.user.findUnique({ where: { id: userId }, select: authUserSelect });
}

export async function getAuthUserOrThrow(userId: string): Promise<AuthUserRow> {
  const user = await getAuthUser(userId);
  if (!user) throw notFound('Utilisateur introuvable');
  return user;
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

// ── Tokens ─────────────────────────────────────────────────────────────────

export function accessTokenFor(user: {
  id: string;
  email: string;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  activeChannelId: string | null;
}): string {
  return signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    cid: user.activeChannelId,
  });
}

/** Crée un refresh token (JWT) et enregistre son empreinte sha256 en base. */
async function issueRefreshToken(
  userId: string,
  family: string,
  meta: RequestMeta,
): Promise<string> {
  const token = signRefreshToken({ sub: userId, fam: family, jti: randomToken(16) });
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      family,
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    },
  });
  return token;
}

/** Ouvre une session neuve : nouvelle famille de rotation. */
export async function issueSession(user: AuthUserRow, meta: RequestMeta): Promise<IssuedSession> {
  const refreshToken = await issueRefreshToken(user.id, randomToken(16), meta);
  return { user, accessToken: accessTokenFor(user), refreshToken };
}

/** Révoque tous les tokens encore actifs d'une lignée de rotation. */
async function revokeFamily(family: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { family, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Rotation du refresh token.
 * - le token présenté est révoqué et remplacé dans la MÊME famille ;
 * - s'il était déjà révoqué (rejeu), TOUTE la famille saute et on renvoie 401.
 */
export async function rotateSession(raw: string, meta: RequestMeta): Promise<IssuedSession> {
  let payload: RefreshTokenPayload;
  try {
    payload = verifyRefreshToken(raw);
  } catch {
    throw unauthorized('Session expirée, reconnecte-toi');
  }

  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });

  // Signature valide mais aucune ligne : token supprimé ou forgé — on coupe.
  if (!record) {
    await revokeFamily(payload.fam);
    throw unauthorized('Session invalide');
  }

  // ⚠ Détection de réutilisation : un token déjà tourné est rejoué.
  if (record.revokedAt) {
    await revokeFamily(record.family);
    throw unauthorized(
      'Réutilisation de session détectée : toutes les sessions ont été révoquées',
    );
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Session expirée, reconnecte-toi');
  }

  const user = await getAuthUser(record.userId);
  if (!user) {
    await revokeFamily(record.family);
    throw unauthorized('Session invalide');
  }
  if (user.bannedAt) {
    await revokeFamily(record.family);
    throw forbidden('Ce compte a été suspendu');
  }

  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  const refreshToken = await issueRefreshToken(user.id, record.family, meta);

  return { user, accessToken: accessTokenFor(user), refreshToken };
}

/** Révoque le refresh token courant (déconnexion). Silencieux si inconnu. */
export async function revokeRefreshToken(raw: string | undefined | null): Promise<void> {
  if (!raw) return;
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    select: { id: true, revokedAt: true },
  });
  if (!record || record.revokedAt) return;
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
}

// ── Emails transactionnels ─────────────────────────────────────────────────

/** Pousse un job email ; un incident Redis ne doit jamais casser la requête. */
async function enqueueEmail(job: EmailJob): Promise<void> {
  try {
    await emailQueue.add('send', job);
  } catch (err) {
    console.error('[auth] Job email non poussé :', err);
  }
}

async function createEmailToken(
  userId: string,
  type: EmailTokenType,
  ttlMs: number,
): Promise<string> {
  const raw = randomToken(32);
  await prisma.emailToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      type,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return raw;
}

/** Consomme un token email à usage unique (marqué `usedAt`). */
async function consumeEmailToken(raw: string, type: EmailTokenType): Promise<{ userId: string }> {
  const record = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(raw) } });

  if (!record || record.type !== type || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw badRequest('Lien invalide ou expiré', { token: ['Lien invalide ou expiré'] });
  }

  // Marquage atomique : la clause `usedAt: null` empêche un double usage concurrent.
  const claimed = await prisma.emailToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw badRequest('Lien invalide ou expiré', { token: ['Lien invalide ou expiré'] });
  }

  return { userId: record.userId };
}

async function sendVerificationEmail(user: {
  id: string;
  email: string;
  displayName: string;
}): Promise<void> {
  const raw = await createEmailToken(
    user.id,
    EmailTokenType.EMAIL_VERIFICATION,
    VERIFICATION_TTL_MS,
  );
  const url = `${env.WEB_PUBLIC_URL}/auth/verify-email?token=${encodeURIComponent(raw)}`;
  const tpl = verificationEmail({ displayName: user.displayName, url });
  await enqueueEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
}

// ── Inscription / connexion ────────────────────────────────────────────────

export async function registerUser(input: RegisterInput, meta: RequestMeta): Promise<IssuedSession> {
  const email = normalizeEmail(input.email);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw conflict('Un compte existe déjà avec cette adresse email', {
      email: ['Adresse email déjà utilisée'],
    });
  }

  let user: AuthUserRow;
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName.trim(),
      },
      select: authUserSelect,
    });
  } catch (err) {
    // Course entre deux inscriptions simultanées sur la même adresse.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('Un compte existe déjà avec cette adresse email', {
        email: ['Adresse email déjà utilisée'],
      });
    }
    throw err;
  }

  await sendVerificationEmail(user);
  return issueSession(user, meta);
}

export async function loginUser(input: LoginInput, meta: RequestMeta): Promise<IssuedSession> {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...authUserSelect, passwordHash: true },
  });

  if (!user?.passwordHash) {
    // Vérification factice : temps de réponse constant (anti-énumération).
    await verifyPassword(await getDecoyHash(), input.password);
    throw unauthorized('Email ou mot de passe incorrect');
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) throw unauthorized('Email ou mot de passe incorrect');

  if (user.bannedAt) throw forbidden('Ce compte a été suspendu');

  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

  const { passwordHash: _passwordHash, ...authUser } = user;
  return issueSession(authUser, meta);
}

// ── Vérification d'email ───────────────────────────────────────────────────

export async function verifyEmail(token: string): Promise<AuthUserRow> {
  const { userId } = await consumeEmailToken(token, EmailTokenType.EMAIL_VERIFICATION);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: new Date() },
    select: authUserSelect,
  });

  // Les autres liens de vérification en attente deviennent caducs.
  await prisma.emailToken.updateMany({
    where: { userId, type: EmailTokenType.EMAIL_VERIFICATION, usedAt: null },
    data: { usedAt: new Date() },
  });

  return user;
}

/**
 * Renvoie un lien de vérification. Ne révèle jamais si le compte existe :
 * l'appelant répond 204 dans tous les cas.
 */
export async function resendVerification(target: {
  userId?: string | null;
  email?: string | null;
}): Promise<void> {
  const where = target.userId
    ? { id: target.userId }
    : target.email
      ? { email: normalizeEmail(target.email) }
      : null;
  if (!where) return;

  const user = await prisma.user.findUnique({
    where,
    select: { id: true, email: true, displayName: true, emailVerified: true },
  });
  if (!user || user.emailVerified) return;

  await sendVerificationEmail(user);
}

// ── Mot de passe oublié ────────────────────────────────────────────────────

/** Toujours silencieux : pas d'énumération de comptes. */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(rawEmail) },
    select: { id: true, email: true, displayName: true, bannedAt: true },
  });
  if (!user || user.bannedAt) return;

  const raw = await createEmailToken(
    user.id,
    EmailTokenType.PASSWORD_RESET,
    PASSWORD_RESET_TTL_MS,
  );
  const url = `${env.WEB_PUBLIC_URL}/auth/reset-password?token=${encodeURIComponent(raw)}`;
  const tpl = passwordResetEmail({ displayName: user.displayName, url });
  await enqueueEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
}

/** Applique le nouveau mot de passe et déconnecte TOUTES les sessions. */
export async function resetPassword(token: string, password: string): Promise<void> {
  const { userId } = await consumeEmailToken(token, EmailTokenType.PASSWORD_RESET);

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      // Cliquer sur le lien prouve la possession de l'adresse email.
      emailVerified: new Date(),
    },
  });

  await Promise.all([
    revokeAllSessions(userId),
    prisma.emailToken.updateMany({
      where: { userId, type: EmailTokenType.PASSWORD_RESET, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);
}

// ── Onboarding & profil ────────────────────────────────────────────────────

/** "@Kelvyn" -> "Kelvyn" ; revalide ensuite le format partagé. */
function normalizeHandle(raw: string): string {
  return handleSchema.parse(raw.trim().replace(/^@+/, ''));
}

/**
 * Première chaîne de l'utilisateur + centres d'intérêt + `onboardedAt`.
 * La chaîne créée devient la chaîne active (le nouvel access token porte `cid`).
 */
export async function onboardUser(
  userId: string,
  input: OnboardingInput,
): Promise<{ user: AuthUserRow; accessToken: string }> {
  const current = await getAuthUserOrThrow(userId);
  if (current.onboardedAt) throw conflict('Ton onboarding est déjà terminé');

  const handle = normalizeHandle(input.handle);
  const displayName = input.displayName.trim();

  const taken = await prisma.channel.findFirst({
    where: { handle: { equals: handle, mode: 'insensitive' } },
    select: { id: true },
  });
  if (taken) {
    throw conflict('Ce handle est déjà pris', { handle: ['Ce handle est déjà pris'] });
  }

  let user: AuthUserRow;
  try {
    user = await prisma.$transaction(async (tx) => {
      const channel = await tx.channel.create({
        data: {
          ownerId: userId,
          handle,
          name: displayName,
          avatarUrl: current.avatarUrl,
        },
        select: { id: true },
      });

      return tx.user.update({
        where: { id: userId },
        data: {
          displayName,
          interests: input.interests,
          onboardedAt: new Date(),
          activeChannelId: channel.id,
        },
        select: authUserSelect,
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('Ce handle est déjà pris', { handle: ['Ce handle est déjà pris'] });
    }
    throw err;
  }

  const tpl = welcomeEmail({ displayName, handle });
  await enqueueEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });

  return { user, accessToken: accessTokenFor(user) };
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<AuthUserRow> {
  const data: Prisma.UserUpdateInput = {};
  if (input.displayName !== undefined) data.displayName = input.displayName.trim();
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  if (input.theme !== undefined) data.theme = input.theme;
  if (input.autoplay !== undefined) data.autoplay = input.autoplay;
  if (input.interests !== undefined) data.interests = input.interests;
  if (input.locale !== undefined) data.locale = input.locale;

  return prisma.user.update({ where: { id: userId }, data, select: authUserSelect });
}

/** Bascule de chaîne active (multi-chaînes façon YouTube Studio). */
export async function activateChannel(
  userId: string,
  channelId: string,
): Promise<{ user: AuthUserRow; accessToken: string }> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, ownerId: true },
  });
  if (!channel) throw notFound('Chaîne introuvable');
  if (channel.ownerId !== userId) throw forbidden('Tu ne possèdes pas cette chaîne');

  const user = await prisma.user.update({
    where: { id: userId },
    data: { activeChannelId: channelId },
    select: authUserSelect,
  });

  return { user, accessToken: accessTokenFor(user) };
}

// ── OAuth Google ───────────────────────────────────────────────────────────

/**
 * Retrouve, lie ou crée le compte associé à un profil Google.
 * Le rattachement par email n'est accepté que si Google atteste la vérification.
 */
export async function loginWithGoogle(
  profile: GoogleProfile,
  meta: RequestMeta,
): Promise<IssuedSession> {
  let user = await prisma.user.findUnique({
    where: { googleId: profile.googleId },
    select: authUserSelect,
  });

  if (!user) {
    const byEmail = await prisma.user.findUnique({
      where: { email: profile.email },
      select: { id: true, googleId: true, avatarUrl: true, emailVerified: true },
    });

    if (byEmail) {
      if (!profile.emailVerified) {
        throw conflict(
          'Un compte utilise déjà cette adresse email. Connecte-toi avec ton mot de passe.',
        );
      }
      if (byEmail.googleId && byEmail.googleId !== profile.googleId) {
        throw conflict('Un autre compte Google est déjà lié à cette adresse email.');
      }
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: profile.googleId,
          emailVerified: byEmail.emailVerified ?? new Date(),
          avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl,
          lastSeenAt: new Date(),
        },
        select: authUserSelect,
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: profile.email,
          googleId: profile.googleId,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          emailVerified: profile.emailVerified ? new Date() : null,
          lastSeenAt: new Date(),
        },
        select: authUserSelect,
      });
    }
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  }

  if (user.bannedAt) throw forbidden('Ce compte a été suspendu');

  return issueSession(user, meta);
}
