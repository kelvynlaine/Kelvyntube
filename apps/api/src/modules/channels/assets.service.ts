import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { AppError } from '../../lib/errors.js';
import { keys, putObject } from '../../lib/storage.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TRAITEMENT DES VISUELS DE CHAÎNE (avatar / bannière)
 *  Toute image envoyée par un créateur passe par ici : validation stricte,
 *  normalisation via sharp, puis dépôt sur le stockage objet.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Taille maximale acceptée pour un visuel de chaîne (15 Mo). */
export const MAX_ASSET_BYTES = 15 * 1024 * 1024;

/** Qualité JPEG de sortie, commune à l'avatar et à la bannière. */
const JPEG_QUALITY = 85;

/**
 * Dimensions cibles.
 * - avatar   : carré 800x800 (recadrage centré)
 * - bannière : 16:9 en 2560x1440 (recadrage centré)
 */
export const ASSET_SPECS = {
  avatar: { width: 800, height: 800 },
  banner: { width: 2560, height: 1440 },
} as const;

export type ChannelAssetType = keyof typeof ASSET_SPECS;

/**
 * Formats bitmap acceptés. Le SVG est explicitement refusé : c'est un format
 * XML capable d'embarquer du script, il n'a rien à faire dans un avatar.
 */
const ALLOWED_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif', 'heif', 'tiff']);

// ── Erreurs spécifiques au module ─────────────────────────────────────────

export const unsupportedMediaType = (msg = 'Format de fichier non supporté') =>
  new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', msg);

export const payloadTooLarge = (msg = 'Fichier trop volumineux') =>
  new AppError(413, 'PAYLOAD_TOO_LARGE', msg);

// ── Validation ────────────────────────────────────────────────────────────

/** Refuse tout ce qui n'est pas annoncé comme une image (415). */
export function assertImageMimeType(mimeType: string | undefined | null): void {
  if (!mimeType || !/^image\//i.test(mimeType)) {
    throw unsupportedMediaType('Une image est requise (JPEG, PNG, WebP, AVIF ou GIF)');
  }
  if (/^image\/svg/i.test(mimeType)) {
    throw unsupportedMediaType('Le format SVG n\'est pas accepté');
  }
}

/** Refuse les fichiers dépassant la limite (413). */
export function assertAssetSize(byteLength: number): void {
  if (byteLength > MAX_ASSET_BYTES) {
    throw payloadTooLarge('L\'image ne doit pas dépasser 15 Mo');
  }
}

/** Vrai si l'erreur provient de la limite de taille de @fastify/multipart. */
export function isFileTooLargeError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT';
}

// ── Traitement ────────────────────────────────────────────────────────────

export interface ProcessedAsset {
  url: string;
  key: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Normalise puis publie un visuel de chaîne.
 * Le nom de fichier est content-addressé : sha256 du buffer FINAL tronqué à
 * 8 caractères. Deux uploads identiques retombent donc sur la même clé, ce qui
 * rend l'opération idempotente et compatible avec un cache immuable.
 */
export async function processChannelAsset(
  channelId: string,
  type: ChannelAssetType,
  buffer: Buffer,
  mimeType?: string | null,
): Promise<ProcessedAsset> {
  assertImageMimeType(mimeType);
  assertAssetSize(buffer.byteLength);

  // On ne fait pas confiance au Content-Type annoncé : sharp doit confirmer
  // que le contenu est bien une image d'un format autorisé.
  let format: string | undefined;
  try {
    const meta = await sharp(buffer, { limitInputPixels: 100_000_000 }).metadata();
    format = meta.format;
    if (!meta.width || !meta.height) format = undefined;
  } catch {
    throw unsupportedMediaType('Image illisible ou corrompue');
  }
  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw unsupportedMediaType('Format d\'image non supporté');
  }

  const spec = ASSET_SPECS[type];

  const output = await sharp(buffer, { limitInputPixels: 100_000_000 })
    // `rotate()` sans argument applique l'orientation EXIF puis la supprime.
    .rotate()
    // `cover` + `centre` = recadrage centré au ratio cible (1:1 ou 16:9).
    .resize({ width: spec.width, height: spec.height, fit: 'cover', position: 'centre' })
    // Le JPEG ne gère pas l'alpha : on aplatit sur fond noir.
    .flatten({ background: '#000000' })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, progressive: true })
    .toBuffer();

  const hash = createHash('sha256').update(output).digest('hex').slice(0, 8);
  const key =
    type === 'avatar' ? keys.channelAvatar(channelId, hash) : keys.channelBanner(channelId, hash);

  const url = await putObject(key, output, 'image/jpeg');

  return {
    url,
    key,
    width: spec.width,
    height: spec.height,
    sizeBytes: output.byteLength,
  };
}
