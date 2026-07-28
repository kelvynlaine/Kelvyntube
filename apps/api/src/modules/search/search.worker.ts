import type { Job } from 'bullmq';
import { prisma } from '@kelvyntube/db';
import type { SearchIndexJob } from '../../lib/queue.js';
import {
  ensureIndexes,
  getIndex,
  isMeiliAvailable,
  type ChannelDocument,
  type PlaylistDocument,
  type VideoDocument,
} from './meili.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  WORKER D'INDEXATION (file `kt-search-index`)
 *  Upsert / suppression d'un document dans l'index Meilisearch correspondant.
 *  Si Meilisearch est indisponible, le job se termine en succès silencieux :
 *  inutile de faire boucler la file — l'API sait chercher sans index, et une
 *  réindexation complète pourra être relancée plus tard.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const toUnix = (d: Date | null | undefined): number =>
  d ? Math.floor(d.getTime() / 1000) : 0;

async function buildVideoDocument(id: string): Promise<VideoDocument | null> {
  const video = await prisma.video.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      visibility: true,
      kind: true,
      durationSec: true,
      publishedAt: true,
      viewCount: true,
      hotScore: true,
      deletedAt: true,
      channelId: true,
      channel: { select: { name: true } },
      category: { select: { slug: true } },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });

  // Seules les vidéos publiques et lisibles sont indexées :
  // toute autre situation entraîne la suppression du document.
  if (!video || video.deletedAt || video.status !== 'READY' || video.visibility !== 'PUBLIC') {
    return null;
  }

  return {
    id: video.id,
    title: video.title,
    description: video.description ?? '',
    tags: video.tags.map((t) => t.tag.name),
    channelName: video.channel.name,
    channelId: video.channelId,
    categorySlug: video.category?.slug ?? null,
    kind: video.kind,
    durationSec: video.durationSec,
    publishedAt: toUnix(video.publishedAt),
    viewCount: Number(video.viewCount),
    hotScore: video.hotScore,
    visibility: video.visibility,
    status: video.status,
  };
}

async function buildChannelDocument(id: string): Promise<ChannelDocument | null> {
  const channel = await prisma.channel.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      handle: true,
      description: true,
      subscriberCount: true,
      verified: true,
    },
  });
  if (!channel) return null;

  return {
    id: channel.id,
    title: channel.name,
    handle: channel.handle,
    description: channel.description ?? '',
    subscriberCount: channel.subscriberCount,
    verified: channel.verified,
  };
}

async function buildPlaylistDocument(id: string): Promise<PlaylistDocument | null> {
  const playlist = await prisma.playlist.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      ownerId: true,
      channelId: true,
      visibility: true,
      kind: true,
      itemCount: true,
      updatedAt: true,
    },
  });

  // Playlists système ou non publiques : jamais indexées.
  if (!playlist || playlist.kind !== 'USER' || playlist.visibility !== 'PUBLIC') return null;

  return {
    id: playlist.id,
    title: playlist.title,
    description: playlist.description ?? '',
    ownerId: playlist.ownerId,
    channelId: playlist.channelId,
    visibility: playlist.visibility,
    kind: playlist.kind,
    itemCount: playlist.itemCount,
    updatedAt: toUnix(playlist.updatedAt),
  };
}

async function buildDocument(entity: SearchIndexJob['entity'], id: string) {
  switch (entity) {
    case 'video':
      return buildVideoDocument(id);
    case 'channel':
      return buildChannelDocument(id);
    case 'playlist':
      return buildPlaylistDocument(id);
    default:
      return null;
  }
}

export async function searchIndexProcessor(job: Job<SearchIndexJob>): Promise<void> {
  const { action, entity, id } = job.data ?? ({} as SearchIndexJob);
  if (!entity || !id) return;

  // No-op silencieux : Meilisearch est optionnel.
  if (!(await isMeiliAvailable())) return;
  if (!(await ensureIndexes())) return;

  const index = getIndex<Record<string, unknown>>(entity);

  try {
    if (action === 'delete') {
      await index.deleteDocument(id);
      return;
    }

    const document = await buildDocument(entity, id);
    if (!document) {
      // L'entité n'est plus indexable (privée, supprimée…) : on la retire.
      await index.deleteDocument(id);
      return;
    }

    await index.addDocuments([document as unknown as Record<string, unknown>]);
  } catch (err) {
    // Panne de l'index : on ne fait pas échouer le job en boucle.
    console.warn(
      `[search] indexation ${entity}:${id} ignorée (Meilisearch indisponible) :`,
      err instanceof Error ? err.message : err,
    );
  }
}
