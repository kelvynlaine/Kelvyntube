import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import { env } from '../config/env.js';

/**
 * Stockage objet S3-compatible.
 * Local : MinIO. Prod : Cloudflare R2 / Backblaze B2 (même API).
 */
export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

export const BUCKET = env.S3_BUCKET;

/** URL publique servie par le CDN pour une clé donnée. */
export function publicUrl(key: string): string {
  return `${env.CDN_PUBLIC_URL.replace(/\/$/, '')}/${key.replace(/^\//, '')}`;
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string | Readable,
  contentType: string,
  cacheControl = 'public, max-age=31536000, immutable',
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body as never,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
  return publicUrl(key);
}

export async function getObjectStream(key: string): Promise<Readable> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return res.Body as Readable;
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const stream = await getObjectStream(key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function signedGetUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

// ── Multipart (upload resumable de gros fichiers vidéo) ────────────────────

export async function createMultipart(key: string, contentType: string): Promise<string> {
  const res = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
  );
  if (!res.UploadId) throw new Error('Impossible de créer l\'upload multipart');
  return res.UploadId;
}

export async function uploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  body: Buffer,
): Promise<string> {
  const res = await s3.send(
    new UploadPartCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: body,
    }),
  );
  return res.ETag!;
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
): Promise<string> {
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) },
    }),
  );
  return publicUrl(key);
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  await s3.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }));
}

/** Conventions de nommage des clés S3. */
export const keys = {
  videoSource: (videoId: string, ext: string) => `videos/${videoId}/source.${ext}`,
  hlsMaster: (videoId: string) => `videos/${videoId}/hls/master.m3u8`,
  hlsVariant: (videoId: string, label: string, file: string) =>
    `videos/${videoId}/hls/${label}/${file}`,
  mp4Fallback: (videoId: string) => `videos/${videoId}/fallback_720p.mp4`,
  thumbnail: (videoId: string, index: number | string) =>
    `videos/${videoId}/thumbs/thumb_${index}.jpg`,
  previewClip: (videoId: string) => `videos/${videoId}/preview.mp4`,
  previewSprite: (videoId: string) => `videos/${videoId}/sprite.jpg`,
  caption: (videoId: string, lang: string) => `videos/${videoId}/captions/${lang}.vtt`,
  channelAvatar: (channelId: string, hash: string) => `channels/${channelId}/avatar_${hash}.jpg`,
  channelBanner: (channelId: string, hash: string) => `channels/${channelId}/banner_${hash}.jpg`,
  userAvatar: (userId: string, hash: string) => `users/${userId}/avatar_${hash}.jpg`,
};
