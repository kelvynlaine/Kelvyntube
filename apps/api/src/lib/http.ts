import type { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { SESSION_COOKIE } from './jwt.js';
import type { DeviceType } from '@kelvyntube/shared';

/** Identifiant de session anonyme (dédup des vues). Créé si absent. */
export function getSessionId(req: FastifyRequest): string {
  const existing = (req.cookies as Record<string, string | undefined>)?.[SESSION_COOKIE];
  return existing ?? randomUUID();
}

export function getClientIp(req: FastifyRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  if (Array.isArray(fwd) && fwd[0]) return fwd[0].split(',')[0].trim();
  return req.ip;
}

export function detectDevice(userAgent = ''): DeviceType {
  const ua = userAgent.toLowerCase();
  if (/smart-tv|smarttv|appletv|googletv|hbbtv|netcast|viera/.test(ua)) return 'TV';
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'TABLET';
  if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(ua)) return 'MOBILE';
  if (/mozilla|chrome|safari|firefox|edge/.test(ua)) return 'DESKTOP';
  return 'UNKNOWN';
}

/** Code pays depuis les en-têtes CDN (Cloudflare / Vercel). */
export function getCountry(req: FastifyRequest): string | null {
  const h = req.headers;
  return (
    (h['cf-ipcountry'] as string) ??
    (h['x-vercel-ip-country'] as string) ??
    null
  );
}

/** Encode/décode un curseur de pagination opaque. */
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor<T = Record<string, unknown>>(cursor?: string): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
