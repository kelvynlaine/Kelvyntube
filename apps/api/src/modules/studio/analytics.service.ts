import { prisma } from '@kelvyntube/db';
import type {
  AnalyticsRangeInput,
  DeviceType,
  OffsetPage,
  StudioOverviewDTO,
  StudioVideoRowDTO,
  TimeSeriesPointDTO,
  TrafficSource,
  VideoAnalyticsDTO,
  VideoCardDTO,
  VideoStatus,
  VideoVisibility,
} from '@kelvyntube/shared';
import { notFound } from '../../lib/errors.js';
import { toNumber, toVideoCard, videoCardSelect } from '../../lib/serializers.js';
import {
  dateKey,
  fillDailySeries,
  resolveRange,
  round2,
  type ResolvedRange,
} from './range.js';
import {
  getChannelRealtime,
  getVideoViewsPerHour,
  countVideoLiveViewers,
  REALTIME_WINDOW_HOURS,
} from './realtime.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ANALYTICS DU STUDIO
 *
 *  Principes appliqués partout dans ce fichier :
 *   1. Agrégation en SQL (`$queryRaw` en template balisé → requête TOUJOURS
 *      paramétrée, jamais d'interpolation de chaîne), on ne charge jamais les
 *      lignes de faits en mémoire.
 *   2. Source primaire = tables d'agrégats (`VideoStatDaily`, `ChannelStatDaily`).
 *      Repli automatique sur les tables brutes (`View`, `Subscription`,
 *      compteurs dénormalisés de `Video`) quand le worker analytics n'a pas
 *      encore tourné — indispensable sur un projet neuf.
 *   3. Aucune réponse `null` : sur une chaîne sans donnée, on renvoie des
 *      totaux à 0 et des séries complètes remplies de 0.
 *   4. Les `BigInt` (watchTimeSec, viewCount) sont convertis en `number`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
//  SIMULATION DES REVENUS
//
//  Kelvyn Tube n'a AUCUNE monétisation réelle : pas de régie publicitaire,
//  pas de paiement, pas de contrat créateur. Les euros affichés dans le
//  Studio sont donc une ESTIMATION entièrement simulée, calculée à la volée
//  selon une formule volontairement simple et vérifiable :
//
//      revenu = vues × MONETIZED_VIEW_RATIO × RPM(catégorie) ÷ 1000
//
//   - RPM                  : revenu simulé pour 1000 vues « monétisées »,
//                            constante par catégorie (les niches tech /
//                            finance rapportent davantage, comme dans la vraie
//                            vie publicitaire).
//   - MONETIZED_VIEW_RATIO : part des vues censées avoir vu une publicité.
//   - Si `Channel.monetizationEnabled` est faux → 0 € partout, sans exception.
//
//  La colonne `estimatedRevenue` des tables d'agrégats n'est volontairement
//  PAS lue : la formule ci-dessous reste l'unique source de vérité, ce qui
//  garantit que deux écrans du Studio affichent toujours le même montant.
// ═══════════════════════════════════════════════════════════════════════════

/** RPM par défaut : 2,50 € pour 1000 vues monétisées. */
export const DEFAULT_RPM_EUR = 2.5;

/** Part simulée des vues servant une publicité. */
export const MONETIZED_VIEW_RATIO = 0.55;

/** RPM simulé par slug de catégorie (voir DEFAULT_CATEGORIES). */
export const RPM_BY_CATEGORY: Record<string, number> = {
  tech: 4.2,
  education: 3.9,
  auto: 3.4,
  actualites: 3.1,
  cuisine: 2.8,
  voyage: 2.7,
  sport: 2.6,
  cinema: 2.4,
  vlog: 2.2,
  gaming: 2.1,
  humour: 1.9,
  musique: 1.6,
};

/** Estimation simulée de revenus pour un lot de vues d'une catégorie donnée. */
export function estimateRevenue(
  views: number,
  categorySlug: string | null,
  monetizationEnabled: boolean,
): number {
  if (!monetizationEnabled || views <= 0) return 0;
  const rpm = (categorySlug && RPM_BY_CATEGORY[categorySlug]) || DEFAULT_RPM_EUR;
  return (views * MONETIZED_VIEW_RATIO * rpm) / 1000;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const SECONDS_PER_HOUR = 3600;

const TRAFFIC_SOURCES: readonly TrafficSource[] = [
  'HOME', 'SEARCH', 'SUGGESTED', 'CHANNEL', 'EXTERNAL',
  'PLAYLIST', 'SHORTS', 'NOTIFICATION', 'DIRECT',
];

const DEVICE_TYPES: readonly DeviceType[] = ['DESKTOP', 'MOBILE', 'TABLET', 'TV', 'UNKNOWN'];

/** Libellé du regroupement des pays hors top 10. */
const OTHER_COUNTRIES_LABEL = 'Autres';

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Arrondi à 4 décimales — utilisé pour le CTR, exprimé en ratio 0..1. */
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

const toHours = (seconds: number): number => round2(seconds / SECONDS_PER_HOUR);

/** Division protégée : renvoie 0 plutôt que NaN / Infinity. */
const safeRatio = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;

const addTo = (map: Map<string, number>, key: string, value: number): void => {
  map.set(key, (map.get(key) ?? 0) + value);
};

/** Fusionne une répartition JSON (`{ "SEARCH": 120, … }`) dans un accumulateur. */
function mergeBreakdown(target: Map<string, number>, raw: unknown): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) continue;
    addTo(target, key, n);
  }
}

/**
 * Transforme un accumulateur en répartition triée avec pourcentages.
 * `allowed` filtre les clés inconnues (protection contre un JSON corrompu).
 */
function toDistribution<K extends string>(
  counts: Map<string, number>,
  allowed?: readonly K[],
): { key: K; views: number; pct: number }[] {
  const entries = [...counts.entries()].filter(
    ([key, value]) => value > 0 && (!allowed || (allowed as readonly string[]).includes(key)),
  );
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([key, views]) => ({
      key: key as K,
      views: Math.round(views),
      pct: round1(safeRatio(views, total) * 100),
    }));
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHARGEMENT DES AGRÉGATS — CHAÎNE
// ═══════════════════════════════════════════════════════════════════════════

interface ChannelDailyRow {
  /** Clé « YYYY-MM-DD ». */
  day: string;
  categorySlug: string | null;
  views: number;
  watchTimeSec: number;
  impressions: number;
  clicks: number;
}

interface RawChannelDailyRow {
  day: Date;
  slug: string | null;
  views: bigint;
  watchTimeSec: bigint;
  impressions: bigint;
  clicks: bigint;
}

/**
 * Vues / watch-time / impressions par jour ET par catégorie (la catégorie est
 * nécessaire au calcul du RPM). Repli sur la table `views` si le worker
 * d'agrégation n'a jamais tourné.
 */
async function loadChannelDaily(
  channelId: string,
  range: ResolvedRange,
): Promise<ChannelDailyRow[]> {
  const rows = await prisma.$queryRaw<RawChannelDailyRow[]>`
    SELECT s."date"                        AS day,
           c."slug"                        AS slug,
           SUM(s."views")::bigint          AS views,
           SUM(s."watchTimeSec")::bigint   AS "watchTimeSec",
           SUM(s."impressions")::bigint    AS impressions,
           SUM(s."clicks")::bigint         AS clicks
    FROM "video_stats_daily" s
    JOIN "videos" v ON v."id" = s."videoId"
    LEFT JOIN "categories" c ON c."id" = v."categoryId"
    WHERE v."channelId" = ${channelId}
      AND v."deletedAt" IS NULL
      AND s."date" >= ${range.fromKey}::date
      AND s."date" <= ${range.toKey}::date
    GROUP BY s."date", c."slug"
  `;

  if (rows.length > 0) {
    return rows.map((r) => ({
      day: dateKey(r.day),
      categorySlug: r.slug,
      views: toNumber(r.views),
      watchTimeSec: toNumber(r.watchTimeSec),
      impressions: toNumber(r.impressions),
      clicks: toNumber(r.clicks),
    }));
  }

  // ── Repli : agrégation directe du journal des vues ──────────────────────
  const fallback = await prisma.$queryRaw<RawChannelDailyRow[]>`
    SELECT vw."createdAt"::date             AS day,
           c."slug"                         AS slug,
           COUNT(*)::bigint                 AS views,
           COALESCE(SUM(vw."watchedSec"), 0)::bigint AS "watchTimeSec",
           0::bigint                        AS impressions,
           0::bigint                        AS clicks
    FROM "views" vw
    JOIN "videos" v ON v."id" = vw."videoId"
    LEFT JOIN "categories" c ON c."id" = v."categoryId"
    WHERE v."channelId" = ${channelId}
      AND v."deletedAt" IS NULL
      AND vw."createdAt" >= ${range.from}
      AND vw."createdAt" <= ${range.to}
    GROUP BY 1, 2
  `;

  return fallback.map((r) => ({
    day: dateKey(r.day),
    categorySlug: r.slug,
    views: toNumber(r.views),
    watchTimeSec: toNumber(r.watchTimeSec),
    impressions: 0,
    clicks: 0,
  }));
}

interface SubscriberDeltas {
  /** Solde net (gagnés − perdus) par jour. */
  netByDay: Map<string, number>;
  gainedByDay: Map<string, number>;
  lostByDay: Map<string, number>;
  gained: number;
  lost: number;
}

interface RawChannelStatRow {
  day: Date;
  subsGained: number;
  subsLost: number;
}

/**
 * Abonnés gagnés / perdus par jour depuis `ChannelStatDaily`.
 * Repli sur la table `Subscription` (les désabonnements n'y laissent aucune
 * trace : `lost` vaut alors 0, ce qui reste cohérent).
 */
async function loadSubscriberDeltas(
  channelId: string,
  range: ResolvedRange,
): Promise<SubscriberDeltas> {
  const rows = await prisma.$queryRaw<RawChannelStatRow[]>`
    SELECT "date"        AS day,
           "subsGained"  AS "subsGained",
           "subsLost"    AS "subsLost"
    FROM "channel_stats_daily"
    WHERE "channelId" = ${channelId}
      AND "date" >= ${range.fromKey}::date
      AND "date" <= ${range.toKey}::date
  `;

  const netByDay = new Map<string, number>();
  const gainedByDay = new Map<string, number>();
  const lostByDay = new Map<string, number>();
  let gained = 0;
  let lost = 0;

  if (rows.length > 0) {
    for (const row of rows) {
      const key = dateKey(row.day);
      const g = Number(row.subsGained) || 0;
      const l = Number(row.subsLost) || 0;
      addTo(gainedByDay, key, g);
      addTo(lostByDay, key, l);
      addTo(netByDay, key, g - l);
      gained += g;
      lost += l;
    }
    return { netByDay, gainedByDay, lostByDay, gained, lost };
  }

  const fallback = await prisma.$queryRaw<{ day: Date; gained: bigint }[]>`
    SELECT s."createdAt"::date AS day,
           COUNT(*)::bigint    AS gained
    FROM "subscriptions" s
    WHERE s."channelId" = ${channelId}
      AND s."createdAt" >= ${range.from}
      AND s."createdAt" <= ${range.to}
    GROUP BY 1
  `;

  for (const row of fallback) {
    const key = dateKey(row.day);
    const g = toNumber(row.gained);
    addTo(gainedByDay, key, g);
    addTo(netByDay, key, g);
    gained += g;
  }

  return { netByDay, gainedByDay, lostByDay, gained, lost };
}

interface TopVideoStat {
  videoId: string;
  views: number;
  watchTimeSec: number;
}

/** Top vidéos de la période (par vues), depuis les agrégats journaliers. */
async function loadTopVideoStats(
  channelId: string,
  range: ResolvedRange,
  limit: number,
): Promise<TopVideoStat[]> {
  const rows = await prisma.$queryRaw<
    { videoId: string; views: bigint; watchTimeSec: bigint }[]
  >`
    SELECT s."videoId"                    AS "videoId",
           SUM(s."views")::bigint         AS views,
           SUM(s."watchTimeSec")::bigint  AS "watchTimeSec"
    FROM "video_stats_daily" s
    JOIN "videos" v ON v."id" = s."videoId"
    WHERE v."channelId" = ${channelId}
      AND v."deletedAt" IS NULL
      AND s."date" >= ${range.fromKey}::date
      AND s."date" <= ${range.toKey}::date
    GROUP BY s."videoId"
    HAVING SUM(s."views") > 0
    ORDER BY SUM(s."views") DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    videoId: r.videoId,
    views: toNumber(r.views),
    watchTimeSec: toNumber(r.watchTimeSec),
  }));
}

/** Hydrate les identifiants en `VideoCardDTO`, en conservant l'ordre du classement. */
async function hydrateTopVideos(
  stats: TopVideoStat[],
): Promise<(VideoCardDTO & { views: number; watchTimeHours: number })[]> {
  if (stats.length === 0) return [];
  const videos = await prisma.video.findMany({
    where: { id: { in: stats.map((s) => s.videoId) } },
    select: videoCardSelect,
  });
  const byId = new Map(videos.map((v) => [v.id, v]));

  return stats.flatMap((stat) => {
    const video = byId.get(stat.videoId);
    if (!video) return [];
    return [
      {
        ...toVideoCard(video),
        views: stat.views,
        watchTimeHours: toHours(stat.watchTimeSec),
      },
    ];
  });
}

/**
 * Repli du top vidéos : aucun agrégat journalier → on classe sur les
 * compteurs dénormalisés de `Video` (vues cumulées depuis toujours).
 */
async function fallbackTopVideos(
  channelId: string,
  limit: number,
): Promise<(VideoCardDTO & { views: number; watchTimeHours: number })[]> {
  const videos = await prisma.video.findMany({
    where: { channelId, deletedAt: null, status: 'READY' },
    orderBy: { viewCount: 'desc' },
    take: limit,
    select: { ...videoCardSelect, avgWatchSec: true },
  });

  return videos
    .filter((v) => toNumber(v.viewCount) > 0)
    .map((v) => {
      const views = toNumber(v.viewCount);
      return {
        ...toVideoCard(v),
        views,
        watchTimeHours: toHours(v.avgWatchSec * views),
      };
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. GET /studio/:channelId/overview
// ═══════════════════════════════════════════════════════════════════════════

const TOP_VIDEOS_LIMIT = 10;

export async function getStudioOverview(
  channelId: string,
  input: AnalyticsRangeInput,
): Promise<StudioOverviewDTO> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { createdAt: true, subscriberCount: true, monetizationEnabled: true },
  });
  if (!channel) throw notFound('Chaîne introuvable');

  // « lifetime » est ancré sur la date de création de la chaîne.
  const range = resolveRange(input, channel.createdAt);

  const [dailyRows, deltas, topStats, realtime] = await Promise.all([
    loadChannelDaily(channelId, range),
    loadSubscriberDeltas(channelId, range),
    loadTopVideoStats(channelId, range, TOP_VIDEOS_LIMIT),
    getChannelRealtime(channelId),
  ]);

  // ── Séries journalières + totaux ────────────────────────────────────────
  const viewsByDay = new Map<string, number>();
  const watchHoursByDay = new Map<string, number>();
  const revenueByDay = new Map<string, number>();

  let totalViews = 0;
  let totalWatchSec = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalRevenue = 0;

  for (const row of dailyRows) {
    const revenue = estimateRevenue(row.views, row.categorySlug, channel.monetizationEnabled);
    addTo(viewsByDay, row.day, row.views);
    addTo(watchHoursByDay, row.day, row.watchTimeSec / SECONDS_PER_HOUR);
    addTo(revenueByDay, row.day, revenue);

    totalViews += row.views;
    totalWatchSec += row.watchTimeSec;
    totalImpressions += row.impressions;
    totalClicks += row.clicks;
    totalRevenue += revenue;
  }

  // ── Série d'abonnés CUMULÉE ─────────────────────────────────────────────
  // On part du nombre d'abonnés actuel et on remonte le solde net de la
  // période pour connaître la valeur juste avant `from`, puis on ré-applique
  // les deltas jour après jour. Un jour sans donnée a un delta de 0 : la
  // courbe reste continue (elle ne retombe jamais à zéro) et se termine
  // exactement sur `Channel.subscriberCount`.
  const netTotal = deltas.gained - deltas.lost;
  let running = channel.subscriberCount - netTotal;
  const subscribersSeries: TimeSeriesPointDTO[] = range.days.map((day) => {
    running += deltas.netByDay.get(day) ?? 0;
    return { date: day, value: Math.max(0, Math.round(running)) };
  });

  // ── Top vidéos (avec repli sur les compteurs dénormalisés) ──────────────
  const topVideos =
    topStats.length > 0
      ? await hydrateTopVideos(topStats)
      : await fallbackTopVideos(channelId, TOP_VIDEOS_LIMIT);

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    totals: {
      views: totalViews,
      watchTimeHours: toHours(totalWatchSec),
      subscribers: channel.subscriberCount,
      subscribersDelta: netTotal,
      estimatedRevenue: round2(totalRevenue),
      impressions: totalImpressions,
      // CTR exprimé en RATIO 0..1 (même convention que `Video.ctr`).
      ctr: round4(safeRatio(totalClicks, totalImpressions)),
      avgViewDurationSec: Math.round(safeRatio(totalWatchSec, totalViews)),
    },
    series: {
      views: fillDailySeries(viewsByDay, range.days),
      watchTime: fillDailySeries(watchHoursByDay, range.days),
      subscribers: subscribersSeries,
      revenue: fillDailySeries(revenueByDay, range.days),
    },
    topVideos,
    realtime: {
      last48hViews: realtime.last48hViews,
      liveViewers: realtime.liveViewers,
      perHour: realtime.perHour,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. GET /studio/:channelId/videos
// ═══════════════════════════════════════════════════════════════════════════

export type StudioVideoSort = 'recent' | 'views' | 'likes' | 'comments' | 'ctr';

export interface StudioVideosQuery {
  page: number;
  pageSize: number;
  status?: VideoStatus;
  visibility?: VideoVisibility;
  q?: string;
  sort: StudioVideoSort;
}

const studioVideoSelect = {
  id: true,
  title: true,
  thumbnailUrl: true,
  status: true,
  visibility: true,
  processingProgress: true,
  processingError: true,
  durationSec: true,
  publishedAt: true,
  publishAt: true,
  createdAt: true,
  viewCount: true,
  likeCount: true,
  dislikeCount: true,
  commentCount: true,
  ctr: true,
  avgWatchPct: true,
} as const;

function toStudioVideoRow(v: {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  status: VideoStatus;
  visibility: VideoVisibility;
  processingProgress: number;
  processingError: string | null;
  durationSec: number;
  publishedAt: Date | null;
  publishAt: Date | null;
  createdAt: Date;
  viewCount: bigint | number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  ctr: number;
  avgWatchPct: number;
}): StudioVideoRowDTO {
  return {
    id: v.id,
    title: v.title,
    thumbnailUrl: v.thumbnailUrl,
    status: v.status,
    visibility: v.visibility,
    // Progression et erreur de traitement : c'est ce couple qui alimente le
    // suivi temps réel de l'onglet « Contenu » du Studio.
    processingProgress: v.processingProgress,
    processingError: v.processingError,
    durationSec: v.durationSec,
    publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
    publishAt: v.publishAt ? v.publishAt.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
    viewCount: toNumber(v.viewCount),
    likeCount: v.likeCount,
    dislikeCount: v.dislikeCount,
    commentCount: v.commentCount,
    ctr: v.ctr,
    avgWatchPct: v.avgWatchPct,
  };
}

/** Tri du tableau de gestion — toujours désambiguïsé par la date de création. */
function buildVideoOrderBy(sort: StudioVideoSort) {
  switch (sort) {
    case 'views':
      return [{ viewCount: 'desc' as const }, { createdAt: 'desc' as const }];
    case 'likes':
      return [{ likeCount: 'desc' as const }, { createdAt: 'desc' as const }];
    case 'comments':
      return [{ commentCount: 'desc' as const }, { createdAt: 'desc' as const }];
    case 'ctr':
      return [{ ctr: 'desc' as const }, { createdAt: 'desc' as const }];
    case 'recent':
    default:
      return [{ createdAt: 'desc' as const }];
  }
}

/**
 * Tableau de gestion des vidéos : TOUS les statuts sont retournés
 * (UPLOADING / UPLOADED / PROCESSING / READY / FAILED) pour que le Studio
 * puisse afficher les uploads en cours et les échecs de transcodage.
 */
export async function listStudioVideos(
  channelId: string,
  query: StudioVideosQuery,
): Promise<OffsetPage<StudioVideoRowDTO>> {
  const where = {
    channelId,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.visibility ? { visibility: query.visibility } : {}),
    ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}),
  };

  const [total, videos] = await Promise.all([
    prisma.video.count({ where }),
    prisma.video.findMany({
      where,
      orderBy: buildVideoOrderBy(query.sort),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: studioVideoSelect,
    }),
  ]);

  return {
    items: videos.map(toStudioVideoRow),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. GET /studio/:channelId/videos/:videoId/analytics
// ═══════════════════════════════════════════════════════════════════════════

/** Nombre de points de la courbe de rétention (1 bucket = 1 % de la vidéo). */
export const RETENTION_BUCKETS = 100;
/** Demi-largeur de la fenêtre de lissage (fenêtre totale = 2n + 1 points). */
const RETENTION_SMOOTH_HALF_WINDOW = 2;

/**
 * Construit la « courbe de rétention d'audience » façon YouTube.
 *
 *  1. Normalisation : `pct[b] = plays[b] / max(plays[0], 1) × 100`.
 *     Le bucket 0 vaut donc 100 % — tous les autres se lisent comme « part
 *     du public initial encore présent ».
 *  2. Lissage : moyenne glissante centrée sur 5 points, pour absorber le bruit
 *     d'échantillonnage des buckets peu fréquentés.
 *  3. Monotonie décroissante : on applique le minimum courant de gauche à
 *     droite. Un spectateur qui a quitté la vidéo ne peut pas « revenir » plus
 *     loin, la courbe ne remonte donc jamais (les rebonds de re-visionnage
 *     sont écrasés, exactement comme sur la courbe de YouTube Studio).
 *
 * Renvoie un tableau vide s'il n'existe aucun point de rétention (vidéo
 * jamais regardée) — jamais `null`.
 */
export function buildRetentionCurve(
  points: { bucket: number; plays: number }[],
): { bucket: number; pct: number }[] {
  if (points.length === 0) return [];

  const raw = new Array<number>(RETENTION_BUCKETS).fill(0);
  for (const p of points) {
    if (p.bucket >= 0 && p.bucket < RETENTION_BUCKETS) {
      raw[p.bucket] = Math.max(0, p.plays);
    }
  }

  // 1. Normalisation en pourcentage du bucket 0.
  const base = Math.max(raw[0], 1);
  const pct = raw.map((plays) => Math.min(100, (plays / base) * 100));

  // 2. Lissage par moyenne glissante centrée.
  const smoothed = pct.map((_, i) => {
    const start = Math.max(0, i - RETENTION_SMOOTH_HALF_WINDOW);
    const end = Math.min(RETENTION_BUCKETS - 1, i + RETENTION_SMOOTH_HALF_WINDOW);
    let sum = 0;
    for (let j = start; j <= end; j += 1) sum += pct[j];
    return sum / (end - start + 1);
  });

  // 3. Monotonie décroissante (minimum courant), en partant du 100 % initial.
  const curve: { bucket: number; pct: number }[] = [];
  let running = pct[0];
  for (let i = 0; i < RETENTION_BUCKETS; i += 1) {
    if (i > 0) running = Math.min(running, smoothed[i]);
    curve.push({ bucket: i, pct: round1(Math.max(0, Math.min(100, running))) });
  }
  return curve;
}

interface RawVideoDailyRow {
  day: Date;
  views: number;
  watchTimeSec: bigint;
  impressions: number;
  clicks: number;
  likes: number;
  dislikes: number;
  comments: number;
  subsGained: number;
  subsLost: number;
  avgViewPct: number;
  sourceBreakdown: unknown;
  deviceBreakdown: unknown;
  countryBreakdown: unknown;
  ageBreakdown: unknown;
}

export async function getVideoAnalytics(
  channelId: string,
  videoId: string,
  input: AnalyticsRangeInput,
): Promise<VideoAnalyticsDTO> {
  const video = await prisma.video.findFirst({
    where: { id: videoId, channelId, deletedAt: null },
    select: {
      id: true,
      createdAt: true,
      publishedAt: true,
      viewCount: true,
      likeCount: true,
      dislikeCount: true,
      commentCount: true,
      impressions: true,
      clicks: true,
      ctr: true,
      avgWatchSec: true,
      avgWatchPct: true,
    },
  });
  if (!video) throw notFound('Vidéo introuvable pour cette chaîne');

  const range = resolveRange(input, video.publishedAt ?? video.createdAt);

  const [dailyRows, retentionPoints, liveViewers, hourly] = await Promise.all([
    prisma.$queryRaw<RawVideoDailyRow[]>`
      SELECT s."date"             AS day,
             s."views"            AS views,
             s."watchTimeSec"     AS "watchTimeSec",
             s."impressions"      AS impressions,
             s."clicks"           AS clicks,
             s."likes"            AS likes,
             s."dislikes"         AS dislikes,
             s."comments"         AS comments,
             s."subsGained"       AS "subsGained",
             s."subsLost"         AS "subsLost",
             s."avgViewPct"       AS "avgViewPct",
             s."sourceBreakdown"  AS "sourceBreakdown",
             s."deviceBreakdown"  AS "deviceBreakdown",
             s."countryBreakdown" AS "countryBreakdown",
             s."ageBreakdown"     AS "ageBreakdown"
      FROM "video_stats_daily" s
      WHERE s."videoId" = ${videoId}
        AND s."date" >= ${range.fromKey}::date
        AND s."date" <= ${range.toKey}::date
      ORDER BY s."date"
    `,
    prisma.retentionPoint.findMany({
      where: { videoId },
      select: { bucket: true, plays: true },
      orderBy: { bucket: 'asc' },
    }),
    countVideoLiveViewers(videoId),
    getVideoViewsPerHour(videoId, REALTIME_WINDOW_HOURS),
  ]);

  // ── Agrégation des agrégats journaliers ─────────────────────────────────
  const viewsByDay = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const deviceCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const ageCounts = new Map<string, number>();

  let views = 0;
  let watchSec = 0;
  let impressions = 0;
  let clicks = 0;
  let likes = 0;
  let dislikes = 0;
  let comments = 0;
  let subsGained = 0;
  let subsLost = 0;
  let weightedPct = 0;

  for (const row of dailyRows) {
    const dayViews = Number(row.views) || 0;
    const daySec = toNumber(row.watchTimeSec);
    addTo(viewsByDay, dateKey(row.day), dayViews);
    views += dayViews;
    watchSec += daySec;
    impressions += Number(row.impressions) || 0;
    clicks += Number(row.clicks) || 0;
    likes += Number(row.likes) || 0;
    dislikes += Number(row.dislikes) || 0;
    comments += Number(row.comments) || 0;
    subsGained += Number(row.subsGained) || 0;
    subsLost += Number(row.subsLost) || 0;
    weightedPct += (Number(row.avgViewPct) || 0) * dayViews;

    mergeBreakdown(sourceCounts, row.sourceBreakdown);
    mergeBreakdown(deviceCounts, row.deviceBreakdown);
    mergeBreakdown(countryCounts, row.countryBreakdown);
    mergeBreakdown(ageCounts, row.ageBreakdown);
  }

  let avgViewPct = round1(safeRatio(weightedPct, views));

  // ── Repli complet sur le journal des vues ───────────────────────────────
  if (dailyRows.length === 0) {
    const fallbackRows = await prisma.$queryRaw<
      { day: Date; views: bigint; watchTimeSec: bigint; avgPct: number | null }[]
    >`
      SELECT vw."createdAt"::date                    AS day,
             COUNT(*)::bigint                        AS views,
             COALESCE(SUM(vw."watchedSec"), 0)::bigint AS "watchTimeSec",
             AVG(vw."watchPct")::float8              AS "avgPct"
      FROM "views" vw
      WHERE vw."videoId" = ${videoId}
        AND vw."createdAt" >= ${range.from}
        AND vw."createdAt" <= ${range.to}
      GROUP BY 1
      ORDER BY 1
    `;

    for (const row of fallbackRows) {
      const dayViews = toNumber(row.views);
      addTo(viewsByDay, dateKey(row.day), dayViews);
      views += dayViews;
      watchSec += toNumber(row.watchTimeSec);
      weightedPct += (row.avgPct ?? 0) * dayViews;
    }
    avgViewPct = round1(safeRatio(weightedPct, views) || video.avgWatchPct);

    // Les compteurs dénormalisés de la vidéo prennent le relais pour les
    // métriques que le journal des vues ne porte pas.
    impressions = toNumber(video.impressions);
    clicks = toNumber(video.clicks);
    likes = video.likeCount;
    dislikes = video.dislikeCount;
    comments = video.commentCount;
  }

  // ── Répartitions : repli sur un groupBy de `View` ───────────────────────
  if (
    sourceCounts.size === 0 &&
    deviceCounts.size === 0 &&
    countryCounts.size === 0 &&
    ageCounts.size === 0
  ) {
    const where = { videoId, createdAt: { gte: range.from, lte: range.to } };
    const [bySource, byDevice, byCountry, byAge] = await Promise.all([
      prisma.view.groupBy({ by: ['source'], where, _count: { _all: true } }),
      prisma.view.groupBy({ by: ['device'], where, _count: { _all: true } }),
      prisma.view.groupBy({ by: ['country'], where, _count: { _all: true } }),
      prisma.view.groupBy({ by: ['ageBucket'], where, _count: { _all: true } }),
    ]);
    for (const r of bySource) addTo(sourceCounts, r.source, r._count._all);
    for (const r of byDevice) addTo(deviceCounts, r.device, r._count._all);
    for (const r of byCountry) if (r.country) addTo(countryCounts, r.country, r._count._all);
    for (const r of byAge) if (r.ageBucket) addTo(ageCounts, r.ageBucket, r._count._all);
  }

  // ── Pays : top 10 + regroupement « Autres » ─────────────────────────────
  const countryRows = toDistribution(countryCounts);
  const topCountries = countryRows.slice(0, 10);
  const restCountries = countryRows.slice(10);
  if (restCountries.length > 0) {
    topCountries.push({
      key: OTHER_COUNTRIES_LABEL,
      views: restCountries.reduce((sum, c) => sum + c.views, 0),
      pct: round1(restCountries.reduce((sum, c) => sum + c.pct, 0)),
    });
  }

  return {
    videoId: video.id,
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    totals: {
      views,
      watchTimeHours: toHours(watchSec),
      avgViewDurationSec: Math.round(safeRatio(watchSec, views) || video.avgWatchSec),
      avgViewPct,
      impressions,
      // CTR en RATIO 0..1, cohérent avec `Video.ctr`.
      ctr: round4(safeRatio(clicks, impressions)),
      likes,
      dislikes,
      comments,
      subsGained,
      subsLost,
    },
    viewsOverTime: fillDailySeries(viewsByDay, range.days),
    retention: buildRetentionCurve(retentionPoints),
    trafficSources: toDistribution<TrafficSource>(sourceCounts, TRAFFIC_SOURCES).map((r) => ({
      source: r.key,
      views: r.views,
      pct: r.pct,
    })),
    devices: toDistribution<DeviceType>(deviceCounts, DEVICE_TYPES).map((r) => ({
      device: r.key,
      views: r.views,
      pct: r.pct,
    })),
    countries: topCountries.map((r) => ({ country: r.key, views: r.views, pct: r.pct })),
    ageGroups: toDistribution(ageCounts).map((r) => ({ bucket: r.key, pct: r.pct })),
    realtime: { liveViewers, perHour: hourly.perHour },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. GET /studio/:channelId/subscribers
// ═══════════════════════════════════════════════════════════════════════════

export interface StudioSubscribersDTO {
  /** Abonnés actuels de la chaîne. */
  total: number;
  /** Abonnés gagnés sur la période. */
  gained: number;
  /** Abonnés perdus sur la période. */
  lost: number;
  /** Solde NET par jour (gagnés − perdus), trous comblés à 0. */
  series: TimeSeriesPointDTO[];
  /** Vidéos qui ont fait gagner (ou perdre) le plus d'abonnés. */
  byVideo: { video: VideoCardDTO; gained: number; lost: number }[];
}

const SUBSCRIBERS_BY_VIDEO_LIMIT = 20;

export async function getSubscriberAnalytics(
  channelId: string,
  input: AnalyticsRangeInput,
): Promise<StudioSubscribersDTO> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { createdAt: true, subscriberCount: true },
  });
  if (!channel) throw notFound('Chaîne introuvable');

  const range = resolveRange(input, channel.createdAt);

  const [deltas, byVideoRows] = await Promise.all([
    loadSubscriberDeltas(channelId, range),
    prisma.$queryRaw<{ videoId: string; gained: bigint; lost: bigint }[]>`
      SELECT s."videoId"                  AS "videoId",
             SUM(s."subsGained")::bigint  AS gained,
             SUM(s."subsLost")::bigint    AS lost
      FROM "video_stats_daily" s
      JOIN "videos" v ON v."id" = s."videoId"
      WHERE v."channelId" = ${channelId}
        AND v."deletedAt" IS NULL
        AND s."date" >= ${range.fromKey}::date
        AND s."date" <= ${range.toKey}::date
      GROUP BY s."videoId"
      HAVING SUM(s."subsGained") > 0 OR SUM(s."subsLost") > 0
      ORDER BY (SUM(s."subsGained") - SUM(s."subsLost")) DESC
      LIMIT ${SUBSCRIBERS_BY_VIDEO_LIMIT}
    `,
  ]);

  let byVideo: StudioSubscribersDTO['byVideo'] = [];
  if (byVideoRows.length > 0) {
    const videos = await prisma.video.findMany({
      where: { id: { in: byVideoRows.map((r) => r.videoId) } },
      select: videoCardSelect,
    });
    const byId = new Map(videos.map((v) => [v.id, v]));
    byVideo = byVideoRows.flatMap((row) => {
      const video = byId.get(row.videoId);
      if (!video) return [];
      return [
        {
          video: toVideoCard(video),
          gained: toNumber(row.gained),
          lost: toNumber(row.lost),
        },
      ];
    });
  }

  return {
    total: channel.subscriberCount,
    gained: deltas.gained,
    lost: deltas.lost,
    series: fillDailySeries(deltas.netByDay, range.days),
    byVideo,
  };
}
