import type { Job } from 'bullmq';
import { Prisma, prisma } from '@kelvyntube/db';
import { REDIS_KEYS } from '@kelvyntube/shared';
import { redis } from '../../lib/redis.js';
import {
  notificationQueue,
  searchQueue,
  type AnalyticsJob,
  type NotificationJob,
  type SearchIndexJob,
} from '../../lib/queue.js';
import { computeHotScore } from '../feed/recommendation.service.js';
import { VIEW_LOG_KEY, type ViewLogEntry } from '../views/views.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  WORKER ANALYTICS
 *   · flush-views          Redis → Postgres (toutes les 15 s)
 *   · rollup-daily         View → VideoStatDaily / ChannelStatDaily
 *   · recompute-hot-scores score de distribution « test & scale »
 *   · refresh-trending-tags hashtags tendances
 *   · publish-scheduled    mise en ligne des vidéos programmées
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function analyticsProcessor(job: Job): Promise<void> {
  const data = job.data as AnalyticsJob;
  switch (data?.type) {
    case 'flush-views':
      return flushViews();
    case 'rollup-daily':
      return rollupDaily(data.date);
    case 'recompute-hot-scores':
      return recomputeHotScores();
    case 'refresh-trending-tags':
      return refreshTrendingTags();
    case 'publish-scheduled':
      return publishScheduled();
    default:
      console.warn('[analytics] type de job inconnu', data);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Utilitaires
// ═══════════════════════════════════════════════════════════════════════════

type CounterMap = Map<string, number>;

/** Minuit UTC du jour d'une date (clé des tables `*_stats_daily`). */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Vide un HASH de façon ATOMIQUE : `HGETALL` + `DEL` dans un MULTI.
 * Aucun incrément ne peut se glisser entre les deux — donc aucune perte.
 */
async function drainHash(key: string): Promise<CounterMap> {
  const res = await redis.multi().hgetall(key).del(key).exec();
  const map: CounterMap = new Map();
  const first = res?.[0];
  if (!first || first[0]) return map;
  const payload = (first[1] ?? {}) as Record<string, string>;
  for (const [field, value] of Object.entries(payload)) {
    const n = Number(value);
    if (Number.isFinite(n) && n !== 0) map.set(field, n);
  }
  return map;
}

/** Vide une LIST de façon atomique (`LRANGE` + `DEL`). */
async function drainList(key: string): Promise<string[]> {
  const res = await redis.multi().lrange(key, 0, -1).del(key).exec();
  const first = res?.[0];
  if (!first || first[0]) return [];
  return (first[1] ?? []) as string[];
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. FLUSH DES COMPTEURS  (Redis → Postgres)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Déverse les tampons Redis dans Postgres.
 *
 * Robustesse : si la transaction échoue, TOUS les compteurs prélevés sont
 * réinjectés dans Redis (HINCRBY / RPUSH) avant que l'erreur ne remonte à
 * BullMQ. Un incident base de données ne fait donc perdre aucune vue —
 * le prochain passage rejouera les deltas.
 */
async function flushViews(): Promise<void> {
  const [views, watchTime, impressions, clicks, retention] = await Promise.all([
    drainHash(REDIS_KEYS.viewBuffer),
    drainHash(REDIS_KEYS.watchTimeBuffer),
    drainHash(REDIS_KEYS.impressionBuffer),
    drainHash(REDIS_KEYS.clickBuffer),
    drainHash(REDIS_KEYS.retentionBuffer),
  ]);
  const rawLog = await drainList(VIEW_LOG_KEY);

  if (
    !views.size &&
    !watchTime.size &&
    !impressions.size &&
    !clicks.size &&
    !retention.size &&
    !rawLog.length
  ) {
    return;
  }

  try {
    await applyFlush({ views, watchTime, impressions, clicks, retention, rawLog });
  } catch (err) {
    await reinject({ views, watchTime, impressions, clicks, retention, rawLog });
    throw err;
  }
}

interface FlushPayload {
  views: CounterMap;
  watchTime: CounterMap;
  impressions: CounterMap;
  clicks: CounterMap;
  /** Clé = `<videoId>:<bucket>` */
  retention: CounterMap;
  rawLog: string[];
}

/** Réinjection intégrale des compteurs en cas d'échec d'écriture. */
async function reinject(payload: FlushPayload): Promise<void> {
  try {
    const pipeline = redis.pipeline();
    for (const [field, n] of payload.views) pipeline.hincrby(REDIS_KEYS.viewBuffer, field, n);
    for (const [field, n] of payload.watchTime) {
      pipeline.hincrby(REDIS_KEYS.watchTimeBuffer, field, n);
    }
    for (const [field, n] of payload.impressions) {
      pipeline.hincrby(REDIS_KEYS.impressionBuffer, field, n);
    }
    for (const [field, n] of payload.clicks) pipeline.hincrby(REDIS_KEYS.clickBuffer, field, n);
    for (const [field, n] of payload.retention) {
      pipeline.hincrby(REDIS_KEYS.retentionBuffer, field, n);
    }
    if (payload.rawLog.length) pipeline.rpush(VIEW_LOG_KEY, ...payload.rawLog);
    await pipeline.exec();
  } catch (err) {
    console.error('[analytics] réinjection Redis impossible', (err as Error).message);
  }
}

async function applyFlush(payload: FlushPayload): Promise<void> {
  const { views, watchTime, impressions, clicks, retention, rawLog } = payload;

  // ── Identification des vidéos concernées ────────────────────────────────
  const retentionEntries: { videoId: string; bucket: number; plays: number }[] = [];
  for (const [field, plays] of retention) {
    const sep = field.lastIndexOf(':');
    if (sep <= 0) continue;
    const videoId = field.slice(0, sep);
    const bucket = Number(field.slice(sep + 1));
    if (!Number.isInteger(bucket) || bucket < 0 || bucket > 99) continue;
    retentionEntries.push({ videoId, bucket, plays });
  }

  const logEntries: ViewLogEntry[] = [];
  for (const raw of rawLog) {
    try {
      logEntries.push(JSON.parse(raw) as ViewLogEntry);
    } catch {
      /* entrée corrompue : ignorée */
    }
  }

  const videoIds = [
    ...new Set([
      ...views.keys(),
      ...watchTime.keys(),
      ...impressions.keys(),
      ...clicks.keys(),
      ...retentionEntries.map((r) => r.videoId),
      ...logEntries.map((e) => e.videoId),
    ]),
  ];
  if (!videoIds.length) return;

  const videos = await prisma.video.findMany({
    where: { id: { in: videoIds } },
    select: { id: true, channelId: true },
  });
  const channelByVideo = new Map(videos.map((v) => [v.id, v.channelId]));
  const known = (id: string) => channelByVideo.has(id);

  const today = startOfUtcDay(new Date());
  const operations: Prisma.PrismaPromise<unknown>[] = [];

  // ── Compteurs de la vidéo + agrégat journalier ──────────────────────────
  for (const videoId of videoIds) {
    if (!known(videoId)) continue;

    const dViews = views.get(videoId) ?? 0;
    const dWatch = watchTime.get(videoId) ?? 0;
    const dImpr = impressions.get(videoId) ?? 0;
    const dClicks = clicks.get(videoId) ?? 0;
    if (!dViews && !dWatch && !dImpr && !dClicks) continue;

    operations.push(
      prisma.video.update({
        where: { id: videoId },
        data: {
          ...(dViews ? { viewCount: { increment: BigInt(dViews) } } : {}),
          ...(dImpr ? { impressions: { increment: BigInt(dImpr) } } : {}),
          ...(dClicks ? { clicks: { increment: BigInt(dClicks) } } : {}),
        },
      }),
    );

    operations.push(
      prisma.videoStatDaily.upsert({
        where: { videoId_date: { videoId, date: today } },
        create: {
          videoId,
          date: today,
          views: dViews,
          watchTimeSec: BigInt(dWatch),
          impressions: dImpr,
          clicks: dClicks,
        },
        update: {
          ...(dViews ? { views: { increment: dViews } } : {}),
          ...(dWatch ? { watchTimeSec: { increment: BigInt(dWatch) } } : {}),
          ...(dImpr ? { impressions: { increment: dImpr } } : {}),
          ...(dClicks ? { clicks: { increment: dClicks } } : {}),
        },
      }),
    );
  }

  // ── Vues totales de la chaîne ───────────────────────────────────────────
  const channelDelta = new Map<string, number>();
  for (const [videoId, delta] of views) {
    const channelId = channelByVideo.get(videoId);
    if (!channelId) continue;
    channelDelta.set(channelId, (channelDelta.get(channelId) ?? 0) + delta);
  }
  for (const [channelId, delta] of channelDelta) {
    operations.push(
      prisma.channel.update({
        where: { id: channelId },
        data: { totalViews: { increment: BigInt(delta) } },
      }),
    );
  }

  // ── Courbe de rétention ─────────────────────────────────────────────────
  for (const point of retentionEntries) {
    if (!known(point.videoId)) continue;
    operations.push(
      prisma.retentionPoint.upsert({
        where: { videoId_bucket: { videoId: point.videoId, bucket: point.bucket } },
        create: { videoId: point.videoId, bucket: point.bucket, plays: point.plays },
        update: { plays: { increment: point.plays } },
      }),
    );
  }

  // ── Journal des vues validées → table `View` ────────────────────────────
  const viewRows: Prisma.ViewCreateManyInput[] = logEntries
    .filter((e) => known(e.videoId))
    .map((e) => ({
      videoId: e.videoId,
      userId: e.userId,
      sessionId: e.sessionId,
      ipHash: e.ipHash,
      watchedSec: Math.max(0, Math.round(e.watchedSec)),
      watchPct: Math.min(1, Math.max(0, e.watchPct)),
      source: e.source,
      device: e.device,
      country: e.country,
      ageBucket: e.ageBucket,
      createdAt: new Date(e.at),
    }));
  if (viewRows.length) {
    operations.push(prisma.view.createMany({ data: viewRows, skipDuplicates: true }));
  }

  if (operations.length) await prisma.$transaction(operations);

  // ── Recalcul des métriques dérivées des vidéos touchées ─────────────────
  // Volontairement HORS du chemin de réinjection : à ce stade les compteurs
  // sont commités ; une erreur ici ne doit surtout pas les réinjecter dans
  // Redis (ce serait un double comptage). Le prochain flush rattrapera.
  try {
    await recomputeDerivedMetrics(videoIds.filter(known));
  } catch (err) {
    console.error('[analytics] recalcul des métriques dérivées', (err as Error).message);
  }
}

/**
 * Recalcule `ctr`, `avgWatchSec`, `avgWatchPct` et `engagementRate`.
 * Une seule requête SQL paramétrée pour tout le lot.
 */
async function recomputeDerivedMetrics(videoIds: string[]): Promise<void> {
  if (!videoIds.length) return;
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "videos" v SET
      "ctr" = CASE WHEN v."impressions" > 0
                   THEN v."clicks"::float / v."impressions"::float ELSE 0 END,
      "avgWatchSec" = COALESCE(s.avg_sec, 0),
      "avgWatchPct" = LEAST(1, CASE WHEN v."durationSec" > 0
                   THEN COALESCE(s.avg_sec, 0) / v."durationSec"::float ELSE 0 END),
      "engagementRate" = CASE WHEN v."viewCount" > 0
                   THEN (v."likeCount" + v."commentCount")::float / v."viewCount"::float ELSE 0 END,
      "updatedAt" = NOW()
    FROM (
      SELECT d."videoId" AS video_id,
             CASE WHEN SUM(d."views") > 0
                  THEN SUM(d."watchTimeSec")::float / SUM(d."views")::float
                  ELSE 0 END AS avg_sec
      FROM "video_stats_daily" d
      WHERE d."videoId" IN (${Prisma.join(videoIds)})
      GROUP BY d."videoId"
    ) s
    WHERE v."id" = s.video_id
  `);
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. AGRÉGATS JOURNALIERS  (View → VideoStatDaily / ChannelStatDaily)
// ═══════════════════════════════════════════════════════════════════════════

interface BreakdownRow {
  videoId: string;
  source: string;
  device: string;
  country: string | null;
  age: string | null;
  n: number;
  secs: number | string | bigint;
  avg_pct: number | null;
}

/**
 * Consolide les lignes `View` du jour en répartitions (source, appareil, pays,
 * âge). IDEMPOTENT : les répartitions sont ÉCRASÉES, jamais incrémentées, donc
 * le job peut tourner toutes les 10 minutes sans fausser les chiffres.
 *
 * Les colonnes `views` / `watchTimeSec` de `VideoStatDaily` restent la
 * propriété de `flush-views` (temps réel) : on ne les touche qu'à la création
 * de la ligne, pour le cas d'un rejeu sur une journée passée.
 */
async function rollupDaily(dateStr?: string): Promise<void> {
  const day = startOfUtcDay(dateStr ? new Date(dateStr) : new Date());
  const nextDay = new Date(day.getTime() + 86_400_000);
  const dayString = toDateOnlyString(day);

  const rows = await prisma.$queryRaw<BreakdownRow[]>(Prisma.sql`
    SELECT
      vw."videoId"          AS "videoId",
      vw."source"::text     AS source,
      vw."device"::text     AS device,
      vw."country"          AS country,
      vw."ageBucket"        AS age,
      COUNT(*)::int         AS n,
      COALESCE(SUM(vw."watchedSec"), 0)::bigint AS secs,
      AVG(vw."watchPct")::float AS avg_pct
    FROM "views" vw
    WHERE vw."createdAt" >= ${day} AND vw."createdAt" < ${nextDay}
    GROUP BY 1, 2, 3, 4, 5
  `);

  // ── Pliage en objets JSON par vidéo ─────────────────────────────────────
  interface Agg {
    source: Record<string, number>;
    device: Record<string, number>;
    country: Record<string, number>;
    age: Record<string, number>;
    views: number;
    watchTimeSec: number;
    pctSum: number;
  }
  const byVideo = new Map<string, Agg>();

  for (const row of rows) {
    const agg =
      byVideo.get(row.videoId) ??
      ({ source: {}, device: {}, country: {}, age: {}, views: 0, watchTimeSec: 0, pctSum: 0 } as Agg);

    agg.source[row.source] = (agg.source[row.source] ?? 0) + row.n;
    agg.device[row.device] = (agg.device[row.device] ?? 0) + row.n;
    if (row.country) agg.country[row.country] = (agg.country[row.country] ?? 0) + row.n;
    if (row.age) agg.age[row.age] = (agg.age[row.age] ?? 0) + row.n;
    agg.views += row.n;
    agg.watchTimeSec += Number(row.secs);
    agg.pctSum += (row.avg_pct ?? 0) * row.n;

    byVideo.set(row.videoId, agg);
  }

  for (const [videoId, agg] of byVideo) {
    const avgViewPct = agg.views > 0 ? agg.pctSum / agg.views : 0;
    await prisma.videoStatDaily.upsert({
      where: { videoId_date: { videoId, date: day } },
      create: {
        videoId,
        date: day,
        views: agg.views,
        watchTimeSec: BigInt(Math.round(agg.watchTimeSec)),
        avgViewPct,
        sourceBreakdown: agg.source,
        deviceBreakdown: agg.device,
        countryBreakdown: agg.country,
        ageBreakdown: agg.age,
      },
      update: {
        avgViewPct,
        sourceBreakdown: agg.source,
        deviceBreakdown: agg.device,
        countryBreakdown: agg.country,
        ageBreakdown: agg.age,
      },
    });
  }

  await rollupChannels(day, nextDay, dayString);
}

/** Agrégat journalier par chaîne (vues, watch time, abonnés). */
async function rollupChannels(day: Date, nextDay: Date, dayString: string): Promise<void> {
  const traffic = await prisma.$queryRaw<
    { id: string; views: number; watch: bigint | number }[]
  >(Prisma.sql`
    SELECT v."channelId" AS id,
           COALESCE(SUM(d."views"), 0)::int AS views,
           COALESCE(SUM(d."watchTimeSec"), 0)::bigint AS watch
    FROM "video_stats_daily" d
    JOIN "videos" v ON v."id" = d."videoId"
    WHERE d."date" = ${dayString}::date
    GROUP BY v."channelId"
  `);

  const gained = await prisma.$queryRaw<{ id: string; n: number }[]>(Prisma.sql`
    SELECT s."channelId" AS id, COUNT(*)::int AS n
    FROM "subscriptions" s
    WHERE s."createdAt" >= ${day} AND s."createdAt" < ${nextDay}
    GROUP BY s."channelId"
  `);

  const channelIds = [...new Set([...traffic.map((t) => t.id), ...gained.map((g) => g.id)])];
  if (!channelIds.length) return;

  const [channels, previous] = await Promise.all([
    prisma.channel.findMany({
      where: { id: { in: channelIds } },
      select: { id: true, subscriberCount: true },
    }),
    prisma.channelStatDaily.findMany({
      where: { channelId: { in: channelIds }, date: new Date(day.getTime() - 86_400_000) },
      select: { channelId: true, subscriberTotal: true },
    }),
  ]);

  const trafficById = new Map(traffic.map((t) => [t.id, t]));
  const gainedById = new Map(gained.map((g) => [g.id, g.n]));
  const previousById = new Map(previous.map((p) => [p.channelId, p.subscriberTotal]));

  for (const channel of channels) {
    const t = trafficById.get(channel.id);
    const subsGained = gainedById.get(channel.id) ?? 0;
    const previousTotal = previousById.get(channel.id);
    // Les désabonnements suppriment la ligne `Subscription` : on les déduit du
    // solde (total d'hier + gagnés − total d'aujourd'hui).
    const subsLost =
      previousTotal === undefined
        ? 0
        : Math.max(0, previousTotal + subsGained - channel.subscriberCount);

    const payload = {
      views: t?.views ?? 0,
      watchTimeSec: BigInt(t?.watch ?? 0),
      subsGained,
      subsLost,
      subscriberTotal: channel.subscriberCount,
    };

    await prisma.channelStatDaily.upsert({
      where: { channelId_date: { channelId: channel.id, date: day } },
      create: { channelId: channel.id, date: day, ...payload },
      update: payload,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. SCORES DE DISTRIBUTION
// ═══════════════════════════════════════════════════════════════════════════

const HOT_SCORE_BATCH = 500;

/**
 * Recalcule `hotScore` pour les vidéos publiées dans les 30 derniers jours
 * OU ayant reçu du trafic récemment. Pagination par curseur, lots de 500,
 * une seule requête `UPDATE ... FROM (VALUES …)` par lot.
 */
async function recomputeHotScores(): Promise<void> {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const yesterday = startOfUtcDay(new Date(now.getTime() - 86_400_000));

  let cursor: string | undefined;
  let processed = 0;

  for (;;) {
    const batch = await prisma.video.findMany({
      where: {
        deletedAt: null,
        status: 'READY',
        visibility: { in: ['PUBLIC', 'UNLISTED'] },
        OR: [
          { publishedAt: { gte: since } },
          { statsDaily: { some: { date: { gte: yesterday } } } },
        ],
      },
      select: {
        id: true,
        publishedAt: true,
        createdAt: true,
        viewCount: true,
        likeCount: true,
        commentCount: true,
        impressions: true,
        clicks: true,
        avgWatchPct: true,
      },
      orderBy: { id: 'asc' },
      take: HOT_SCORE_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (!batch.length) break;

    const values = batch.map((v) => {
      const score = computeHotScore(
        {
          publishedAt: v.publishedAt,
          createdAt: v.createdAt,
          viewCount: Number(v.viewCount),
          likeCount: v.likeCount,
          commentCount: v.commentCount,
          impressions: Number(v.impressions),
          clicks: Number(v.clicks),
          avgWatchPct: v.avgWatchPct,
        },
        now,
      );
      return Prisma.sql`(${v.id}::text, ${score}::double precision)`;
    });

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "videos" v
      SET "hotScore" = x.score, "hotScoreUpdatedAt" = ${now}
      FROM (VALUES ${Prisma.join(values)}) AS x(id, score)
      WHERE v."id" = x.id
    `);

    processed += batch.length;
    cursor = batch[batch.length - 1].id;
    if (batch.length < HOT_SCORE_BATCH) break;
  }

  if (processed) console.log(`[analytics] hotScore recalculé pour ${processed} vidéos`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. HASHTAGS TENDANCES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `recentUsage` = nombre de vidéos publiques publiées dans les 48 h portant le
 * tag. `trendingScore` = usage récent normalisé entre 0 et 1 (1 = tag le plus
 * utilisé du moment). Le mapper DTO considère « tendance » un score > 0,5.
 */
async function refreshTrendingTags(): Promise<void> {
  const since = new Date(Date.now() - 48 * 3_600_000);

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "tags" SET "recentUsage" = 0, "updatedAt" = NOW() WHERE "recentUsage" <> 0
  `);

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "tags" t
    SET "recentUsage" = r.n, "updatedAt" = NOW()
    FROM (
      SELECT vt."tagId" AS tag_id, COUNT(*)::int AS n
      FROM "video_tags" vt
      JOIN "videos" v ON v."id" = vt."videoId"
      WHERE v."deletedAt" IS NULL
        AND v."visibility"::text = 'PUBLIC'
        AND v."publishedAt" IS NOT NULL
        AND v."publishedAt" >= ${since}
      GROUP BY vt."tagId"
    ) r
    WHERE t."id" = r.tag_id
  `);

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "tags" t
    SET "trendingScore" = CASE WHEN m.max_usage > 0
                               THEN t."recentUsage"::float / m.max_usage::float
                               ELSE 0 END,
        "updatedAt" = NOW()
    FROM (SELECT GREATEST(MAX("recentUsage"), 0) AS max_usage FROM "tags") m
  `);
}

// ═══════════════════════════════════════════════════════════════════════════
//  5. PUBLICATION PROGRAMMÉE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Passe en PUBLIC les vidéos `SCHEDULED` prêtes dont l'heure est arrivée,
 * puis déclenche l'indexation et la notification `NEW_VIDEO` aux abonnés.
 */
async function publishScheduled(): Promise<void> {
  const now = new Date();

  const due = await prisma.video.findMany({
    where: {
      visibility: 'SCHEDULED',
      status: 'READY',
      deletedAt: null,
      publishAt: { lte: now },
    },
    select: {
      id: true,
      title: true,
      channelId: true,
      thumbnailUrl: true,
      publishAt: true,
      channel: { select: { name: true } },
    },
    take: 200,
  });

  for (const video of due) {
    await prisma.video.update({
      where: { id: video.id },
      data: {
        visibility: 'PUBLIC',
        publishedAt: video.publishAt ?? now,
        publishAt: null,
      },
    });

    await searchQueue.add('upsert', {
      action: 'upsert',
      entity: 'video',
      id: video.id,
    } satisfies SearchIndexJob);

    await notificationQueue.add('new-video', {
      type: 'NEW_VIDEO',
      fanoutChannelId: video.channelId,
      actorChannelId: video.channelId,
      videoId: video.id,
      title: `${video.channel.name} a publié une nouvelle vidéo`,
      body: video.title,
      ...(video.thumbnailUrl ? { imageUrl: video.thumbnailUrl } : {}),
      link: `/watch?v=${video.id}`,
    } satisfies NotificationJob);
  }

  if (due.length) console.log(`[analytics] ${due.length} vidéo(s) programmée(s) publiée(s)`);
}
