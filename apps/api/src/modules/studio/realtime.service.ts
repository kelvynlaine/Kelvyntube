import { prisma } from '@kelvyntube/db';
import { REDIS_KEYS, type TimeSeriesPointDTO, type VideoCardDTO } from '@kelvyntube/shared';
import { redis } from '../../lib/redis.js';
import { toVideoCard, videoCardSelect } from '../../lib/serializers.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TEMPS RÉEL DU STUDIO
 *
 *  Deux sources :
 *   - Redis  : les spectateurs en direct (clés volatiles `kt:live:<videoId>:<sessionId>`
 *              posées avec un TTL par le module `views`).
 *   - Postgres : les vues des 48 dernières heures (table `views`), agrégées par
 *              heure directement en SQL.
 *
 *  ⚠️ Le scan Redis utilise EXCLUSIVEMENT `SCAN` avec curseur. `KEYS` bloque
 *  le thread principal de Redis pendant tout le parcours du keyspace et n'a
 *  rien à faire dans une requête HTTP servie en production.
 *
 *  Toute erreur Redis est absorbée : le dashboard doit s'afficher même si le
 *  cache est indisponible (on renvoie alors 0 spectateur, jamais une 500).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Taille du lot demandé à chaque itération de SCAN. */
const SCAN_COUNT = 500;
/** Garde-fou anti-boucle infinie (keyspace gigantesque / curseur pathologique). */
const SCAN_MAX_ITERATIONS = 400;
/** Nombre maximum de vidéos « live » remontées à Postgres pour filtrage. */
const MAX_LIVE_VIDEOS = 500;

/** Fenêtre temps réel du Studio (heures). */
export const REALTIME_WINDOW_HOURS = 48;

// ── Redis : spectateurs en direct ──────────────────────────────────────────

/**
 * Parcourt le keyspace avec SCAN et renvoie les clés correspondant au motif.
 * Jamais de `KEYS` : SCAN est incrémental et non bloquant.
 */
async function scanKeys(pattern: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = '0';
  let iterations = 0;

  try {
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_COUNT);
      cursor = next;
      if (batch.length > 0) found.push(...batch);
      iterations += 1;
    } while (cursor !== '0' && iterations < SCAN_MAX_ITERATIONS);
  } catch {
    // Redis indisponible : on dégrade silencieusement vers « aucun spectateur ».
    return [];
  }

  return found;
}

/**
 * Extrait l'identifiant de vidéo d'une clé `kt:live:<videoId>:<sessionId>`.
 * Les cuid ne contiennent pas de « : », le découpage est donc sûr.
 */
function videoIdFromLiveKey(key: string): string | null {
  const parts = key.split(':');
  return parts.length >= 4 && parts[2] ? parts[2] : null;
}

/** Spectateurs en direct sur UNE vidéo. */
export async function countVideoLiveViewers(videoId: string): Promise<number> {
  const keys = await scanKeys(REDIS_KEYS.liveViewer(videoId, '*'));
  return keys.length;
}

/**
 * Spectateurs en direct de toute une chaîne.
 *
 * Un seul SCAN global (`kt:live:*:*`) puis regroupement par vidéo ; on ne
 * demande à Postgres que les vidéos effectivement actives (au plus quelques
 * dizaines), au lieu de charger tout le catalogue de la chaîne.
 */
export async function getChannelLiveViewers(channelId: string): Promise<{
  total: number;
  byVideo: { videoId: string; viewers: number }[];
}> {
  const keys = await scanKeys(REDIS_KEYS.liveViewer('*', '*'));
  if (keys.length === 0) return { total: 0, byVideo: [] };

  const perVideo = new Map<string, number>();
  for (const key of keys) {
    const videoId = videoIdFromLiveKey(key);
    if (!videoId) continue;
    perVideo.set(videoId, (perVideo.get(videoId) ?? 0) + 1);
  }
  if (perVideo.size === 0) return { total: 0, byVideo: [] };

  // On ne garde que les vidéos les plus regardées avant d'interroger la base.
  const candidates = [...perVideo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_LIVE_VIDEOS);

  const owned = await prisma.video.findMany({
    where: { channelId, deletedAt: null, id: { in: candidates.map(([id]) => id) } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((v) => v.id));

  const byVideo = candidates
    .filter(([videoId]) => ownedIds.has(videoId))
    .map(([videoId, viewers]) => ({ videoId, viewers }));

  return {
    total: byVideo.reduce((sum, row) => sum + row.viewers, 0),
    byVideo,
  };
}

/**
 * Hydrate en cartes vidéo la liste (déjà triée) renvoyée par
 * `getChannelLiveViewers`. On passe la liste en paramètre pour ne PAS relancer
 * un second SCAN quand l'appelant a déjà besoin du total.
 */
export async function hydrateLiveVideos(
  byVideo: { videoId: string; viewers: number }[],
  limit = 5,
): Promise<{ video: VideoCardDTO; viewers: number }[]> {
  if (byVideo.length === 0) return [];

  const top = byVideo.slice(0, limit);
  const videos = await prisma.video.findMany({
    where: { id: { in: top.map((row) => row.videoId) } },
    select: videoCardSelect,
  });
  const byId = new Map(videos.map((v) => [v.id, v]));

  return top.flatMap((row) => {
    const video = byId.get(row.videoId);
    return video ? [{ video: toVideoCard(video), viewers: row.viewers }] : [];
  });
}

// ── Postgres : vues par heure ──────────────────────────────────────────────

interface HourRow {
  hour: Date;
  views: bigint;
}

/** Clé de bucket horaire : « YYYY-MM-DDTHH ». */
function hourKey(d: Date): string {
  return d.toISOString().slice(0, 13);
}

/** Début de l'heure courante (UTC). */
function startOfHour(d: Date): Date {
  const copy = new Date(d.getTime());
  copy.setUTCMinutes(0, 0, 0);
  return copy;
}

/**
 * Reconstruit une série horaire continue : un point par heure de la fenêtre,
 * les heures sans vue valant 0. La date est un datetime ISO (le DTO
 * `TimeSeriesPointDTO` l'autorise explicitement pour le temps réel).
 */
function buildHourlySeries(rows: HourRow[], hours: number): {
  perHour: TimeSeriesPointDTO[];
  total: number;
} {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(hourKey(row.hour), Number(row.views));

  const end = startOfHour(new Date());
  const perHour: TimeSeriesPointDTO[] = [];
  let total = 0;

  for (let i = hours - 1; i >= 0; i -= 1) {
    const bucket = new Date(end.getTime() - i * 3_600_000);
    const value = counts.get(hourKey(bucket)) ?? 0;
    total += value;
    perHour.push({ date: bucket.toISOString(), value });
  }

  return { perHour, total };
}

/** Vues par heure sur les N dernières heures, pour toutes les vidéos d'une chaîne. */
export async function getChannelViewsPerHour(
  channelId: string,
  hours = REALTIME_WINDOW_HOURS,
): Promise<{ perHour: TimeSeriesPointDTO[]; total: number }> {
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows = await prisma.$queryRaw<HourRow[]>`
    SELECT date_trunc('hour', vw."createdAt") AS hour,
           COUNT(*)::bigint                   AS views
    FROM "views" vw
    JOIN "videos" v ON v."id" = vw."videoId"
    WHERE v."channelId" = ${channelId}
      AND v."deletedAt" IS NULL
      AND vw."createdAt" >= ${since}
    GROUP BY 1
    ORDER BY 1
  `;
  return buildHourlySeries(rows, hours);
}

/** Vues par heure sur les N dernières heures, pour UNE vidéo. */
export async function getVideoViewsPerHour(
  videoId: string,
  hours = REALTIME_WINDOW_HOURS,
): Promise<{ perHour: TimeSeriesPointDTO[]; total: number }> {
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows = await prisma.$queryRaw<HourRow[]>`
    SELECT date_trunc('hour', vw."createdAt") AS hour,
           COUNT(*)::bigint                   AS views
    FROM "views" vw
    WHERE vw."videoId" = ${videoId}
      AND vw."createdAt" >= ${since}
    GROUP BY 1
    ORDER BY 1
  `;
  return buildHourlySeries(rows, hours);
}

/**
 * Bloc temps réel complet d'une chaîne (réutilisé par `/overview` et
 * `/realtime`). `byVideo` est renvoyé brut pour permettre l'hydratation en
 * cartes vidéo sans relancer de SCAN.
 */
export async function getChannelRealtime(channelId: string): Promise<{
  liveViewers: number;
  last48hViews: number;
  perHour: TimeSeriesPointDTO[];
  byVideo: { videoId: string; viewers: number }[];
}> {
  const [live, hourly] = await Promise.all([
    getChannelLiveViewers(channelId),
    getChannelViewsPerHour(channelId, REALTIME_WINDOW_HOURS),
  ]);
  return {
    liveViewers: live.total,
    last48hViews: hourly.total,
    perHour: hourly.perHour,
    byVideo: live.byVideo,
  };
}
