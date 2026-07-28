import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  /** Chaîne active au moment de l'émission (pratique pour le Studio). */
  cid?: string | null;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Famille de rotation : permet de révoquer toute une lignée en cas de réutilisation. */
  fam: string;
  jti: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: 'kelvyntube',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'kelvyntube' }) as AccessTokenPayload;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d`,
    issuer: 'kelvyntube',
  } as jwt.SignOptions);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'kelvyntube' }) as RefreshTokenPayload;
}

/** Les refresh tokens ne sont jamais stockés en clair. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Hachage d'IP pour les logs de vues (RGPD). */
export function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip + env.IP_HASH_SALT).digest('hex').slice(0, 32);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Durée d'accès en secondes (pour `expiresIn` renvoyé au client). */
export function accessTtlSeconds(): number {
  const ttl = env.JWT_ACCESS_TTL;
  const m = ttl.match(/^(\d+)([smhd])$/);
  if (!m) return 900;
  const n = Number(m[1]);
  return { s: n, m: n * 60, h: n * 3600, d: n * 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
}

export const REFRESH_COOKIE = 'kt_refresh';
export const SESSION_COOKIE = 'kt_session'; // identifiant anonyme pour le comptage de vues
