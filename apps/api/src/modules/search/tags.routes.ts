import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@kelvyntube/db';
import { ROUTES, cursorPaginationSchema, tagSuggestSchema } from '@kelvyntube/shared';
import type { TagDTO, ChannelSummaryDTO, VideoCardDTO, CursorPage } from '@kelvyntube/shared';
import {
  channelSummarySelect,
  videoCardSelect,
  toChannelSummary,
  toTagDTO,
  toVideoCard,
  toNumber,
} from '../../lib/serializers.js';
import { notFound } from '../../lib/errors.js';
import { buildPage, readOffset } from '../library/playlists.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HASHTAGS
 *  Les tags sont stockés en minuscules et sans « # » (cf. schema.prisma).
 *  `trendingScore` est recalculé toutes les 15 min par le job analytics.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Nombre de hashtags de la page « tendances ». */
const TRENDING_LIMIT = 20;
const TAG_SUGGEST_LIMIT = 10;
const TOP_CHANNELS_LIMIT = 5;

/** Normalise un nom de hashtag saisi par l'utilisateur ou l'URL. */
function normalizeTagName(raw: string): string {
  return raw.trim().replace(/^#+/, '').toLowerCase().slice(0, 40);
}

const tagSelect = {
  id: true,
  name: true,
  usageCount: true,
  trendingScore: true,
} as const;

/** Vidéos publiques et lisibles portant ce tag. */
const publicVideoWhere = {
  deletedAt: null,
  status: 'READY',
  visibility: 'PUBLIC',
} as const;

const tagVideosSchema = cursorPaginationSchema.extend({
  sort: z.enum(['recent', 'popular']).default('recent'),
});


export async function registerTagRoutes(app: FastifyInstance) {
  // ── GET /tags/trending ──────────────────────────────────────────────────
  // Alimente la page « tendances » ET les suggestions de tags à l'upload.
  app.get(ROUTES.tags.trending, async (): Promise<TagDTO[]> => {
    const tags = await prisma.tag.findMany({
      where: { usageCount: { gt: 0 } },
      orderBy: [{ trendingScore: 'desc' }, { recentUsage: 'desc' }, { usageCount: 'desc' }],
      take: TRENDING_LIMIT,
      select: tagSelect,
    });
    return tags.map(toTagDTO);
  });

  // ── GET /tags/suggest?q=&limit= ─────────────────────────────────────────
  //
  // `q` est OPTIONNEL. Sans terme de recherche, la route renvoie l'ensemble
  // des hashtags existants (les plus utilisés d'abord) : c'est ce qui alimente
  // le panel « tous les hashtags » du formulaire de publication.
  //
  // On ne filtre volontairement PAS sur `usageCount > 0` ici : un hashtag créé
  // mais pas encore rattaché à une vidéo publiée doit rester proposable, sinon
  // le panel se vide dès qu'on repart d'un catalogue propre.
  app.get(ROUTES.tags.suggest, async (req): Promise<TagDTO[]> => {
    const { q, limit } = tagSuggestSchema.parse(req.query);
    const prefix = q ? normalizeTagName(q).replace(/[\\%_]/g, '') : '';

    const popularityOrder = [
      { trendingScore: 'desc' as const },
      { usageCount: 'desc' as const },
      { name: 'asc' as const },
    ];

    // Sans préfixe : catalogue complet, trié par popularité.
    if (!prefix) {
      const all = await prisma.tag.findMany({
        orderBy: popularityOrder,
        take: limit,
        select: tagSelect,
      });
      return all.map(toTagDTO);
    }

    // Avec préfixe : correspondances d'abord…
    const matches = await prisma.tag.findMany({
      where: { name: { startsWith: prefix } },
      orderBy: popularityOrder,
      take: limit,
      select: tagSelect,
    });

    // …puis complétées par le reste du catalogue pour que le panel ne se vide
    // jamais pendant la frappe (comportement YouTube).
    if (matches.length < limit) {
      const fillers = await prisma.tag.findMany({
        where: { id: { notIn: matches.map((t) => t.id) } },
        orderBy: popularityOrder,
        take: limit - matches.length,
        select: tagSelect,
      });
      matches.push(...fillers);
    }

    return matches.map(toTagDTO);
  });

  // ── GET /tags/:name ─────────────────────────────────────────────────────
  // En-tête de la page dédiée à un hashtag.
  app.get<{ Params: { name: string } }>(
    ROUTES.tags.byName(':name'),
    async (
      req,
    ): Promise<{
      tag: TagDTO;
      videoCount: number;
      totalViews: number;
      topChannels: ChannelSummaryDTO[];
    }> => {
      const name = normalizeTagName(req.params.name);
      if (!name) throw notFound('Hashtag introuvable');

      const tag = await prisma.tag.findUnique({ where: { name }, select: tagSelect });
      if (!tag) throw notFound('Hashtag introuvable');

      const videoWhere = { ...publicVideoWhere, tags: { some: { tagId: tag.id } } } as const;

      const [videoCount, views, grouped] = await Promise.all([
        prisma.video.count({ where: videoWhere }),
        prisma.video.aggregate({ where: videoWhere, _sum: { viewCount: true } }),
        prisma.video.groupBy({
          by: ['channelId'],
          where: videoWhere,
          _count: { _all: true },
          orderBy: { _count: { channelId: 'desc' } },
          take: TOP_CHANNELS_LIMIT,
        }),
      ]);

      const channelIds = grouped.map((g) => g.channelId);
      const channels = channelIds.length
        ? await prisma.channel.findMany({
            where: { id: { in: channelIds } },
            select: channelSummarySelect,
          })
        : [];
      const byId = new Map(channels.map((c) => [c.id, c]));

      return {
        tag: toTagDTO(tag),
        videoCount,
        totalViews: toNumber(views._sum.viewCount),
        topChannels: channelIds
          .map((id) => byId.get(id))
          .filter((c): c is (typeof channels)[number] => c !== undefined)
          .map(toChannelSummary),
      };
    },
  );

  // ── GET /tags/:name/videos ──────────────────────────────────────────────
  app.get<{ Params: { name: string } }>(
    ROUTES.tags.videos(':name'),
    async (req): Promise<CursorPage<VideoCardDTO>> => {
      const name = normalizeTagName(req.params.name);
      if (!name) throw notFound('Hashtag introuvable');

      const { cursor, limit, sort } = tagVideosSchema.parse(req.query);
      const offset = readOffset(cursor);

      const tag = await prisma.tag.findUnique({ where: { name }, select: { id: true } });
      if (!tag) throw notFound('Hashtag introuvable');

      const rows = await prisma.video.findMany({
        where: { ...publicVideoWhere, tags: { some: { tagId: tag.id } } },
        orderBy:
          sort === 'popular'
            ? [{ viewCount: 'desc' }, { publishedAt: 'desc' }]
            : [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit + 1,
        select: videoCardSelect,
      });

      return buildPage(rows, offset, limit, (v) => toVideoCard(v));
    },
  );
}
