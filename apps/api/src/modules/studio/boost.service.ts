import { randomBytes } from 'node:crypto';
import { Prisma, prisma } from '@kelvyntube/db';
import type { BoostInput, BoostResultDTO } from '@kelvyntube/shared';
import { badRequest, notFound } from '../../lib/errors.js';
import { startOfUtcDay } from './range.js';
import {
  COMMENT_TEXTS,
  REPLY_TEXTS,
  botAvatarUrl,
  botDisplayName,
  botEmail,
} from './boost-data.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BOOSTER D'ENGAGEMENT — OUTIL DE SIMULATION *LOCAL*
 *
 *  ⚠️ Ce service fabrique des métriques SYNTHÉTIQUES sur VOTRE propre
 *  instance Kelvyn Tube : compteurs dénormalisés, agrégats journaliers,
 *  commentaires et abonnements signés par des comptes `isBot`. Il sert à
 *  peupler le Studio pour le développement, à éprouver l'algorithme de
 *  distribution (CTR / rétention / vitesse d'engagement) et à faire des
 *  démonstrations crédibles.
 *
 *  Il ne contacte AUCUNE plateforme tierce, n'achète rien, ne crée aucune
 *  audience réelle : les chiffres produits n'ont de sens que sur cette base
 *  de données. Les comptes générés sont marqués `User.isBot = true`, ce qui
 *  permet de les purger d'un seul `DELETE`.
 *
 *  ── Stratégie de volumétrie ──────────────────────────────────────────────
 *  `views` peut valoir 7 milliards : hors de question de créer une ligne
 *  `View` par vue. On distingue donc deux familles de métriques :
 *
 *   1. MÉTRIQUES DE MASSE (vues, impressions, clics, likes, abonnés) :
 *      uniquement des compteurs dénormalisés + les agrégats journaliers
 *      `VideoStatDaily` / `ChannelStatDaily`. Coût O(jours), pas O(vues).
 *   2. MÉTRIQUES DE PREUVE (lignes `Like`, `Comment`, `Subscription`) :
 *      de vraies lignes, mais PLAFONNÉES, juste assez pour que l'interface
 *      reste cohérente si on inspecte le fil de commentaires ou la liste
 *      des abonnés.
 *
 *  ── Atomicité ────────────────────────────────────────────────────────────
 *  Chaque métrique est appliquée dans sa (ou ses) propre(s) transaction(s).
 *  Si une phase échoue, les phases déjà commitées sont conservées, l'échec
 *  est journalisé (`[boost] …`) et le DTO renvoie 0 pour la métrique perdue :
 *  jamais de demi-application silencieuse.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Plafonds & constantes ──────────────────────────────────────────────────

/** Taille maximale du vivier de comptes robots (réutilisé d'un run à l'autre). */
const MAX_BOT_POOL = 500;

/** Lignes `Like` réellement écrites par exécution (le compteur, lui, n'est pas bridé). */
const MAX_LIKE_ROWS = 300;

/** Lignes `Subscription` réellement écrites par exécution. */
const MAX_SUBSCRIPTION_ROWS = 300;

/** Taille des paquets de `createMany`. */
const CREATE_BATCH = 500;

/** Taille des paquets d'opérations Prisma par transaction. */
const OPS_BATCH = 100;

/**
 * Les colonnes des agrégats journaliers sont des `int4`. On sature juste en
 * dessous de la limite PostgreSQL (2 147 483 647) : les compteurs `BigInt` de
 * `Video` / `Channel` restent, eux, parfaitement exacts.
 */
const DAILY_INT_CAP = 2_000_000_000;

/** CTR simulé : entre 4 % et 12 %, la fourchette plausible d'une miniature. */
const CTR_MIN = 0.04;
const CTR_MAX = 0.12;

/** Part de la vidéo réellement regardée par une vue simulée. */
const WATCH_PCT_MIN = 0.3;
const WATCH_PCT_MAX = 0.6;

/** Durée de repli quand la vidéo n'est pas encore transcodée (durationSec = 0). */
const FALLBACK_DURATION_SEC = 300;

/** Part des commentaires générés sous forme de réponse à un commentaire racine. */
const REPLY_RATIO = 0.2;

/** Cible « chaîne entière » : on répartit sur les N vidéos les plus chaudes. */
const MAX_TARGET_VIDEOS = 100;

const DAY_MS = 86_400_000;

// ── Aléatoire & identifiants ───────────────────────────────────────────────

const randBetween = (min: number, max: number): number => min + Math.random() * (max - min);

const randInt = (min: number, max: number): number =>
  Math.floor(randBetween(min, max + 1));

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;

/**
 * Identifiant au format cuid-like (`c` + 24 caractères). Généré côté
 * application pour pouvoir utiliser `createMany` tout en connaissant à
 * l'avance l'id des commentaires racine (nécessaire pour y rattacher les
 * réponses sans requête supplémentaire).
 */
function newId(): string {
  const ts = Date.now().toString(36).padStart(8, '0').slice(-8);
  return `c${ts}${randomBytes(8).toString('hex')}`;
}

// ── Répartitions ───────────────────────────────────────────────────────────

/**
 * Répartition proportionnelle exacte (méthode du plus fort reste).
 * La somme du tableau renvoyé vaut TOUJOURS `total`.
 */
function allocate(total: number, weights: number[]): number[] {
  const out = new Array<number>(weights.length).fill(0);
  if (total <= 0 || weights.length === 0) return out;

  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    out[0] = total;
    return out;
  }

  const remainders: { index: number; frac: number }[] = [];
  let assigned = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const exact = (total * (weights[i] as number)) / sum;
    const floor = Math.floor(exact);
    out[i] = floor;
    assigned += floor;
    remainders.push({ index: i, frac: exact - floor });
  }

  remainders.sort((a, b) => b.frac - a.frac);
  let rest = total - assigned;
  for (let i = 0; rest > 0; i = (i + 1) % remainders.length) {
    out[(remainders[i] as { index: number }).index] += 1;
    rest -= 1;
  }
  return out;
}

/**
 * Répartition d'un total sur `days` jours suivant une courbe DÉCROISSANTE
 * bruitée : une vidéo encaisse le gros de ses vues dans les premiers jours,
 * puis décroît en longue traîne. L'indice 0 est le jour le plus ANCIEN de la
 * fenêtre, l'indice `days - 1` est aujourd'hui.
 *
 * Le reste d'arrondi est reporté sur le dernier jour : la somme est exacte.
 */
function distributeOverDays(total: number, days: number): number[] {
  const out = new Array<number>(days).fill(0);
  if (total <= 0 || days <= 0) return out;
  if (days === 1) {
    out[0] = total;
    return out;
  }

  // Constante de temps : ~4 « demi-vies » sur la fenêtre demandée.
  const tau = Math.max(1.5, days / 4);
  const weights: number[] = [];
  let sum = 0;
  for (let i = 0; i < days; i += 1) {
    const w = Math.exp(-i / tau) * randBetween(0.75, 1.25);
    weights.push(w);
    sum += w;
  }

  let assigned = 0;
  for (let i = 0; i < days - 1; i += 1) {
    const value = Math.floor((total * (weights[i] as number)) / sum);
    out[i] = value;
    assigned += value;
  }
  out[days - 1] = total - assigned; // correction du reste, sans perte
  return out;
}

/** Les `spreadDays` derniers jours (minuit UTC), du plus ancien à aujourd'hui. */
function buildWindow(spreadDays: number): Date[] {
  const today = startOfUtcDay(new Date());
  const days: Date[] = [];
  for (let i = spreadDays - 1; i >= 0; i -= 1) {
    days.push(new Date(today.getTime() - i * DAY_MS));
  }
  return days;
}

/** Horodatage aléatoire dans la journée `day`, jamais dans le futur. */
function randomInstantInDay(day: Date): Date {
  const now = Date.now();
  const at = day.getTime() + randInt(0, DAY_MS - 1);
  return new Date(Math.min(at, now));
}

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

// ── Garde-fous numériques ──────────────────────────────────────────────────

let saturationLogged = false;

/**
 * Incrément d'une colonne `int4` sans jamais dépasser la limite PostgreSQL.
 * Cas d'usage réel : 7 milliards de vues étalées sur 1 seul jour.
 */
function safeDailyDelta(existing: number, delta: number): number {
  if (delta <= 0) return 0;
  const room = DAILY_INT_CAP - existing;
  if (delta <= room) return delta;
  if (!saturationLogged) {
    saturationLogged = true;
    console.warn(
      '[boost] agrégat journalier saturé à 2e9 (colonne int4) — les compteurs BigInt restent exacts',
    );
  }
  return Math.max(0, room);
}

// ── Vivier de comptes robots ───────────────────────────────────────────────

export interface BotRef {
  id: string;
  email: string;
}

/** `bot-42@bots.kelvyntube.local` -> 42 */
function indexFromBotEmail(email: string): number | null {
  const match = /^bot-(\d+)@/.exec(email);
  return match ? Number(match[1]) : null;
}

/**
 * Garantit l'existence d'au moins `count` comptes `isBot`.
 * Les robots déjà présents sont RÉUTILISÉS : on ne crée que le complément
 * manquant, et le vivier total est plafonné à `MAX_BOT_POOL`.
 */
export async function ensureBotPool(count: number): Promise<{ bots: BotRef[]; created: number }> {
  const target = Math.min(Math.max(Math.ceil(count), 0), MAX_BOT_POOL);
  if (target === 0) return { bots: [], created: 0 };

  const existing = await prisma.user.findMany({
    where: { isBot: true },
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
    take: MAX_BOT_POOL,
  });

  if (existing.length >= target) {
    return { bots: existing.slice(0, target), created: 0 };
  }

  // Indices d'emails déjà pris — on ne réattribue jamais le même.
  const used = new Set<number>();
  for (const bot of existing) {
    const index = indexFromBotEmail(bot.email);
    if (index !== null) used.add(index);
  }

  const missing = target - existing.length;
  const rows: Prisma.UserCreateManyInput[] = [];
  for (let index = 1; index <= MAX_BOT_POOL && rows.length < missing; index += 1) {
    if (used.has(index)) continue;
    const displayName = botDisplayName(index);
    rows.push({
      id: newId(),
      email: botEmail(index),
      displayName,
      avatarUrl: botAvatarUrl(`${displayName}-${index}`),
      isBot: true,
      emailVerified: new Date(),
      locale: 'fr',
    });
  }

  let created = 0;
  for (let i = 0; i < rows.length; i += CREATE_BATCH) {
    const chunk = rows.slice(i, i + CREATE_BATCH);
    const [result] = await prisma.$transaction([
      prisma.user.createMany({ data: chunk, skipDuplicates: true }),
    ]);
    created += result.count;
  }

  const bots = await prisma.user.findMany({
    where: { isBot: true },
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
    take: target,
  });

  return { bots, created };
}

// ── Cibles ─────────────────────────────────────────────────────────────────

interface TargetVideo {
  id: string;
  title: string;
  durationSec: number;
  hotScore: number;
}

/**
 * Vidéos qui recevront les métriques de masse.
 * `videoId` fourni -> cette vidéo seulement (et elle doit appartenir à la
 * chaîne). Sinon : les vidéos `READY` de la chaîne, pondérées par `hotScore`.
 */
async function resolveTargetVideos(
  channelId: string,
  videoId: string | undefined,
): Promise<TargetVideo[]> {
  if (videoId) {
    const video = await prisma.video.findFirst({
      where: { id: videoId, channelId, deletedAt: null },
      select: { id: true, title: true, durationSec: true, hotScore: true },
    });
    if (!video) throw notFound('Vidéo introuvable sur cette chaîne');
    return [video];
  }

  return prisma.video.findMany({
    where: { channelId, status: 'READY', deletedAt: null },
    select: { id: true, title: true, durationSec: true, hotScore: true },
    orderBy: { hotScore: 'desc' },
    take: MAX_TARGET_VIDEOS,
  });
}

/**
 * Poids de répartition : `hotScore` + un plancher, pour qu'une vidéo au score
 * nul reçoive quand même sa part (sinon une chaîne fraîchement seedée, dont
 * tous les `hotScore` valent 0, ne recevrait rien).
 */
function videoWeights(videos: TargetVideo[]): number[] {
  const maxHot = videos.reduce((max, v) => Math.max(max, v.hotScore), 0);
  const floor = Math.max(1, maxHot * 0.05);
  return videos.map((v) => Math.max(0, v.hotScore) + floor);
}

// ── Agrégats journaliers ───────────────────────────────────────────────────

interface DailyDelta {
  views?: number;
  impressions?: number;
  clicks?: number;
  likes?: number;
  dislikes?: number;
  comments?: number;
  /** Colonne `BigInt` : aucun risque de dépassement. */
  watchTimeSec?: number;
}

const DAILY_INT_FIELDS = ['views', 'impressions', 'clicks', 'likes', 'dislikes', 'comments'] as const;

/** Exécute une liste d'opérations Prisma par transactions de `OPS_BATCH`. */
async function runOps(ops: Prisma.PrismaPromise<unknown>[]): Promise<void> {
  for (let i = 0; i < ops.length; i += OPS_BATCH) {
    await prisma.$transaction(ops.slice(i, i + OPS_BATCH));
  }
}

/**
 * Applique des deltas sur `VideoStatDaily`, jour par jour.
 * Les lignes existantes sont relues pour saturer proprement les colonnes
 * `int4` (voir `safeDailyDelta`) tout en gardant une sémantique d'incrément.
 */
async function bumpVideoDaily(
  videoId: string,
  days: Date[],
  deltas: DailyDelta[],
): Promise<void> {
  const first = days[0] as Date;
  const last = days[days.length - 1] as Date;

  const existing = await prisma.videoStatDaily.findMany({
    where: { videoId, date: { gte: first, lte: last } },
    select: {
      date: true,
      views: true,
      impressions: true,
      clicks: true,
      likes: true,
      dislikes: true,
      comments: true,
    },
  });
  const byDay = new Map(existing.map((row) => [dayKey(row.date), row]));

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (let i = 0; i < days.length; i += 1) {
    const date = days[i] as Date;
    const delta = deltas[i] ?? {};
    const current = byDay.get(dayKey(date));

    const create: Prisma.VideoStatDailyUncheckedCreateInput = { videoId, date };
    const update: Prisma.VideoStatDailyUncheckedUpdateInput = {};
    let touched = false;

    for (const field of DAILY_INT_FIELDS) {
      const raw = delta[field] ?? 0;
      if (raw <= 0) continue;
      const safe = safeDailyDelta(current?.[field] ?? 0, raw);
      if (safe <= 0) continue;
      create[field] = safe;
      update[field] = { increment: safe };
      touched = true;
    }

    const watch = delta.watchTimeSec ?? 0;
    if (watch > 0) {
      const asBig = BigInt(Math.round(watch));
      create.watchTimeSec = asBig;
      update.watchTimeSec = { increment: asBig };
      touched = true;
    }

    if (!touched) continue;
    ops.push(
      prisma.videoStatDaily.upsert({
        where: { videoId_date: { videoId, date } },
        create: { id: newId(), ...create },
        update,
      }),
    );
  }

  await runOps(ops);
}

/** Idem pour `ChannelStatDaily` (vues + temps de visionnage de la chaîne). */
async function bumpChannelDailyViews(
  channelId: string,
  days: Date[],
  views: number[],
  watchSec: number[],
): Promise<void> {
  const first = days[0] as Date;
  const last = days[days.length - 1] as Date;

  const existing = await prisma.channelStatDaily.findMany({
    where: { channelId, date: { gte: first, lte: last } },
    select: { date: true, views: true },
  });
  const byDay = new Map(existing.map((row) => [dayKey(row.date), row.views]));

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (let i = 0; i < days.length; i += 1) {
    const date = days[i] as Date;
    const dViews = safeDailyDelta(byDay.get(dayKey(date)) ?? 0, views[i] ?? 0);
    const dWatch = BigInt(Math.round(watchSec[i] ?? 0));
    if (dViews <= 0 && dWatch <= 0n) continue;

    ops.push(
      prisma.channelStatDaily.upsert({
        where: { channelId_date: { channelId, date } },
        create: { id: newId(), channelId, date, views: dViews, watchTimeSec: dWatch },
        update: {
          ...(dViews > 0 ? { views: { increment: dViews } } : {}),
          ...(dWatch > 0n ? { watchTimeSec: { increment: dWatch } } : {}),
        },
      }),
    );
  }

  await runOps(ops);
}

// ═══════════════════════════════════════════════════════════════════════════
//  PHASE 1 — VUES (compteurs + impressions / clics cohérents)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aucune ligne `View` n'est écrite : uniquement `Video.viewCount`,
 * `Channel.totalViews`, `Video.impressions` / `clicks` et les agrégats
 * journaliers. Les impressions sont déduites d'un CTR tiré entre 4 % et 12 %
 * (`impressions = vues / CTR`, `clics = vues`), ce qui garantit que le
 * dashboard n'affiche jamais des vues sans impressions.
 */
async function applyViews(
  channelId: string,
  videos: TargetVideo[],
  perVideoViews: number[],
  days: Date[],
): Promise<number> {
  const channelViews = new Array<number>(days.length).fill(0);
  const channelWatch = new Array<number>(days.length).fill(0);
  let appliedTotal = 0;

  for (let v = 0; v < videos.length; v += 1) {
    const video = videos[v] as TargetVideo;
    const total = perVideoViews[v] ?? 0;
    if (total <= 0) continue;

    const ctr = randBetween(CTR_MIN, CTR_MAX);
    const duration = video.durationSec > 0 ? video.durationSec : FALLBACK_DURATION_SEC;
    const secPerView = duration * randBetween(WATCH_PCT_MIN, WATCH_PCT_MAX);

    const daily = distributeOverDays(total, days.length);
    const deltas: DailyDelta[] = daily.map((views, i) => {
      const impressions = Math.round(views / ctr);
      const watchTimeSec = Math.round(views * secPerView);
      channelViews[i] = (channelViews[i] ?? 0) + views;
      channelWatch[i] = (channelWatch[i] ?? 0) + watchTimeSec;
      return { views, impressions, clicks: views, watchTimeSec };
    });

    const impressionsTotal = deltas.reduce((sum, d) => sum + (d.impressions ?? 0), 0);

    // Compteurs dénormalisés : exacts, en BigInt.
    await prisma.$transaction([
      prisma.video.update({
        where: { id: video.id },
        data: {
          viewCount: { increment: BigInt(total) },
          impressions: { increment: BigInt(impressionsTotal) },
          clicks: { increment: BigInt(total) },
        },
      }),
    ]);

    await bumpVideoDaily(video.id, days, deltas);
    appliedTotal += total;
  }

  if (appliedTotal > 0) {
    await prisma.$transaction([
      prisma.channel.update({
        where: { id: channelId },
        data: { totalViews: { increment: BigInt(appliedTotal) } },
      }),
    ]);
    await bumpChannelDailyViews(channelId, days, channelViews, channelWatch);
  }

  return appliedTotal;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PHASE 2 — LIKES / DISLIKES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compteurs + agrégats journaliers pour la totalité du volume demandé, mais
 * au plus `MAX_LIKE_ROWS` vraies lignes `Like` (contrainte d'unicité
 * `[userId, targetType, targetId]` -> `skipDuplicates`).
 */
async function applyLikes(
  videos: TargetVideo[],
  perVideoLikes: number[],
  perVideoDislikes: number[],
  days: Date[],
  bots: BotRef[],
): Promise<{ likes: number; dislikes: number; rowsCreated: number }> {
  const totalLikes = perVideoLikes.reduce((a, b) => a + b, 0);
  const totalDislikes = perVideoDislikes.reduce((a, b) => a + b, 0);
  const totalSignals = totalLikes + totalDislikes;
  if (totalSignals <= 0) return { likes: 0, dislikes: 0, rowsCreated: 0 };

  // Budget global de lignes réelles, réparti au prorata des signaux.
  const rowBudget = Math.min(MAX_LIKE_ROWS, totalSignals, bots.length);
  const rows: Prisma.LikeCreateManyInput[] = [];

  for (let v = 0; v < videos.length; v += 1) {
    const video = videos[v] as TargetVideo;
    const likes = perVideoLikes[v] ?? 0;
    const dislikes = perVideoDislikes[v] ?? 0;
    if (likes <= 0 && dislikes <= 0) continue;

    const dailyLikes = distributeOverDays(likes, days.length);
    const dailyDislikes = distributeOverDays(dislikes, days.length);

    await prisma.$transaction([
      prisma.video.update({
        where: { id: video.id },
        data: {
          ...(likes > 0 ? { likeCount: { increment: likes } } : {}),
          ...(dislikes > 0 ? { dislikeCount: { increment: dislikes } } : {}),
        },
      }),
    ]);

    await bumpVideoDaily(
      video.id,
      days,
      days.map((_, i) => ({ likes: dailyLikes[i] ?? 0, dislikes: dailyDislikes[i] ?? 0 })),
    );

    // Lignes de preuve : un robot ne peut avoir qu'UNE ligne par vidéo, donc
    // likes et dislikes puisent dans des tranches disjointes du vivier.
    const share = (likes + dislikes) / totalSignals;
    const videoRows = Math.min(bots.length, Math.round(rowBudget * share));
    const likeRows = Math.min(likes, Math.round(videoRows * (likes / (likes + dislikes))));
    const dislikeRows = Math.min(dislikes, videoRows - likeRows);

    for (let i = 0; i < likeRows + dislikeRows; i += 1) {
      const bot = bots[i] as BotRef | undefined;
      if (!bot) break;
      const isLike = i < likeRows;
      const dayIndex = randInt(0, days.length - 1);
      rows.push({
        id: newId(),
        userId: bot.id,
        targetType: 'VIDEO',
        targetId: video.id,
        value: isLike ? 1 : -1,
        createdAt: randomInstantInDay(days[dayIndex] as Date),
      });
    }
  }

  let rowsCreated = 0;
  for (let i = 0; i < rows.length; i += CREATE_BATCH) {
    const [result] = await prisma.$transaction([
      prisma.like.createMany({ data: rows.slice(i, i + CREATE_BATCH), skipDuplicates: true }),
    ]);
    rowsCreated += result.count;
  }

  return { likes: totalLikes, dislikes: totalDislikes, rowsCreated };
}

// ═══════════════════════════════════════════════════════════════════════════
//  PHASE 3 — COMMENTAIRES
// ═══════════════════════════════════════════════════════════════════════════

interface PlannedComment {
  id: string;
  parentId: string | null;
  authorId: string;
  text: string;
  createdAt: Date;
  dayIndex: number;
}

/**
 * Construit le lot de commentaires : ~80 % de racines, ~20 % de réponses à une
 * racine du MÊME lot, publiée AVANT la réponse. Les `createdAt` suivent la
 * même courbe décroissante que les vues.
 */
function planComments(count: number, days: Date[], bots: BotRef[]): PlannedComment[] {
  const perDay = distributeOverDays(count, days.length);
  const planned: PlannedComment[] = [];

  for (let i = 0; i < days.length; i += 1) {
    const day = days[i] as Date;
    for (let n = 0; n < (perDay[i] ?? 0); n += 1) {
      planned.push({
        id: newId(),
        parentId: null,
        authorId: (pick(bots) as BotRef).id,
        text: pick(COMMENT_TEXTS),
        createdAt: randomInstantInDay(day),
        dayIndex: i,
      });
    }
  }

  planned.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Les plus anciens restent racines : une réponse a ainsi toujours un parent
  // antérieur à elle (cohérence du fil affiché dans l'UI).
  const replyCount = Math.floor(planned.length * REPLY_RATIO);
  const rootCount = planned.length - replyCount;
  for (let i = rootCount; i < planned.length; i += 1) {
    const reply = planned[i] as PlannedComment;
    const parent = planned[randInt(0, Math.max(0, rootCount - 1))] as PlannedComment | undefined;
    if (!parent || parent.createdAt >= reply.createdAt) continue;
    reply.parentId = parent.id;
    reply.text = pick(REPLY_TEXTS);
  }

  return planned;
}

async function applyComments(
  video: TargetVideo,
  count: number,
  days: Date[],
  bots: BotRef[],
): Promise<number> {
  if (count <= 0 || bots.length === 0) return 0;

  const planned = planComments(count, days, bots);
  const roots = planned.filter((c) => c.parentId === null);
  const replies = planned.filter((c) => c.parentId !== null);

  const toRow = (c: PlannedComment): Prisma.CommentCreateManyInput => ({
    id: c.id,
    videoId: video.id,
    authorId: c.authorId,
    parentId: c.parentId,
    text: c.text,
    createdAt: c.createdAt,
    updatedAt: c.createdAt,
  });

  let created = 0;

  // 1. Racines d'abord (clé étrangère `parentId`), par paquets de 500.
  for (let i = 0; i < roots.length; i += CREATE_BATCH) {
    const [result] = await prisma.$transaction([
      prisma.comment.createMany({ data: roots.slice(i, i + CREATE_BATCH).map(toRow) }),
    ]);
    created += result.count;
  }

  // 2. Réponses.
  for (let i = 0; i < replies.length; i += CREATE_BATCH) {
    const [result] = await prisma.$transaction([
      prisma.comment.createMany({ data: replies.slice(i, i + CREATE_BATCH).map(toRow) }),
    ]);
    created += result.count;
  }

  // 3. `replyCount` des parents concernés.
  const repliesByParent = new Map<string, number>();
  for (const reply of replies) {
    const key = reply.parentId as string;
    repliesByParent.set(key, (repliesByParent.get(key) ?? 0) + 1);
  }
  await runOps(
    [...repliesByParent].map(([id, n]) =>
      prisma.comment.update({ where: { id }, data: { replyCount: { increment: n } } }),
    ),
  );

  // 4. Compteur dénormalisé + agrégat journalier.
  await prisma.$transaction([
    prisma.video.update({
      where: { id: video.id },
      data: { commentCount: { increment: created } },
    }),
  ]);

  const perDay = new Array<number>(days.length).fill(0);
  for (const comment of planned) {
    perDay[comment.dayIndex] = (perDay[comment.dayIndex] ?? 0) + 1;
  }
  await bumpVideoDaily(
    video.id,
    days,
    perDay.map((comments) => ({ comments })),
  );

  return created;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PHASE 4 — ABONNÉS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `Channel.subscriberCount` + `ChannelStatDaily.subsGained` / `subscriberTotal`
 * pour tout le volume, et au plus `MAX_SUBSCRIPTION_ROWS` vraies lignes
 * `Subscription` (unicité `[subscriberId, channelId]` -> `skipDuplicates`).
 */
async function applySubscribers(
  channelId: string,
  baseSubscribers: number,
  count: number,
  days: Date[],
  bots: BotRef[],
): Promise<{ applied: number; rowsCreated: number }> {
  if (count <= 0) return { applied: 0, rowsCreated: 0 };

  const perDay = distributeOverDays(count, days.length);

  await prisma.$transaction([
    prisma.channel.update({
      where: { id: channelId },
      data: { subscriberCount: { increment: count } },
    }),
  ]);

  const first = days[0] as Date;
  const last = days[days.length - 1] as Date;
  const existing = await prisma.channelStatDaily.findMany({
    where: { channelId, date: { gte: first, lte: last } },
    select: { date: true, subsGained: true, subscriberTotal: true },
  });
  const byDay = new Map(existing.map((row) => [dayKey(row.date), row]));

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  let cumulative = 0;
  for (let i = 0; i < days.length; i += 1) {
    const date = days[i] as Date;
    const gained = perDay[i] ?? 0;
    cumulative += gained;
    const current = byDay.get(dayKey(date));

    // Base du total : la valeur historique de la ligne si elle existe, sinon
    // le total d'avant boost — la courbe reste monotone croissante.
    const base = current?.subscriberTotal ?? baseSubscribers;
    const subscriberTotal = Math.min(DAILY_INT_CAP, base + cumulative);
    const safeGained = safeDailyDelta(current?.subsGained ?? 0, gained);

    ops.push(
      prisma.channelStatDaily.upsert({
        where: { channelId_date: { channelId, date } },
        create: { id: newId(), channelId, date, subsGained: safeGained, subscriberTotal },
        update: {
          ...(safeGained > 0 ? { subsGained: { increment: safeGained } } : {}),
          subscriberTotal,
        },
      }),
    );
  }
  await runOps(ops);

  // Lignes de preuve.
  const rowCount = Math.min(count, MAX_SUBSCRIPTION_ROWS, bots.length);
  const rows: Prisma.SubscriptionCreateManyInput[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const bot = bots[i] as BotRef;
    rows.push({
      id: newId(),
      subscriberId: bot.id,
      channelId,
      level: 'PERSONALIZED',
      createdAt: randomInstantInDay(days[randInt(0, days.length - 1)] as Date),
    });
  }

  let rowsCreated = 0;
  for (let i = 0; i < rows.length; i += CREATE_BATCH) {
    const [result] = await prisma.$transaction([
      prisma.subscription.createMany({
        data: rows.slice(i, i + CREATE_BATCH),
        skipDuplicates: true,
      }),
    ]);
    rowsCreated += result.count;
  }

  return { applied: count, rowsCreated };
}

// ═══════════════════════════════════════════════════════════════════════════
//  MÉTRIQUES DÉRIVÉES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recalcule `ctr`, `avgWatchSec`, `avgWatchPct` et `engagementRate` — même
 * formule que le worker analytics, pour que les deux chemins d'écriture
 * produisent exactement les mêmes valeurs. Requête paramétrée (`Prisma.sql`).
 */
async function recomputeDerivedMetrics(videoIds: string[]): Promise<void> {
  if (!videoIds.length) return;
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "videos" v SET
      "ctr" = CASE WHEN v."impressions" > 0
                   THEN v."clicks"::float / v."impressions"::float ELSE 0 END,
      "avgWatchSec" = COALESCE(s.avg_sec, v."avgWatchSec"),
      "avgWatchPct" = LEAST(1, CASE WHEN v."durationSec" > 0
                   THEN COALESCE(s.avg_sec, v."avgWatchSec") / v."durationSec"::float ELSE 0 END),
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
//  POINT D'ENTRÉE
// ═══════════════════════════════════════════════════════════════════════════

/** Nombre de robots nécessaires au run (borné par `MAX_BOT_POOL`). */
function botsNeeded(input: BoostInput): number {
  const likeRows = Math.min(MAX_LIKE_ROWS, input.likes + input.dislikes);
  const subRows = Math.min(MAX_SUBSCRIPTION_ROWS, input.subscribers);
  const commentAuthors = input.comments > 0 ? Math.min(input.comments, 120) : 0;
  return Math.min(MAX_BOT_POOL, Math.max(likeRows, subRows, commentAuthors));
}

/**
 * Exécute une simulation d'engagement sur une chaîne (ou une vidéo précise).
 * L'appelant a DÉJÀ vérifié la propriété de la chaîne (`assertChannelOwner`).
 */
export async function runBoost(channelId: string, input: BoostInput): Promise<BoostResultDTO> {
  const startedAt = Date.now();
  saturationLogged = false;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, name: true, subscriberCount: true },
  });
  if (!channel) throw notFound('Chaîne introuvable');

  const videos = await resolveTargetVideos(channelId, input.videoId);
  const needsVideos = input.views + input.likes + input.dislikes + input.comments > 0;
  if (needsVideos && videos.length === 0) {
    throw badRequest('Aucune vidéo prête (READY) sur cette chaîne : rien à booster');
  }

  const days = buildWindow(input.spreadDays);
  const weights = videoWeights(videos);
  const { bots, created: botUsersCreated } = await ensureBotPool(botsNeeded(input));

  const applied = { views: 0, likes: 0, dislikes: 0, comments: 0, subscribers: 0 };
  let botCommentsCreated = 0;
  let botSubscriptionsCreated = 0;

  // ── Vues ────────────────────────────────────────────────────────────────
  if (input.views > 0) {
    try {
      applied.views = await applyViews(channelId, videos, allocate(input.views, weights), days);
    } catch (err) {
      console.error('[boost] échec de la phase VUES —', (err as Error).message);
    }
  }

  // ── Likes / dislikes ────────────────────────────────────────────────────
  if (input.likes > 0 || input.dislikes > 0) {
    try {
      const result = await applyLikes(
        videos,
        allocate(input.likes, weights),
        allocate(input.dislikes, weights),
        days,
        bots,
      );
      applied.likes = result.likes;
      applied.dislikes = result.dislikes;
    } catch (err) {
      console.error('[boost] échec de la phase LIKES —', (err as Error).message);
    }
  }

  // ── Commentaires (toujours sur une vidéo précise : cf. `boostSchema`) ────
  if (input.comments > 0) {
    try {
      botCommentsCreated = await applyComments(
        videos[0] as TargetVideo,
        input.comments,
        days,
        bots,
      );
      applied.comments = botCommentsCreated;
    } catch (err) {
      console.error('[boost] échec de la phase COMMENTAIRES —', (err as Error).message);
    }
  }

  // ── Abonnés ─────────────────────────────────────────────────────────────
  if (input.subscribers > 0) {
    try {
      const result = await applySubscribers(
        channelId,
        channel.subscriberCount,
        input.subscribers,
        days,
        bots,
      );
      applied.subscribers = result.applied;
      botSubscriptionsCreated = result.rowsCreated;
    } catch (err) {
      console.error('[boost] échec de la phase ABONNÉS —', (err as Error).message);
    }
  }

  // Hors transaction : une erreur ici ne doit pas remettre en cause ce qui
  // est déjà commité, le worker analytics rattrapera au prochain passage.
  try {
    await recomputeDerivedMetrics(videos.map((v) => v.id));
  } catch (err) {
    console.error('[boost] recalcul des métriques dérivées —', (err as Error).message);
  }

  const target = input.videoId
    ? { type: 'video' as const, id: (videos[0] as TargetVideo).id, title: (videos[0] as TargetVideo).title }
    : { type: 'channel' as const, id: channel.id, title: channel.name };

  console.info(
    `[boost] ${target.type} ${target.id} — vues:${applied.views} likes:${applied.likes} ` +
      `dislikes:${applied.dislikes} commentaires:${applied.comments} abonnés:${applied.subscribers} ` +
      `(${days.length} j, ${bots.length} robots)`,
  );

  return {
    target,
    applied,
    botCommentsCreated,
    botSubscriptionsCreated,
    botUsersCreated,
    durationMs: Date.now() - startedAt,
  };
}
