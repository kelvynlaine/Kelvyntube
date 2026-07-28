import type { Job } from 'bullmq';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@kelvyntube/db';
import {
  RENDITIONS,
  SHORT_MAX_DURATION,
  WS_EVENTS,
  type VideoStatus,
} from '@kelvyntube/shared';
import { env } from '../../config/env.js';
import {
  BUCKET,
  getObjectStream,
  keys,
  publicUrl,
  putObject,
  s3,
} from '../../lib/storage.js';
import {
  notificationQueue,
  searchQueue,
  thumbnailQueue,
  type NotificationJob,
  type SearchIndexJob,
  type ThumbnailJob,
  type TranscodeJob,
} from '../../lib/queue.js';
import { emitToRoom, videoRoom } from '../../lib/realtime.js';
import {
  isFfmpegAvailable,
  makePreviewClip,
  makeSpriteSheet,
  probe,
  transcodeToHls,
  transcodeToMp4,
  type Rendition,
  type SourceMeta,
} from './ffmpeg.js';
import {
  HLS_CONTENT_TYPE,
  PLAYLIST_CACHE_CONTROL,
  SEGMENT_CACHE_CONTROL,
  TS_CONTENT_TYPE,
  buildMasterPlaylist,
  type MasterVariantInput,
} from './hls.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PIPELINE DE TRANSCODAGE
 *
 *  1.  PROCESSING + progression 0
 *  2.  téléchargement de la source S3 dans un dossier temporaire
 *  3.  ffprobe → durée / dimensions / détection Short
 *  4.  sélection des résolutions (≤ source, plafonnées par MAX_RENDITION)
 *  5.  transcodage HLS de chaque résolution + upload + VideoVariant
 *  6.  master playlist HLS
 *  7.  MP4 720p de repli
 *  8.  clip de survol + sprite sheet
 *  9.  job `thumbnails`
 *  10. READY + URLs + publication éventuelle + compteur de la chaîne
 *  11. jobs `search` et `notification`
 *  12. progression poussée en WebSocket, dossier temporaire toujours nettoyé
 *
 *  MODE DÉGRADÉ : si ffmpeg est absent de la machine, on ne plante pas.
 *  La source devient le MP4 de repli, une variante « source » est créée et la
 *  vidéo passe READY avec un `processingError` explicite. Le site reste utilisable.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const DEGRADED_MESSAGE = 'FFmpeg indisponible : transcodage HLS ignoré (mode dégradé)';

/** Copie mutable des résolutions partagées. */
const ALL_RENDITIONS: Rendition[] = RENDITIONS.map((r) => ({ ...r }));

// ── Progression temps réel ─────────────────────────────────────────────────

/**
 * Fabrique un rapporteur de progression : écrit en base ET diffuse sur la room
 * `video:<id>`. Throttlé pour ne pas marteler Postgres pendant l'encodage.
 */
function createProgressReporter(videoId: string) {
  let lastValue = -1;
  let lastAt = 0;
  let inFlight: Promise<void> = Promise.resolve();

  return function report(progress: number, status: VideoStatus, force = false): Promise<void> {
    const value = Math.max(0, Math.min(100, Math.round(progress)));
    const now = Date.now();
    if (!force && (value === lastValue || now - lastAt < 700)) return inFlight;
    lastValue = value;
    lastAt = now;

    inFlight = (async () => {
      try {
        await prisma.video.update({
          where: { id: videoId },
          data: { processingProgress: value },
        });
      } catch {
        /* la vidéo a pu être supprimée entre-temps */
      }
      try {
        await emitToRoom(videoRoom(videoId), WS_EVENTS.processingProgress, {
          videoId,
          progress: value,
          status,
        });
      } catch {
        /* Redis indisponible : la progression n'est pas critique */
      }
    })();

    return inFlight;
  };
}

type ProgressReporter = ReturnType<typeof createProgressReporter>;

// ── Helpers stockage ───────────────────────────────────────────────────────

/** Télécharge un objet S3 vers un fichier local (en streaming : pas de RAM). */
async function downloadToFile(key: string, destPath: string): Promise<void> {
  const stream = await getObjectStream(key);
  await pipeline(stream, createWriteStream(destPath));
}

/**
 * Envoie un fichier local sur S3 en streaming.
 * On passe par le client S3 directement pour fournir `ContentLength` : un
 * `Readable` sans longueur connue ferait échouer la requête sur les gros MP4.
 */
async function putFile(
  key: string,
  filePath: string,
  contentType: string,
  cacheControl = SEGMENT_CACHE_CONTROL,
): Promise<string> {
  const stat = await fs.stat(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: stat.size,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
  return publicUrl(key);
}

// ── Sélection des résolutions ──────────────────────────────────────────────

/**
 * Toutes les résolutions dont la hauteur est ≤ à la source, plafonnées par
 * `MAX_RENDITION`. Pour une vidéo verticale c'est le petit côté qui sert de
 * référence (sinon on ré-échantillonnerait vers le haut). Toujours au moins
 * la plus basse.
 */
function selectRenditions(width: number, height: number): Rendition[] {
  const maxIndex = ALL_RENDITIONS.findIndex((r) => r.label === env.MAX_RENDITION);
  const capped = maxIndex >= 0 ? ALL_RENDITIONS.slice(0, maxIndex + 1) : [...ALL_RENDITIONS];
  const reference = Math.min(width || 0, height || 0);
  const eligible = reference > 0 ? capped.filter((r) => r.height <= reference) : [];
  return eligible.length > 0 ? eligible : [capped[0] ?? ALL_RENDITIONS[0]];
}

// ── Vidéo chargée en début de job ──────────────────────────────────────────

const videoSelect = {
  id: true,
  title: true,
  status: true,
  visibility: true,
  publishedAt: true,
  sourceKey: true,
  channelId: true,
  width: true,
  height: true,
  channel: { select: { id: true, name: true, ownerId: true } },
} as const;

function loadVideo(videoId: string) {
  return prisma.video.findUnique({ where: { id: videoId }, select: videoSelect });
}

type LoadedVideo = NonNullable<Awaited<ReturnType<typeof loadVideo>>>;

/** Suites communes à la fin d'un traitement réussi (normal ou dégradé). */
async function announceReady(video: LoadedVideo, wasReady: boolean): Promise<void> {
  if (!wasReady) {
    await prisma.channel
      .update({ where: { id: video.channelId }, data: { videoCount: { increment: 1 } } })
      .catch(() => undefined);
  }

  const searchJob: SearchIndexJob = { action: 'upsert', entity: 'video', id: video.id };
  await searchQueue.add('upsert-video', searchJob).catch(() => undefined);

  const processed: NotificationJob = {
    type: 'VIDEO_PROCESSED',
    userId: video.channel.ownerId,
    actorChannelId: video.channelId,
    videoId: video.id,
    title: 'Votre vidéo est prête',
    body: video.title,
    link: `/watch?v=${video.id}`,
  };
  await notificationQueue.add('video-processed', processed).catch(() => undefined);

  // Fan-out aux abonnés uniquement pour une vidéo publique.
  if (video.visibility === 'PUBLIC') {
    const newVideo: NotificationJob = {
      type: 'NEW_VIDEO',
      fanoutChannelId: video.channelId,
      actorChannelId: video.channelId,
      videoId: video.id,
      title: `${video.channel.name} a publié une nouvelle vidéo`,
      body: video.title,
      link: `/watch?v=${video.id}`,
    };
    await notificationQueue.add('new-video', newVideo).catch(() => undefined);
  }
}

// ── Mode dégradé (ffmpeg absent) ───────────────────────────────────────────

async function runDegraded(
  video: LoadedVideo,
  sourceKey: string,
  durationSec: number,
  wasReady: boolean,
  report: ProgressReporter,
): Promise<void> {
  console.warn(`⚠️  [transcode] ${DEGRADED_MESSAGE} — vidéo ${video.id}`);

  // La source déjà présente sur S3 sert directement de fichier de lecture :
  // la recopier à l'identique doublerait le stockage sans aucun bénéfice.
  const sourceUrl = publicUrl(sourceKey);

  await prisma.videoVariant.upsert({
    where: { videoId_label: { videoId: video.id, label: 'source' } },
    create: {
      videoId: video.id,
      label: 'source',
      width: video.width ?? 0,
      height: video.height ?? 0,
      bitrateKbps: 0,
      playlistUrl: sourceUrl,
      ready: true,
    },
    update: { playlistUrl: sourceUrl, ready: true },
  });

  const shouldPublish = video.visibility === 'PUBLIC' && !video.publishedAt;
  await prisma.video.update({
    where: { id: video.id },
    data: {
      status: 'READY',
      processingProgress: 100,
      processingError: DEGRADED_MESSAGE,
      hlsMasterUrl: null,
      mp4FallbackUrl: sourceUrl,
      ...(shouldPublish ? { publishedAt: new Date() } : {}),
    },
  });

  // Le worker de miniatures se dégradera de la même façon (tableau vide).
  const thumbJob: ThumbnailJob = { videoId: video.id, sourceKey, durationSec };
  await thumbnailQueue.add('thumbnails', thumbJob).catch(() => undefined);

  await report(100, 'READY', true);
  await announceReady(video, wasReady);
}

// ── Processeur BullMQ ──────────────────────────────────────────────────────

export async function transcodeProcessor(job: Job<TranscodeJob>): Promise<void> {
  const videoId = job.data?.videoId;
  if (!videoId) throw new Error('Job de transcodage sans videoId');

  const video = await loadVideo(videoId);
  if (!video) {
    console.warn(`[transcode] vidéo ${videoId} introuvable — job ignoré`);
    return;
  }

  const sourceKey = job.data.sourceKey || video.sourceKey;
  if (!sourceKey) throw new Error(`Vidéo ${videoId} : aucune clé source à transcoder`);

  // Un re-run (retry BullMQ) ne doit pas incrémenter deux fois le compteur.
  const wasReady = video.status === 'READY';
  const workDir = path.resolve(env.TRANSCODE_TMP_DIR, videoId);
  const report = createProgressReporter(videoId);

  try {
    // 1. Statut PROCESSING
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'PROCESSING', processingProgress: 0, processingError: null },
    });
    await report(0, 'PROCESSING', true);

    // Mode dégradé : on n'a même pas besoin de télécharger la source.
    if (!(await isFfmpegAvailable())) {
      await runDegraded(video, sourceKey, 0, wasReady, report);
      return;
    }

    // 2. Téléchargement de la source
    await fs.mkdir(workDir, { recursive: true });
    const sourcePath = path.join(workDir, `source${path.extname(sourceKey) || '.mp4'}`);
    await downloadToFile(sourceKey, sourcePath);
    await report(5, 'PROCESSING', true);

    // 3. Analyse + détection des Shorts
    const info = await probe(sourcePath);
    const durationSec = Math.max(0, Math.round(info.durationSec));
    const isShort =
      durationSec > 0 && durationSec <= SHORT_MAX_DURATION && info.height > info.width;

    await prisma.video.update({
      where: { id: videoId },
      data: {
        durationSec,
        width: info.width || null,
        height: info.height || null,
        kind: isShort ? 'SHORT' : 'LONG',
      },
    });
    await report(10, 'PROCESSING', true);

    const meta: SourceMeta = {
      width: info.width,
      height: info.height,
      durationSec: info.durationSec,
      hasAudio: info.hasAudio,
    };

    // 4. Résolutions retenues
    const renditions = selectRenditions(info.width, info.height);
    await job.log?.(
      `Transcodage ${videoId} : ${renditions.map((r) => r.label).join(', ')} ` +
        `(source ${info.width}x${info.height}, ${durationSec}s)`,
    );

    // 5. Transcodage HLS résolution par résolution (10 % → 75 %)
    const HLS_START = 10;
    const HLS_SPAN = 65;
    const masterVariants: MasterVariantInput[] = [];
    const hlsRoot = path.join(workDir, 'hls');

    for (let i = 0; i < renditions.length; i++) {
      const rendition = renditions[i];
      const outDir = path.join(hlsRoot, rendition.label);

      const result = await transcodeToHls(
        sourcePath,
        outDir,
        rendition,
        (ratio) => {
          void report(HLS_START + ((i + ratio) / renditions.length) * HLS_SPAN, 'PROCESSING');
        },
        meta,
      );

      // Upload des segments puis de la playlist (la playlist en dernier :
      // un lecteur ne doit jamais voir une playlist pointant vers un segment absent).
      for (const segment of result.segmentFiles) {
        await putFile(
          keys.hlsVariant(videoId, rendition.label, path.basename(segment)),
          segment,
          TS_CONTENT_TYPE,
        );
      }
      const playlistKey = keys.hlsVariant(videoId, rendition.label, 'index.m3u8');
      await putFile(playlistKey, result.playlistFile, HLS_CONTENT_TYPE, PLAYLIST_CACHE_CONTROL);

      await prisma.videoVariant.upsert({
        where: { videoId_label: { videoId, label: rendition.label } },
        create: {
          videoId,
          label: rendition.label,
          width: result.width,
          height: result.height,
          bitrateKbps: rendition.bitrateKbps,
          codec: 'h264',
          playlistUrl: publicUrl(playlistKey),
          sizeBytes: BigInt(result.sizeBytes),
          ready: true,
        },
        update: {
          width: result.width,
          height: result.height,
          bitrateKbps: rendition.bitrateKbps,
          playlistUrl: publicUrl(playlistKey),
          sizeBytes: BigInt(result.sizeBytes),
          ready: true,
        },
      });

      masterVariants.push({
        label: rendition.label,
        width: result.width,
        height: result.height,
        bitrateKbps: rendition.bitrateKbps,
        audioKbps: rendition.audioKbps,
        hasAudio: info.hasAudio,
      });

      // Libère le disque au fil de l'eau (une source 4K génère beaucoup de segments).
      await fs.rm(outDir, { recursive: true, force: true });
      await report(HLS_START + ((i + 1) / renditions.length) * HLS_SPAN, 'PROCESSING', true);
    }

    // 6. Master playlist
    let hlsMasterUrl: string | null = null;
    if (masterVariants.length > 0) {
      const master = buildMasterPlaylist(masterVariants);
      hlsMasterUrl = await putObject(
        keys.hlsMaster(videoId),
        master,
        HLS_CONTENT_TYPE,
        PLAYLIST_CACHE_CONTROL,
      );
    }
    await report(78, 'PROCESSING', true);

    // 7. MP4 de repli (navigateurs sans HLS natif ni MSE)
    const fallbackRendition =
      renditions.find((r) => r.label === '720p') ?? renditions[renditions.length - 1];
    const mp4Path = path.join(workDir, 'fallback_720p.mp4');
    await transcodeToMp4(
      sourcePath,
      mp4Path,
      fallbackRendition,
      (ratio) => void report(78 + ratio * 10, 'PROCESSING'),
      meta,
    );
    const mp4FallbackUrl = await putFile(keys.mp4Fallback(videoId), mp4Path, 'video/mp4');
    await fs.rm(mp4Path, { force: true });
    await report(88, 'PROCESSING', true);

    // 8. Clip de survol + sprite sheet (agréments : un échec ne casse pas la vidéo)
    let previewClipUrl: string | null = null;
    let previewSpriteUrl: string | null = null;

    try {
      const clipPath = path.join(workDir, 'preview.mp4');
      const start = durationSec > 12 ? Math.floor(durationSec * 0.15) : 0;
      await makePreviewClip(sourcePath, clipPath, start, 4, meta);
      previewClipUrl = await putFile(keys.previewClip(videoId), clipPath, 'video/mp4');
      await fs.rm(clipPath, { force: true });
    } catch (err) {
      console.warn(`[transcode] clip de survol ignoré (${videoId}) :`, err);
    }

    try {
      const spritePath = path.join(workDir, 'sprite.jpg');
      await makeSpriteSheet(sourcePath, spritePath, durationSec, meta);
      previewSpriteUrl = await putFile(keys.previewSprite(videoId), spritePath, 'image/jpeg');
      await fs.rm(spritePath, { force: true });
    } catch (err) {
      console.warn(`[transcode] sprite sheet ignorée (${videoId}) :`, err);
    }

    await report(94, 'PROCESSING', true);

    // 9. Miniatures (job séparé : moins prioritaire que la lecture)
    const thumbJob: ThumbnailJob = { videoId, sourceKey, durationSec };
    await thumbnailQueue.add('thumbnails', thumbJob);

    // 10. READY
    const shouldPublish = video.visibility === 'PUBLIC' && !video.publishedAt;
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'READY',
        processingProgress: 100,
        processingError: null,
        hlsMasterUrl,
        mp4FallbackUrl,
        previewClipUrl,
        previewSpriteUrl,
        ...(shouldPublish ? { publishedAt: new Date() } : {}),
      },
    });
    await report(100, 'READY', true);

    // 11. Indexation + notifications
    await announceReady(video, wasReady);
  } catch (err) {
    // 13. Échec : statut FAILED, message lisible, notification, puis re-lève
    // l'erreur pour que BullMQ applique sa politique de retry.
    const message = err instanceof Error ? err.message : String(err);
    await prisma.video
      .update({
        where: { id: videoId },
        data: { status: 'FAILED', processingError: message.slice(0, 500) },
      })
      .catch(() => undefined);

    try {
      await emitToRoom(videoRoom(videoId), WS_EVENTS.processingProgress, {
        videoId,
        progress: 0,
        status: 'FAILED' satisfies VideoStatus,
        error: message.slice(0, 500),
      });
    } catch {
      /* diffusion best-effort */
    }

    const failed: NotificationJob = {
      type: 'VIDEO_FAILED',
      userId: video.channel.ownerId,
      actorChannelId: video.channelId,
      videoId,
      title: 'Échec du traitement de votre vidéo',
      body: message.slice(0, 200),
      link: `/studio/videos/${videoId}`,
    };
    await notificationQueue.add('video-failed', failed).catch(() => undefined);

    throw err;
  } finally {
    // 12. Le dossier temporaire est TOUJOURS nettoyé.
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
