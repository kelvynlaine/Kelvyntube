// ═══════════════════════════════════════════════════════════════════════════
//  Kelvyn Tube — Seed de démonstration
//
//  Objectif : produire, en une seule commande, un jeu de données assez riche
//  pour que le feed, la reco, la recherche, les hashtags tendances et le
//  dashboard créateur soient crédibles sans le moindre upload.
//
//  Deux garanties fortes :
//    • IDEMPOTENT   — purge complète avant écriture, relançable à l'infini ;
//    • DÉTERMINISTE — PRNG à graine fixe (mulberry32), aucun `Math.random()`.
//
//  Conventions de mesure (alignées sur le schéma Prisma) :
//    • `ctr`, `avgWatchPct`, `engagementRate`, `hotScore`, `trendingScore`
//      sont des FRACTIONS entre 0 et 1 (comme `ctr = clicks / impressions`).
//    • Les compteurs `likeCount` / `dislikeCount` sont dénormalisés (dans la
//      vraie app ils viennent d'un batch Redis → Postgres), ils ne comptent
//      donc pas les lignes `Like` : avec 12 utilisateurs c'est impossible.
//    • `commentCount`, en revanche, vaut EXACTEMENT le nombre de lignes
//      `Comment` de la vidéo : c'est le seul compteur que l'UI peut
//      contredire visuellement (la liste des commentaires est affichée).
//
//  Lancement : `npm run seed -w @kelvyntube/db`
// ═══════════════════════════════════════════════════════════════════════════

import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import {
  AGE_WEIGHTS,
  CATEGORIES,
  CDN_BASE,
  CHANNELS,
  CHAPTER_TITLES,
  COMMENT_TEXTS,
  COMMUNITY_POSTS,
  COUNTRY_WEIGHTS,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DESCRIPTION_BODIES,
  DESCRIPTION_CTAS,
  DESCRIPTION_HOOKS,
  DEVICE_WEIGHTS,
  MP4_SOURCES,
  NOTIFICATIONS,
  PICSUM,
  PINNED_TEXTS,
  REACTION_EMOJIS,
  RENDITIONS,
  REPLY_TEXTS,
  SEARCH_QUERIES,
  SHORT_TITLES,
  TAGS,
  TAGS_BY_CATEGORY,
  TRAFFIC_SOURCE_WEIGHTS,
  USER_PLAYLISTS,
  USERS,
  VIDEO_TITLES,
} from './seed-data.js';

const prisma = new PrismaClient({ log: ['error'] });

// ───────────────────────────────────────────────────────────────────────────
//  Types locaux (unions littérales : elles se substituent aux enums Prisma
//  sans avoir à les importer comme valeurs).
// ───────────────────────────────────────────────────────────────────────────

type VideoStatus = 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
type VideoVisibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE' | 'SCHEDULED';
type VideoKind = 'LONG' | 'SHORT';
type NotificationLevel = 'ALL' | 'PERSONALIZED' | 'NONE';

// ───────────────────────────────────────────────────────────────────────────
//  1. PRNG déterministe (mulberry32) + utilitaires aléatoires
// ───────────────────────────────────────────────────────────────────────────

/** Graine fixe : deux exécutions produisent rigoureusement le même jeu. */
const SEED = 20260728;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(SEED);

/** Flottant dans [min, max[. */
const rndFloat = (min: number, max: number): number => min + rnd() * (max - min);
/** Entier dans [min, max] (bornes incluses). */
const rndInt = (min: number, max: number): number => Math.floor(min + rnd() * (max - min + 1));
/** Vrai avec la probabilité `p`. */
const chance = (p: number): boolean => rnd() < p;
/** Un élément au hasard. */
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];

/** Copie mélangée (Fisher-Yates alimenté par le PRNG). */
function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** `n` éléments distincts au hasard. */
const pickMany = <T>(arr: readonly T[], n: number): T[] => shuffle(arr).slice(0, Math.min(n, arr.length));

/** Tirage pondéré dans un dictionnaire `clé -> poids`. */
function weightedKey(weights: Record<string, number>): string {
  const keys = Object.keys(weights);
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let r = rnd() * total;
  for (const k of keys) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round4 = (v: number): number => Math.round(v * 10000) / 10000;

/**
 * Répartit `total` (entier) sur des clés pondérées, avec un bruit
 * multiplicatif, en garantissant que la somme des parts vaut EXACTEMENT
 * `total` (le reste est attribué aux plus grosses parties fractionnaires).
 */
function distribute(total: number, weights: Record<string, number>, jitter = 0.3): Record<string, number> {
  const keys = Object.keys(weights);
  const noisy = keys.map((k) => Math.max(0.0001, weights[k] * rndFloat(1 - jitter, 1 + jitter)));
  const sum = noisy.reduce((s, w) => s + w, 0);
  const exact = noisy.map((w) => (w / sum) * total);
  const out: Record<string, number> = {};
  let allocated = 0;
  keys.forEach((k, i) => {
    out[k] = Math.floor(exact[i]);
    allocated += out[k];
  });
  // Distribution du reliquat, des plus grosses décimales aux plus petites.
  const order = keys
    .map((k, i) => ({ k, frac: exact[i] - Math.floor(exact[i]) }))
    .sort((a, b) => b.frac - a.frac);
  let remainder = total - allocated;
  let i = 0;
  while (remainder > 0 && order.length > 0) {
    out[order[i % order.length].k] += 1;
    remainder -= 1;
    i += 1;
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
//  2. Identifiants
//     On génère nous-mêmes des ids au format cuid (`c` + 24 caractères) :
//     c'est ce qui permet d'utiliser `createMany` partout — donc de rester
//     sous les 60 s malgré les dizaines de milliers de lignes.
// ───────────────────────────────────────────────────────────────────────────

// Préfixe dérivé de la graine (et non de `Date.now()`) : les identifiants sont
// donc eux aussi reproductibles — les URLs partagées pendant une démo restent
// valides après un nouveau `npm run seed`.
const ID_TS = SEED.toString(36).padStart(8, '0').slice(-8);
let idCounter = 0;

function cuid(): string {
  idCounter += 1;
  const counter = idCounter.toString(36).padStart(4, '0').slice(-4);
  const block = () => Math.floor(rnd() * 36 ** 6).toString(36).padStart(6, '0');
  return `c${ID_TS}${counter}${block()}${block()}`;
}

// ───────────────────────────────────────────────────────────────────────────
//  3. Dates
// ───────────────────────────────────────────────────────────────────────────

const NOW = new Date();
const DAY_MS = 86_400_000;

const daysAgo = (d: number): Date => new Date(NOW.getTime() - d * DAY_MS);
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 3_600_000);
const daysFromNow = (d: number): Date => new Date(NOW.getTime() + d * DAY_MS);

/** Date tronquée à minuit UTC — pour les colonnes `@db.Date`. */
function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Instant aléatoire entre deux bornes. */
function between(from: Date, to: Date): Date {
  const a = from.getTime();
  const b = Math.max(a + 1000, to.getTime());
  return new Date(a + rnd() * (b - a));
}

/** Formate des secondes en `m:ss` ou `h:mm:ss` (timestamps de chapitres). */
function timecode(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// ───────────────────────────────────────────────────────────────────────────
//  4. Divers
// ───────────────────────────────────────────────────────────────────────────

function slugify(text: string, fallback: string): string {
  const s = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s.length >= 3 ? s : fallback;
}

function chunked<T>(arr: T[], size = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Journalisation d'étape. */
let stepNo = 0;
const startedAt = Date.now();
function step(label: string): void {
  stepNo += 1;
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n[${String(stepNo).padStart(2, '0')}] ${label}  (+${elapsed}s)`);
}
function done(label: string, count: number): void {
  console.log(`     ✓ ${label.padEnd(30, '.')} ${String(count).padStart(6, ' ')}`);
}

/** Récapitulatif final. */
const totals: Record<string, number> = {};
function tally(table: string, count: number): void {
  totals[table] = (totals[table] ?? 0) + count;
}

/**
 * Insère par lots via `createMany` et comptabilise le résultat.
 */
async function insertMany<T>(
  table: string,
  rows: T[],
  run: (batch: T[]) => Promise<{ count: number }>,
): Promise<void> {
  let inserted = 0;
  for (const batch of chunked(rows)) {
    const res = await run(batch);
    inserted += res.count;
  }
  tally(table, inserted);
  done(table, inserted);
}

// ───────────────────────────────────────────────────────────────────────────
//  5. Modèle de rétention
// ───────────────────────────────────────────────────────────────────────────

interface RetentionShape {
  /** Part d'audience perdue sur les 10 premiers % (chute d'accroche). */
  initialDrop: number;
  /** Niveau du plateau final, exprimé en fraction du niveau post-chute. */
  plateauRatio: number;
  /** Petit rebond de fin (écran de fin, générique). */
  endBump: number;
}

/**
 * Construit une courbe de rétention de 100 buckets, valeurs dans [0, 1] :
 * chute marquée sur les 10 premiers %, plateau doucement décroissant,
 * puis léger rebond sur les toutes dernières secondes.
 */
function retentionCurve(shape: RetentionShape): number[] {
  const afterHook = 1 - shape.initialDrop;
  const plateauEnd = afterHook * shape.plateauRatio;
  const curve: number[] = [];
  for (let b = 0; b < 100; b += 1) {
    let v: number;
    if (b <= 9) {
      // Chute d'accroche, plus raide sur les toutes premières secondes.
      const t = b / 9;
      v = 1 - shape.initialDrop * (1 - Math.pow(1 - t, 1.8));
    } else if (b <= 89) {
      const t = (b - 10) / 79;
      v = afterHook + (plateauEnd - afterHook) * t;
    } else {
      const t = (b - 90) / 9;
      v = plateauEnd + shape.endBump * Math.sin(t * Math.PI);
    }
    curve.push(clamp(v + rndFloat(-0.012, 0.012), 0.02, 1));
  }
  curve[0] = 1;
  return curve;
}

const curveMean = (curve: number[]): number => curve.reduce((s, v) => s + v, 0) / curve.length;

// ═══════════════════════════════════════════════════════════════════════════
//  PURGE
// ═══════════════════════════════════════════════════════════════════════════

async function purge(): Promise<void> {
  step('Purge des tables (ordre de dépendances)');

  // Les vidéos sont référencées par `Channel.trailerVideoId` : on casse le
  // lien avant de les supprimer.
  await prisma.channel.updateMany({ data: { trailerVideoId: null } });

  const steps: [string, () => Promise<{ count: number }>][] = [
    ['moderationLog', () => prisma.moderationLog.deleteMany()],
    ['notification', () => prisma.notification.deleteMany()],
    ['commentReaction', () => prisma.commentReaction.deleteMany()],
    ['like', () => prisma.like.deleteMany()],
    ['comment', () => prisma.comment.deleteMany()],
    ['playlistItem', () => prisma.playlistItem.deleteMany()],
    ['playlist', () => prisma.playlist.deleteMany()],
    ['retentionPoint', () => prisma.retentionPoint.deleteMany()],
    ['videoStatDaily', () => prisma.videoStatDaily.deleteMany()],
    ['channelStatDaily', () => prisma.channelStatDaily.deleteMany()],
    ['watchHistory', () => prisma.watchHistory.deleteMany()],
    ['view', () => prisma.view.deleteMany()],
    ['searchQuery', () => prisma.searchQuery.deleteMany()],
    ['videoTag', () => prisma.videoTag.deleteMany()],
    ['tag', () => prisma.tag.deleteMany()],
    ['videoVariant', () => prisma.videoVariant.deleteMany()],
    ['videoChapter', () => prisma.videoChapter.deleteMany()],
    ['videoCaption', () => prisma.videoCaption.deleteMany()],
    ['uploadSession', () => prisma.uploadSession.deleteMany()],
    ['subscription', () => prisma.subscription.deleteMany()],
    ['communityPost', () => prisma.communityPost.deleteMany()],
    ['video', () => prisma.video.deleteMany()],
    ['channel', () => prisma.channel.deleteMany()],
    ['refreshToken', () => prisma.refreshToken.deleteMany()],
    ['emailToken', () => prisma.emailToken.deleteMany()],
    ['user', () => prisma.user.deleteMany()],
  ];

  let removed = 0;
  for (const [, fn] of steps) removed += (await fn()).count;
  done('lignes supprimées', removed);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SEED
// ═══════════════════════════════════════════════════════════════════════════

interface ChannelRow {
  id: string;
  ownerId: string;
  ownerIndex: number;
  handle: string;
  seedIndex: number;
  createdAt: Date;
  categories: string[];
  audienceFactor: number;
}

interface VideoRow {
  id: string;
  slug: string;
  channelIndex: number;
  channelId: string;
  ownerId: string;
  categorySlug: string;
  categoryId: string;
  title: string;
  kind: VideoKind;
  status: VideoStatus;
  visibility: VideoVisibility;
  durationSec: number;
  ageDays: number;
  publishedAt: Date | null;
  publishAt: Date | null;
  createdAt: Date;
  viral: boolean;
  // Métriques
  views: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  impressions: number;
  clicks: number;
  ctr: number;
  avgWatchPct: number;
  avgWatchSec: number;
  engagementRate: number;
  hotScore: number;
  curve: number[];
  tagNames: string[];
  chapters: { startSec: number; title: string }[];
  thumbnailUrl: string;
  mp4Url: string;
  commentsEnabled: boolean;
  ageRestricted: boolean;
  madeForKids: boolean;
  width: number;
  height: number;
  processingProgress: number;
  /** Éligible au feed / aux interactions publiques. */
  public: boolean;
}

async function main(): Promise<void> {
  // ── Garde-fou ────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refus d’exécution : le seed purge toutes les tables et NODE_ENV vaut "production".',
    );
  }

  console.log('═'.repeat(74));
  console.log('  Kelvyn Tube — seed de démonstration');
  console.log(`  graine PRNG : ${SEED}   ·   NODE_ENV : ${process.env.NODE_ENV ?? 'undefined'}`);
  console.log('═'.repeat(74));

  await purge();

  // ── 1. Catégories (upsert idempotent par slug) ───────────────────────────
  step('Catégories');
  const categoryIdBySlug = new Map<string, string>();
  for (const c of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, icon: c.icon, order: c.order },
      create: { id: cuid(), slug: c.slug, name: c.name, icon: c.icon, order: c.order },
    });
    categoryIdBySlug.set(c.slug, row.id);
  }
  tally('category', CATEGORIES.length);
  done('category', CATEGORIES.length);

  // ── 2. Utilisateurs ──────────────────────────────────────────────────────
  step('Utilisateurs');
  // Tous les comptes de démo partagent le même mot de passe : un seul hash
  // argon2 suffit (et évite 12 dérivations coûteuses inutiles).
  const passwordHash = await argon2.hash(DEMO_PASSWORD);

  // Ancienneté d'un utilisateur = ancienneté de sa plus vieille chaîne + marge.
  const oldestChannelMonths = new Map<number, number>();
  CHANNELS.forEach((c) => {
    const cur = oldestChannelMonths.get(c.ownerIndex) ?? 0;
    oldestChannelMonths.set(c.ownerIndex, Math.max(cur, c.ageMonths));
  });

  const userIds = USERS.map(() => cuid());
  const userCreatedAt = USERS.map((_, i) => daysAgo((oldestChannelMonths.get(i) ?? 6) * 30 + rndInt(3, 45)));

  const userRows: Prisma.UserCreateManyInput[] = USERS.map((u, i) => {
    const mainChannel = CHANNELS.find((c) => c.ownerIndex === i);
    const handle = mainChannel ? mainChannel.handle : `user${i}`;
    return {
      id: userIds[i],
      email: u.email,
      emailVerified: new Date(userCreatedAt[i].getTime() + 3_600_000),
      passwordHash,
      displayName: u.displayName,
      avatarUrl: `${PICSUM}/${handle}/400/400`,
      role: u.role,
      interests: u.interests,
      onboardedAt: new Date(userCreatedAt[i].getTime() + 7_200_000),
      locale: 'fr',
      country: u.country,
      theme: i === 0 ? 'dark' : pick(['dark', 'dark', 'light', 'system']),
      autoplay: chance(0.8),
      restrictedMode: false,
      createdAt: userCreatedAt[i],
      lastSeenAt: i === 0 ? hoursAgo(1) : hoursAgo(rndInt(2, 400)),
    };
  });
  await insertMany('user', userRows, (b) => prisma.user.createMany({ data: b }));
  const demoUserId = userIds[0];

  // ── 3. Chaînes ───────────────────────────────────────────────────────────
  step('Chaînes');
  const channelRows: ChannelRow[] = CHANNELS.map((c, i) => ({
    id: cuid(),
    ownerId: userIds[c.ownerIndex],
    ownerIndex: c.ownerIndex,
    handle: c.handle,
    seedIndex: i,
    createdAt: daysAgo(c.ageMonths * 30),
    categories: c.categories,
    audienceFactor: c.audienceFactor,
  }));

  const channelCreate: Prisma.ChannelCreateManyInput[] = CHANNELS.map((c, i) => ({
    id: channelRows[i].id,
    ownerId: channelRows[i].ownerId,
    handle: c.handle,
    name: c.name,
    description: c.description,
    avatarUrl: `${PICSUM}/${c.handle}/400/400`,
    bannerUrl: `${PICSUM}/${c.handle}-banner/2560/1440`,
    location: c.location,
    links: c.links as unknown as Prisma.InputJsonValue,
    verified: c.verified,
    monetizationEnabled: c.monetizationEnabled,
    blockedWords: i === 0 ? ['arnaque', 'spam', 'crypto-gratuit'] : [],
    createdAt: channelRows[i].createdAt,
  }));
  await insertMany('channel', channelCreate, (b) => prisma.channel.createMany({ data: b }));

  // Chaîne active par défaut = première chaîne de l'utilisateur.
  for (let i = 0; i < USERS.length; i += 1) {
    const main = channelRows.find((c) => c.ownerIndex === i);
    if (main) {
      await prisma.user.update({ where: { id: userIds[i] }, data: { activeChannelId: main.id } });
    }
  }
  const demoMain = channelRows[0];

  // ── 4. Vidéos ────────────────────────────────────────────────────────────
  step('Vidéos');

  // Distributeurs de titres : une file mélangée par catégorie, réalimentée
  // avec un suffixe si elle se vide (garantit des titres uniques).
  const titleQueues = new Map<string, string[]>();
  const titleRefills = new Map<string, number>();
  function nextTitle(categorySlug: string, kind: VideoKind): string {
    const key = `${kind}:${categorySlug}`;
    let q = titleQueues.get(key);
    if (!q || q.length === 0) {
      const refill = (titleRefills.get(key) ?? 0) + 1;
      titleRefills.set(key, refill);
      const pool =
        kind === 'SHORT'
          ? (SHORT_TITLES[categorySlug] ?? SHORT_TITLES.vlog)
          : (VIDEO_TITLES[categorySlug] ?? VIDEO_TITLES.tech);
      q = shuffle(pool).map((t) => (refill > 1 ? `${t} — partie ${refill}` : t));
      titleQueues.set(key, q);
    }
    return q.pop() as string;
  }

  /** Ancienneté d'une vidéo : concentrée sur les 30 derniers jours. */
  function pickAgeDays(channelAgeMonths: number): number {
    const maxDays = Math.min(540, channelAgeMonths * 30);
    const r = rnd();
    if (r < 0.42 || maxDays <= 30) return rndFloat(0.4, Math.min(30, maxDays));
    if (r < 0.7) return rndFloat(30, Math.min(180, maxDays));
    return rndFloat(Math.min(180, maxDays), maxDays);
  }

  const videos: VideoRow[] = [];
  let slugCounter = 0;
  let mp4Cursor = 0;

  for (let ci = 0; ci < CHANNELS.length; ci += 1) {
    const seed = CHANNELS[ci];
    const ch = channelRows[ci];
    const isDemoMain = ci === 0;

    // Répartition Shorts / vidéos longues, mélangée pour ne pas les grouper.
    const kinds: VideoKind[] = shuffle([
      ...Array<VideoKind>(seed.shortCount).fill('SHORT'),
      ...Array<VideoKind>(seed.videoCount - seed.shortCount).fill('LONG'),
    ]);

    // États spéciaux réservés à la chaîne principale du compte de démo,
    // pour que le Studio affiche tous les cas possibles.
    const specialQueue: { status: VideoStatus; visibility: VideoVisibility; progress: number }[] = isDemoMain
      ? [
          { status: 'PROCESSING', visibility: 'PRIVATE', progress: 24 },
          { status: 'PROCESSING', visibility: 'PUBLIC', progress: 61 },
          { status: 'PROCESSING', visibility: 'PUBLIC', progress: 88 },
          { status: 'FAILED', visibility: 'PRIVATE', progress: 43 },
          { status: 'READY', visibility: 'SCHEDULED', progress: 100 },
          { status: 'READY', visibility: 'SCHEDULED', progress: 100 },
          { status: 'READY', visibility: 'PRIVATE', progress: 100 },
          { status: 'READY', visibility: 'UNLISTED', progress: 100 },
        ]
      : [];

    for (let vi = 0; vi < seed.videoCount; vi += 1) {
      const kind = kinds[vi];
      const categorySlug = pick(seed.categories);
      const title = nextTitle(categorySlug, kind);

      // Les états spéciaux ne concernent que les vidéos longues.
      const special = kind === 'LONG' && specialQueue.length > 0 ? specialQueue.shift() : undefined;
      const status: VideoStatus = special ? special.status : 'READY';
      const visibility: VideoVisibility = special ? special.visibility : 'PUBLIC';
      const isPublic = status === 'READY' && visibility === 'PUBLIC';

      const ageDays = special ? rndFloat(0.2, 9) : pickAgeDays(seed.ageMonths);
      const createdAt = daysAgo(ageDays + rndFloat(0.2, 3));
      const publishedAt =
        status === 'READY' && (visibility === 'PUBLIC' || visibility === 'UNLISTED')
          ? daysAgo(ageDays)
          : null;
      const publishAt = visibility === 'SCHEDULED' ? daysFromNow(rndFloat(1.5, 21)) : null;

      // Durée : Shorts 15-59 s ; longues de 45 s à 2 h, majoritairement 6-22 min.
      let durationSec: number;
      if (kind === 'SHORT') {
        durationSec = rndInt(15, 59);
      } else {
        const r = rnd();
        if (r < 0.08) durationSec = rndInt(45, 240);
        else if (r < 0.62) durationSec = rndInt(360, 1320);
        else if (r < 0.88) durationSec = rndInt(1320, 2700);
        else durationSec = rndInt(2700, 7200);
      }

      const slug = `${slugify(title, 'video')}-${(slugCounter += 1)}`;
      const width = kind === 'SHORT' ? 1080 : 1920;
      const height = kind === 'SHORT' ? 1920 : 1080;
      const thumbnailUrl =
        kind === 'SHORT' ? `${PICSUM}/${slug}/720/1280` : `${PICSUM}/${slug}/1280/720`;
      const mp4Url = MP4_SOURCES[mp4Cursor % MP4_SOURCES.length];
      mp4Cursor += 1;

      videos.push({
        id: cuid(),
        slug,
        channelIndex: ci,
        channelId: ch.id,
        ownerId: ch.ownerId,
        categorySlug,
        categoryId: categoryIdBySlug.get(categorySlug) as string,
        title,
        kind,
        status,
        visibility,
        durationSec,
        ageDays,
        publishedAt,
        publishAt,
        createdAt,
        viral: false,
        views: 0,
        likeCount: 0,
        dislikeCount: 0,
        commentCount: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        avgWatchPct: 0,
        avgWatchSec: 0,
        engagementRate: 0,
        hotScore: 0,
        curve: [],
        tagNames: [],
        chapters: [],
        thumbnailUrl,
        mp4Url,
        commentsEnabled: !chance(0.04),
        ageRestricted: isPublic && chance(0.015),
        madeForKids: isPublic && chance(0.05),
        width,
        height,
        processingProgress: special ? special.progress : 100,
        public: isPublic,
      });
    }
  }

  // ── 4b. Vidéos « virales » récentes (le feed algorithmique a besoin de
  //        têtes d'affiche crédibles) ───────────────────────────────────────
  const viralCandidates = videos
    .filter((v) => v.public && v.ageDays <= 18)
    .sort((a, b) => a.ageDays - b.ageDays);
  // Au moins deux sur la chaîne de démo pour que son Studio soit spectaculaire.
  const demoViral = viralCandidates.filter((v) => v.channelIndex === 0).slice(0, 2);
  const otherViral = viralCandidates.filter((v) => v.channelIndex !== 0).slice(0, 5);
  for (const v of [...demoViral, ...otherViral]) v.viral = true;

  // ── 4c. Métriques cohérentes ─────────────────────────────────────────────
  for (const v of videos) {
    const seed = CHANNELS[v.channelIndex];

    // Courbe de rétention → `avgWatchPct` (les deux sont donc cohérents).
    const shape: RetentionShape = v.viral
      ? { initialDrop: rndFloat(0.16, 0.26), plateauRatio: rndFloat(0.7, 0.84), endBump: rndFloat(0.03, 0.07) }
      : v.kind === 'SHORT'
        ? { initialDrop: rndFloat(0.08, 0.2), plateauRatio: rndFloat(0.72, 0.9), endBump: rndFloat(0.04, 0.1) }
        : { initialDrop: rndFloat(0.3, 0.55), plateauRatio: rndFloat(0.34, 0.62), endBump: rndFloat(0.01, 0.05) };
    v.curve = retentionCurve(shape);
    v.avgWatchPct = round4(curveMean(v.curve));
    v.avgWatchSec = round2(v.durationSec * v.avgWatchPct);

    if (!v.public) {
      // Vidéos non publiées : aucun signal (elles n'ont jamais été distribuées).
      v.hotScore = 0;
      continue;
    }

    // Vues : loi log-normale, pondérée par l'audience de la chaîne et la
    // maturité de la vidéo (une vidéo d'hier n'a pas encore tout capitalisé…
    // sauf si elle est virale : elle capitalise justement en quelques jours).
    const maturity = v.viral ? rndFloat(0.85, 1.1) : 0.32 + 0.68 * Math.min(1, v.ageDays / 110);
    let views = Math.exp(rndFloat(6.9, 11.5)) * seed.audienceFactor * maturity;
    if (v.kind === 'SHORT') views *= rndFloat(1.8, 4.4);
    if (v.viral) views *= rndFloat(6, 16);
    v.views = Math.max(37, Math.round(views));

    // CTR : les virales et les Shorts performent nettement mieux.
    v.ctr = round4(
      v.viral ? rndFloat(0.098, 0.145) : v.kind === 'SHORT' ? rndFloat(0.05, 0.11) : rndFloat(0.021, 0.082),
    );
    // Tous les clics ne deviennent pas une vue qualifiée (~6 % de déperdition).
    v.clicks = Math.round(v.views * rndFloat(1.04, 1.12));
    v.impressions = Math.max(v.clicks, Math.round(v.clicks / v.ctr));
    v.ctr = round4(v.clicks / v.impressions); // exactitude : ctr = clicks / impressions

    const likeRate = v.viral ? rndFloat(0.055, 0.082) : rndFloat(0.021, 0.062);
    v.likeCount = Math.round(v.views * likeRate);
    v.dislikeCount = Math.round(v.likeCount * rndFloat(0.03, 0.1));
  }

  // ── 4d. Tags par vidéo (les hashtags de la description sont les mêmes,
  //        dans le même ordre : `syncVideoTags` retrouverait exactement ça) ─
  for (const v of videos) {
    const pool = TAGS_BY_CATEGORY[v.categorySlug] ?? TAGS_BY_CATEGORY.tech;
    const names = pickMany(pool, rndInt(3, Math.min(6, pool.length)));
    if (v.kind === 'SHORT' && !names.includes('shorts')) names.push('shorts');
    if (v.viral && !names.includes('2026')) names.push('2026');
    v.tagNames = names.slice(0, 7);
  }

  // ── 4e. Chapitres des vidéos longues ─────────────────────────────────────
  for (const v of videos) {
    if (v.kind === 'SHORT' || v.durationSec < 420) continue;
    const count = rndInt(4, Math.min(9, Math.floor(v.durationSec / 90)));
    if (count < 3) continue;
    // Sous-ensemble aléatoire MAIS conservant l'ordre narratif de la liste
    // (« Le contexte » avant « Bilan », etc.).
    const titles = shuffle(CHAPTER_TITLES.map((t, i) => i))
      .slice(0, count - 1)
      .sort((a, b) => a - b)
      .map((i) => CHAPTER_TITLES[i]);
    const chapters = [{ startSec: 0, title: 'Introduction' }];
    // Points de coupe strictement croissants, répartis sur la durée.
    const cuts = new Set<number>();
    while (cuts.size < count - 1) {
      cuts.add(Math.round(rndFloat(0.06, 0.94) * v.durationSec / 5) * 5);
    }
    [...cuts]
      .sort((a, b) => a - b)
      .forEach((startSec, i) => {
        if (startSec > 0) chapters.push({ startSec, title: titles[i] ?? 'Suite' });
      });
    v.chapters = chapters;
  }

  /** Compose une description réaliste : accroche, corps, chapitres, hashtags. */
  function buildDescription(v: VideoRow): string {
    const parts: string[] = [pick(DESCRIPTION_HOOKS)];
    if (v.kind === 'LONG') parts.push(pick(DESCRIPTION_BODIES));
    if (v.chapters.length > 0) {
      const lines = v.chapters.map((c) => `${timecode(c.startSec)} ${c.title}`);
      parts.push(`⏱️ Chapitres\n${lines.join('\n')}`);
    }
    parts.push(`👉 ${pick(DESCRIPTION_CTAS)}`);
    parts.push(v.tagNames.map((t) => `#${t}`).join(' '));
    return parts.join('\n\n');
  }

  const videoRows: Prisma.VideoCreateManyInput[] = videos.map((v) => {
    const engagementRate = v.views > 0 ? round4((v.likeCount + v.commentCount) / v.views) : 0;
    return {
      id: v.id,
      channelId: v.channelId,
      title: v.title,
      description: buildDescription(v),
      status: v.status,
      visibility: v.visibility,
      kind: v.kind,
      publishAt: v.publishAt,
      publishedAt: v.publishedAt,
      categoryId: v.categoryId,
      durationSec: v.status === 'READY' ? v.durationSec : 0,
      width: v.status === 'READY' ? v.width : null,
      height: v.status === 'READY' ? v.height : null,
      sourceKey: `uploads/${CHANNELS[v.channelIndex].handle}/${v.id}/source.mp4`,
      sourceSizeBytes: BigInt(Math.round(v.durationSec * 1_350_000)),
      // Pas de HLS en démo : le lecteur bascule automatiquement sur le MP4.
      hlsMasterUrl: null,
      mp4FallbackUrl: v.status === 'READY' ? v.mp4Url : null,
      thumbnailUrl: v.status === 'FAILED' ? null : v.thumbnailUrl,
      thumbnailCandidates:
        v.status === 'READY'
          ? ['a', 'b', 'c'].map((s) =>
              v.kind === 'SHORT' ? `${PICSUM}/${v.slug}-${s}/720/1280` : `${PICSUM}/${v.slug}-${s}/1280/720`,
            )
          : [],
      previewSpriteUrl: v.status === 'READY' ? `${CDN_BASE}/${v.id}/preview/sprite.jpg` : null,
      previewClipUrl: v.status === 'READY' ? v.mp4Url : null,
      processingProgress: v.processingProgress,
      processingError:
        v.status === 'FAILED'
          ? 'Transcodage interrompu : flux audio illisible (codec non supporté).'
          : null,
      viewCount: BigInt(v.views),
      likeCount: v.likeCount,
      dislikeCount: v.dislikeCount,
      commentCount: 0, // recalculé après la création des commentaires
      impressions: BigInt(v.impressions),
      clicks: BigInt(v.clicks),
      ctr: v.ctr,
      avgWatchSec: v.avgWatchSec,
      avgWatchPct: v.avgWatchPct,
      engagementRate,
      hotScore: 0, // recalculé après les commentaires (il en dépend)
      hotScoreUpdatedAt: v.public ? hoursAgo(rndInt(1, 6)) : null,
      commentsEnabled: v.commentsEnabled,
      ageRestricted: v.ageRestricted,
      madeForKids: v.madeForKids,
      language: 'fr',
      createdAt: v.createdAt,
    };
  });
  await insertMany('video', videoRows, (b) => prisma.video.createMany({ data: b }));

  // ── 5. Variantes de transcodage ──────────────────────────────────────────
  step('Variantes, chapitres');
  const variantRows: Prisma.VideoVariantCreateManyInput[] = [];
  for (const v of videos) {
    if (v.status !== 'READY') continue;
    // 2 ou 3 rendus selon la qualité de la source.
    const labels = chance(0.72) ? ['360p', '720p', '1080p'] : ['360p', '720p'];
    for (const label of labels) {
      const r = RENDITIONS.find((x) => x.label === label);
      if (!r) continue;
      // Un Short est vertical : on inverse largeur et hauteur.
      const w = v.kind === 'SHORT' ? r.height : r.width;
      const h = v.kind === 'SHORT' ? r.width : r.height;
      variantRows.push({
        id: cuid(),
        videoId: v.id,
        label,
        width: w,
        height: h,
        bitrateKbps: r.bitrateKbps,
        codec: 'h264',
        playlistUrl: `${CDN_BASE}/${v.id}/${label}/index.m3u8`,
        sizeBytes: BigInt(Math.round((r.bitrateKbps * 1000 * v.durationSec) / 8)),
        ready: true,
        createdAt: v.createdAt,
      });
    }
  }
  await insertMany('videoVariant', variantRows, (b) => prisma.videoVariant.createMany({ data: b }));

  const chapterRows: Prisma.VideoChapterCreateManyInput[] = videos.flatMap((v) =>
    v.chapters.map((c) => ({ id: cuid(), videoId: v.id, startSec: c.startSec, title: c.title })),
  );
  await insertMany('videoChapter', chapterRows, (b) => prisma.videoChapter.createMany({ data: b }));

  // ── 6. Tags ──────────────────────────────────────────────────────────────
  step('Tags & hashtags tendances');
  const tagIdByName = new Map<string, string>();
  const usageCount = new Map<string, number>();
  const recentUsage = new Map<string, number>();
  for (const t of TAGS) {
    tagIdByName.set(t.name, cuid());
    usageCount.set(t.name, 0);
    recentUsage.set(t.name, 0);
  }

  const videoTagRows: Prisma.VideoTagCreateManyInput[] = [];
  for (const v of videos) {
    v.tagNames.forEach((name, position) => {
      const tagId = tagIdByName.get(name);
      if (!tagId) return;
      videoTagRows.push({ videoId: v.id, tagId, position });
      usageCount.set(name, (usageCount.get(name) ?? 0) + 1);
      // « Usage récent » : vidéos publiées ces derniers jours — c'est ce qui
      // alimente le classement des hashtags tendances.
      if (v.public && v.ageDays <= 3) recentUsage.set(name, (recentUsage.get(name) ?? 0) + 1);
    });
  }

  const tagRows: Prisma.TagCreateManyInput[] = TAGS.map((t) => {
    const usage = usageCount.get(t.name) ?? 0;
    // Un tag « tendance » est massivement utilisé sur la période récente.
    const recent = t.trending
      ? Math.max(recentUsage.get(t.name) ?? 0, Math.ceil(usage * rndFloat(0.45, 0.8)))
      : (recentUsage.get(t.name) ?? 0) + (usage > 0 && chance(0.4) ? 1 : 0);
    const ratio = usage > 0 ? recent / usage : 0;
    const trendingScore = t.trending
      ? round4(clamp(0.72 + ratio * 0.25 + rndFloat(0, 0.05), 0.72, 0.98))
      : round4(clamp(ratio * 0.85 + rndFloat(0, 0.12), 0, 0.66));
    return {
      id: tagIdByName.get(t.name) as string,
      name: t.name,
      usageCount: usage,
      recentUsage: recent,
      trendingScore,
      createdAt: daysAgo(rndInt(90, 500)),
    };
  });
  await insertMany('tag', tagRows, (b) => prisma.tag.createMany({ data: b }));
  await insertMany('videoTag', videoTagRows, (b) => prisma.videoTag.createMany({ data: b }));

  // ── 7. Abonnements ───────────────────────────────────────────────────────
  step('Abonnements');
  const subscriptionRows: Prisma.SubscriptionCreateManyInput[] = [];
  /** Dates d'abonnement par chaîne — réutilisées par les stats journalières. */
  const subsByChannel = new Map<string, Date[]>();
  channelRows.forEach((c) => subsByChannel.set(c.id, []));
  const demoSubscribedChannels: ChannelRow[] = [];

  for (let ui = 0; ui < USERS.length; ui += 1) {
    const eligible = channelRows.filter((c) => c.ownerIndex !== ui);
    const n = ui === 0 ? 6 : rndInt(4, 9);
    const targets = pickMany(eligible, n);
    for (const target of targets) {
      const from = new Date(Math.max(target.createdAt.getTime(), userCreatedAt[ui].getTime()));
      const createdAt = between(from, NOW);
      const level = weightedKey({ ALL: 28, PERSONALIZED: 56, NONE: 16 }) as NotificationLevel;
      subscriptionRows.push({
        id: cuid(),
        subscriberId: userIds[ui],
        channelId: target.id,
        level,
        createdAt,
      });
      (subsByChannel.get(target.id) as Date[]).push(createdAt);
      if (ui === 0) demoSubscribedChannels.push(target);
    }
  }
  await insertMany('subscription', subscriptionRows, (b) => prisma.subscription.createMany({ data: b }));

  // ── 8. Commentaires (+ réponses sur 2 niveaux) ───────────────────────────
  step('Commentaires & réactions');
  interface CommentRow {
    id: string;
    videoId: string;
    authorId: string;
    parentId: string | null;
    createdAt: Date;
    likeCount: number;
    videoViews: number;
  }
  const comments: CommentRow[] = [];
  const commentRows: Prisma.CommentCreateManyInput[] = [];
  const replyRows: Prisma.CommentCreateManyInput[] = [];
  const commentCountByVideo = new Map<string, number>();
  const replyCountByRoot = new Map<string, number>();

  // Les commentaires se concentrent sur les vidéos publiques les plus vues.
  const commentables = shuffle(
    [...videos]
      .filter((v) => v.public && v.commentsEnabled)
      .sort((a, b) => b.views - a.views)
      .slice(0, 46),
  );
  const TARGET_ROOTS = 215;
  let rootsCreated = 0;

  for (const v of commentables) {
    if (rootsCreated >= TARGET_ROOTS) break;
    const owner = channelRows[v.channelIndex].ownerId;
    const others = userIds.filter((id) => id !== owner);
    const popularity = clamp(Math.log10(Math.max(10, v.views)) / 6, 0.15, 1);
    const rootCount = Math.max(2, Math.round(rndInt(3, 15) * popularity + 1));
    const publishedAt = v.publishedAt ?? v.createdAt;
    let pinnedUsed = false;

    for (let i = 0; i < rootCount && rootsCreated < TARGET_ROOTS; i += 1) {
      const pinned = !pinnedUsed && i === 0 && chance(0.2);
      const authorId = pinned ? owner : pick(others);
      const createdAt = between(publishedAt, NOW);
      const id = cuid();
      const likeCount = Math.round(rndFloat(0, 1) ** 2 * (v.likeCount * 0.035 + 8));
      comments.push({ id, videoId: v.id, authorId, parentId: null, createdAt, likeCount, videoViews: v.views });
      commentRows.push({
        id,
        videoId: v.id,
        authorId,
        parentId: null,
        text: pinned ? pick(PINNED_TEXTS) : pick(COMMENT_TEXTS),
        likeCount,
        replyCount: 0,
        pinned,
        heartedByCreator: !pinned && chance(0.11),
        edited: chance(0.06),
        mentions: [],
        createdAt,
      });
      if (pinned) pinnedUsed = true;
      rootsCreated += 1;
      commentCountByVideo.set(v.id, (commentCountByVideo.get(v.id) ?? 0) + 1);

      // Fil de réponses (un seul niveau, comme sur YouTube).
      if (chance(0.34)) {
        const replies = rndInt(1, 3);
        for (let r = 0; r < replies; r += 1) {
          // Le créateur répond dans ~40 % des cas.
          const replyAuthor = chance(0.4) ? owner : pick(userIds.filter((u) => u !== authorId));
          const rid = cuid();
          const rCreatedAt = between(createdAt, NOW);
          const authorHandle = channelRows.find((c) => c.ownerId === authorId)?.handle;
          const mention = replyAuthor !== authorId && authorHandle && chance(0.45) ? authorHandle : null;
          const rLikeCount = Math.round(rndFloat(0, 1) ** 2 * 24);
          comments.push({
            id: rid,
            videoId: v.id,
            authorId: replyAuthor,
            parentId: id,
            createdAt: rCreatedAt,
            likeCount: rLikeCount,
            videoViews: v.views,
          });
          replyRows.push({
            id: rid,
            videoId: v.id,
            authorId: replyAuthor,
            parentId: id,
            text: mention ? `@${mention} ${pick(REPLY_TEXTS)}` : pick(REPLY_TEXTS),
            likeCount: rLikeCount,
            replyCount: 0,
            pinned: false,
            heartedByCreator: replyAuthor !== owner && chance(0.14),
            edited: chance(0.04),
            mentions: mention ? [mention] : [],
            createdAt: rCreatedAt,
          });
          replyCountByRoot.set(id, (replyCountByRoot.get(id) ?? 0) + 1);
          commentCountByVideo.set(v.id, (commentCountByVideo.get(v.id) ?? 0) + 1);
        }
      }
    }
  }

  // Report du nombre de réponses sur les commentaires racines.
  for (const row of commentRows) {
    row.replyCount = replyCountByRoot.get(row.id as string) ?? 0;
  }

  await insertMany('comment (racines)', commentRows, (b) => prisma.comment.createMany({ data: b }));
  await insertMany('comment (réponses)', replyRows, (b) => prisma.comment.createMany({ data: b }));

  // Réactions emoji (contrainte d'unicité : commentId + userId + emoji).
  const reactionRows: Prisma.CommentReactionCreateManyInput[] = [];
  const reactionKeys = new Set<string>();
  for (const c of pickMany(comments, 70)) {
    for (const userId of pickMany(userIds, rndInt(1, 3))) {
      const emoji = pick(REACTION_EMOJIS);
      const key = `${c.id}|${userId}|${emoji}`;
      if (reactionKeys.has(key)) continue;
      reactionKeys.add(key);
      reactionRows.push({ id: cuid(), commentId: c.id, userId, emoji, createdAt: between(c.createdAt, NOW) });
    }
  }
  await insertMany('commentReaction', reactionRows, (b) => prisma.commentReaction.createMany({ data: b }));

  // ── 9. Likes polymorphes ─────────────────────────────────────────────────
  step('Likes');
  const likeRows: Prisma.LikeCreateManyInput[] = [];
  const likeKeys = new Set<string>();
  /** Vidéos likées par le compte de démo → alimente la playlist « Aimées ». */
  const demoLikedVideos: { videoId: string; at: Date }[] = [];

  function addLike(userId: string, targetType: 'VIDEO' | 'COMMENT', targetId: string, value: number, createdAt: Date): void {
    const key = `${userId}|${targetType}|${targetId}`;
    if (likeKeys.has(key)) return;
    likeKeys.add(key);
    likeRows.push({ id: cuid(), userId, targetType, targetId, value, createdAt });
  }

  const publicVideos = videos.filter((v) => v.public);
  // Le compte de démo aime une quinzaine de vidéos (playlist « Aimées »).
  const demoFavourites = pickMany(publicVideos, 15);
  for (const v of demoFavourites) {
    const at = between(v.publishedAt ?? v.createdAt, NOW);
    addLike(demoUserId, 'VIDEO', v.id, 1, at);
    demoLikedVideos.push({ videoId: v.id, at });
  }

  for (const v of publicVideos) {
    const popularity = clamp(Math.log10(Math.max(10, v.views)) / 6.2, 0.1, 1);
    const likers = pickMany(userIds, Math.max(3, Math.round(popularity * rndInt(6, 12))));
    for (const userId of likers) {
      addLike(userId, 'VIDEO', v.id, chance(0.08) ? -1 : 1, between(v.publishedAt ?? v.createdAt, NOW));
    }
  }
  for (const c of comments) {
    const likers = pickMany(userIds, rndInt(0, 6));
    for (const userId of likers) {
      if (userId === c.authorId) continue;
      addLike(userId, 'COMMENT', c.id, chance(0.05) ? -1 : 1, between(c.createdAt, NOW));
    }
  }
  await insertMany('like', likeRows, (b) => prisma.like.createMany({ data: b }));

  // ── 10. Consolidation des compteurs vidéo (commentCount + hotScore) ──────
  step('Consolidation des compteurs vidéo');
  let updatedVideos = 0;
  for (const v of videos) {
    v.commentCount = commentCountByVideo.get(v.id) ?? 0;
    v.engagementRate = v.views > 0 ? round4((v.likeCount + v.commentCount) / v.views) : 0;
    v.hotScore = computeHotScore(v);
  }
  // Une seule requête par vidéo, mais seulement 91 vidéos : c'est instantané.
  await prisma.$transaction(
    videos.map((v) =>
      prisma.video.update({
        where: { id: v.id },
        data: { commentCount: v.commentCount, engagementRate: v.engagementRate, hotScore: v.hotScore },
      }),
    ),
  );
  updatedVideos = videos.length;
  done('vidéos consolidées', updatedVideos);

  // ── 11. Compteurs de chaîne ──────────────────────────────────────────────
  step('Compteurs de chaîne');
  for (const ch of channelRows) {
    const chVideos = videos.filter((v) => v.channelId === ch.id);
    const subs = subsByChannel.get(ch.id) as Date[];
    await prisma.channel.update({
      where: { id: ch.id },
      data: {
        // `subscriberCount` reflète EXACTEMENT le nombre de lignes Subscription.
        subscriberCount: subs.length,
        // Compteur public : uniquement les vidéos réellement visibles.
        videoCount: chVideos.filter((v) => v.public).length,
        totalViews: BigInt(chVideos.reduce((s, v) => s + v.views, 0)),
      },
    });
  }
  done('chaînes mises à jour', channelRows.length);

  // Bande-annonce : la vidéo longue la plus vue de la chaîne principale.
  const trailer = videos
    .filter((v) => v.channelIndex === 0 && v.public && v.kind === 'LONG')
    .sort((a, b) => b.views - a.views)[0];
  if (trailer) {
    await prisma.channel.update({ where: { id: demoMain.id }, data: { trailerVideoId: trailer.id } });
  }

  // ── 12. Historique de visionnage du compte de démo ───────────────────────
  step('Historique & bibliothèque');
  const historyPool = pickMany(
    publicVideos.filter((v) => v.channelIndex !== 0 || chance(0.3)),
    25,
  );
  const watchHistoryRows: Prisma.WatchHistoryCreateManyInput[] = historyPool.map((v) => {
    const completed = chance(0.36);
    const positionSec = completed
      ? Math.max(0, v.durationSec - rndInt(0, 4))
      : Math.round(v.durationSec * rndFloat(0.04, 0.92));
    return {
      id: cuid(),
      userId: demoUserId,
      videoId: v.id,
      positionSec,
      completed,
      watchedAt: between(daysAgo(30), NOW),
    };
  });
  await insertMany('watchHistory', watchHistoryRows, (b) => prisma.watchHistory.createMany({ data: b }));

  // ── 13. Playlists ────────────────────────────────────────────────────────
  const playlistRows: Prisma.PlaylistCreateManyInput[] = [];
  const playlistItemRows: Prisma.PlaylistItemCreateManyInput[] = [];

  function addPlaylist(
    title: string,
    description: string | null,
    kind: 'USER' | 'WATCH_LATER' | 'LIKED',
    visibility: VideoVisibility,
    items: { videoId: string; addedAt: Date; thumbnailUrl: string }[],
    channelId: string | null,
  ): void {
    const id = cuid();
    playlistRows.push({
      id,
      ownerId: demoUserId,
      channelId,
      title,
      description,
      visibility,
      kind,
      thumbnailUrl: items[0]?.thumbnailUrl ?? null,
      itemCount: items.length,
      createdAt: daysAgo(rndInt(40, 300)),
    });
    items.forEach((item, position) => {
      playlistItemRows.push({
        id: cuid(),
        playlistId: id,
        videoId: item.videoId,
        position,
        addedAt: item.addedAt,
      });
    });
  }

  const videoById = new Map(videos.map((v) => [v.id, v]));

  // Playlists système.
  const watchLater = pickMany(publicVideos, 9).map((v) => ({
    videoId: v.id,
    addedAt: between(daysAgo(45), NOW),
    thumbnailUrl: v.thumbnailUrl,
  }));
  addPlaylist('À regarder plus tard', null, 'WATCH_LATER', 'PRIVATE', watchLater, null);

  const liked = [...demoLikedVideos]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((l) => ({
      videoId: l.videoId,
      addedAt: l.at,
      thumbnailUrl: (videoById.get(l.videoId) as VideoRow).thumbnailUrl,
    }));
  addPlaylist('Vidéos que j’aime', null, 'LIKED', 'PRIVATE', liked, null);

  // Playlists créées par l'utilisateur, rattachées à sa chaîne principale.
  for (const p of USER_PLAYLISTS) {
    const pool = publicVideos.filter((v) => p.categories.includes(v.categorySlug));
    const chosen = pickMany(pool.length >= 4 ? pool : publicVideos, p.itemCount).map((v) => ({
      videoId: v.id,
      addedAt: between(daysAgo(200), NOW),
      thumbnailUrl: v.thumbnailUrl,
    }));
    addPlaylist(p.title, p.description, 'USER', p.visibility, chosen, demoMain.id);
  }

  await insertMany('playlist', playlistRows, (b) => prisma.playlist.createMany({ data: b }));
  await insertMany('playlistItem', playlistItemRows, (b) => prisma.playlistItem.createMany({ data: b }));

  // ── 14. Analytics ────────────────────────────────────────────────────────
  step('Analytics (90 jours)');
  const WINDOW = 90;
  /**
   * Vidéos suivies finement : celles, publiées, des deux chaînes du compte de
   * démo (le Studio doit avoir des graphiques et une courbe de rétention).
   */
  const trackedVideos = videos.filter(
    (v) =>
      (v.channelIndex === 0 || v.channelIndex === 1) &&
      v.status === 'READY' &&
      (v.visibility === 'PUBLIC' || v.visibility === 'UNLISTED'),
  );

  /**
   * Répartit les vues d'une vidéo sur la fenêtre glissante : pic au moment
   * de la publication, puis longue traîne.
   */
  function dailyViewCurve(v: VideoRow): number[] {
    const out = new Array<number>(WINDOW).fill(0);
    if (!v.public && v.visibility !== 'UNLISTED') return out;
    // Part des vues totales réalisée sur les 90 derniers jours.
    const share = v.ageDays <= WINDOW ? rndFloat(0.86, 0.99) : rndFloat(0.16, 0.42);
    const inWindow = Math.round(v.views * share);
    const weights: number[] = [];
    for (let d = 0; d < WINDOW; d += 1) {
      const dayAge = WINDOW - 1 - d; // 89 = il y a 89 jours, 0 = aujourd'hui
      const sincePublish = v.ageDays - dayAge;
      weights.push(sincePublish < 0 ? 0 : (Math.exp(-sincePublish / 19) + 0.1) * rndFloat(0.6, 1.4));
    }
    const sum = weights.reduce((s, w) => s + w, 0);
    if (sum <= 0) return out;
    let allocated = 0;
    for (let d = 0; d < WINDOW; d += 1) {
      out[d] = Math.floor((weights[d] / sum) * inWindow);
      allocated += out[d];
    }
    // Le reliquat va sur le jour le plus fort.
    let best = 0;
    for (let d = 1; d < WINDOW; d += 1) if (weights[d] > weights[best]) best = d;
    out[best] += inWindow - allocated;
    return out;
  }

  const viewCurves = new Map<string, number[]>();
  for (const v of videos) viewCurves.set(v.id, dailyViewCurve(v));

  // Abonnements gagnés par chaîne et par jour (issus des vraies lignes
  // Subscription) : `subscriberTotal` reste donc parfaitement cohérent.
  function subsPerDay(channelId: string): { gained: number[]; before: number } {
    const dates = subsByChannel.get(channelId) as Date[];
    const gained = new Array<number>(WINDOW).fill(0);
    let before = 0;
    for (const d of dates) {
      const dayAge = Math.floor((NOW.getTime() - d.getTime()) / DAY_MS);
      if (dayAge >= WINDOW) before += 1;
      else gained[WINDOW - 1 - dayAge] += 1;
    }
    return { gained, before };
  }

  // ── 14a. VideoStatDaily ──────────────────────────────────────────────────
  const videoStatRows: Prisma.VideoStatDailyCreateManyInput[] = [];
  /** Attribution des abonnements gagnés à la vidéo la plus vue du jour. */
  const subsCreditByVideoDay = new Map<string, number>();
  for (const chIndex of [0, 1]) {
    const ch = channelRows[chIndex];
    const { gained } = subsPerDay(ch.id);
    const chVideos = trackedVideos.filter((v) => v.channelIndex === chIndex);
    for (let d = 0; d < WINDOW; d += 1) {
      if (gained[d] === 0) continue;
      const best = chVideos
        .map((v) => ({ v, views: (viewCurves.get(v.id) as number[])[d] }))
        .sort((a, b) => b.views - a.views)[0];
      if (best && best.views > 0) subsCreditByVideoDay.set(`${best.v.id}|${d}`, gained[d]);
    }
  }

  for (const v of trackedVideos) {
    const curve = viewCurves.get(v.id) as number[];
    const rpm = rndFloat(1.1, 4.6); // revenu pour 1 000 vues, en euros
    const likeRate = v.views > 0 ? v.likeCount / v.views : 0;
    const commentRate = v.views > 0 ? v.commentCount / v.views : 0;
    for (let d = 0; d < WINDOW; d += 1) {
      const views = curve[d];
      if (views === 0) continue;
      const date = dateOnly(daysAgo(WINDOW - 1 - d));
      const avgViewPct = round4(clamp(v.avgWatchPct * rndFloat(0.88, 1.12), 0.04, 0.97));
      const dayCtr = clamp(v.ctr * rndFloat(0.82, 1.22), 0.005, 0.35);
      const clicks = Math.max(1, Math.round(views * rndFloat(1.02, 1.13)));
      const impressions = Math.max(clicks, Math.round(clicks / dayCtr));
      const likes = Math.round(views * likeRate * rndFloat(0.7, 1.3));
      videoStatRows.push({
        id: cuid(),
        videoId: v.id,
        date,
        views,
        watchTimeSec: BigInt(Math.round(views * v.durationSec * avgViewPct)),
        impressions,
        clicks,
        likes,
        dislikes: Math.round(likes * rndFloat(0.03, 0.1)),
        comments: Math.round(views * commentRate * rndFloat(0.6, 1.4)),
        shares: Math.round(likes * rndFloat(0.06, 0.22)),
        subsGained: subsCreditByVideoDay.get(`${v.id}|${d}`) ?? 0,
        // Aucun désabonnement n'est simulé : `subscriberTotal` doit rester
        // strictement croissant et égal au nombre réel d'abonnés.
        subsLost: 0,
        avgViewPct,
        estimatedRevenue: round2((views / 1000) * rpm),
        sourceBreakdown: distribute(views, TRAFFIC_SOURCE_WEIGHTS) as Prisma.InputJsonValue,
        deviceBreakdown: distribute(views, DEVICE_WEIGHTS) as Prisma.InputJsonValue,
        countryBreakdown: distribute(views, COUNTRY_WEIGHTS) as Prisma.InputJsonValue,
        ageBreakdown: distribute(views, AGE_WEIGHTS) as Prisma.InputJsonValue,
      });
    }
  }
  await insertMany('videoStatDaily', videoStatRows, (b) => prisma.videoStatDaily.createMany({ data: b }));

  // ── 14b. ChannelStatDaily (toutes les chaînes) ───────────────────────────
  const channelStatRows: Prisma.ChannelStatDailyCreateManyInput[] = [];
  for (const ch of channelRows) {
    const chVideos = videos.filter((v) => v.channelId === ch.id);
    const { gained, before } = subsPerDay(ch.id);
    const rpm = rndFloat(1.1, 4.2);
    let subscriberTotal = before;
    for (let d = 0; d < WINDOW; d += 1) {
      subscriberTotal += gained[d];
      let views = 0;
      let watchTimeSec = 0;
      for (const v of chVideos) {
        const dv = (viewCurves.get(v.id) as number[])[d];
        if (dv === 0) continue;
        views += dv;
        watchTimeSec += Math.round(dv * v.durationSec * v.avgWatchPct);
      }
      channelStatRows.push({
        id: cuid(),
        channelId: ch.id,
        date: dateOnly(daysAgo(WINDOW - 1 - d)),
        views,
        watchTimeSec: BigInt(watchTimeSec),
        subsGained: gained[d],
        subsLost: 0,
        subscriberTotal,
        estimatedRevenue: round2((views / 1000) * rpm),
      });
    }
  }
  await insertMany('channelStatDaily', channelStatRows, (b) => prisma.channelStatDaily.createMany({ data: b }));

  // ── 14c. Courbes de rétention ────────────────────────────────────────────
  const retentionRows: Prisma.RetentionPointCreateManyInput[] = [];
  for (const v of trackedVideos) {
    const basePlays = Math.max(12, Math.min(v.views, 2_000_000));
    for (let b = 0; b < 100; b += 1) {
      retentionRows.push({
        id: cuid(),
        videoId: v.id,
        bucket: b,
        plays: Math.max(1, Math.round(v.curve[b] * basePlays)),
      });
    }
  }
  await insertMany('retentionPoint', retentionRows, (b) => prisma.retentionPoint.createMany({ data: b }));

  // ── 15. Notifications ────────────────────────────────────────────────────
  step('Notifications, posts communautaires, recherches');
  const notifiableVideos = publicVideos.filter((v) => v.channelIndex !== 0);
  const demoVideos = videos.filter((v) => v.channelIndex === 0 && v.public);
  const notificationRows: Prisma.NotificationCreateManyInput[] = NOTIFICATIONS.map((n) => {
    // Les notifications liées à la chaîne pointent sur les vidéos de démo,
    // les autres sur les vidéos des chaînes suivies.
    const isOwn = n.type === 'NEW_COMMENT' || n.type === 'MILESTONE' || n.type === 'VIDEO_PROCESSED';
    const video = n.target === 'video' ? pick(isOwn ? demoVideos : notifiableVideos) : null;
    const actor = n.target === 'channel' ? demoMain : video ? channelRows[video.channelIndex] : demoMain;
    const createdAt = hoursAgo(n.ageHours);
    let link = '/';
    if (n.target === 'video' && video) link = `/watch?v=${video.id}`;
    else if (n.target === 'channel') link = `/@${demoMain.handle}`;
    else link = '/studio/videos';
    return {
      id: cuid(),
      userId: demoUserId,
      type: n.type,
      actorChannelId: actor.id,
      videoId: video?.id ?? null,
      commentId: null,
      title: n.title,
      body: n.body,
      imageUrl: video ? video.thumbnailUrl : `${PICSUM}/${actor.handle}/400/400`,
      link,
      payload: { source: 'seed' } as Prisma.InputJsonValue,
      readAt: n.read ? new Date(createdAt.getTime() + rndInt(10, 600) * 60_000) : null,
      createdAt,
    };
  });
  await insertMany('notification', notificationRows, (b) => prisma.notification.createMany({ data: b }));

  // ── 16. Publications communautaires ──────────────────────────────────────
  const postRows: Prisma.CommunityPostCreateManyInput[] = COMMUNITY_POSTS.map((text, i) => ({
    id: cuid(),
    channelId: demoMain.id,
    text,
    imageUrl: chance(0.4) ? `${PICSUM}/post-${i + 1}/1200/900` : null,
    likeCount: rndInt(4, 320),
    createdAt: daysAgo(rndInt(2, 120)),
  }));
  await insertMany('communityPost', postRows, (b) => prisma.communityPost.createMany({ data: b }));

  // ── 17. Requêtes de recherche (autocomplétion) ───────────────────────────
  const searchRows: Prisma.SearchQueryCreateManyInput[] = SEARCH_QUERIES.map((query) => {
    // 40 % anonymes, 30 % compte de démo, 30 % autres utilisateurs.
    const r = rnd();
    const userId = r < 0.4 ? null : r < 0.7 ? demoUserId : pick(userIds);
    return {
      id: cuid(),
      userId,
      query,
      results: rndInt(0, 34),
      createdAt: between(daysAgo(60), NOW),
    };
  });
  await insertMany('searchQuery', searchRows, (b) => prisma.searchQuery.createMany({ data: b }));

  // ── 18. Récapitulatif ────────────────────────────────────────────────────
  summary(demoSubscribedChannels.length);
}

/**
 * Score « test & scale » : combinaison CTR / rétention / engagement, pondérée
 * par la fraîcheur. Les vidéos non publiques ne sont jamais distribuées.
 */
function computeHotScore(v: VideoRow): number {
  if (!v.public || v.views === 0) return 0;
  const recency = Math.exp(-v.ageDays / 40);
  const ctrNorm = Math.min(1, v.ctr / 0.12);
  const quality = 0.32 * ctrNorm + 0.38 * v.avgWatchPct + 0.3 * Math.min(1, v.engagementRate * 14);
  return round4(clamp(0.06 + 0.94 * quality * (0.2 + 0.8 * recency), 0, 1));
}

function summary(demoSubs: number): void {
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(74)}`);
  console.log('  RÉCAPITULATIF');
  console.log('═'.repeat(74));
  const keys = Object.keys(totals).sort();
  for (const k of keys) {
    console.log(`  ${k.padEnd(34, '.')} ${String(totals[k]).padStart(8, ' ')}`);
  }
  const grand = keys.reduce((s, k) => s + totals[k], 0);
  console.log(`  ${'TOTAL'.padEnd(34, '.')} ${String(grand).padStart(8, ' ')}`);
  console.log('═'.repeat(74));
  console.log('  IDENTIFIANTS DE DÉMONSTRATION');
  console.log('═'.repeat(74));
  console.log(`  Email        : ${DEMO_EMAIL}`);
  console.log(`  Mot de passe : ${DEMO_PASSWORD}`);
  console.log(`  Chaînes      : @kelvyn (principale) · @kelvyn-gaming (secondaire)`);
  console.log(`  Abonnements  : ${demoSubs} chaînes suivies`);
  console.log(`  Autres comptes : creator1@kelvyntube.local … creator11@kelvyntube.local`);
  console.log(`                   (même mot de passe : ${DEMO_PASSWORD})`);
  console.log('═'.repeat(74));
  console.log(`  Terminé en ${elapsed}s — graine ${SEED} (jeu de données reproductible).\n`);
}

main()
  .catch((err) => {
    console.error('\n✖ Le seed a échoué :', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
