import { prisma } from '@kelvyntube/db';
import type { Prisma } from '@kelvyntube/db';
import type {
  ChannelDTO,
  ChannelSummaryDTO,
  CursorPage,
  NotificationLevel,
  PlaylistSummaryDTO,
  VideoCardDTO,
  VideoVisibility,
  CreateChannelInput,
  UpdateChannelInput,
} from '@kelvyntube/shared';
import { handleSchema } from '@kelvyntube/shared';
import { conflict, notFound, badRequest } from '../../lib/errors.js';
import { decodeCursor, encodeCursor } from '../../lib/http.js';
import {
  channelSummarySelect,
  toChannelDTO,
  toChannelSummary,
  toVideoCard,
  videoCardSelect,
} from '../../lib/serializers.js';
import type { ChannelAssetType } from './assets.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVICE CHAÎNES
 *  Toute la logique métier de l'onglet chaîne : profil public, annuaire,
 *  onglets Vidéos / Shorts / Playlists / Communauté / Accueil.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Multi-chaînes façon YouTube Studio : plafond par compte. */
export const MAX_CHANNELS_PER_USER = 5;

/** Handles réservés à la plateforme, jamais attribuables. */
const RESERVED_HANDLES = new Set([
  'admin', 'administrateur', 'root', 'system', 'support', 'help', 'aide',
  'kelvyn', 'kelvyntube', 'about', 'settings', 'studio', 'api', 'www',
  'moderation', 'legal', 'privacy', 'mine', 'me', 'null', 'undefined',
]);

export type ChannelVideoSort = 'recent' | 'popular' | 'oldest';

/** Publication communautaire renvoyée au client. */
export interface CommunityPostDTO {
  id: string;
  text: string;
  imageUrl: string | null;
  likeCount: number;
  createdAt: string;
  channel: ChannelSummaryDTO;
}

/** Onglet Accueil d'une chaîne. */
export interface ChannelHomeDTO {
  trailer: VideoCardDTO | null;
  featured: VideoCardDTO[];
  sections: { title: string; videos: VideoCardDTO[] }[];
}

// ── Sélections Prisma ─────────────────────────────────────────────────────

/** Tout ce dont `toChannelDTO` a besoin. */
const channelFullSelect = {
  ...channelSummarySelect,
  ownerId: true,
  description: true,
  bannerUrl: true,
  location: true,
  links: true,
  videoCount: true,
  totalViews: true,
  createdAt: true,
  trailerVideoId: true,
} as const;

type ChannelFullRow = Prisma.ChannelGetPayload<{ select: typeof channelFullSelect }>;

// ── Helpers internes ──────────────────────────────────────────────────────

/** Normalise un handle : sans « @ », en minuscules, sans espaces. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

/**
 * Recherche insensible à la casse : le handle est stocké en minuscules mais on
 * ne veut pas qu'un ancien enregistrement en casse mixte échappe au contrôle
 * d'unicité.
 */
async function findChannelIdByHandle(handle: string, exceptId?: string): Promise<string | null> {
  const row = await prisma.channel.findFirst({
    where: {
      handle: { equals: handle, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** Relation de l'utilisateur courant à la chaîne (abonnement + propriété). */
async function loadViewerRelation(
  channelId: string,
  viewerId: string | null,
): Promise<{ userId: string | null; isSubscribed: boolean; level: NotificationLevel | null }> {
  if (!viewerId) return { userId: null, isSubscribed: false, level: null };
  const sub = await prisma.subscription.findUnique({
    where: { subscriberId_channelId: { subscriberId: viewerId, channelId } },
    select: { level: true },
  });
  return {
    userId: viewerId,
    isSubscribed: Boolean(sub),
    level: sub ? (sub.level as NotificationLevel) : null,
  };
}

/** Charge la chaîne + ses métadonnées de propriété, ou 404. */
async function requireChannel(channelId: string): Promise<ChannelFullRow> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: channelFullSelect,
  });
  if (!channel) throw notFound('Chaîne introuvable');
  return channel;
}

/** Assemble une page à curseur à partir de `limit + 1` éléments récupérés. */
function buildPage<T>(rows: T[], limit: number, makeCursor: (item: T) => string): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor: hasMore && items.length > 0 ? makeCursor(items[items.length - 1]) : null,
    hasMore,
  };
}

/** Curseur vidéo : `{ id, publishedAt }`. */
function videoCursor(v: VideoCardDTO): string {
  return encodeCursor({ id: v.id, publishedAt: v.publishedAt });
}

function readCursorId(cursor?: string): string | null {
  const decoded = decodeCursor<{ id?: string }>(cursor);
  return typeof decoded?.id === 'string' ? decoded.id : null;
}

/**
 * Filtre de visibilité : un visiteur ne voit que les vidéos publiées et
 * publiques ; le propriétaire voit l'intégralité de son catalogue.
 */
function videoVisibilityWhere(isOwner: boolean): Prisma.VideoWhereInput {
  if (isOwner) return { deletedAt: null };
  return {
    deletedAt: null,
    status: 'READY',
    visibility: 'PUBLIC',
    publishedAt: { not: null, lte: new Date() },
  };
}

function videoOrderBy(sort: ChannelVideoSort): Prisma.VideoOrderByWithRelationInput[] {
  switch (sort) {
    case 'popular':
      return [{ viewCount: 'desc' }, { id: 'desc' }];
    case 'oldest':
      return [{ publishedAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    case 'recent':
    default:
      return [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
  }
}

// ── Profil de chaîne ──────────────────────────────────────────────────────

async function buildChannelDTO(channel: ChannelFullRow, viewerId: string | null): Promise<ChannelDTO> {
  const viewer = await loadViewerRelation(channel.id, viewerId);
  return toChannelDTO(channel, viewer);
}

export async function getChannelById(id: string, viewerId: string | null): Promise<ChannelDTO> {
  const channel = await requireChannel(id);
  return buildChannelDTO(channel, viewerId);
}

export async function getChannelByHandle(
  rawHandle: string,
  viewerId: string | null,
): Promise<ChannelDTO> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) throw notFound('Chaîne introuvable');
  const channel = await prisma.channel.findFirst({
    where: { handle: { equals: handle, mode: 'insensitive' } },
    select: channelFullSelect,
  });
  if (!channel) throw notFound('Chaîne introuvable');
  return buildChannelDTO(channel, viewerId);
}

/** Chaînes possédées par l'utilisateur (sélecteur du Studio). */
export async function listOwnedChannels(userId: string): Promise<ChannelSummaryDTO[]> {
  const rows = await prisma.channel.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'asc' },
    select: channelSummarySelect,
  });
  return rows.map(toChannelSummary);
}

// ── Playlists système ─────────────────────────────────────────────────────

/**
 * Garantit l'existence des playlists système de l'utilisateur.
 * Idempotent : appelé à chaque création de chaîne.
 */
export async function ensureSystemPlaylists(userId: string): Promise<void> {
  const existing = await prisma.playlist.findMany({
    where: { ownerId: userId, kind: { in: ['WATCH_LATER', 'LIKED'] } },
    select: { kind: true },
  });
  const present = new Set(existing.map((p) => p.kind));

  const data: Prisma.PlaylistCreateManyInput[] = [];
  if (!present.has('WATCH_LATER')) {
    data.push({
      ownerId: userId,
      title: 'À regarder plus tard',
      kind: 'WATCH_LATER',
      visibility: 'PRIVATE',
    });
  }
  if (!present.has('LIKED')) {
    data.push({
      ownerId: userId,
      title: 'Vidéos que j\'aime',
      kind: 'LIKED',
      visibility: 'PRIVATE',
    });
  }
  if (data.length > 0) await prisma.playlist.createMany({ data });
}

// ── Création / mise à jour ────────────────────────────────────────────────

export async function createChannel(
  userId: string,
  input: CreateChannelInput,
): Promise<ChannelDTO> {
  const handle = normalizeHandle(input.handle);
  assertHandleUsable(handle);

  const owned = await prisma.channel.count({ where: { ownerId: userId } });
  if (owned >= MAX_CHANNELS_PER_USER) {
    throw conflict(`Un compte ne peut pas dépasser ${MAX_CHANNELS_PER_USER} chaînes`);
  }

  if (await findChannelIdByHandle(handle)) {
    throw conflict('Ce handle est déjà pris', { handle: ['Ce handle est déjà pris'] });
  }

  const created = await prisma.channel.create({
    data: {
      ownerId: userId,
      handle,
      name: input.name,
      description: input.description ?? null,
    },
    select: channelFullSelect,
  });

  // Les playlists système appartiennent à l'utilisateur, pas à la chaîne :
  // on les crée à la première chaîne et on ne les duplique jamais.
  await ensureSystemPlaylists(userId);

  // Première chaîne : elle devient la chaîne active du compte.
  await prisma.user.updateMany({
    where: { id: userId, activeChannelId: null },
    data: { activeChannelId: created.id },
  });

  return buildChannelDTO(created, userId);
}

export async function updateChannel(
  channelId: string,
  input: UpdateChannelInput,
  viewerId: string,
): Promise<ChannelDTO> {
  await requireChannel(channelId);

  const data: Prisma.ChannelUncheckedUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.location !== undefined) data.location = input.location;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  if (input.bannerUrl !== undefined) data.bannerUrl = input.bannerUrl;
  if (input.blockedWords !== undefined) data.blockedWords = input.blockedWords;
  if (input.links !== undefined) data.links = input.links as unknown as Prisma.InputJsonValue;

  // Changement de handle : unicité vérifiée hors de la contrainte SQL pour
  // renvoyer un 409 lisible plutôt qu'une erreur Prisma brute.
  if (input.handle !== undefined) {
    const handle = normalizeHandle(input.handle);
    assertHandleUsable(handle);
    if (await findChannelIdByHandle(handle, channelId)) {
      throw conflict('Ce handle est déjà pris', { handle: ['Ce handle est déjà pris'] });
    }
    data.handle = handle;
  }

  // Bande-annonce : la vidéo doit appartenir à la chaîne.
  if (input.trailerVideoId !== undefined) {
    if (input.trailerVideoId === null) {
      data.trailerVideoId = null;
    } else {
      const video = await prisma.video.findFirst({
        where: { id: input.trailerVideoId, channelId, deletedAt: null },
        select: { id: true },
      });
      if (!video) {
        throw badRequest('La bande-annonce doit être une vidéo de cette chaîne', {
          trailerVideoId: ['Vidéo introuvable sur cette chaîne'],
        });
      }
      data.trailerVideoId = video.id;
    }
  }

  const updated = await prisma.channel.update({
    where: { id: channelId },
    data,
    select: channelFullSelect,
  });
  return buildChannelDTO(updated, viewerId);
}

/** Applique l'URL produite par l'upload d'un visuel. */
export async function applyChannelAsset(
  channelId: string,
  type: ChannelAssetType,
  url: string,
): Promise<void> {
  await prisma.channel.update({
    where: { id: channelId },
    data: type === 'avatar' ? { avatarUrl: url } : { bannerUrl: url },
    select: { id: true },
  });
}

// ── Disponibilité du handle ───────────────────────────────────────────────

function assertHandleUsable(handle: string): void {
  const parsed = handleSchema.safeParse(handle);
  if (!parsed.success) {
    throw badRequest('Handle invalide', {
      handle: parsed.error.errors.map((e) => e.message),
    });
  }
  if (RESERVED_HANDLES.has(handle)) {
    throw conflict('Ce handle est réservé', { handle: ['Ce handle est réservé'] });
  }
}

/** Racine exploitable pour bâtir des suggestions à partir d'une saisie libre. */
function handleRoot(raw: string): string {
  const cleaned = normalizeHandle(raw)
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+/, '')
    .slice(0, 20);
  return cleaned.length >= 3 ? cleaned : `${cleaned}chaine`.slice(0, 20);
}

/**
 * Vérifie la disponibilité d'un handle et propose 3 alternatives s'il est pris
 * (ou si la saisie ne respecte pas le format).
 */
export async function checkHandleAvailability(
  raw: string,
): Promise<{ available: boolean; suggestions: string[] }> {
  const handle = normalizeHandle(raw);
  const wellFormed = handleSchema.safeParse(handle).success && !RESERVED_HANDLES.has(handle);

  const available = wellFormed ? (await findChannelIdByHandle(handle)) === null : false;
  if (available) return { available: true, suggestions: [] };

  return { available: false, suggestions: await suggestHandles(handle) };
}

async function suggestHandles(raw: string, count = 3): Promise<string[]> {
  const root = handleRoot(raw);
  const year = new Date().getFullYear();

  const pool = Array.from(
    new Set(
      [
        `${root}tv`,
        `${root}_officiel`,
        `le${root}`,
        `${root}${year}`,
        `${root}yt`,
        `${root}_fr`,
        // Variantes numériques aléatoires pour garantir un stock suffisant.
        ...Array.from({ length: 6 }, () => `${root}${Math.floor(Math.random() * 9000) + 1000}`),
      ]
        .map((h) => h.slice(0, 30))
        .filter((h) => handleSchema.safeParse(h).success && !RESERVED_HANDLES.has(h)),
    ),
  );

  const taken = await prisma.channel.findMany({
    where: { handle: { in: pool, mode: 'insensitive' } },
    select: { handle: true },
  });
  const takenSet = new Set(taken.map((c) => c.handle.toLowerCase()));

  return pool.filter((h) => !takenSet.has(h)).slice(0, count);
}

// ── Onglets Vidéos / Shorts ───────────────────────────────────────────────

export interface ListChannelVideosParams {
  channelId: string;
  viewerId: string | null;
  kind: 'LONG' | 'SHORT';
  sort: ChannelVideoSort;
  cursor?: string;
  limit: number;
}

export async function listChannelVideos(
  params: ListChannelVideosParams,
): Promise<CursorPage<VideoCardDTO>> {
  const channel = await requireChannel(params.channelId);
  const isOwner = Boolean(params.viewerId && params.viewerId === channel.ownerId);
  const cursorId = readCursorId(params.cursor);

  const rows = await prisma.video.findMany({
    where: {
      channelId: params.channelId,
      kind: params.kind,
      ...videoVisibilityWhere(isOwner),
    },
    orderBy: videoOrderBy(params.sort),
    take: params.limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: videoCardSelect,
  });

  return buildPage(rows.map((v) => toVideoCard(v)), params.limit, videoCursor);
}

// ── Onglet Playlists ──────────────────────────────────────────────────────

export async function listChannelPlaylists(
  channelId: string,
  viewerId: string | null,
): Promise<PlaylistSummaryDTO[]> {
  const channel = await requireChannel(channelId);
  const isOwner = Boolean(viewerId && viewerId === channel.ownerId);

  const rows = await prisma.playlist.findMany({
    where: {
      channelId,
      kind: 'USER',
      ...(isOwner ? {} : { visibility: 'PUBLIC' }),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      visibility: true,
      kind: true,
      thumbnailUrl: true,
      itemCount: true,
      updatedAt: true,
    },
  });

  const owner = toChannelSummary(channel);
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    visibility: p.visibility as VideoVisibility,
    kind: 'USER' as const,
    thumbnailUrl: p.thumbnailUrl,
    itemCount: p.itemCount,
    updatedAt: p.updatedAt.toISOString(),
    owner,
  }));
}

// ── Onglet Communauté ─────────────────────────────────────────────────────

export async function listCommunityPosts(
  channelId: string,
  opts: { cursor?: string; limit: number },
): Promise<CursorPage<CommunityPostDTO>> {
  const channel = await requireChannel(channelId);
  const cursorId = readCursorId(opts.cursor);

  const rows = await prisma.communityPost.findMany({
    where: { channelId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: { id: true, text: true, imageUrl: true, likeCount: true, createdAt: true },
  });

  const summary = toChannelSummary(channel);
  const items: CommunityPostDTO[] = rows.map((p) => ({
    id: p.id,
    text: p.text,
    imageUrl: p.imageUrl,
    likeCount: p.likeCount,
    createdAt: p.createdAt.toISOString(),
    channel: summary,
  }));

  return buildPage(items, opts.limit, (p) =>
    encodeCursor({ id: p.id, publishedAt: p.createdAt }),
  );
}

export async function createCommunityPost(
  channelId: string,
  input: { text: string; imageUrl?: string | null },
): Promise<CommunityPostDTO> {
  const channel = await requireChannel(channelId);
  const post = await prisma.communityPost.create({
    data: { channelId, text: input.text, imageUrl: input.imageUrl ?? null },
    select: { id: true, text: true, imageUrl: true, likeCount: true, createdAt: true },
  });
  return {
    id: post.id,
    text: post.text,
    imageUrl: post.imageUrl,
    likeCount: post.likeCount,
    createdAt: post.createdAt.toISOString(),
    channel: toChannelSummary(channel),
  };
}

// ── Onglet Accueil ────────────────────────────────────────────────────────

export async function getChannelHome(
  channelId: string,
  viewerId: string | null,
): Promise<ChannelHomeDTO> {
  const channel = await requireChannel(channelId);
  const isOwner = Boolean(viewerId && viewerId === channel.ownerId);
  const viewer = await loadViewerRelation(channelId, viewerId);
  const publicWhere = videoVisibilityWhere(isOwner);

  // 1) Bande-annonce : réservée aux visiteurs non abonnés.
  let trailer: VideoCardDTO | null = null;
  if (channel.trailerVideoId && !viewer.isSubscribed) {
    const row = await prisma.video.findFirst({
      where: {
        id: channel.trailerVideoId,
        channelId,
        deletedAt: null,
        ...(isOwner ? {} : { status: 'READY', visibility: { in: ['PUBLIC', 'UNLISTED'] } }),
      },
      select: videoCardSelect,
    });
    trailer = row ? toVideoCard(row) : null;
  }

  // 2) Mises en avant : score de distribution (« test & scale ») décroissant.
  const [featuredRows, popularRows, latestRows, playlists] = await Promise.all([
    prisma.video.findMany({
      where: { channelId, kind: 'LONG', ...publicWhere },
      orderBy: [{ hotScore: 'desc' }, { publishedAt: 'desc' }],
      take: 6,
      select: videoCardSelect,
    }),
    prisma.video.findMany({
      where: { channelId, ...publicWhere },
      orderBy: [{ viewCount: 'desc' }, { id: 'desc' }],
      take: 10,
      select: videoCardSelect,
    }),
    prisma.video.findMany({
      where: { channelId, ...publicWhere },
      orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: 10,
      select: videoCardSelect,
    }),
    prisma.playlist.findMany({
      where: { channelId, kind: 'USER', visibility: 'PUBLIC' },
      orderBy: { updatedAt: 'desc' },
      take: 3,
      select: {
        title: true,
        items: {
          where: { video: { deletedAt: null, status: 'READY', visibility: 'PUBLIC' } },
          orderBy: { position: 'asc' },
          take: 10,
          select: { video: { select: videoCardSelect } },
        },
      },
    }),
  ]);

  const sections: ChannelHomeDTO['sections'] = [];
  if (popularRows.length > 0) {
    sections.push({ title: 'Vidéos populaires', videos: popularRows.map((v) => toVideoCard(v)) });
  }
  if (latestRows.length > 0) {
    sections.push({ title: 'Dernières vidéos', videos: latestRows.map((v) => toVideoCard(v)) });
  }
  for (const playlist of playlists) {
    if (playlist.items.length === 0) continue;
    sections.push({
      title: playlist.title,
      videos: playlist.items.map((i) => toVideoCard(i.video)),
    });
  }

  return {
    trailer,
    featured: featuredRows.map((v) => toVideoCard(v)),
    sections,
  };
}

// ── Annuaire des chaînes ──────────────────────────────────────────────────

export async function listChannelDirectory(opts: {
  cursor?: string;
  limit: number;
}): Promise<CursorPage<ChannelSummaryDTO>> {
  const cursorId = readCursorId(opts.cursor);

  const rows = await prisma.channel.findMany({
    orderBy: [{ subscriberCount: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: channelSummarySelect,
  });

  return buildPage(rows.map(toChannelSummary), opts.limit, (c) =>
    encodeCursor({ id: c.id, subscriberCount: c.subscriberCount }),
  );
}
