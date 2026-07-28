import sharp from 'sharp';
import { prisma, Prisma } from '@kelvyntube/db';
import type {
  LikeState,
  NotificationLevel,
  UpdateVideoInput,
  VideoDetailDTO,
} from '@kelvyntube/shared';
import { z } from 'zod';
import { bulkUpdateVideosSchema } from '@kelvyntube/shared';
import { forbidden, notFound, badRequest } from '../../lib/errors.js';
import { searchQueue, type SearchIndexJob } from '../../lib/queue.js';
import { keys, putObject } from '../../lib/storage.js';
import {
  toVideoDetailDTO,
  videoDetailInclude,
  type VideoViewerContext,
} from './videos.mapper.js';
import { detachVideoTags, syncVideoTags } from './tags.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVICE VIDÉOS — lecture de la page de visionnage + édition (Studio)
 * ═══════════════════════════════════════════════════════════════════════════
 */

type BulkUpdateInput = z.infer<typeof bulkUpdateVideosSchema>;

/** Miniature personnalisée : format YouTube (16/9, 1280x720, JPEG q85). */
const THUMB_WIDTH = 1280;
const THUMB_HEIGHT = 720;
const THUMB_QUALITY = 85;

// ── Helpers d'accès ───────────────────────────────────────────────────────

/** Une vidéo non publique n'est visible que de son propriétaire. */
function canViewerAccess(
  video: { visibility: string; deletedAt: Date | null },
  isOwner: boolean,
): boolean {
  if (video.deletedAt) return false;
  if (isOwner) return true;
  // UNLISTED = accessible par lien direct ; PRIVATE / SCHEDULED = propriétaire seul.
  return video.visibility === 'PUBLIC' || video.visibility === 'UNLISTED';
}

/** Charge la vidéo + vérifie la possession. Lève 404 / 403. */
async function loadOwnedVideo(videoId: string, userId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { channel: { select: { id: true, ownerId: true } } },
  });
  if (!video || video.deletedAt) throw notFound('Vidéo introuvable');
  if (video.channel.ownerId !== userId) throw forbidden('Vous ne possédez pas cette vidéo');
  return video;
}

async function enqueueSearchIndex(action: SearchIndexJob['action'], id: string) {
  try {
    await searchQueue.add(action, { action, entity: 'video', id } satisfies SearchIndexJob);
  } catch (err) {
    // L'indexation ne doit jamais faire échouer une écriture métier.
    console.error('[videos] enfilement du job search impossible', (err as Error).message);
  }
}

// ── Lecture ───────────────────────────────────────────────────────────────

/**
 * GET /videos/:id — `VideoDetailDTO` complet.
 * Le bloc `viewer` (like, abonnement, reprise de lecture, à regarder plus tard)
 * est résolu en une seule salve de requêtes parallèles.
 */
export async function getVideoDetail(
  videoId: string,
  userId: string | null,
): Promise<VideoDetailDTO> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: videoDetailInclude,
  });
  if (!video) throw notFound('Vidéo introuvable');

  const isOwner = Boolean(userId && video.channel.ownerId === userId);
  if (!canViewerAccess(video, isOwner)) throw notFound('Vidéo introuvable');

  const viewer: VideoViewerContext = {
    userId,
    isOwner,
    like: 'NONE',
    isSubscribed: false,
    notificationLevel: null,
    watchedSec: 0,
    inWatchLater: false,
  };

  if (userId) {
    const [like, subscription, history, watchLater] = await Promise.all([
      prisma.like.findUnique({
        where: {
          userId_targetType_targetId: { userId, targetType: 'VIDEO', targetId: videoId },
        },
        select: { value: true },
      }),
      prisma.subscription.findUnique({
        where: { subscriberId_channelId: { subscriberId: userId, channelId: video.channelId } },
        select: { level: true },
      }),
      prisma.watchHistory.findUnique({
        where: { userId_videoId: { userId, videoId } },
        select: { positionSec: true },
      }),
      prisma.playlistItem.findFirst({
        where: { videoId, playlist: { ownerId: userId, kind: 'WATCH_LATER' } },
        select: { id: true },
      }),
    ]);

    const likeState: LikeState = like ? (like.value > 0 ? 'LIKE' : 'DISLIKE') : 'NONE';
    viewer.like = likeState;
    viewer.isSubscribed = Boolean(subscription);
    viewer.notificationLevel = (subscription?.level as NotificationLevel | undefined) ?? null;
    viewer.watchedSec = history?.positionSec ?? 0;
    viewer.inWatchLater = Boolean(watchLater);
  }

  return toVideoDetailDTO(video, viewer);
}

// ── Édition ───────────────────────────────────────────────────────────────

/**
 * PATCH /videos/:id
 * Gère la visibilité (avec pose de `publishedAt`), la publication programmée,
 * le remplacement des tags et des chapitres.
 */
export async function updateVideo(
  videoId: string,
  userId: string,
  input: UpdateVideoInput,
): Promise<VideoDetailDTO> {
  const video = await loadOwnedVideo(videoId, userId);
  const now = new Date();

  const data: Prisma.VideoUpdateInput = {};

  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.thumbnailUrl !== undefined) data.thumbnailUrl = input.thumbnailUrl;
  if (input.commentsEnabled !== undefined) data.commentsEnabled = input.commentsEnabled;
  if (input.madeForKids !== undefined) data.madeForKids = input.madeForKids;
  if (input.ageRestricted !== undefined) data.ageRestricted = input.ageRestricted;
  if (input.language !== undefined) data.language = input.language;

  if (input.categoryId !== undefined) {
    data.category = input.categoryId
      ? { connect: { id: input.categoryId } }
      : { disconnect: true };
  }

  // ── Visibilité & publication ──────────────────────────────────────────
  if (input.visibility !== undefined) {
    data.visibility = input.visibility;

    if (input.visibility === 'PUBLIC') {
      // Première mise en ligne : on horodate la publication (tri des feeds).
      if (!video.publishedAt) data.publishedAt = now;
      data.publishAt = null;
    } else if (input.visibility === 'SCHEDULED') {
      // `updateVideoSchema` garantit déjà la présence de `publishAt`.
      if (!input.publishAt) throw badRequest('Date de publication requise');
      data.publishAt = new Date(input.publishAt);
      data.publishedAt = null;
    }
  } else if (input.publishAt !== undefined) {
    data.publishAt = input.publishAt ? new Date(input.publishAt) : null;
  }

  const updated = await prisma.video.update({ where: { id: videoId }, data });

  // ── Tags : rejoués si les tags OU les textes porteurs de hashtags changent ──
  const textChanged = input.title !== undefined || input.description !== undefined;
  if (input.tags !== undefined || textChanged) {
    await syncVideoTags(videoId, input.tags, updated.description, updated.title);
  }

  // ── Chapitres : remplacement intégral ─────────────────────────────────
  if (input.chapters !== undefined) {
    const chapters = dedupeChapters(input.chapters, updated.durationSec);
    await prisma.$transaction([
      prisma.videoChapter.deleteMany({ where: { videoId } }),
      ...(chapters.length
        ? [
            prisma.videoChapter.createMany({
              data: chapters.map((c) => ({ videoId, startSec: c.startSec, title: c.title })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  await enqueueSearchIndex('upsert', videoId);

  return getVideoDetail(videoId, userId);
}

/** Trie, déduplique et borne les chapitres saisis manuellement. */
function dedupeChapters(
  chapters: { startSec: number; title: string }[],
  durationSec: number,
): { startSec: number; title: string }[] {
  const seen = new Set<number>();
  return chapters
    .filter((c) => c.title.trim().length > 0)
    .filter((c) => durationSec <= 0 || c.startSec <= durationSec)
    .sort((a, b) => a.startSec - b.startSec)
    .filter((c) => {
      if (seen.has(c.startSec)) return false;
      seen.add(c.startSec);
      return true;
    })
    .map((c) => ({ startSec: c.startSec, title: c.title.trim().slice(0, 100) }));
}

/**
 * DELETE /videos/:id — suppression logique.
 * On conserve la ligne (analytics, historiques, playlists) mais la vidéo
 * disparaît de toutes les lectures ; le compteur de la chaîne est décrémenté.
 */
export async function deleteVideo(videoId: string, userId: string): Promise<void> {
  const video = await loadOwnedVideo(videoId, userId);

  await prisma.$transaction([
    prisma.video.update({
      where: { id: videoId },
      data: { deletedAt: new Date(), visibility: 'PRIVATE' },
    }),
    prisma.channel.updateMany({
      where: { id: video.channelId, videoCount: { gt: 0 } },
      data: { videoCount: { decrement: 1 } },
    }),
  ]);

  await detachVideoTags(videoId);
  await enqueueSearchIndex('delete', videoId);
}

/**
 * POST /videos/bulk — édition en masse depuis le Studio.
 * La possession est vérifiée pour CHAQUE vidéo avant toute écriture.
 */
export async function bulkUpdateVideos(
  userId: string,
  input: BulkUpdateInput,
): Promise<{ updated: number; videoIds: string[] }> {
  const ids = [...new Set(input.videoIds)];

  const videos = await prisma.video.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      publishedAt: true,
      channel: { select: { ownerId: true } },
    },
  });

  if (videos.length !== ids.length) throw notFound('Certaines vidéos sont introuvables');
  const foreign = videos.filter((v) => v.channel.ownerId !== userId);
  if (foreign.length) throw forbidden('Vous ne possédez pas toutes les vidéos sélectionnées');

  const now = new Date();
  const data: Prisma.VideoUncheckedUpdateManyInput = {};
  if (input.visibility !== undefined) data.visibility = input.visibility;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.commentsEnabled !== undefined) data.commentsEnabled = input.commentsEnabled;

  const operations: Prisma.PrismaPromise<unknown>[] = [];

  if (Object.keys(data).length) {
    operations.push(prisma.video.updateMany({ where: { id: { in: ids } }, data }));
  }

  // Passage en PUBLIC : on horodate uniquement celles jamais publiées.
  if (input.visibility === 'PUBLIC') {
    operations.push(
      prisma.video.updateMany({
        where: { id: { in: ids }, publishedAt: null },
        data: { publishedAt: now, publishAt: null },
      }),
    );
  }

  if (operations.length) await prisma.$transaction(operations);

  // Ajout de tags : fusion avec les tags existants, vidéo par vidéo.
  if (input.addTags?.length) {
    for (const video of videos) {
      const current = await prisma.videoTag.findMany({
        where: { videoId: video.id },
        include: { tag: { select: { name: true } } },
        orderBy: { position: 'asc' },
      });
      await syncVideoTags(
        video.id,
        [...current.map((c) => c.tag.name), ...input.addTags],
        video.description,
        video.title,
      );
    }
  }

  await Promise.all(videos.map((v) => enqueueSearchIndex('upsert', v.id)));

  return { updated: videos.length, videoIds: videos.map((v) => v.id) };
}

/**
 * PUT /videos/:id/thumbnail — miniature personnalisée.
 * Normalisée en 1280x720 JPEG q85 (recadrage centré), poussée sur S3.
 */
export async function setCustomThumbnail(
  videoId: string,
  userId: string,
  file: Buffer,
): Promise<{ thumbnailUrl: string }> {
  await loadOwnedVideo(videoId, userId);
  if (!file.length) throw badRequest('Fichier vide');

  let jpeg: Buffer;
  try {
    jpeg = await sharp(file)
      .rotate()
      .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: THUMB_QUALITY, progressive: true, mozjpeg: true })
      .toBuffer();
  } catch {
    throw badRequest("Image illisible (JPEG, PNG ou WebP attendu)");
  }

  const url = await putObject(
    keys.thumbnail(videoId, 'custom'),
    jpeg,
    'image/jpeg',
    // La miniature personnalisée peut être remplacée : cache court côté CDN.
    'public, max-age=300',
  );
  // Cache-busting : le front doit voir le nouveau fichier immédiatement.
  const thumbnailUrl = `${url}?v=${Date.now()}`;

  await prisma.video.update({ where: { id: videoId }, data: { thumbnailUrl } });
  await enqueueSearchIndex('upsert', videoId);

  return { thumbnailUrl };
}
