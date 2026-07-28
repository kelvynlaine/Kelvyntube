import { prisma } from '@kelvyntube/db';
import type { LikeState } from '@kelvyntube/shared';
import { notFound } from '../../lib/errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  LIKES POLYMORPHES (vidéo | commentaire)
 *
 *  Une seule ligne `Like` par (userId, targetType, targetId) — contrainte
 *  unique en base. Les compteurs dénormalisés (`Video.likeCount/dislikeCount`,
 *  `Comment.likeCount`) sont mis à jour dans LA MÊME transaction que la ligne
 *  de like, pour qu'ils ne puissent jamais diverger.
 *
 *  Transitions gérées : none→like, none→dislike, like→dislike (-1 / +1),
 *  dislike→like, like→none, dislike→none, et le no-op (même valeur renvoyée).
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type LikeValue = 1 | -1 | 0;

export interface LikeResultDTO {
  like: LikeState;
  likeCount: number;
  /** Visible uniquement par le propriétaire de la chaîne (règle YouTube). */
  dislikeCount: number | null;
}

export function likeStateOf(value: number | null | undefined): LikeState {
  if (value === 1) return 'LIKE';
  if (value === -1) return 'DISLIKE';
  return 'NONE';
}

/** Deltas à appliquer aux compteurs pour passer de `previous` à `next`. */
function deltas(previous: number, next: number) {
  return {
    like: (next === 1 ? 1 : 0) - (previous === 1 ? 1 : 0),
    dislike: (next === -1 ? 1 : 0) - (previous === -1 ? 1 : 0),
  };
}

// ── Vidéos ────────────────────────────────────────────────────────────────

export async function setVideoLike(
  userId: string,
  videoId: string,
  value: LikeValue,
): Promise<LikeResultDTO> {
  const video = await prisma.video.findFirst({
    where: { id: videoId, deletedAt: null },
    select: { id: true, channel: { select: { ownerId: true } } },
  });
  if (!video) throw notFound('Vidéo introuvable');

  const key = { userId_targetType_targetId: { userId, targetType: 'VIDEO' as const, targetId: videoId } };

  const counters = await prisma.$transaction(async (tx) => {
    const existing = await tx.like.findUnique({ where: key, select: { value: true } });
    const previous = existing?.value ?? 0;

    if (previous === value) {
      // Aucun changement : on renvoie simplement l'état courant.
      const current = await tx.video.findUniqueOrThrow({
        where: { id: videoId },
        select: { likeCount: true, dislikeCount: true },
      });
      return current;
    }

    if (value === 0) {
      await tx.like.delete({ where: key });
    } else {
      await tx.like.upsert({
        where: key,
        create: { userId, targetType: 'VIDEO', targetId: videoId, value },
        update: { value },
      });
    }

    const d = deltas(previous, value);
    return tx.video.update({
      where: { id: videoId },
      data: {
        likeCount: { increment: d.like },
        dislikeCount: { increment: d.dislike },
      },
      select: { likeCount: true, dislikeCount: true },
    });
  });

  const isOwner = video.channel.ownerId === userId;
  return {
    like: likeStateOf(value),
    likeCount: counters.likeCount,
    dislikeCount: isOwner ? counters.dislikeCount : null,
  };
}

// ── Commentaires ──────────────────────────────────────────────────────────

export async function setCommentLike(
  userId: string,
  commentId: string,
  value: LikeValue,
): Promise<LikeResultDTO> {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: { id: true },
  });
  if (!comment) throw notFound('Commentaire introuvable');

  const key = {
    userId_targetType_targetId: { userId, targetType: 'COMMENT' as const, targetId: commentId },
  };

  const counters = await prisma.$transaction(async (tx) => {
    const existing = await tx.like.findUnique({ where: key, select: { value: true } });
    const previous = existing?.value ?? 0;

    if (previous === value) {
      return tx.comment.findUniqueOrThrow({
        where: { id: commentId },
        select: { likeCount: true },
      });
    }

    if (value === 0) {
      await tx.like.delete({ where: key });
    } else {
      await tx.like.upsert({
        where: key,
        create: { userId, targetType: 'COMMENT', targetId: commentId, value },
        update: { value },
      });
    }

    const d = deltas(previous, value);
    // Un commentaire n'expose pas de compteur de dislikes : seul `likeCount` bouge.
    return tx.comment.update({
      where: { id: commentId },
      data: { likeCount: { increment: d.like } },
      select: { likeCount: true },
    });
  });

  return {
    like: likeStateOf(value),
    likeCount: counters.likeCount,
    dislikeCount: null,
  };
}

// ── Lecture groupée (sérialisation des listes) ─────────────────────────────

/** État du like du spectateur pour un lot de cibles (1 seule requête). */
export async function getLikeStates(
  userId: string | null | undefined,
  targetType: 'VIDEO' | 'COMMENT',
  targetIds: string[],
): Promise<Map<string, LikeState>> {
  const map = new Map<string, LikeState>();
  if (!userId || targetIds.length === 0) return map;

  const rows = await prisma.like.findMany({
    where: { userId, targetType, targetId: { in: targetIds } },
    select: { targetId: true, value: true },
  });
  for (const row of rows) map.set(row.targetId, likeStateOf(row.value));
  return map;
}
