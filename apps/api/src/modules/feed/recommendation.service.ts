import { Prisma, prisma } from '@kelvyntube/db';
import {
  REDIS_KEYS,
  type CategoryDTO,
  type CursorPage,
  type FeedChipDTO,
  type HomeFeedDTO,
  type VideoCardDTO,
} from '@kelvyntube/shared';
import { redis } from '../../lib/redis.js';
import { decodeCursor, encodeCursor } from '../../lib/http.js';
import { toCategoryDTO, toVideoCard, videoCardSelect } from '../../lib/serializers.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MOTEUR DE RECOMMANDATION « TEST & SCALE »
 *
 *  Principe (façon YouTube / TikTok) :
 *   1. TEST   — toute vidéo fraîchement publiée reçoit une petite audience
 *               garantie (bucket « exploration » + bonus de découverte dans le
 *               hotScore). Personne ne démarre à zéro impression.
 *   2. MESURE — CTR, rétention, engagement et vitesse d'acquisition sont
 *               mesurés sur cette petite audience.
 *   3. SCALE  — si les signaux sont bons, le hotScore monte et la vidéo entre
 *               dans les buckets « tendances » et « personnalisé », donc face
 *               à une audience de plus en plus large.
 *   4. DECAY  — une gravité temporelle fait redescendre les vidéos anciennes
 *               pour laisser la place aux suivantes.
 *
 *  Toutes les fonctions de scoring sont PURES et testables sans base.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Paramètres du score ───────────────────────────────────────────────────

/** CTR considéré comme excellent sur une miniature (10 %). */
const CTR_TARGET = 0.1;
/** Rétention moyenne considérée comme excellente (50 % de la vidéo). */
const RETENTION_TARGET = 0.5;
/** Taux d'engagement excellent : (likes + commentaires) / vues = 5 %. */
const ENGAGEMENT_TARGET = 0.05;
/** Vitesse d'acquisition excellente : 50 vues / heure sur les premières heures. */
const VELOCITY_TARGET = 50;
/** Plafond de normalisation d'un signal (un signal ne peut pas tout emporter). */
const SIGNAL_CAP = 1.5;
/** Qualité « neutre » supposée tant qu'on n'a pas assez d'impressions. */
const NEUTRAL_QUALITY = 0.5;
/** Prior bayésien : nb d'impressions à partir duquel on croit les signaux. */
const CONFIDENCE_PRIOR = 50;
/** Exposant de la décroissance temporelle (Hacker News utilise 1.8). */
const GRAVITY_EXPONENT = 1.4;
/** Fenêtre pendant laquelle une vidéo est « en test ». */
const DISCOVERY_WINDOW_HOURS = 48;
/** Impressions considérées comme un test complet. */
const MIN_TEST_IMPRESSIONS = 1000;
/** Multiplicateur maximal du boost de découverte (+150 %). */
const DISCOVERY_MAX_BOOST = 1.5;

// ── Paramètres du feed ────────────────────────────────────────────────────

/** Mélange pondéré du feed d'accueil. */
export const HOME_FEED_MIX = {
  personalized: 0.4,
  trending: 0.3,
  subscriptions: 0.2,
  exploration: 0.1,
} as const;

/** Mélange de la sidebar « vidéos suggérées ». */
export const RELATED_MIX = {
  sameChannel: 0.25,
  sameTopic: 0.35,
  hot: 0.25,
  history: 0.15,
} as const;

/** Taille du vivier calculé puis mis en cache (≈ 8 pages). */
const CANDIDATE_POOL = 200;
/** Cache des feeds (secondes). */
const FEED_CACHE_TTL = 60;
/** Nombre maximum de vidéos d'une même chaîne dans une même page. */
const MAX_PER_CHANNEL_PER_PAGE = 2;
/** Une vidéo est considérée « vue » au-delà de ce pourcentage. */
const SEEN_RATIO = 0.9;
/** Au-delà de ce nombre d'impressions, une vidéo n'est plus « à tester ». */
const EXPLORATION_MAX_IMPRESSIONS = 500;
/** Fenêtre de fraîcheur du bucket exploration. */
const EXPLORATION_WINDOW_DAYS = 7;
/** Fenêtre des vidéos éligibles aux tendances. */
const TRENDING_WINDOW_DAYS = 30;
/** Nombre de Shorts dans la rangée du feed d'accueil. */
const SHORTS_ROW_SIZE = 10;
/** Badge « Nouveau » : vidéo d'une chaîne suivie publiée depuis moins de X jours. */
const NEW_BADGE_DAYS = 14;

// ═══════════════════════════════════════════════════════════════════════════
//  1. SCORE DE DISTRIBUTION
// ═══════════════════════════════════════════════════════════════════════════

export interface HotScoreInput {
  publishedAt: Date | null;
  createdAt: Date;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  impressions: number;
  clicks: number;
  /** Rétention moyenne, fraction 0..1. */
  avgWatchPct: number;
}

const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

/**
 * Score de distribution d'une vidéo.
 *
 * ┌── QUALITÉ (0..1,5) — ce que le public fait de la vidéo ─────────────────┐
 * │  ctrNorm        = min(ctr / 10 %, 1.5)                    poids 0.30    │
 * │  retentionNorm  = min(avgWatchPct / 50 %, 1.5)            poids 0.30    │
 * │  engagementNorm = min(engagement / 5 %, 1.5)              poids 0.20    │
 * │  velocityNorm   = log1p(vues/h) / log1p(50)               poids 0.20    │
 * │  → quality = Σ (signal × poids)                                         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * CONFIANCE : avec 3 impressions, un CTR de 100 % ne veut rien dire. On lisse
 * donc vers une qualité neutre tant que l'échantillon est petit :
 *   confidence = impressions / (impressions + 50)
 *   quality'   = confidence × quality + (1 − confidence) × 0.5
 *
 * MASSE : log10(vues + 10) — une vidéo à 1 M de vues pèse 6× une vidéo à 0,
 * pas 1 000 000× (sinon effet boule de neige et aucune rotation du feed).
 *
 * GRAVITÉ (Hacker News) : 1 / (heures + 2)^1.4 — décroissance douce, une
 * vidéo de 24 h vaut ~11 % d'une vidéo d'une heure à qualité égale.
 *
 * BOOST DE DÉCOUVERTE — le cœur du « test & scale » :
 *   coverage  = min(impressions / 1000, 1)   ← part du test déjà consommée
 *   freshness = max(1 − heures / 48, 0)      ← la fenêtre de test dure 48 h
 *   discovery = 1.5 × (1 − coverage) × freshness
 * Une vidéo publiée il y a 1 h avec 0 impression est donc multipliée par 2,5 :
 * elle est *garantie* d'être servie à une petite audience. Le boost s'éteint
 * automatiquement à mesure que les impressions arrivent — le test ne devient
 * jamais un passe-droit permanent.
 *
 * hotScore = 1000 × masse × (0.5 + quality') × gravité × (1 + discovery)
 */
export function computeHotScore(v: HotScoreInput, now: Date = new Date()): number {
  const published = v.publishedAt ?? v.createdAt;
  const hours = Math.max(0, (now.getTime() - published.getTime()) / 3_600_000);

  const impressions = Math.max(0, v.impressions);
  const views = Math.max(0, v.viewCount);

  const ctr = impressions > 0 ? v.clicks / impressions : 0;
  const engagement = (Math.max(0, v.likeCount) + Math.max(0, v.commentCount)) / Math.max(views, 1);
  const velocity = views / Math.max(hours, 1);

  const ctrNorm = clamp(ctr / CTR_TARGET, 0, SIGNAL_CAP);
  const retentionNorm = clamp(v.avgWatchPct / RETENTION_TARGET, 0, SIGNAL_CAP);
  const engagementNorm = clamp(engagement / ENGAGEMENT_TARGET, 0, SIGNAL_CAP);
  const velocityNorm = clamp(Math.log1p(velocity) / Math.log1p(VELOCITY_TARGET), 0, SIGNAL_CAP);

  const quality =
    0.3 * ctrNorm + 0.3 * retentionNorm + 0.2 * engagementNorm + 0.2 * velocityNorm;

  const confidence = impressions / (impressions + CONFIDENCE_PRIOR);
  const adjustedQuality = confidence * quality + (1 - confidence) * NEUTRAL_QUALITY;

  const mass = Math.log10(views + 10);
  const gravity = 1 / Math.pow(hours + 2, GRAVITY_EXPONENT);

  const coverage = clamp(impressions / MIN_TEST_IMPRESSIONS, 0, 1);
  const freshness = clamp(1 - hours / DISCOVERY_WINDOW_HOURS, 0, 1);
  const discovery = DISCOVERY_MAX_BOOST * (1 - coverage) * freshness;

  const score = 1000 * mass * (0.5 + adjustedQuality) * gravity * (1 + discovery);
  return Number.isFinite(score) ? Math.max(0, score) : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. VIVIERS DE CANDIDATS (SQL paramétré, jamais d'interpolation)
// ═══════════════════════════════════════════════════════════════════════════

interface Candidate {
  id: string;
  channelId: string;
  categoryId: string | null;
  score: number;
}

interface CandidateRow {
  id: string;
  channelId: string;
  categoryId: string | null;
  score: number | string | null;
}

interface BucketScope {
  now: Date;
  kind: 'LONG' | 'SHORT';
  categoryId: string | null;
  excludeIds: string[];
  excludeChannelIds: string[];
  take: number;
}

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

async function runCandidates(sql: Prisma.Sql): Promise<Candidate[]> {
  const rows = await prisma.$queryRaw<CandidateRow[]>(sql);
  return rows.map((r) => ({
    id: r.id,
    channelId: r.channelId,
    categoryId: r.categoryId,
    score: Number(r.score ?? 0),
  }));
}

/** Filtres communs à TOUS les buckets : seules les vidéos réellement publiques. */
function baseFilters(scope: BucketScope): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`v."deletedAt" IS NULL`,
    Prisma.sql`v."status"::text = 'READY'`,
    Prisma.sql`v."visibility"::text = 'PUBLIC'`,
    Prisma.sql`v."publishedAt" IS NOT NULL`,
    Prisma.sql`v."publishedAt" <= ${scope.now}`,
    Prisma.sql`v."kind"::text = ${scope.kind}`,
  ];
  if (scope.categoryId) parts.push(Prisma.sql`v."categoryId" = ${scope.categoryId}`);
  if (scope.excludeIds.length) {
    parts.push(Prisma.sql`v."id" NOT IN (${Prisma.join(scope.excludeIds)})`);
  }
  if (scope.excludeChannelIds.length) {
    parts.push(Prisma.sql`v."channelId" NOT IN (${Prisma.join(scope.excludeChannelIds)})`);
  }
  return Prisma.join(parts, ' AND ');
}

/** 30 % — tendances globales : le meilleur hotScore du moment. */
function trendingSql(scope: BucketScope): Prisma.Sql {
  return Prisma.sql`
    SELECT v."id", v."channelId", v."categoryId", v."hotScore" AS score
    FROM "videos" v
    WHERE ${baseFilters(scope)}
      AND v."publishedAt" >= ${daysAgo(scope.now, TRENDING_WINDOW_DAYS)}
    ORDER BY v."hotScore" DESC, v."publishedAt" DESC
    LIMIT ${scope.take}
  `;
}

/**
 * 40 % — personnalisé : catégories d'intérêt + catégories de l'historique
 * récent + chaînes « proches » des abonnements (co-abonnement).
 */
function personalizedSql(
  scope: BucketScope,
  categoryIds: string[],
  channelIds: string[],
): Prisma.Sql | null {
  const affinity: Prisma.Sql[] = [];
  if (categoryIds.length) {
    affinity.push(Prisma.sql`v."categoryId" IN (${Prisma.join(categoryIds)})`);
  }
  if (channelIds.length) {
    affinity.push(Prisma.sql`v."channelId" IN (${Prisma.join(channelIds)})`);
  }
  if (!affinity.length) return null;

  // Une chaîne proche d'un abonnement pèse un peu plus qu'une simple
  // correspondance de catégorie.
  const boost = channelIds.length
    ? Prisma.sql`CASE WHEN v."channelId" IN (${Prisma.join(channelIds)}) THEN 1.25 ELSE 1 END`
    : Prisma.sql`1`;

  return Prisma.sql`
    SELECT v."id", v."channelId", v."categoryId", (v."hotScore" * ${boost}) AS score
    FROM "videos" v
    WHERE ${baseFilters(scope)}
      AND (${Prisma.join(affinity, ' OR ')})
      AND v."publishedAt" >= ${daysAgo(scope.now, 90)}
    ORDER BY score DESC, v."publishedAt" DESC
    LIMIT ${scope.take}
  `;
}

/** 20 % — nouveautés des abonnements jamais ouvertes. */
function subscriptionsSql(
  scope: BucketScope,
  userId: string,
  subscribedChannelIds: string[],
): Prisma.Sql | null {
  if (!subscribedChannelIds.length) return null;
  return Prisma.sql`
    SELECT v."id", v."channelId", v."categoryId", v."hotScore" AS score
    FROM "videos" v
    WHERE ${baseFilters(scope)}
      AND v."channelId" IN (${Prisma.join(subscribedChannelIds)})
      AND v."publishedAt" >= ${daysAgo(scope.now, TRENDING_WINDOW_DAYS)}
      AND NOT EXISTS (
        SELECT 1 FROM "watch_history" wh
        WHERE wh."videoId" = v."id" AND wh."userId" = ${userId}
      )
    ORDER BY v."publishedAt" DESC
    LIMIT ${scope.take}
  `;
}

/**
 * 10 % — exploration : les vidéos récentes les MOINS exposées passent devant.
 * C'est le mécanisme concret qui garantit une portée organique à tout le monde.
 */
function explorationSql(scope: BucketScope): Prisma.Sql {
  return Prisma.sql`
    SELECT v."id", v."channelId", v."categoryId", v."hotScore" AS score
    FROM "videos" v
    WHERE ${baseFilters(scope)}
      AND v."publishedAt" >= ${daysAgo(scope.now, EXPLORATION_WINDOW_DAYS)}
      AND v."impressions" < ${EXPLORATION_MAX_IMPRESSIONS}
    ORDER BY v."impressions" ASC, v."hotScore" DESC
    LIMIT ${scope.take}
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. PROFIL UTILISATEUR
// ═══════════════════════════════════════════════════════════════════════════

interface UserAffinity {
  /** Catégories issues des `interests` + de l'historique récent. */
  categoryIds: string[];
  subscribedChannelIds: string[];
  /** Chaînes proches des abonnements (co-abonnement). */
  nearbyChannelIds: string[];
  /** Vidéos déjà vues à plus de 90 % → exclues du feed. */
  seenVideoIds: string[];
  /** Chaînes de l'utilisateur → on ne lui recommande pas ses propres vidéos. */
  ownChannelIds: string[];
}

const EMPTY_AFFINITY: UserAffinity = {
  categoryIds: [],
  subscribedChannelIds: [],
  nearbyChannelIds: [],
  seenVideoIds: [],
  ownChannelIds: [],
};

/** Vidéos consommées à plus de {@link SEEN_RATIO} (ou marquées terminées). */
async function getSeenVideoIds(userId: string, limit = 500): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT wh."videoId" AS id
    FROM "watch_history" wh
    JOIN "videos" v ON v."id" = wh."videoId"
    WHERE wh."userId" = ${userId}
      AND (
        wh."completed" = true
        OR wh."positionSec"::float >= ${SEEN_RATIO} * GREATEST(v."durationSec", 1)
      )
    ORDER BY wh."watchedAt" DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => r.id);
}

async function getUserAffinity(userId: string, now: Date): Promise<UserAffinity> {
  const [user, subscriptions, ownChannels, seenVideoIds] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { interests: true } }),
    prisma.subscription.findMany({ where: { subscriberId: userId }, select: { channelId: true } }),
    prisma.channel.findMany({ where: { ownerId: userId }, select: { id: true } }),
    getSeenVideoIds(userId),
  ]);

  const subscribedChannelIds = subscriptions.map((s) => s.channelId);

  // Catégories : centres d'intérêt déclarés à l'onboarding…
  const interestSlugs = user?.interests ?? [];
  const interestCategories = interestSlugs.length
    ? await prisma.category.findMany({
        where: { slug: { in: interestSlugs } },
        select: { id: true },
      })
    : [];

  // …+ catégories réellement consommées ces 30 derniers jours (signal fort).
  const historyCategories = await prisma.$queryRaw<{ id: string; n: number }[]>(Prisma.sql`
    SELECT v."categoryId" AS id, COUNT(*)::int AS n
    FROM "watch_history" wh
    JOIN "videos" v ON v."id" = wh."videoId"
    WHERE wh."userId" = ${userId}
      AND wh."watchedAt" >= ${daysAgo(now, TRENDING_WINDOW_DAYS)}
      AND v."categoryId" IS NOT NULL
    GROUP BY v."categoryId"
    ORDER BY n DESC
    LIMIT 6
  `);

  // Chaînes proches : « les abonnés de tes chaînes suivent aussi… »
  const nearby = subscribedChannelIds.length
    ? await prisma.$queryRaw<{ id: string; n: number }[]>(Prisma.sql`
        SELECT s2."channelId" AS id, COUNT(*)::int AS n
        FROM "subscriptions" s1
        JOIN "subscriptions" s2
          ON s2."subscriberId" = s1."subscriberId"
         AND s2."channelId" <> s1."channelId"
        WHERE s1."channelId" IN (${Prisma.join(subscribedChannelIds)})
          AND s2."channelId" NOT IN (${Prisma.join(subscribedChannelIds)})
        GROUP BY s2."channelId"
        ORDER BY n DESC
        LIMIT 20
      `)
    : [];

  const categoryIds = [
    ...new Set([...interestCategories.map((c) => c.id), ...historyCategories.map((c) => c.id)]),
  ];

  return {
    categoryIds,
    subscribedChannelIds,
    nearbyChannelIds: nearby.map((n) => n.id),
    seenVideoIds,
    ownChannelIds: ownChannels.map((c) => c.id),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. MÉLANGE PONDÉRÉ
// ═══════════════════════════════════════════════════════════════════════════

interface WeightedBucket {
  rows: Candidate[];
  weight: number;
}

/**
 * Fusionne les buckets en respectant leurs quotas, en dédupliquant et en
 * limitant chaque chaîne à {@link MAX_PER_CHANNEL_PER_PAGE} vidéos par page.
 * Le plafond est appliqué par fenêtre de `pageSize` : une chaîne peut donc
 * réapparaître à la page suivante, jamais trois fois d'affilée.
 */
export function weightedMerge(
  buckets: WeightedBucket[],
  total: number,
  pageSize: number,
  maxPerChannel = MAX_PER_CHANNEL_PER_PAGE,
): Candidate[] {
  const pools = buckets.map((b) => ({ rows: [...b.rows], weight: b.weight }));
  const quotas = pools.map((b) => Math.max(1, Math.round(total * b.weight)));
  const taken = pools.map(() => 0);

  const out: Candidate[] = [];
  const used = new Set<string>();
  const channelInPage = new Map<string, number>();
  let pageStart = 0;

  const rollWindow = () => {
    if (out.length - pageStart >= pageSize) {
      channelInPage.clear();
      pageStart = out.length;
    }
  };

  const allowed = (channelId: string): boolean => {
    rollWindow();
    return (channelInPage.get(channelId) ?? 0) < maxPerChannel;
  };

  const push = (c: Candidate) => {
    rollWindow();
    channelInPage.set(c.channelId, (channelInPage.get(c.channelId) ?? 0) + 1);
    used.add(c.id);
    out.push(c);
  };

  /** Retire et renvoie le premier candidat acceptable du bucket. */
  const draw = (index: number): Candidate | null => {
    const rows = pools[index].rows;
    for (let i = 0; i < rows.length; i += 1) {
      const candidate = rows[i];
      if (used.has(candidate.id)) {
        rows.splice(i, 1);
        i -= 1;
        continue;
      }
      if (allowed(candidate.channelId)) {
        rows.splice(i, 1);
        return candidate;
      }
    }
    return null;
  };

  let guard = 0;
  while (out.length < total && guard < total * 4) {
    guard += 1;
    let progressed = false;

    // Passe 1 : chacun dans son quota.
    for (let i = 0; i < pools.length && out.length < total; i += 1) {
      if (taken[i] >= quotas[i]) continue;
      const candidate = draw(i);
      if (!candidate) continue;
      push(candidate);
      taken[i] += 1;
      progressed = true;
    }

    // Passe 2 : quotas ignorés, on complète la page avec ce qui reste.
    if (!progressed) {
      let filled = false;
      for (let i = 0; i < pools.length && out.length < total; i += 1) {
        const candidate = draw(i);
        if (!candidate) continue;
        push(candidate);
        taken[i] += 1;
        filled = true;
      }
      if (!filled) break;
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  5. HYDRATATION → VideoCardDTO
// ═══════════════════════════════════════════════════════════════════════════

async function hydrate(ids: string[], userId: string | null): Promise<VideoCardDTO[]> {
  if (!ids.length) return [];

  const videos = await prisma.video.findMany({
    where: { id: { in: ids } },
    select: { ...videoCardSelect, channelId: true },
  });

  const historyByVideo = new Map<string, number>();
  const subscribed = new Set<string>();

  if (userId) {
    const [history, subs] = await Promise.all([
      prisma.watchHistory.findMany({
        where: { userId, videoId: { in: ids } },
        select: { videoId: true, positionSec: true },
      }),
      prisma.subscription.findMany({
        where: { subscriberId: userId, channelId: { in: videos.map((v) => v.channelId) } },
        select: { channelId: true },
      }),
    ]);
    for (const h of history) historyByVideo.set(h.videoId, h.positionSec);
    for (const s of subs) subscribed.add(s.channelId);
  }

  const newThreshold = Date.now() - NEW_BADGE_DAYS * 86_400_000;
  const byId = new Map(videos.map((v) => [v.id, v]));

  return ids
    .map((id) => byId.get(id))
    .filter((v): v is (typeof videos)[number] => Boolean(v))
    .map((v) => {
      const position = historyByVideo.get(v.id);
      const watchedPct =
        position && v.durationSec > 0
          ? Math.min(100, Math.round((position / v.durationSec) * 100))
          : undefined;
      const isNew =
        subscribed.has(v.channelId) &&
        position === undefined &&
        Boolean(v.publishedAt && v.publishedAt.getTime() >= newThreshold);
      return toVideoCard(v, {
        ...(watchedPct !== undefined ? { watchedPct } : {}),
        ...(isNew ? { isNew: true } : {}),
      });
    });
}

/** Découpe un vivier en page et fabrique le `CursorPage`. */
async function paginate(
  candidates: Candidate[],
  page: number,
  limit: number,
  userId: string | null,
): Promise<CursorPage<VideoCardDTO>> {
  const start = page * limit;
  const slice = candidates.slice(start, start + limit);
  const items = await hydrate(
    slice.map((c) => c.id),
    userId,
  );
  const hasMore = candidates.length > start + limit;
  return {
    items,
    nextCursor: hasMore ? encodeCursor({ p: page + 1 }) : null,
    hasMore,
  };
}

function readPage(cursor?: string): number {
  const decoded = decodeCursor<{ p?: number }>(cursor);
  const page = Number(decoded?.p ?? 0);
  return Number.isFinite(page) && page >= 0 ? Math.floor(page) : 0;
}

// ── Cache du vivier ───────────────────────────────────────────────────────

async function cachedCandidates(
  key: string,
  build: () => Promise<Candidate[]>,
): Promise<Candidate[]> {
  const cached = await redis.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as Candidate[];
    } catch {
      /* cache corrompu : on recalcule */
    }
  }
  const candidates = await build();
  await redis.set(key, JSON.stringify(candidates), 'EX', FEED_CACHE_TTL);
  return candidates;
}

// ═══════════════════════════════════════════════════════════════════════════
//  6. FEED D'ACCUEIL
// ═══════════════════════════════════════════════════════════════════════════

export interface HomeFeedParams {
  userId: string | null;
  categorySlug?: string;
  cursor?: string;
  limit: number;
}

async function resolveCategoryId(slug?: string): Promise<string | null> {
  if (!slug || slug === 'all') return null;
  const category = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
  return category?.id ?? null;
}

/**
 * Construit le vivier du feed d'accueil.
 * Connecté  : 40 % perso / 30 % tendances / 20 % abonnements / 10 % exploration.
 * Anonyme   : tendances + nouveautés uniquement (aucun signal personnel).
 */
async function buildHomeCandidates(
  userId: string | null,
  categoryId: string | null,
  now: Date,
): Promise<Candidate[]> {
  const affinity = userId ? await getUserAffinity(userId, now) : EMPTY_AFFINITY;

  const scope: BucketScope = {
    now,
    kind: 'LONG',
    categoryId,
    excludeIds: affinity.seenVideoIds,
    excludeChannelIds: affinity.ownChannelIds,
    take: CANDIDATE_POOL,
  };

  if (!userId) {
    // Visiteur anonyme : tendances + nouveautés, rien de personnalisé.
    const [trending, fresh] = await Promise.all([
      runCandidates(trendingSql(scope)),
      runCandidates(explorationSql({ ...scope, take: Math.round(CANDIDATE_POOL / 2) })),
    ]);
    return weightedMerge(
      [
        { rows: trending, weight: 0.7 },
        { rows: fresh, weight: 0.3 },
      ],
      CANDIDATE_POOL,
      24,
    );
  }

  const personalized = personalizedSql(scope, affinity.categoryIds, affinity.nearbyChannelIds);
  const subscriptions = subscriptionsSql(scope, userId, affinity.subscribedChannelIds);

  const [personalizedRows, trendingRows, subscriptionRows, explorationRows] = await Promise.all([
    personalized ? runCandidates(personalized) : Promise.resolve([]),
    runCandidates(trendingSql(scope)),
    subscriptions ? runCandidates(subscriptions) : Promise.resolve([]),
    runCandidates(explorationSql(scope)),
  ]);

  return weightedMerge(
    [
      { rows: personalizedRows, weight: HOME_FEED_MIX.personalized },
      { rows: trendingRows, weight: HOME_FEED_MIX.trending },
      { rows: subscriptionRows, weight: HOME_FEED_MIX.subscriptions },
      { rows: explorationRows, weight: HOME_FEED_MIX.exploration },
    ],
    CANDIDATE_POOL,
    24,
  );
}

/** Rangée de Shorts insérée dans la grille d'accueil. */
async function getShortsRow(userId: string | null, now: Date): Promise<VideoCardDTO[]> {
  const key = `kt:feed:shortsrow:${userId ?? 'anon'}`;
  const candidates = await cachedCandidates(key, async () => {
    const seen = userId ? await getSeenVideoIds(userId, 200) : [];
    return runCandidates(
      trendingSql({
        now,
        kind: 'SHORT',
        categoryId: null,
        excludeIds: seen,
        excludeChannelIds: [],
        take: SHORTS_ROW_SIZE,
      }),
    );
  });
  return hydrate(
    candidates.slice(0, SHORTS_ROW_SIZE).map((c) => c.id),
    userId,
  );
}

/** Chips = « Tout » + catégories réellement présentes dans le vivier. */
async function buildChips(candidates: Candidate[]): Promise<FeedChipDTO[]> {
  const ids = [...new Set(candidates.map((c) => c.categoryId).filter((id): id is string => !!id))];
  const chips: FeedChipDTO[] = [{ slug: 'all', label: 'Tout' }];
  if (!ids.length) return chips;

  const categories = await prisma.category.findMany({
    where: { id: { in: ids } },
    orderBy: { order: 'asc' },
    select: { slug: true, name: true },
  });
  for (const c of categories) chips.push({ slug: c.slug, label: c.name });
  return chips;
}

/** GET /feed/home */
export async function getHomeFeed(params: HomeFeedParams): Promise<HomeFeedDTO> {
  const now = new Date();
  const slug = params.categorySlug && params.categorySlug !== 'all' ? params.categorySlug : 'all';
  const categoryId = await resolveCategoryId(slug);
  const page = readPage(params.cursor);

  const cacheKey = REDIS_KEYS.homeFeed(params.userId ?? 'anon', slug);
  const candidates = await cachedCandidates(cacheKey, () =>
    buildHomeCandidates(params.userId, categoryId, now),
  );

  const [videos, chips, shortsRow] = await Promise.all([
    paginate(candidates, page, params.limit, params.userId),
    buildChips(candidates),
    // La rangée de Shorts n'a de sens qu'en tête de feed.
    page === 0 ? getShortsRow(params.userId, now) : Promise.resolve<VideoCardDTO[]>([]),
  ]);

  return { chips, videos, shortsRow };
}

// ═══════════════════════════════════════════════════════════════════════════
//  7. TENDANCES
// ═══════════════════════════════════════════════════════════════════════════

export interface TrendingParams {
  userId: string | null;
  categorySlug?: string;
  cursor?: string;
  limit: number;
}

/** GET /feed/trending — classement pur hotScore, identique pour tout le monde. */
export async function getTrendingFeed(params: TrendingParams): Promise<CursorPage<VideoCardDTO>> {
  const now = new Date();
  const slug = params.categorySlug && params.categorySlug !== 'all' ? params.categorySlug : 'all';
  const categoryId = await resolveCategoryId(slug);
  const page = readPage(params.cursor);

  const candidates = await cachedCandidates(REDIS_KEYS.trending(slug), () =>
    runCandidates(
      trendingSql({
        now,
        kind: 'LONG',
        categoryId,
        excludeIds: [],
        excludeChannelIds: [],
        take: CANDIDATE_POOL,
      }),
    ),
  );

  return paginate(candidates, page, params.limit, params.userId);
}

// ═══════════════════════════════════════════════════════════════════════════
//  8. VIDÉOS SUGGÉRÉES (sidebar de la page de visionnage)
// ═══════════════════════════════════════════════════════════════════════════

export interface RelatedParams {
  videoId: string;
  userId: string | null;
  cursor?: string;
  limit: number;
}

/**
 * GET /videos/:id/related — mélange :
 *   25 % même chaîne · 35 % mêmes tags/catégorie · 25 % performances du moment
 *   · 15 % affinité issue de l'historique de l'utilisateur.
 */
export async function getRelatedVideos(
  params: RelatedParams,
): Promise<CursorPage<VideoCardDTO>> {
  const now = new Date();
  const page = readPage(params.cursor);
  const cacheKey = `kt:feed:related:${params.videoId}:${params.userId ?? 'anon'}`;

  const candidates = await cachedCandidates(cacheKey, async () => {
    const source = await prisma.video.findUnique({
      where: { id: params.videoId },
      select: {
        id: true,
        channelId: true,
        categoryId: true,
        kind: true,
        tags: { select: { tagId: true }, orderBy: { position: 'asc' }, take: 10 },
      },
    });
    if (!source) return [];

    const affinity = params.userId
      ? await getUserAffinity(params.userId, now)
      : EMPTY_AFFINITY;

    const scope: BucketScope = {
      now,
      kind: source.kind,
      categoryId: null,
      // On exclut la vidéo courante ET les vidéos déjà terminées.
      excludeIds: [source.id, ...affinity.seenVideoIds],
      excludeChannelIds: affinity.ownChannelIds,
      take: 60,
    };

    const tagIds = source.tags.map((t) => t.tagId);

    // (a) Même chaîne — la suite logique la plus attendue.
    const sameChannel = runCandidates(Prisma.sql`
      SELECT v."id", v."channelId", v."categoryId", v."hotScore" AS score
      FROM "videos" v
      WHERE ${baseFilters(scope)} AND v."channelId" = ${source.channelId}
      ORDER BY v."publishedAt" DESC
      LIMIT ${scope.take}
    `);

    // (b) Même sujet : tags partagés (pondérés) puis catégorie.
    const sameTopic = tagIds.length
      ? runCandidates(Prisma.sql`
          SELECT v."id", v."channelId", v."categoryId",
                 (COUNT(vt."tagId")::float * 2
                  + CASE WHEN v."categoryId" = ${source.categoryId} THEN 1 ELSE 0 END
                  + LEAST(v."hotScore" / 1000, 2)) AS score
          FROM "videos" v
          JOIN "video_tags" vt ON vt."videoId" = v."id"
          WHERE ${baseFilters(scope)} AND vt."tagId" IN (${Prisma.join(tagIds)})
          GROUP BY v."id", v."channelId", v."categoryId", v."hotScore"
          ORDER BY score DESC
          LIMIT ${scope.take}
        `)
      : source.categoryId
        ? runCandidates(Prisma.sql`
            SELECT v."id", v."channelId", v."categoryId", v."hotScore" AS score
            FROM "videos" v
            WHERE ${baseFilters(scope)} AND v."categoryId" = ${source.categoryId}
            ORDER BY v."hotScore" DESC
            LIMIT ${scope.take}
          `)
        : Promise.resolve<Candidate[]>([]);

    // (c) Performances actuelles, tous sujets confondus.
    const hot = runCandidates(trendingSql(scope));

    // (d) Affinité issue de l'historique / des abonnements.
    const historySql = personalizedSql(
      scope,
      affinity.categoryIds,
      [...affinity.subscribedChannelIds, ...affinity.nearbyChannelIds],
    );
    const history = historySql ? runCandidates(historySql) : Promise.resolve<Candidate[]>([]);

    const [a, b, c, d] = await Promise.all([sameChannel, sameTopic, hot, history]);

    return weightedMerge(
      [
        { rows: a, weight: RELATED_MIX.sameChannel },
        { rows: b, weight: RELATED_MIX.sameTopic },
        { rows: c, weight: RELATED_MIX.hot },
        { rows: d, weight: RELATED_MIX.history },
      ],
      CANDIDATE_POOL,
      params.limit,
      // Sur la sidebar on tolère 3 vidéos de la même chaîne (suite de série).
      3,
    );
  });

  return paginate(candidates, page, params.limit, params.userId);
}

// ═══════════════════════════════════════════════════════════════════════════
//  9. FEED SHORTS
// ═══════════════════════════════════════════════════════════════════════════

export interface ShortsFeedParams {
  userId: string | null;
  cursor?: string;
  limit: number;
  seedVideoId?: string;
}

/**
 * GET /feed/shorts — flux vertical infini.
 * hotScore + exploration (mêmes règles de test & scale), Shorts déjà vus exclus.
 * `seedVideoId` place la vidéo d'entrée en tête (partage d'un Short précis).
 */
export async function getShortsFeed(
  params: ShortsFeedParams,
): Promise<CursorPage<VideoCardDTO>> {
  const now = new Date();
  const page = readPage(params.cursor);
  const cacheKey = `kt:feed:shorts:${params.userId ?? 'anon'}:${params.seedVideoId ?? 'none'}`;

  const candidates = await cachedCandidates(cacheKey, async () => {
    const affinity = params.userId
      ? await getUserAffinity(params.userId, now)
      : EMPTY_AFFINITY;

    const scope: BucketScope = {
      now,
      kind: 'SHORT',
      categoryId: null,
      excludeIds: [
        ...(params.seedVideoId ? [params.seedVideoId] : []),
        ...affinity.seenVideoIds,
      ],
      excludeChannelIds: affinity.ownChannelIds,
      take: CANDIDATE_POOL,
    };

    const personalized = personalizedSql(scope, affinity.categoryIds, affinity.nearbyChannelIds);

    const [hot, exploration, perso] = await Promise.all([
      runCandidates(trendingSql(scope)),
      runCandidates(explorationSql(scope)),
      personalized ? runCandidates(personalized) : Promise.resolve<Candidate[]>([]),
    ]);

    const merged = weightedMerge(
      [
        { rows: perso, weight: 0.4 },
        { rows: hot, weight: 0.4 },
        { rows: exploration, weight: 0.2 },
      ],
      CANDIDATE_POOL,
      params.limit,
      // Un même créateur ne doit pas monopoliser le flux vertical.
      1,
    );

    // Le Short d'entrée reste en première position.
    if (params.seedVideoId) {
      const seed = await prisma.video.findFirst({
        where: { id: params.seedVideoId, deletedAt: null, kind: 'SHORT' },
        select: { id: true, channelId: true, categoryId: true },
      });
      if (seed) {
        merged.unshift({
          id: seed.id,
          channelId: seed.channelId,
          categoryId: seed.categoryId,
          score: Number.MAX_SAFE_INTEGER,
        });
      }
    }
    return merged;
  });

  return paginate(candidates, page, params.limit, params.userId);
}

// ═══════════════════════════════════════════════════════════════════════════
//  10. CATÉGORIES
// ═══════════════════════════════════════════════════════════════════════════

/** GET /feed/categories — chips de navigation, triées par `order`. */
export async function getCategories(): Promise<CategoryDTO[]> {
  const categories = await prisma.category.findMany({ orderBy: { order: 'asc' } });
  return categories.map(toCategoryDTO);
}
