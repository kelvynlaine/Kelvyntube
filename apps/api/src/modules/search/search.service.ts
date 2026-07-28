import { Prisma, prisma } from '@kelvyntube/db';
import type {
  SearchInput,
  SearchResultsDTO,
  SearchSuggestionDTO,
  VideoCardDTO,
  ChannelSummaryDTO,
  PlaylistSummaryDTO,
  CursorPage,
} from '@kelvyntube/shared';
import {
  channelSummarySelect,
  videoCardSelect,
  toChannelSummary,
  toVideoCard,
} from '../../lib/serializers.js';
import { redis } from '../../lib/redis.js';
import { encodeCursor } from '../../lib/http.js';
import {
  playlistSummarySelect,
  readOffset,
  toPlaylistSummary,
} from '../library/playlists.service.js';
import { getIndex, isMeiliAvailable } from './meili.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVICE RECHERCHE
 *  Deux moteurs interchangeables :
 *    1. Meilisearch (rapide, tolérant aux fautes) — moteur nominal ;
 *    2. PostgreSQL (ILIKE + to_tsvector/ts_rank) — repli automatique dès que
 *       Meilisearch ne répond pas, ou qu'une requête d'index échoue.
 *  Dans les deux cas, les résultats ne sont que des IDs : les données
 *  affichées sont TOUJOURS rechargées depuis Postgres (source de vérité), ce
 *  qui garantit qu'un index périmé ne peut jamais exposer une vidéo privée.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Constantes de filtrage ────────────────────────────────────────────────

/** Seuils de durée façon YouTube (secondes). */
const SHORT_MAX_SEC = 4 * 60; // < 4 min
const MEDIUM_MAX_SEC = 20 * 60; // 4 – 20 min

const UPLOAD_WINDOW_MS: Record<string, number> = {
  hour: 60 * 60 * 1000,
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

/** Nombre de chaînes / playlists renvoyées à côté des vidéos. */
const SIDE_RESULTS_LIMIT = 6;
/** Nombre maximum de suggestions d'autocomplétion. */
const SUGGEST_LIMIT = 10;
/** TTL du cache Redis de l'autocomplétion (secondes). */
const SUGGEST_TTL_SEC = 60;

// ── Utilitaires ───────────────────────────────────────────────────────────

/** Échappe les jokers LIKE/ILIKE pour qu'ils soient traités littéralement. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Nettoie un préfixe utilisateur destiné à un `startsWith` Prisma. */
function safePrefix(value: string): string {
  return value.replace(/[\\%_]/g, '').trim();
}

function orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is T => r !== undefined);
}

function publishedSince(uploadDate: SearchInput['uploadDate']): Date | null {
  const window = UPLOAD_WINDOW_MS[uploadDate];
  return window ? new Date(Date.now() - window) : null;
}

// ── Moteur 1 : Meilisearch ────────────────────────────────────────────────

/** Filtres Meilisearch dérivés des options de recherche. */
function meiliVideoFilters(input: SearchInput): string[] {
  const filters = ['status = "READY"', 'visibility = "PUBLIC"'];

  if (input.type === 'short') filters.push('kind = "SHORT"');
  if (input.type === 'video') filters.push('kind = "LONG"');

  if (input.duration === 'short') filters.push(`durationSec < ${SHORT_MAX_SEC}`);
  if (input.duration === 'medium') {
    filters.push(`durationSec >= ${SHORT_MAX_SEC}`, `durationSec <= ${MEDIUM_MAX_SEC}`);
  }
  if (input.duration === 'long') filters.push(`durationSec > ${MEDIUM_MAX_SEC}`);

  const since = publishedSince(input.uploadDate);
  if (since) filters.push(`publishedAt >= ${Math.floor(since.getTime() / 1000)}`);

  return filters;
}

function meiliVideoSort(sort: SearchInput['sort']): string[] | undefined {
  switch (sort) {
    case 'date':
      return ['publishedAt:desc'];
    case 'views':
      return ['viewCount:desc'];
    case 'rating':
      return ['hotScore:desc'];
    default:
      return undefined; // pertinence : classement natif de Meilisearch
  }
}

/**
 * Interroge un index Meilisearch.
 * Renvoie `null` (et non une erreur) si Meilisearch est indisponible : c'est
 * le signal de bascule vers le repli PostgreSQL.
 */
async function meiliSearchIds(
  entity: 'video' | 'channel' | 'playlist',
  q: string,
  options: { offset: number; limit: number; filter?: string[]; sort?: string[] },
): Promise<string[] | null> {
  if (!(await isMeiliAvailable())) return null;
  try {
    const res = await getIndex<{ id: string }>(entity).search(q, {
      offset: options.offset,
      limit: options.limit,
      filter: options.filter,
      sort: options.sort,
      attributesToRetrieve: ['id'],
    });
    return res.hits.map((h) => h.id);
  } catch {
    // Index absent, panne réseau… : on n'échoue jamais, on replie.
    void isMeiliAvailable(true);
    return null;
  }
}

// ── Moteur 2 : repli PostgreSQL ───────────────────────────────────────────

/** Clause `where` Prisma commune au repli vidéo. */
function pgVideoWhere(input: SearchInput, q: string): Prisma.VideoWhereInput {
  const where: Prisma.VideoWhereInput = {
    deletedAt: null,
    status: 'READY',
    visibility: 'PUBLIC',
    OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { tags: { some: { tag: { name: { contains: q.toLowerCase() } } } } },
    ],
  };

  if (input.type === 'short') where.kind = 'SHORT';
  if (input.type === 'video') where.kind = 'LONG';

  if (input.duration === 'short') where.durationSec = { lt: SHORT_MAX_SEC };
  if (input.duration === 'medium') {
    where.durationSec = { gte: SHORT_MAX_SEC, lte: MEDIUM_MAX_SEC };
  }
  if (input.duration === 'long') where.durationSec = { gt: MEDIUM_MAX_SEC };

  const since = publishedSince(input.uploadDate);
  if (since) where.publishedAt = { gte: since };

  return where;
}

function pgVideoOrderBy(sort: SearchInput['sort']): Prisma.VideoOrderByWithRelationInput[] {
  switch (sort) {
    case 'date':
      return [{ publishedAt: 'desc' }];
    case 'views':
      return [{ viewCount: 'desc' }];
    case 'rating':
      return [{ engagementRate: 'desc' }, { likeCount: 'desc' }];
    default:
      return [{ hotScore: 'desc' }, { viewCount: 'desc' }];
  }
}

/**
 * Repli plein texte PostgreSQL : ILIKE + `to_tsvector`/`ts_rank`.
 * Toutes les valeurs utilisateur passent par des placeholders `Prisma.sql`
 * (aucune interpolation de chaîne — pas d'injection possible).
 * Si la recherche pondérée échoue (configuration `french` absente…), on
 * retombe sur une requête Prisma ILIKE simple.
 */
async function pgSearchVideoIds(
  input: SearchInput,
  q: string,
  offset: number,
  limit: number,
): Promise<string[]> {
  const like = `%${escapeLike(q)}%`;
  const document = Prisma.sql`to_tsvector('french', coalesce(v.title, '') || ' ' || coalesce(v.description, ''))`;
  const query = Prisma.sql`plainto_tsquery('french', ${q})`;

  const conditions: Prisma.Sql[] = [
    Prisma.sql`v."deletedAt" IS NULL`,
    Prisma.sql`v.status::text = 'READY'`,
    Prisma.sql`v.visibility::text = 'PUBLIC'`,
    Prisma.sql`(v.title ILIKE ${like} OR v.description ILIKE ${like} OR ${document} @@ ${query})`,
  ];

  if (input.type === 'short') conditions.push(Prisma.sql`v.kind::text = 'SHORT'`);
  if (input.type === 'video') conditions.push(Prisma.sql`v.kind::text = 'LONG'`);

  if (input.duration === 'short') conditions.push(Prisma.sql`v."durationSec" < ${SHORT_MAX_SEC}`);
  if (input.duration === 'medium') {
    conditions.push(
      Prisma.sql`v."durationSec" >= ${SHORT_MAX_SEC}`,
      Prisma.sql`v."durationSec" <= ${MEDIUM_MAX_SEC}`,
    );
  }
  if (input.duration === 'long') conditions.push(Prisma.sql`v."durationSec" > ${MEDIUM_MAX_SEC}`);

  const since = publishedSince(input.uploadDate);
  if (since) conditions.push(Prisma.sql`v."publishedAt" >= ${since}`);

  const orderBy =
    input.sort === 'date'
      ? Prisma.sql`v."publishedAt" DESC NULLS LAST`
      : input.sort === 'views'
        ? Prisma.sql`v."viewCount" DESC`
        : input.sort === 'rating'
          ? Prisma.sql`v."engagementRate" DESC, v."likeCount" DESC`
          : Prisma.sql`rank DESC, v."hotScore" DESC, v."viewCount" DESC`;

  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT v.id, ts_rank(${document}, ${query}) AS rank
      FROM videos v
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `);
    return rows.map((r) => r.id);
  } catch {
    // Repli du repli : ILIKE via Prisma, toujours fonctionnel.
    const rows = await prisma.video.findMany({
      where: pgVideoWhere(input, q),
      orderBy: pgVideoOrderBy(input.sort),
      skip: offset,
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}

// ── Recherche principale ──────────────────────────────────────────────────

async function searchVideos(
  input: SearchInput,
  q: string,
  offset: number,
): Promise<CursorPage<VideoCardDTO>> {
  const limit = input.limit;
  // +1 élément pour savoir s'il reste une page.
  const over = limit + 1;

  let ids = await meiliSearchIds('video', q, {
    offset,
    limit: over,
    filter: meiliVideoFilters(input),
    sort: meiliVideoSort(input.sort),
  });

  if (ids === null) ids = await pgSearchVideoIds(input, q, offset, over);
  if (ids.length === 0) return { items: [], nextCursor: null, hasMore: false };

  // `hasMore` se calcule sur les IDs et non sur les lignes hydratées : un
  // index Meilisearch un peu en retard (vidéo passée en privé) ne doit pas
  // interrompre la pagination.
  const hasMore = ids.length > limit;
  const pageIds = hasMore ? ids.slice(0, limit) : ids;

  const rows = await prisma.video.findMany({
    where: { id: { in: pageIds }, deletedAt: null, status: 'READY', visibility: 'PUBLIC' },
    select: videoCardSelect,
  });

  return {
    items: orderByIds(rows, pageIds).map((v) => toVideoCard(v)),
    nextCursor: hasMore ? encodeCursor({ o: offset + limit }) : null,
    hasMore,
  };
}

async function searchChannels(q: string): Promise<ChannelSummaryDTO[]> {
  const ids = await meiliSearchIds('channel', q, { offset: 0, limit: SIDE_RESULTS_LIMIT });

  if (ids !== null) {
    if (ids.length === 0) return [];
    const rows = await prisma.channel.findMany({
      where: { id: { in: ids } },
      select: channelSummarySelect,
    });
    return orderByIds(rows, ids).map(toChannelSummary);
  }

  const rows = await prisma.channel.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { handle: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ subscriberCount: 'desc' }],
    take: SIDE_RESULTS_LIMIT,
    select: channelSummarySelect,
  });
  return rows.map(toChannelSummary);
}

async function searchPlaylists(q: string): Promise<PlaylistSummaryDTO[]> {
  const ids = await meiliSearchIds('playlist', q, {
    offset: 0,
    limit: SIDE_RESULTS_LIMIT,
    filter: ['visibility = "PUBLIC"'],
  });

  if (ids !== null) {
    if (ids.length === 0) return [];
    const rows = await prisma.playlist.findMany({
      where: { id: { in: ids }, visibility: 'PUBLIC' },
      select: playlistSummarySelect,
    });
    return orderByIds(rows, ids).map(toPlaylistSummary);
  }

  const rows = await prisma.playlist.findMany({
    where: {
      visibility: 'PUBLIC',
      itemCount: { gt: 0 },
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ itemCount: 'desc' }, { updatedAt: 'desc' }],
    take: SIDE_RESULTS_LIMIT,
    select: playlistSummarySelect,
  });
  return rows.map(toPlaylistSummary);
}

/**
 * Terme corrigé / suggéré : proposé seulement quand la recherche donne peu de
 * résultats. On s'appuie sur les requêtes passées qui, elles, ont abouti.
 */
async function computeSuggestion(q: string, resultCount: number): Promise<string | null> {
  if (resultCount >= 3) return null;
  const prefix = safePrefix(q).slice(0, 4);
  if (prefix.length < 3) return null;

  const popular = await prisma.searchQuery.groupBy({
    by: ['query'],
    where: { query: { startsWith: prefix }, results: { gt: 0 } },
    _count: { query: true },
    orderBy: { _count: { query: 'desc' } },
    take: 5,
  });

  const normalized = q.trim().toLowerCase();
  const best = popular.find((p) => p.query !== normalized);
  return best?.query ?? null;
}

/** Journalise la requête (autocomplétion + analytics). Ne bloque jamais la réponse. */
async function recordSearchQuery(q: string, userId: string | null, results: number) {
  try {
    await prisma.searchQuery.create({
      data: { query: q.trim().toLowerCase().slice(0, 200), userId, results },
    });
  } catch {
    /* la journalisation ne doit jamais casser une recherche */
  }
}

/** Point d'entrée de `GET /search`. */
export async function runSearch(
  input: SearchInput,
  viewerId: string | null,
): Promise<SearchResultsDTO> {
  const q = input.q.trim();
  const offset = readOffset(input.cursor);
  const firstPage = offset === 0;

  const wantsVideos = input.type === 'all' || input.type === 'video' || input.type === 'short';
  const wantsChannels = firstPage && (input.type === 'all' || input.type === 'channel');
  const wantsPlaylists = firstPage && (input.type === 'all' || input.type === 'playlist');

  const [videos, channels, playlists] = await Promise.all([
    wantsVideos
      ? searchVideos(input, q, offset)
      : Promise.resolve<CursorPage<VideoCardDTO>>({ items: [], nextCursor: null, hasMore: false }),
    wantsChannels ? searchChannels(q) : Promise.resolve<ChannelSummaryDTO[]>([]),
    wantsPlaylists ? searchPlaylists(q) : Promise.resolve<PlaylistSummaryDTO[]>([]),
  ]);

  const total = videos.items.length + channels.length + playlists.length;

  const suggestion = firstPage ? await computeSuggestion(q, total) : null;

  if (firstPage) {
    // Fire-and-forget : la réponse ne dépend pas de l'écriture.
    void recordSearchQuery(q, viewerId, total);
  }

  return { videos, channels, playlists, suggestion };
}

// ── Autocomplétion ────────────────────────────────────────────────────────

/**
 * `GET /search/suggest` — mélange requêtes populaires, chaînes et hashtags.
 * Réponse mise en cache 60 s dans Redis (clé normalisée en minuscules).
 */
export async function getSuggestions(rawQuery: string): Promise<SearchSuggestionDTO[]> {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const cacheKey = `kt:search:suggest:${q}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as SearchSuggestionDTO[];
  } catch {
    /* cache indisponible : on calcule */
  }

  const prefix = safePrefix(q);
  const suggestions: SearchSuggestionDTO[] = [];

  if (prefix.length > 0) {
    const [queries, channels, tags] = await Promise.all([
      prisma.searchQuery.groupBy({
        by: ['query'],
        where: { query: { startsWith: prefix }, results: { gt: 0 } },
        _count: { query: true },
        orderBy: { _count: { query: 'desc' } },
        take: 6,
      }),
      prisma.channel.findMany({
        where: {
          OR: [
            { handle: { startsWith: prefix, mode: 'insensitive' } },
            { name: { contains: prefix, mode: 'insensitive' } },
          ],
        },
        orderBy: { subscriberCount: 'desc' },
        take: 3,
        select: channelSummarySelect,
      }),
      prisma.tag.findMany({
        where: { name: { startsWith: prefix } },
        orderBy: [{ trendingScore: 'desc' }, { usageCount: 'desc' }],
        take: 3,
        select: { name: true },
      }),
    ]);

    for (const row of queries) suggestions.push({ text: row.query, type: 'query' });
    for (const c of channels) {
      suggestions.push({ text: c.name, type: 'channel', channel: toChannelSummary(c) });
    }
    for (const t of tags) suggestions.push({ text: `#${t.name}`, type: 'tag' });
  }

  // Dédoublonnage (texte + type) puis plafond à 10 entrées.
  const seen = new Set<string>();
  const result = suggestions
    .filter((s) => {
      const key = `${s.type}:${s.text.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SUGGEST_LIMIT);

  try {
    await redis.setex(cacheKey, SUGGEST_TTL_SEC, JSON.stringify(result));
  } catch {
    /* cache indisponible : sans conséquence */
  }

  return result;
}
