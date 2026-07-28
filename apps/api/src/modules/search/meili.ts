import { MeiliSearch, type Index, type Settings } from 'meilisearch';
import { env } from '../../config/env.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CLIENT MEILISEARCH
 *  Meilisearch est un *accélérateur*, jamais une dépendance dure : si le
 *  serveur est absent, `isMeiliAvailable()` renvoie false et tout le module
 *  recherche bascule sur le repli PostgreSQL. Le site reste fonctionnel.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type MeiliEntity = 'video' | 'channel' | 'playlist';

/** Nom des index par entité. */
export const MEILI_INDEX = {
  video: 'videos',
  channel: 'channels',
  playlist: 'playlists',
} as const satisfies Record<MeiliEntity, string>;

// ── Formes des documents indexés ──────────────────────────────────────────
// On n'indexe QUE ce qui sert à chercher/filtrer/trier : les données
// d'affichage sont toujours rechargées depuis Postgres (source de vérité).

export interface VideoDocument {
  id: string;
  title: string;
  description: string;
  tags: string[];
  channelName: string;
  channelId: string;
  categorySlug: string | null;
  kind: 'LONG' | 'SHORT';
  durationSec: number;
  /** Timestamp unix en secondes (filtrable + triable). */
  publishedAt: number;
  viewCount: number;
  hotScore: number;
  visibility: string;
  status: string;
}

export interface ChannelDocument {
  id: string;
  title: string;
  handle: string;
  description: string;
  subscriberCount: number;
  verified: boolean;
}

export interface PlaylistDocument {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  channelId: string | null;
  visibility: string;
  kind: string;
  itemCount: number;
  updatedAt: number;
}

export type MeiliDocument = VideoDocument | ChannelDocument | PlaylistDocument;

// ── Client ────────────────────────────────────────────────────────────────

/** Hôte normalisé (sans slash final) : sert aussi au ping /health. */
const MEILI_HOST = env.MEILI_HOST.replace(/\/+$/, '');

/** Délai maximal d'un ping de disponibilité (ms). */
const PING_TIMEOUT_MS = 800;
/** Durée de mise en cache du résultat du ping (ms). */
const AVAILABILITY_TTL_MS = 30_000;

export const meili = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: env.MEILI_MASTER_KEY,
  timeout: 3_000,
});

export function getIndex<T extends Record<string, unknown> = Record<string, unknown>>(
  entity: MeiliEntity,
): Index<T> {
  return meili.index<T>(MEILI_INDEX[entity]);
}

// ── Disponibilité ─────────────────────────────────────────────────────────

let lastCheckAt = 0;
let lastResult = false;
let inFlight: Promise<boolean> | null = null;
/** L'avertissement « Meilisearch indisponible » n'est journalisé qu'une fois par panne. */
let warned = false;

/**
 * Ping court sur /health, résultat mémorisé 30 s.
 * Ne lève JAMAIS : renvoie simplement false si Meilisearch ne répond pas.
 */
export async function isMeiliAvailable(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && now - lastCheckAt < AVAILABILITY_TTL_MS) return lastResult;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let ok = false;
    try {
      const res = await fetch(`${MEILI_HOST}/health`, {
        method: 'GET',
        headers: env.MEILI_MASTER_KEY
          ? { Authorization: `Bearer ${env.MEILI_MASTER_KEY}` }
          : undefined,
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }

    lastResult = ok;
    lastCheckAt = Date.now();

    if (!ok && !warned) {
      warned = true;
      console.warn(
        `[search] Meilisearch injoignable sur ${MEILI_HOST} — bascule sur le repli PostgreSQL (ILIKE / to_tsvector).`,
      );
    }
    if (ok && warned) {
      warned = false;
      console.info('[search] Meilisearch de nouveau disponible.');
    }

    inFlight = null;
    return ok;
  })();

  return inFlight;
}

// ── Création / configuration des index ────────────────────────────────────

const VIDEO_SETTINGS: Settings = {
  searchableAttributes: ['title', 'description', 'tags', 'channelName'],
  filterableAttributes: [
    'categorySlug',
    'kind',
    'durationSec',
    'publishedAt',
    'channelId',
    'visibility',
    'status',
  ],
  sortableAttributes: ['publishedAt', 'viewCount', 'hotScore'],
  // `sort` est remonté avant `proximity`/`attribute` : quand l'utilisateur
  // choisit explicitement « date » ou « vues », l'ordre demandé prime sur la
  // pertinence fine (comportement attendu des filtres YouTube). Sans tri
  // explicite cette règle est neutre : le classement par pertinence est
  // inchangé, puis départagé par hotScore et viewCount.
  rankingRules: [
    'words',
    'typo',
    'sort',
    'proximity',
    'attribute',
    'exactness',
    'hotScore:desc',
    'viewCount:desc',
  ],
  distinctAttribute: null,
};

const CHANNEL_SETTINGS: Settings = {
  searchableAttributes: ['title', 'handle', 'description'],
  filterableAttributes: ['verified'],
  sortableAttributes: ['subscriberCount'],
  rankingRules: [
    'words',
    'typo',
    'proximity',
    'attribute',
    'sort',
    'exactness',
    'subscriberCount:desc',
  ],
};

const PLAYLIST_SETTINGS: Settings = {
  searchableAttributes: ['title', 'description'],
  filterableAttributes: ['visibility', 'kind', 'ownerId', 'channelId'],
  sortableAttributes: ['updatedAt', 'itemCount'],
  rankingRules: [
    'words',
    'typo',
    'proximity',
    'attribute',
    'sort',
    'exactness',
    'itemCount:desc',
  ],
};

let ensurePromise: Promise<boolean> | null = null;

async function doEnsureIndexes(): Promise<boolean> {
  if (!(await isMeiliAvailable(true))) return false;

  const specs: { entity: MeiliEntity; settings: Settings }[] = [
    { entity: 'video', settings: VIDEO_SETTINGS },
    { entity: 'channel', settings: CHANNEL_SETTINGS },
    { entity: 'playlist', settings: PLAYLIST_SETTINGS },
  ];

  for (const spec of specs) {
    const uid = MEILI_INDEX[spec.entity];
    try {
      await meili.createIndex(uid, { primaryKey: 'id' });
    } catch {
      // `index_already_exists` — cas nominal au redémarrage.
    }
    await meili.index(uid).updateSettings(spec.settings);
  }

  return true;
}

/**
 * Crée les index et applique leurs réglages (idempotent, mémorisé).
 * Renvoie false si Meilisearch est indisponible — l'appelant ignore alors
 * simplement l'indexation.
 */
export async function ensureIndexes(): Promise<boolean> {
  if (!ensurePromise) {
    ensurePromise = doEnsureIndexes().catch((err: unknown) => {
      console.warn('[search] configuration des index Meilisearch impossible :', err);
      return false;
    });
  }
  const ok = await ensurePromise;
  // En cas d'échec on autorise une nouvelle tentative au prochain appel.
  if (!ok) ensurePromise = null;
  return ok;
}
