import path from 'node:path';
import { prisma } from '@kelvyntube/db';
import {
  UPLOAD_CHUNK_SIZE,
  WS_EVENTS,
  type UploadInitDTO,
  type UploadInitInput,
  type UploadStatusDTO,
  type VideoStatus,
} from '@kelvyntube/shared';
import {
  abortMultipart,
  completeMultipart,
  createMultipart,
  keys,
  uploadPart,
} from '../../lib/storage.js';
import { transcodeQueue } from '../../lib/queue.js';
import { emitToRoom, videoRoom } from '../../lib/realtime.js';
import { badRequest, conflict, forbidden, internal, notFound } from '../../lib/errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVICE D'UPLOAD RESUMABLE
 *
 *  Le client découpe son fichier en chunks de `chunkSizeBytes` et les envoie
 *  un par un (dans N'IMPORTE QUEL ORDRE). Chaque chunk devient une *part* S3
 *  multipart (numérotée `index + 1`, S3 numérote à partir de 1).
 *
 *  Après une coupure réseau, le client interroge `/status` et ne renvoie que
 *  les chunks absents de `receivedChunks`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Minimum imposé par S3 pour une part non finale. */
const MIN_CHUNK_BYTES = 5 * 1024 * 1024;
/** Limite alignée sur `@fastify/multipart` (200 Mo). */
export const MAX_CHUNK_BYTES = 200 * 1024 * 1024;
/** Nombre maximal de parts d'un upload multipart S3. */
const MAX_PARTS = 10_000;
/** Durée de vie d'une session d'upload. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// ── Utilitaires ────────────────────────────────────────────────────────────

interface StoredPart {
  partNumber: number;
  etag: string;
}

/** `parts` est un champ Json : on le relit défensivement. */
function readParts(raw: unknown): StoredPart[] {
  if (!Array.isArray(raw)) return [];
  const parts: StoredPart[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as { partNumber?: unknown; etag?: unknown };
    if (typeof candidate.partNumber !== 'number' || typeof candidate.etag !== 'string') continue;
    parts.push({ partNumber: candidate.partNumber, etag: candidate.etag });
  }
  // Dédoublonnage : la dernière ETag écrite pour un numéro de part gagne.
  const byNumber = new Map<number, StoredPart>();
  for (const part of parts) byNumber.set(part.partNumber, part);
  return [...byNumber.values()].sort((a, b) => a.partNumber - b.partNumber);
}

/** Extension du fichier source, nettoyée (sans point, minuscules). */
function sanitizeExtension(fileName: string): string {
  const ext = path.extname(fileName).replace(/^\./, '').toLowerCase();
  if (!ext || !/^[a-z0-9]{1,8}$/.test(ext)) return 'mp4';
  return ext;
}

/** Titre par défaut = nom de fichier sans extension. */
function defaultTitle(fileName: string): string {
  const base = path.basename(fileName).replace(/\.[^.]+$/, '').trim();
  const cleaned = base.replace(/[\r\n\t]+/g, ' ').slice(0, 120).trim();
  return cleaned || 'Vidéo sans titre';
}

/**
 * Taille de chunk retenue : la proposition du client si elle est valide,
 * sinon `UPLOAD_CHUNK_SIZE`. Élargie si le fichier dépasserait 10 000 parts.
 */
function resolveChunkSize(fileSizeBytes: number, proposed?: number): number {
  let size =
    proposed && proposed >= MIN_CHUNK_BYTES
      ? Math.min(proposed, MAX_CHUNK_BYTES)
      : UPLOAD_CHUNK_SIZE;

  if (Math.ceil(fileSizeBytes / size) > MAX_PARTS) {
    const needed = Math.ceil(fileSizeBytes / MAX_PARTS);
    // Arrondi au Mo supérieur pour rester lisible côté client.
    size = Math.min(MAX_CHUNK_BYTES, Math.ceil(needed / (1024 * 1024)) * 1024 * 1024);
  }
  return size;
}

// ── Chargement + contrôle de propriété ─────────────────────────────────────

const sessionInclude = {
  video: {
    select: {
      id: true,
      status: true,
      processingProgress: true,
      channel: { select: { id: true, ownerId: true } },
    },
  },
} as const;

/**
 * Charge une session et vérifie qu'elle appartient bien à une chaîne
 * possédée par `userId`. C'est LE point de contrôle de sécurité du module.
 */
async function loadOwnedSession(uploadId: string, userId: string) {
  const session = await prisma.uploadSession.findUnique({
    where: { id: uploadId },
    include: sessionInclude,
  });
  if (!session) throw notFound("Session d'upload introuvable");
  if (session.video.channel.ownerId !== userId) {
    throw forbidden("Cette session d'upload ne vous appartient pas");
  }
  return session;
}

type LoadedSession = Awaited<ReturnType<typeof loadOwnedSession>>;

function toStatusDTO(session: LoadedSession): UploadStatusDTO {
  return {
    uploadId: session.id,
    videoId: session.videoId,
    receivedChunks: [...session.receivedChunks].sort((a, b) => a - b),
    totalChunks: session.totalChunks,
    completed: session.completed,
    status: session.video.status as VideoStatus,
    processingProgress: session.video.processingProgress,
  };
}

/** La diffusion temps réel ne doit jamais faire échouer une requête HTTP. */
async function safeEmit(videoId: string, progress: number, status: VideoStatus) {
  try {
    await emitToRoom(videoRoom(videoId), WS_EVENTS.processingProgress, {
      videoId,
      progress,
      status,
    });
  } catch {
    /* Redis indisponible : la progression n'est pas critique */
  }
}

// ── 1. Initialisation ──────────────────────────────────────────────────────

export async function initUpload(
  userId: string,
  channelId: string,
  input: UploadInitInput,
): Promise<UploadInitDTO> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, ownerId: true },
  });
  if (!channel) throw badRequest('Chaîne active introuvable');
  if (channel.ownerId !== userId) throw forbidden('Vous ne possédez pas cette chaîne');

  const chunkSizeBytes = resolveChunkSize(input.fileSizeBytes, input.chunkSizeBytes);
  const totalChunks = Math.max(1, Math.ceil(input.fileSizeBytes / chunkSizeBytes));
  const ext = sanitizeExtension(input.fileName);

  // 1. La vidéo d'abord : son id sert à nommer la clé S3.
  const video = await prisma.video.create({
    data: {
      channelId: channel.id,
      title: defaultTitle(input.fileName),
      status: 'UPLOADING',
      visibility: 'PRIVATE',
      sourceSizeBytes: BigInt(input.fileSizeBytes),
    },
    select: { id: true },
  });

  const key = keys.videoSource(video.id, ext);

  // 2. Ouverture du multipart S3 ; en cas d'échec on ne laisse pas de vidéo orpheline.
  let multipartId: string;
  try {
    multipartId = await createMultipart(key, input.mimeType);
  } catch (err) {
    await prisma.video.delete({ where: { id: video.id } }).catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    throw internal(`Stockage indisponible : ${message}`);
  }

  // 3. Session de reprise.
  try {
    const session = await prisma.uploadSession.create({
      data: {
        videoId: video.id,
        channelId: channel.id,
        key,
        multipartId,
        fileName: input.fileName.slice(0, 255),
        fileSizeBytes: BigInt(input.fileSizeBytes),
        mimeType: input.mimeType,
        chunkSizeBytes,
        totalChunks,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
      select: { id: true },
    });

    await prisma.video.update({ where: { id: video.id }, data: { sourceKey: key } });

    return {
      uploadId: session.id,
      videoId: video.id,
      chunkSizeBytes,
      totalChunks,
      receivedChunks: [],
    };
  } catch (err) {
    await abortMultipart(key, multipartId).catch(() => undefined);
    await prisma.video.delete({ where: { id: video.id } }).catch(() => undefined);
    throw err;
  }
}

// ── 2. Réception d'un chunk ────────────────────────────────────────────────

export async function receiveChunk(
  uploadId: string,
  userId: string,
  index: number,
  chunk: Buffer,
): Promise<UploadStatusDTO> {
  const session = await loadOwnedSession(uploadId, userId);

  if (session.completed) throw conflict('Cet upload est déjà finalisé');
  if (session.expiresAt.getTime() < Date.now()) {
    throw badRequest("Session d'upload expirée : relancez un upload");
  }
  if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
    throw badRequest(`Index de chunk invalide (attendu entre 0 et ${session.totalChunks - 1})`);
  }
  if (chunk.length === 0) throw badRequest('Chunk vide');
  if (chunk.length > session.chunkSizeBytes) {
    throw badRequest(
      `Chunk trop volumineux (${chunk.length} octets pour un maximum de ${session.chunkSizeBytes})`,
    );
  }
  if (!session.multipartId) throw internal('Upload multipart non initialisé');

  // Idempotence : un chunk déjà accepté renvoie simplement l'état courant (200).
  if (session.receivedChunks.includes(index)) return toStatusDTO(session);

  const etag = await uploadPart(session.key, session.multipartId, index + 1, chunk);
  await recordPart(uploadId, index, etag);

  const refreshed = await loadOwnedSession(uploadId, userId);
  return toStatusDTO(refreshed);
}

/**
 * Enregistre la part confirmée de façon ATOMIQUE.
 * Les chunks arrivent en parallèle : un read-modify-write applicatif perdrait
 * des parts (dernière écriture gagnante). On délègue donc la fusion à Postgres.
 */
async function recordPart(uploadId: string, index: number, etag: string): Promise<void> {
  const partJson = JSON.stringify([{ partNumber: index + 1, etag }]);
  try {
    await prisma.$executeRaw`
      UPDATE "upload_sessions"
      SET "receivedChunks" = CASE
            WHEN ${index}::int = ANY("receivedChunks") THEN "receivedChunks"
            ELSE array_append("receivedChunks", ${index}::int)
          END,
          "parts" = CASE
            WHEN ${index}::int = ANY("receivedChunks") THEN "parts"
            ELSE "parts" || ${partJson}::jsonb
          END,
          "updatedAt" = now()
      WHERE "id" = ${uploadId}
    `;
  } catch {
    // Filet de sécurité si le dialecte SQL diffère : moins concurrent, mais correct.
    await prisma.$transaction(async (tx) => {
      const current = await tx.uploadSession.findUnique({
        where: { id: uploadId },
        select: { receivedChunks: true, parts: true },
      });
      if (!current) return;
      if (current.receivedChunks.includes(index)) return;
      const merged = readParts(current.parts);
      merged.push({ partNumber: index + 1, etag });
      await tx.uploadSession.update({
        where: { id: uploadId },
        data: {
          receivedChunks: { push: index },
          parts: merged.map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
        },
      });
    });
  }
}

// ── 3. État (reprise après coupure) ────────────────────────────────────────

export async function getUploadStatus(uploadId: string, userId: string): Promise<UploadStatusDTO> {
  const session = await loadOwnedSession(uploadId, userId);
  return toStatusDTO(session);
}

// ── 4. Finalisation ────────────────────────────────────────────────────────

export async function completeUpload(uploadId: string, userId: string): Promise<UploadStatusDTO> {
  const session = await loadOwnedSession(uploadId, userId);

  // Rejouable sans effet de bord.
  if (session.completed) return toStatusDTO(session);

  const received = new Set(session.receivedChunks);
  const missing: number[] = [];
  for (let i = 0; i < session.totalChunks; i++) if (!received.has(i)) missing.push(i);

  if (missing.length > 0) {
    throw badRequest(
      `Upload incomplet : ${missing.length} chunk(s) manquant(s) sur ${session.totalChunks}`,
      { missingChunks: missing.slice(0, 500).map(String) },
    );
  }

  if (!session.multipartId) throw internal('Upload multipart non initialisé');

  const parts = readParts(session.parts);
  if (parts.length < session.totalChunks) {
    throw internal("Parts S3 incohérentes avec les chunks reçus : relancez l'upload");
  }

  await completeMultipart(
    session.key,
    session.multipartId,
    parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
  );

  await prisma.$transaction([
    prisma.uploadSession.update({
      where: { id: session.id },
      data: { completed: true },
    }),
    prisma.video.update({
      where: { id: session.videoId },
      data: {
        status: 'UPLOADED',
        sourceKey: session.key,
        processingProgress: 0,
        processingError: null,
      },
    }),
  ]);

  // Le pipeline de transcodage prend le relais (processus worker séparé).
  await transcodeQueue.add('transcode', {
    videoId: session.videoId,
    sourceKey: session.key,
  });

  await safeEmit(session.videoId, 0, 'UPLOADED');

  const refreshed = await loadOwnedSession(uploadId, userId);
  return toStatusDTO(refreshed);
}

// ── 5. Abandon ─────────────────────────────────────────────────────────────

export async function abortUpload(uploadId: string, userId: string): Promise<void> {
  const session = await loadOwnedSession(uploadId, userId);

  // Une vidéo en cours de traitement ou déjà publiée ne se supprime pas ici :
  // c'est le rôle de DELETE /videos/:id.
  if (session.video.status === 'PROCESSING' || session.video.status === 'READY') {
    throw conflict(
      'Cette vidéo est déjà en traitement : utilisez la suppression de vidéo du Studio',
    );
  }

  if (session.multipartId && !session.completed) {
    // S3 libère les parts déjà envoyées ; une erreur ici (upload déjà abandonné)
    // ne doit pas empêcher le nettoyage en base.
    await abortMultipart(session.key, session.multipartId).catch(() => undefined);
  }

  // La session est supprimée en cascade avec la vidéo (onDelete: Cascade).
  await prisma.video.delete({ where: { id: session.videoId } });
}
