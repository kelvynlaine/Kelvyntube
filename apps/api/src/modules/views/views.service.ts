import { prisma } from '@kelvyntube/db';
import {
  REDIS_KEYS,
  WS_EVENTS,
  type DeviceType,
  type TrafficSource,
  type WatchHeartbeatInput,
} from '@kelvyntube/shared';
import { env } from '../../config/env.js';
import { redis } from '../../lib/redis.js';
import { emitToRoom, videoRoom } from '../../lib/realtime.js';
import { notFound } from '../../lib/errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SYSTÈME DE VUES — chemin chaud, 100 % Redis
 *
 *  Aucune écriture Postgres n'a lieu dans le chemin critique d'un heartbeat
 *  (sauf l'`upsert` de reprise de lecture, throttlé à 1 écriture / 30 s / session).
 *  Tout est tamponné dans Redis puis déversé en batch par le worker analytics
 *  (`flush-views`).
 *
 *  Buffers (cf. REDIS_KEYS) :
 *    viewBuffer       HASH  videoId          -> nb de vues validées
 *    watchTimeBuffer  HASH  videoId          -> secondes visionnées
 *    impressionBuffer HASH  videoId          -> miniatures affichées
 *    clickBuffer      HASH  videoId          -> clics sur miniature
 *    retentionBuffer  HASH  videoId:bucket   -> spectateurs présents
 *    VIEW_LOG_KEY     LIST  JSON             -> une entrée par vue validée
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Clés Redis locales au module (les clés partagées vivent dans REDIS_KEYS) ──

/** File des vues validées, vidée par `flush-views` → table `View`. */
export const VIEW_LOG_KEY = 'kt:views:log';

/** Dernier heartbeat d'une session : { s: watchedSec cumulé, t: epoch ms }. */
const heartbeatKey = (videoId: string, sessionId: string) => `kt:views:hb:${videoId}:${sessionId}`;
/** SET des buckets de rétention déjà comptés pour la session. */
const retentionSetKey = (videoId: string, sessionId: string) => `kt:views:rb:${videoId}:${sessionId}`;
/** Verrou d'écriture de l'historique (1 écriture DB / 30 s / session). */
const historyLockKey = (userId: string, videoId: string) => `kt:views:hist:${userId}:${videoId}`;
/** Compteur de vues validées par IP et par vidéo (anti-bot). */
const ipQuotaKey = (videoId: string, ipHash: string) => `kt:views:ip:${videoId}:${ipHash}`;
/** Déduplication des impressions par session. */
const impressionSetKey = (sessionId: string) => `kt:views:imp:${sessionId}`;
/** Métadonnées vidéo mises en cache (évite un SELECT par heartbeat). */
const videoMetaKey = (videoId: string) => `kt:video:meta:${videoId}`;

// ── Paramètres anti-fraude ────────────────────────────────────────────────

/** TTL des états de session (une lecture ne dure jamais plus longtemps). */
const SESSION_STATE_TTL = 6 * 3600;
/** Écriture DB de la position de lecture au plus toutes les N secondes. */
const HISTORY_WRITE_INTERVAL = 30;
/** Une vidéo est « terminée » au-delà de ce pourcentage. */
const COMPLETION_RATIO = 0.9;
/** Durée de vie d'un spectateur « en direct » (heartbeat toutes les ~10 s). */
const LIVE_VIEWER_TTL = 90;
/** Vues validées maximum pour un même couple (vidéo, IP) par heure. */
const MAX_VIEWS_PER_IP_PER_HOUR = 8;
/** Facteur de vitesse de lecture maximal toléré (YouTube plafonne à 2x). */
const MAX_PLAYBACK_RATE = 2;
/** Tolérance en secondes ajoutée au contrôle de vitesse (latence réseau). */
const CLOCK_SLACK_SEC = 15;
/** Delta de watch-time maximal accepté pour un seul heartbeat. */
const MAX_DELTA_PER_HEARTBEAT = 180;
/** TTL du cache des métadonnées vidéo. */
const VIDEO_META_TTL = 60;

// ── Types ─────────────────────────────────────────────────────────────────

export interface ViewerContext {
  userId: string | null;
  sessionId: string;
  ipHash: string;
  device: DeviceType;
  country: string | null;
}

export interface HeartbeatResult {
  /** Vrai si CE heartbeat a validé une nouvelle vue. */
  counted: boolean;
  /** Compteur affichable immédiatement (Postgres + delta encore en Redis). */
  viewCount: number;
}

/** Une entrée de la file `VIEW_LOG_KEY` — devient une ligne `View`. */
export interface ViewLogEntry {
  videoId: string;
  userId: string | null;
  sessionId: string;
  ipHash: string;
  watchedSec: number;
  watchPct: number;
  source: TrafficSource;
  device: DeviceType;
  country: string | null;
  ageBucket: string | null;
  at: string;
}

interface VideoMeta {
  id: string;
  channelId: string;
  durationSec: number;
  viewCount: number;
}

// ── Métadonnées vidéo (cache 60 s) ────────────────────────────────────────

async function getVideoMeta(videoId: string): Promise<VideoMeta | null> {
  const cached = await redis.get(videoMetaKey(videoId));
  if (cached) {
    try {
      return JSON.parse(cached) as VideoMeta;
    } catch {
      /* cache corrompu : on relit la base */
    }
  }
  const video = await prisma.video.findFirst({
    where: { id: videoId, deletedAt: null },
    select: { id: true, channelId: true, durationSec: true, viewCount: true },
  });
  if (!video) return null;
  const meta: VideoMeta = {
    id: video.id,
    channelId: video.channelId,
    durationSec: video.durationSec,
    viewCount: Number(video.viewCount),
  };
  await redis.set(videoMetaKey(videoId), JSON.stringify(meta), 'EX', VIDEO_META_TTL);
  return meta;
}

// ── Heartbeat ─────────────────────────────────────────────────────────────

/**
 * POST /views/heartbeat — appelé toutes les ~10 s par le lecteur.
 *
 * Garanties anti-fraude :
 *  1. seuil de visionnage minimal (`VIEW_MIN_WATCH_SECONDS`) ;
 *  2. déduplication ATOMIQUE par (vidéo, session) via `SET NX EX` — impossible
 *     de compter deux vues pour la même session dans la fenêtre configurée ;
 *  3. quota de vues validées par (vidéo, IP hachée) et par heure : vider ses
 *     cookies ne suffit donc pas à gonfler le compteur ;
 *  4. le watch-time est plafonné par le temps réellement écoulé entre deux
 *     heartbeats (× vitesse de lecture max) : impossible d'envoyer
 *     `watchedSec: 999999` ;
 *  5. la rétention n'est comptée qu'une fois par (session, bucket).
 */
export async function recordHeartbeat(
  input: WatchHeartbeatInput,
  ctx: ViewerContext,
): Promise<HeartbeatResult> {
  const meta = await getVideoMeta(input.videoId);
  if (!meta) throw notFound('Vidéo introuvable');

  const { videoId } = input;
  const { sessionId } = ctx;
  const now = Date.now();
  const duration = Math.max(meta.durationSec, 0);

  // ── 1. Delta de watch-time borné par l'horloge murale ──────────────────
  const hbKey = heartbeatKey(videoId, sessionId);
  const previousRaw = await redis.get(hbKey);
  let previousSec = 0;
  let previousAt = now;
  if (previousRaw) {
    try {
      const parsed = JSON.parse(previousRaw) as { s: number; t: number };
      previousSec = Number(parsed.s) || 0;
      previousAt = Number(parsed.t) || now;
    } catch {
      /* état corrompu : on repart de zéro */
    }
  }

  const elapsedSec = Math.max(0, (now - previousAt) / 1000);
  const allowedDelta = previousRaw
    ? elapsedSec * MAX_PLAYBACK_RATE + CLOCK_SLACK_SEC
    : Math.min(input.watchedSec, MAX_DELTA_PER_HEARTBEAT);

  const rawDelta = Math.max(0, input.watchedSec - previousSec);
  const delta = Math.floor(Math.min(rawDelta, allowedDelta, MAX_DELTA_PER_HEARTBEAT));

  await redis.set(
    hbKey,
    JSON.stringify({ s: input.watchedSec, t: now }),
    'EX',
    SESSION_STATE_TTL,
  );

  // Le watch-time est TOUJOURS accumulé, même sans nouvelle vue.
  if (delta > 0) {
    await redis.hincrby(REDIS_KEYS.watchTimeBuffer, videoId, delta);
  }

  // ── 2. Validation de la vue (dédup atomique + quota IP) ────────────────
  let counted = false;
  if (input.watchedSec >= env.VIEW_MIN_WATCH_SECONDS) {
    const ipKey = ipQuotaKey(videoId, ctx.ipHash);
    const ipCount = Number((await redis.get(ipKey)) ?? 0);
    if (ipCount < MAX_VIEWS_PER_IP_PER_HOUR) {
      // SET NX EX : atomique, jamais de GET puis SET (course entre deux pings).
      const acquired = await redis.set(
        REDIS_KEYS.viewDedupe(videoId, sessionId),
        '1',
        'EX',
        env.VIEW_DEDUPE_WINDOW_SECONDS,
        'NX',
      );
      if (acquired === 'OK') {
        counted = true;
        const used = await redis.incr(ipKey);
        if (used === 1) await redis.expire(ipKey, 3600);
      }
    }
  }

  const watchPct = duration > 0 ? Math.min(1, input.watchedSec / duration) : 0;

  if (counted) {
    await redis.hincrby(REDIS_KEYS.viewBuffer, videoId, 1);
    const entry: ViewLogEntry = {
      videoId,
      userId: ctx.userId,
      sessionId,
      ipHash: ctx.ipHash,
      watchedSec: Math.min(input.watchedSec, duration > 0 ? duration : input.watchedSec),
      watchPct,
      source: input.source,
      device: ctx.device,
      country: ctx.country,
      ageBucket: null,
      at: new Date(now).toISOString(),
    };
    await redis.rpush(VIEW_LOG_KEY, JSON.stringify(entry));
  }

  // ── 3. Courbe de rétention (une fois par session et par bucket) ────────
  if (duration > 0) {
    const bucket = Math.min(99, Math.max(0, Math.floor((input.positionSec / duration) * 100)));
    const setKey = retentionSetKey(videoId, sessionId);
    const isNewBucket = await redis.sadd(setKey, String(bucket));
    if (isNewBucket === 1) {
      await redis.hincrby(REDIS_KEYS.retentionBuffer, `${videoId}:${bucket}`, 1);
      await redis.expire(setKey, SESSION_STATE_TTL);
    }
  }

  // ── 4. Spectateurs en direct ───────────────────────────────────────────
  await redis.set(REDIS_KEYS.liveViewer(videoId, sessionId), '1', 'EX', LIVE_VIEWER_TTL);

  // ── 5. Reprise de lecture (≤ 1 écriture DB / 30 s / session) ───────────
  if (ctx.userId) {
    const lock = await redis.set(
      historyLockKey(ctx.userId, videoId),
      '1',
      'EX',
      HISTORY_WRITE_INTERVAL,
      'NX',
    );
    if (lock === 'OK') {
      const completed = duration > 0 && input.positionSec >= duration * COMPLETION_RATIO;
      const position = duration > 0 ? Math.min(input.positionSec, duration) : input.positionSec;
      await prisma.watchHistory.upsert({
        where: { userId_videoId: { userId: ctx.userId, videoId } },
        create: { userId: ctx.userId, videoId, positionSec: position, completed },
        update: {
          positionSec: position,
          watchedAt: new Date(now),
          // On ne « dé-termine » jamais une vidéo déjà terminée.
          ...(completed ? { completed: true } : {}),
        },
      });
    }
  }

  // ── 6. Compteur affichable = Postgres + delta encore en tampon ─────────
  const buffered = Number((await redis.hget(REDIS_KEYS.viewBuffer, videoId)) ?? 0);
  const viewCount = meta.viewCount + buffered;

  // ── 7. Diffusion temps réel uniquement sur nouvelle vue ────────────────
  if (counted) {
    await emitToRoom(videoRoom(videoId), WS_EVENTS.viewCount, { videoId, viewCount });
  }

  return { counted, viewCount };
}

// ── Impressions & clics (CTR) ─────────────────────────────────────────────

/**
 * POST /views/impressions — miniatures réellement affichées à l'écran.
 * Dédupliquées par session (une même miniature vue deux fois dans la même
 * session ne compte qu'une impression : sinon le CTR s'effondre au scroll).
 */
export async function recordImpressions(
  videoIds: string[],
  sessionId: string,
): Promise<{ recorded: number }> {
  const unique = [...new Set(videoIds)].slice(0, 100);
  if (!unique.length) return { recorded: 0 };

  const setKey = impressionSetKey(sessionId);
  const dedupe = redis.pipeline();
  for (const id of unique) dedupe.sadd(setKey, id);
  dedupe.expire(setKey, SESSION_STATE_TTL);
  const results = await dedupe.exec();

  const fresh: string[] = [];
  unique.forEach((id, index) => {
    const row = results?.[index];
    if (row && !row[0] && Number(row[1]) === 1) fresh.push(id);
  });
  if (!fresh.length) return { recorded: 0 };

  const pipeline = redis.pipeline();
  for (const id of fresh) pipeline.hincrby(REDIS_KEYS.impressionBuffer, id, 1);
  await pipeline.exec();

  return { recorded: fresh.length };
}

/** POST /views/click — clic sur une miniature (numérateur du CTR). */
export async function recordClick(videoId: string): Promise<void> {
  await redis.hincrby(REDIS_KEYS.clickBuffer, videoId, 1);
}

// ── Spectateurs en direct ─────────────────────────────────────────────────

/**
 * GET /views/:videoId/live
 * Parcours par SCAN (jamais KEYS : bloquerait Redis sur un gros dataset).
 */
export async function countLiveViewers(videoId: string): Promise<number> {
  const pattern = REDIS_KEYS.liveViewer(videoId, '*');
  let cursor = '0';
  let total = 0;
  let iterations = 0;

  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
    cursor = next;
    total += batch.length;
    iterations += 1;
    // Garde-fou : au pire on renvoie une estimation plutôt que de boucler.
    if (iterations > 200) break;
  } while (cursor !== '0');

  return total;
}
