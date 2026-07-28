import type { Job } from 'bullmq';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@kelvyntube/db';
import { env } from '../../config/env.js';
import { BUCKET, getObjectStream, keys, publicUrl, s3 } from '../../lib/storage.js';
import type { ThumbnailJob } from '../../lib/queue.js';
import { extractThumbnails, isFfmpegAvailable, probe } from './ffmpeg.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  WORKER MINIATURES
 *
 *  Extrait 3 images aux 15 %, 45 % et 75 % de la durée, les propose au
 *  créateur (`thumbnailCandidates`) et sélectionne la première par défaut —
 *  SAUF si une miniature personnalisée a déjà été choisie.
 *
 *  MODE DÉGRADÉ : sans ffmpeg, on pose un tableau vide et on sort sans erreur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Positions d'extraction, en fraction de la durée totale. */
const POSITIONS = [0.15, 0.45, 0.75];

/**
 * Une miniature est « personnalisée » dès qu'elle ne provient pas du dossier
 * auto-généré `videos/<id>/thumbs/` : dans ce cas on n'y touche pas.
 */
function hasCustomThumbnail(videoId: string, thumbnailUrl: string | null): boolean {
  if (!thumbnailUrl) return false;
  return !thumbnailUrl.includes(`videos/${videoId}/thumbs/`);
}

async function downloadToFile(key: string, destPath: string): Promise<void> {
  const stream = await getObjectStream(key);
  await pipeline(stream, createWriteStream(destPath));
}

async function putFile(key: string, filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: stat.size,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=86400',
    }),
  );
  return publicUrl(key);
}

export async function thumbnailProcessor(job: Job<ThumbnailJob>): Promise<void> {
  const videoId = job.data?.videoId;
  if (!videoId) throw new Error('Job de miniatures sans videoId');

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, durationSec: true, thumbnailUrl: true, sourceKey: true },
  });
  if (!video) {
    console.warn(`[thumbnails] vidéo ${videoId} introuvable — job ignoré`);
    return;
  }

  // Mode dégradé : pas de ffmpeg → aucune candidate, mais surtout aucune erreur.
  if (!(await isFfmpegAvailable())) {
    console.warn(
      `⚠️  [thumbnails] FFmpeg indisponible : aucune miniature générée pour ${videoId}`,
    );
    await prisma.video
      .update({ where: { id: videoId }, data: { thumbnailCandidates: [] } })
      .catch(() => undefined);
    return;
  }

  const sourceKey = job.data.sourceKey || video.sourceKey;
  if (!sourceKey) {
    console.warn(`[thumbnails] vidéo ${videoId} sans clé source — job ignoré`);
    return;
  }

  const workDir = path.resolve(env.TRANSCODE_TMP_DIR, `thumbs-${videoId}`);

  try {
    await fs.mkdir(workDir, { recursive: true });
    const sourcePath = path.join(workDir, `source${path.extname(sourceKey) || '.mp4'}`);
    await downloadToFile(sourceKey, sourcePath);

    const info = await probe(sourcePath);
    const durationSec = job.data.durationSec || video.durationSec || info.durationSec;

    // Sur une vidéo très courte, tous les pourcentages retombent près de 0 :
    // on garde au moins un décalage pour éviter une image noire d'ouverture.
    const timestamps = POSITIONS.map((ratio) =>
      durationSec > 0 ? Math.max(0.1, durationSec * ratio) : 0.1,
    );

    const files = await extractThumbnails(sourcePath, workDir, timestamps, {
      width: info.width,
      height: info.height,
      durationSec: info.durationSec,
      hasAudio: info.hasAudio,
    });

    const candidates: string[] = [];
    for (let i = 0; i < files.length; i++) {
      candidates.push(await putFile(keys.thumbnail(videoId, i), files[i]));
    }

    if (candidates.length === 0) {
      console.warn(`[thumbnails] aucune image extraite pour ${videoId}`);
      return;
    }

    const keepCustom = hasCustomThumbnail(videoId, video.thumbnailUrl);
    await prisma.video.update({
      where: { id: videoId },
      data: {
        thumbnailCandidates: candidates,
        ...(keepCustom ? {} : { thumbnailUrl: candidates[0] }),
      },
    });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
