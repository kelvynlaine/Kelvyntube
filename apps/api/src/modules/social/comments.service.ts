import { Prisma, prisma } from '@kelvyntube/db';
import {
  WS_EVENTS,
  extractMentions,
  type CommentDTO,
  type CommentSort,
  type CursorPage,
  type LikeState,
  type OffsetPage,
} from '@kelvyntube/shared';
import { emitToRoom, videoRoom } from '../../lib/realtime.js';
import { decodeCursor, encodeCursor } from '../../lib/http.js';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors.js';
import { getLikeStates } from './likes.service.js';
import { checkComment } from './moderation.js';
import { enqueueNotification } from './notifications.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  COMMENTAIRES
 *  - fil à deux niveaux (racine + réponses aplaties, comme YouTube)
 *  - tri `top` (likes) ou `newest`, épinglé toujours en tête
 *  - compteurs dénormalisés (`Video.commentCount`, `Comment.replyCount`)
 *    mis à jour dans la même transaction que l'écriture
 *  - modération : mots bloqués de la chaîne + anti-spam (`moderation.ts`)
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Nombre de réponses préchargées sous chaque commentaire racine. */
const PRELOADED_REPLIES = 3;

export interface Viewer {
  userId: string | null;
  role: 'USER' | 'MODERATOR' | 'ADMIN' | null;
}

export const commentSelect = {
  id: true,
  videoId: true,
  parentId: true,
  authorId: true,
  text: true,
  likeCount: true,
  replyCount: true,
  pinned: true,
  heartedByCreator: true,
  edited: true,
  createdAt: true,
  author: {
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      channels: {
        select: { id: true, handle: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  },
} satisfies Prisma.CommentSelect;

export type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

type ReactionSummary = { emoji: string; count: number; reacted: boolean };

interface SerializeContext {
  /** Propriétaire de la chaîne à laquelle appartient la vidéo. */
  channelOwnerId: string;
  viewer: Viewer;
  likes: Map<string, LikeState>;
  reactions: Map<string, ReactionSummary[]>;
  repliesByParent?: Map<string, CommentDTO[]>;
}

// ── Permissions ───────────────────────────────────────────────────────────

function isModerator(viewer: Viewer): boolean {
  return viewer.role === 'MODERATOR' || viewer.role === 'ADMIN';
}

function canModerate(viewer: Viewer, channelOwnerId: string): boolean {
  if (!viewer.userId) return false;
  return viewer.userId === channelOwnerId || isModerator(viewer);
}

// ── Sérialisation ─────────────────────────────────────────────────────────

function toCommentDTO(row: CommentRow, ctx: SerializeContext): CommentDTO {
  const moderate = canModerate(ctx.viewer, ctx.channelOwnerId);
  return {
    id: row.id,
    text: row.text,
    author: {
      id: row.author.id,
      displayName: row.author.displayName,
      avatarUrl: row.author.avatarUrl,
      handle: row.author.channels[0]?.handle ?? null,
      // L'auteur est-il le créateur de la vidéo commentée ?
      isCreator: row.author.id === ctx.channelOwnerId,
    },
    parentId: row.parentId,
    likeCount: row.likeCount,
    replyCount: row.replyCount,
    pinned: row.pinned,
    heartedByCreator: row.heartedByCreator,
    edited: row.edited,
    createdAt: row.createdAt.toISOString(),
    reactions: ctx.reactions.get(row.id) ?? [],
    viewer: {
      like: ctx.likes.get(row.id) ?? 'NONE',
      canDelete: moderate || (!!ctx.viewer.userId && ctx.viewer.userId === row.authorId),
      canModerate: moderate,
    },
    ...(ctx.repliesByParent?.has(row.id) ? { replies: ctx.repliesByParent.get(row.id) } : {}),
  };
}

/** Agrège les réactions emoji d'un lot de commentaires (2 requêtes max). */
async function loadReactions(
  commentIds: string[],
  viewerId: string | null,
): Promise<Map<string, ReactionSummary[]>> {
  const map = new Map<string, ReactionSummary[]>();
  if (commentIds.length === 0) return map;

  const [grouped, mine] = await Promise.all([
    prisma.commentReaction.groupBy({
      by: ['commentId', 'emoji'],
      where: { commentId: { in: commentIds } },
      _count: { _all: true },
    }),
    viewerId
      ? prisma.commentReaction.findMany({
          where: { commentId: { in: commentIds }, userId: viewerId },
          select: { commentId: true, emoji: true },
        })
      : Promise.resolve([] as { commentId: string; emoji: string }[]),
  ]);

  const mineSet = new Set(mine.map((r) => `${r.commentId}::${r.emoji}`));
  for (const g of grouped) {
    const list = map.get(g.commentId) ?? [];
    list.push({
      emoji: g.emoji,
      count: g._count._all,
      reacted: mineSet.has(`${g.commentId}::${g.emoji}`),
    });
    map.set(g.commentId, list);
  }
  // Les réactions les plus utilisées d'abord.
  for (const list of map.values()) list.sort((a, b) => b.count - a.count);
  return map;
}

/** Construit le contexte de sérialisation d'un lot de commentaires. */
async function buildContext(
  rows: CommentRow[],
  channelOwnerId: string,
  viewer: Viewer,
): Promise<SerializeContext> {
  const ids = rows.map((r) => r.id);
  const [likes, reactions] = await Promise.all([
    getLikeStates(viewer.userId, 'COMMENT', ids),
    loadReactions(ids, viewer.userId),
  ]);
  return { channelOwnerId, viewer, likes, reactions };
}

// ── Pagination par curseur ────────────────────────────────────────────────

interface CommentCursor {
  /** Le commentaire du curseur était-il épinglé ? (`pinned desc` = 1re clé) */
  p: boolean;
  /** likeCount — uniquement pour le tri `top`. */
  l?: number;
  /** createdAt ISO */
  t: string;
  /** id (départage les égalités) */
  i: string;
}

function rootOrderBy(sort: CommentSort): Prisma.CommentOrderByWithRelationInput[] {
  return sort === 'top'
    ? [{ pinned: 'desc' }, { likeCount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
    : [{ pinned: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
}

/** Traduit un curseur en condition « strictement après » cohérente avec le tri. */
function rootCursorWhere(sort: CommentSort, c: CommentCursor | null): Prisma.CommentWhereInput {
  if (!c) return {};
  const at = new Date(c.t);
  const tuple: Prisma.CommentWhereInput[] =
    sort === 'top'
      ? [
          { likeCount: { lt: c.l ?? 0 } },
          { likeCount: c.l ?? 0, createdAt: { lt: at } },
          { likeCount: c.l ?? 0, createdAt: at, id: { lt: c.i } },
        ]
      : [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: c.i } }];

  // `pinned` est la première clé de tri (desc) : après un épinglé viennent
  // les autres épinglés « plus bas », puis tous les non-épinglés.
  return c.p
    ? { OR: [{ pinned: true, OR: tuple }, { pinned: false }] }
    : { pinned: false, OR: tuple };
}

function makeCursor(row: CommentRow, sort: CommentSort): string {
  return encodeCursor({
    p: row.pinned,
    ...(sort === 'top' ? { l: row.likeCount } : {}),
    t: row.createdAt.toISOString(),
    i: row.id,
  } satisfies CommentCursor);
}

// ── Chargement de la vidéo (contexte de permissions) ──────────────────────

const videoContextSelect = {
  id: true,
  title: true,
  thumbnailUrl: true,
  commentsEnabled: true,
  channel: {
    select: { id: true, ownerId: true, name: true, handle: true, blockedWords: true },
  },
} satisfies Prisma.VideoSelect;

type VideoContext = Prisma.VideoGetPayload<{ select: typeof videoContextSelect }>;

async function loadVideoContext(videoId: string): Promise<VideoContext> {
  const video = await prisma.video.findFirst({
    where: { id: videoId, deletedAt: null },
    select: videoContextSelect,
  });
  if (!video) throw notFound('Vidéo introuvable');
  return video;
}

// ── Liste des commentaires racines ────────────────────────────────────────

export interface ListCommentsParams {
  cursor?: string;
  limit: number;
  sort: CommentSort;
}

export async function listVideoComments(
  videoId: string,
  params: ListCommentsParams,
  viewer: Viewer,
): Promise<CursorPage<CommentDTO>> {
  const video = await loadVideoContext(videoId);
  const cursor = decodeCursor<CommentCursor>(params.cursor);

  const rows = await prisma.comment.findMany({
    where: {
      videoId,
      parentId: null,
      deletedAt: null,
      ...rootCursorWhere(params.sort, cursor),
    },
    orderBy: rootOrderBy(params.sort),
    take: params.limit + 1,
    select: commentSelect,
  });

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;

  // Réponses préchargées (jusqu'à 3 par racine) — une seule requête fenêtrée.
  const replyRows = await loadPreloadedReplies(page.map((r) => r.id));

  const ctx = await buildContext([...page, ...replyRows], video.channel.ownerId, viewer);
  const repliesByParent = new Map<string, CommentDTO[]>();
  for (const reply of replyRows) {
    if (!reply.parentId) continue;
    const list = repliesByParent.get(reply.parentId) ?? [];
    list.push(toCommentDTO(reply, ctx));
    repliesByParent.set(reply.parentId, list);
  }
  ctx.repliesByParent = repliesByParent;

  const last = page[page.length - 1];
  return {
    items: page.map((row) => toCommentDTO(row, ctx)),
    nextCursor: hasMore && last ? makeCursor(last, params.sort) : null,
    hasMore,
  };
}

/**
 * Récupère au plus `PRELOADED_REPLIES` réponses par commentaire racine.
 * Prisma ne sait pas faire de « LIMIT par groupe » : on passe par une
 * fonction fenêtre SQL qui ne renvoie que les identifiants (borné à
 * 3 × taille de page), puis on hydrate normalement.
 */
async function loadPreloadedReplies(parentIds: string[]): Promise<CommentRow[]> {
  if (parentIds.length === 0) return [];

  const ranked = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM (
      SELECT c.id,
             ROW_NUMBER() OVER (
               PARTITION BY c."parentId"
               ORDER BY c."likeCount" DESC, c."createdAt" ASC
             ) AS rn
      FROM "comments" c
      WHERE c."parentId" IN (${Prisma.join(parentIds)})
        AND c."deletedAt" IS NULL
    ) ranked
    WHERE ranked.rn <= ${PRELOADED_REPLIES}
  `;
  if (ranked.length === 0) return [];

  const rows = await prisma.comment.findMany({
    where: { id: { in: ranked.map((r) => r.id) } },
    orderBy: [{ likeCount: 'desc' }, { createdAt: 'asc' }],
    select: commentSelect,
  });
  return rows;
}

// ── Réponses d'un commentaire ─────────────────────────────────────────────

interface ReplyCursor {
  t: string;
  i: string;
}

export async function listReplies(
  commentId: string,
  params: { cursor?: string; limit: number },
  viewer: Viewer,
): Promise<CursorPage<CommentDTO>> {
  const parent = await prisma.comment.findFirst({
    where: { id: commentId },
    select: { id: true, video: { select: { channel: { select: { ownerId: true } } } } },
  });
  if (!parent) throw notFound('Commentaire introuvable');

  const c = decodeCursor<ReplyCursor>(params.cursor);
  const rows = await prisma.comment.findMany({
    where: {
      parentId: commentId,
      deletedAt: null,
      ...(c
        ? {
            OR: [
              { createdAt: { gt: new Date(c.t) } },
              { createdAt: new Date(c.t), id: { gt: c.i } },
            ],
          }
        : {}),
    },
    // Les réponses se lisent dans l'ordre chronologique.
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: params.limit + 1,
    select: commentSelect,
  });

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  const ctx = await buildContext(page, parent.video.channel.ownerId, viewer);
  const last = page[page.length - 1];

  return {
    items: page.map((row) => toCommentDTO(row, ctx)),
    nextCursor:
      hasMore && last ? encodeCursor({ t: last.createdAt.toISOString(), i: last.id }) : null,
    hasMore,
  };
}

// ── Création ──────────────────────────────────────────────────────────────

export interface CreateCommentParams {
  text: string;
  parentId?: string | null;
}

export async function createComment(
  videoId: string,
  userId: string,
  input: CreateCommentParams,
  viewer: Viewer,
): Promise<CommentDTO> {
  const video = await loadVideoContext(videoId);
  if (!video.commentsEnabled) {
    throw forbidden('Les commentaires sont désactivés sur cette vidéo');
  }

  // ── Modération ────────────────────────────────────────────────────────
  const verdict = checkComment(input.text, video.channel);
  if (!verdict.allowed) {
    await prisma.moderationLog.create({
      data: {
        channelId: video.channel.id,
        actorId: userId,
        action: 'DELETED',
        reason: verdict.reason ?? 'Mot bloqué',
      },
    });
    throw new AppError(
      422,
      'COMMENT_BLOCKED',
      `Votre commentaire contient un mot bloqué par la chaîne : « ${verdict.matchedWord} »`,
      { text: [verdict.reason ?? 'Contenu refusé'] },
    );
  }

  // ── Parent : le fil est aplati à deux niveaux (comme YouTube) ─────────
  let threadParentId: string | null = null;
  let repliedToAuthorId: string | null = null;
  if (input.parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: input.parentId, videoId, deletedAt: null },
      select: { id: true, parentId: true, authorId: true },
    });
    if (!parent) throw badRequest('Commentaire parent introuvable');
    threadParentId = parent.parentId ?? parent.id;
    repliedToAuthorId = parent.authorId;
  }

  const mentions = extractMentions(input.text);

  const created = await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        videoId,
        authorId: userId,
        parentId: threadParentId,
        text: input.text,
        mentions,
      },
      select: commentSelect,
    });

    // Compteurs dénormalisés : même transaction que l'écriture.
    await tx.video.update({
      where: { id: videoId },
      data: { commentCount: { increment: 1 } },
    });
    if (threadParentId) {
      await tx.comment.update({
        where: { id: threadParentId },
        data: { replyCount: { increment: 1 } },
      });
    }

    // Suspicion de spam : le commentaire reste publié mais est signalé au
    // créateur (onglet « En attente » du Studio), qui tranche.
    if (verdict.held) {
      await tx.moderationLog.create({
        data: {
          channelId: video.channel.id,
          commentId: comment.id,
          action: 'HELD_FOR_REVIEW',
          reason: verdict.reason ?? 'Spam suspecté',
        },
      });
    }

    return comment;
  });

  const ctx = await buildContext([created], video.channel.ownerId, viewer);
  const dto = toCommentDTO(created, ctx);

  // Temps réel : le fil des spectateurs de la vidéo se met à jour tout seul.
  await emitToRoom(videoRoom(videoId), WS_EVENTS.commentCreated, dto);

  await queueCommentNotifications({
    video,
    comment: created,
    authorId: userId,
    repliedToAuthorId,
    mentions,
  });

  return dto;
}

/** Extrait court utilisé comme corps de notification. */
function excerpt(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Met en file les notifications déclenchées par un nouveau commentaire.
 * Jamais de notification à soi-même, et un seul message par destinataire
 * (priorité : réponse > commentaire sur la vidéo > mention).
 */
async function queueCommentNotifications(args: {
  video: VideoContext;
  comment: CommentRow;
  authorId: string;
  repliedToAuthorId: string | null;
  mentions: string[];
}): Promise<void> {
  const { video, comment, authorId, repliedToAuthorId, mentions } = args;
  const actorChannelId = comment.author.channels[0]?.id ?? null;
  const authorName = comment.author.displayName;
  const link = `/watch?v=${video.id}&lc=${comment.id}`;
  const body = excerpt(comment.text);

  // L'auteur ne se notifie jamais lui-même.
  const notified = new Set<string>([authorId]);

  if (repliedToAuthorId && !notified.has(repliedToAuthorId)) {
    notified.add(repliedToAuthorId);
    await enqueueNotification({
      type: 'COMMENT_REPLY',
      userId: repliedToAuthorId,
      actorChannelId: actorChannelId ?? undefined,
      videoId: video.id,
      commentId: comment.id,
      title: `${authorName} a répondu à votre commentaire`,
      body,
      imageUrl: video.thumbnailUrl ?? undefined,
      link,
    });
  }

  if (!notified.has(video.channel.ownerId)) {
    notified.add(video.channel.ownerId);
    await enqueueNotification({
      type: 'NEW_COMMENT',
      userId: video.channel.ownerId,
      actorChannelId: actorChannelId ?? undefined,
      videoId: video.id,
      commentId: comment.id,
      title: `${authorName} a commenté « ${excerpt(video.title, 60)} »`,
      body,
      imageUrl: video.thumbnailUrl ?? undefined,
      link,
    });
  }

  if (mentions.length > 0) {
    const mentionedChannels = await prisma.channel.findMany({
      where: { handle: { in: mentions } },
      select: { handle: true, ownerId: true },
    });
    for (const channel of mentionedChannels) {
      if (notified.has(channel.ownerId)) continue;
      notified.add(channel.ownerId);
      await enqueueNotification({
        type: 'COMMENT_MENTION',
        userId: channel.ownerId,
        actorChannelId: actorChannelId ?? undefined,
        videoId: video.id,
        commentId: comment.id,
        title: `${authorName} vous a mentionné dans un commentaire`,
        body,
        imageUrl: video.thumbnailUrl ?? undefined,
        link,
      });
    }
  }
}

// ── Modification ──────────────────────────────────────────────────────────

export async function updateComment(
  commentId: string,
  userId: string,
  text: string,
  viewer: Viewer,
): Promise<CommentDTO> {
  const existing = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: {
      id: true,
      authorId: true,
      video: { select: { id: true, channel: { select: { ownerId: true, blockedWords: true } } } },
    },
  });
  if (!existing) throw notFound('Commentaire introuvable');
  if (existing.authorId !== userId) {
    throw forbidden('Seul l’auteur peut modifier son commentaire');
  }

  const verdict = checkComment(text, existing.video.channel);
  if (!verdict.allowed) {
    throw new AppError(
      422,
      'COMMENT_BLOCKED',
      `Votre commentaire contient un mot bloqué par la chaîne : « ${verdict.matchedWord} »`,
      { text: [verdict.reason ?? 'Contenu refusé'] },
    );
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { text, edited: true, mentions: extractMentions(text) },
    select: commentSelect,
  });

  const ctx = await buildContext([updated], existing.video.channel.ownerId, viewer);
  return toCommentDTO(updated, ctx);
}

// ── Suppression (soft delete) ─────────────────────────────────────────────

export async function deleteComment(
  commentId: string,
  viewer: Viewer,
): Promise<{ deleted: true; id: string }> {
  if (!viewer.userId) throw forbidden();

  const existing = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: {
      id: true,
      authorId: true,
      videoId: true,
      parentId: true,
      video: { select: { channel: { select: { id: true, ownerId: true } } } },
    },
  });
  if (!existing) throw notFound('Commentaire introuvable');

  const isAuthor = existing.authorId === viewer.userId;
  const moderates = canModerate(viewer, existing.video.channel.ownerId);
  if (!isAuthor && !moderates) throw forbidden('Suppression non autorisée');

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.comment.update({
      where: { id: commentId },
      data: { deletedAt: now, pinned: false },
    });

    // Supprimer un commentaire racine emporte tout son fil.
    let removed = 1;
    if (existing.parentId === null) {
      const { count } = await tx.comment.updateMany({
        where: { parentId: commentId, deletedAt: null },
        data: { deletedAt: now },
      });
      removed += count;
    } else {
      await tx.comment.update({
        where: { id: existing.parentId },
        data: { replyCount: { decrement: 1 } },
      });
    }

    await tx.video.update({
      where: { id: existing.videoId },
      data: { commentCount: { decrement: removed } },
    });

    // Journal de modération : uniquement quand ce n'est pas l'auteur.
    if (!isAuthor) {
      await tx.moderationLog.create({
        data: {
          channelId: existing.video.channel.id,
          commentId,
          actorId: viewer.userId,
          action: 'DELETED',
          reason: isModerator(viewer)
            ? 'Supprimé par un modérateur de la plateforme'
            : 'Supprimé par le propriétaire de la chaîne',
        },
      });
    }
  });

  return { deleted: true, id: commentId };
}

// ── Épinglage ─────────────────────────────────────────────────────────────

export async function pinComment(
  commentId: string,
  userId: string,
  viewer: Viewer,
): Promise<CommentDTO> {
  const existing = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: {
      id: true,
      videoId: true,
      parentId: true,
      pinned: true,
      video: { select: { channel: { select: { ownerId: true } } } },
    },
  });
  if (!existing) throw notFound('Commentaire introuvable');
  if (existing.video.channel.ownerId !== userId) {
    throw forbidden('Seul le propriétaire de la chaîne peut épingler un commentaire');
  }
  if (existing.parentId !== null) {
    throw badRequest('Seul un commentaire racine peut être épinglé');
  }

  const nextPinned = !existing.pinned;
  const updated = await prisma.$transaction(async (tx) => {
    if (nextPinned) {
      // Un seul commentaire épinglé par vidéo : on dépingle l'ancien ici même.
      await tx.comment.updateMany({
        where: { videoId: existing.videoId, pinned: true, NOT: { id: commentId } },
        data: { pinned: false },
      });
    }
    return tx.comment.update({
      where: { id: commentId },
      data: { pinned: nextPinned },
      select: commentSelect,
    });
  });

  const ctx = await buildContext([updated], existing.video.channel.ownerId, viewer);
  return toCommentDTO(updated, ctx);
}

// ── Cœur du créateur ──────────────────────────────────────────────────────

export async function heartComment(
  commentId: string,
  userId: string,
  viewer: Viewer,
): Promise<CommentDTO> {
  const existing = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: {
      id: true,
      authorId: true,
      heartedByCreator: true,
      video: {
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          channel: { select: { id: true, name: true, ownerId: true } },
        },
      },
    },
  });
  if (!existing) throw notFound('Commentaire introuvable');
  if (existing.video.channel.ownerId !== userId) {
    throw forbidden('Seul le propriétaire de la chaîne peut mettre un cœur');
  }

  const hearted = !existing.heartedByCreator;
  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { heartedByCreator: hearted },
    select: commentSelect,
  });

  if (hearted && existing.authorId !== userId) {
    await enqueueNotification({
      type: 'COMMENT_HEARTED',
      userId: existing.authorId,
      actorChannelId: existing.video.channel.id,
      videoId: existing.video.id,
      commentId,
      title: `${existing.video.channel.name} a aimé votre commentaire`,
      body: excerpt(updated.text),
      imageUrl: existing.video.thumbnailUrl ?? undefined,
      link: `/watch?v=${existing.video.id}&lc=${commentId}`,
    });
  }

  const ctx = await buildContext([updated], existing.video.channel.ownerId, viewer);
  return toCommentDTO(updated, ctx);
}

// ── Réactions emoji ───────────────────────────────────────────────────────

export async function toggleReaction(
  commentId: string,
  userId: string,
  emoji: string,
  viewer: Viewer,
): Promise<CommentDTO> {
  const existing = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: { id: true, video: { select: { channel: { select: { ownerId: true } } } } },
  });
  if (!existing) throw notFound('Commentaire introuvable');

  const key = { commentId_userId_emoji: { commentId, userId, emoji } };
  const already = await prisma.commentReaction.findUnique({ where: key, select: { id: true } });
  if (already) {
    await prisma.commentReaction.delete({ where: key });
  } else {
    await prisma.commentReaction.create({ data: { commentId, userId, emoji } });
  }

  const row = await prisma.comment.findUniqueOrThrow({
    where: { id: commentId },
    select: commentSelect,
  });
  const ctx = await buildContext([row], existing.video.channel.ownerId, viewer);
  return toCommentDTO(row, ctx);
}

// ── Modération centralisée (Studio) ───────────────────────────────────────

export type StudioCommentDTO = CommentDTO & {
  video: { id: string; title: string; thumbnailUrl: string | null };
};

export interface StudioCommentsParams {
  page: number;
  pageSize: number;
  filter: 'all' | 'unanswered' | 'held';
  q?: string;
}

/** Identifiants des commentaires mis en attente par l'anti-spam. */
async function heldCommentIds(channelId: string): Promise<string[]> {
  const logs = await prisma.moderationLog.findMany({
    where: { channelId, action: 'HELD_FOR_REVIEW', commentId: { not: null } },
    select: { commentId: true },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  });
  return [...new Set(logs.map((l) => l.commentId).filter((id): id is string => id !== null))];
}

export async function listStudioComments(
  channelId: string,
  params: StudioCommentsParams,
  viewer: Viewer,
): Promise<OffsetPage<StudioCommentDTO>> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, ownerId: true },
  });
  if (!channel) throw notFound('Chaîne introuvable');

  const where: Prisma.CommentWhereInput = {
    deletedAt: null,
    video: { channelId },
    ...(params.q ? { text: { contains: params.q, mode: 'insensitive' } } : {}),
  };

  if (params.filter === 'unanswered') {
    // Sans réponse du créateur (et pas écrit par le créateur lui-même).
    where.authorId = { not: channel.ownerId };
    where.replies = { none: { authorId: channel.ownerId, deletedAt: null } };
  } else if (params.filter === 'held') {
    where.id = { in: await heldCommentIds(channelId) };
  }

  const skip = (params.page - 1) * params.pageSize;
  const [total, rows] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: params.pageSize,
      select: {
        ...commentSelect,
        video: { select: { id: true, title: true, thumbnailUrl: true } },
      },
    }),
  ]);

  const ctx = await buildContext(rows, channel.ownerId, viewer);
  return {
    items: rows.map((row) => ({
      ...toCommentDTO(row, ctx),
      video: row.video,
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}
