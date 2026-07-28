import { Queue, type JobsOptions } from 'bullmq';
import { QUEUES } from '@kelvyntube/shared';
import { bullConnection } from './redis.js';

/**
 * Files BullMQ partagées. Les *workers* vivent dans `src/worker.ts`.
 * Ce fichier n'expose que les producteurs (utilisables depuis l'API HTTP).
 */

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
};

export const transcodeQueue = new Queue(QUEUES.transcode, {
  connection: bullConnection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 2 },
});

export const thumbnailQueue = new Queue(QUEUES.thumbnails, {
  connection: bullConnection,
  defaultJobOptions,
});

export const searchQueue = new Queue(QUEUES.search, {
  connection: bullConnection,
  defaultJobOptions,
});

export const notificationQueue = new Queue(QUEUES.notifications, {
  connection: bullConnection,
  defaultJobOptions,
});

export const analyticsQueue = new Queue(QUEUES.analytics, {
  connection: bullConnection,
  defaultJobOptions,
});

export const emailQueue = new Queue(QUEUES.email, {
  connection: bullConnection,
  defaultJobOptions,
});

// ── Contrats de payload des jobs ──────────────────────────────────────────

export interface TranscodeJob {
  videoId: string;
  sourceKey: string;
}

export interface ThumbnailJob {
  videoId: string;
  sourceKey: string;
  durationSec: number;
}

export interface SearchIndexJob {
  action: 'upsert' | 'delete';
  entity: 'video' | 'channel' | 'playlist';
  id: string;
}

export interface NotificationJob {
  type:
    | 'NEW_SUBSCRIBER' | 'NEW_VIDEO' | 'NEW_COMMENT' | 'COMMENT_REPLY'
    | 'COMMENT_MENTION' | 'COMMENT_HEARTED' | 'VIDEO_PROCESSED'
    | 'VIDEO_FAILED' | 'MILESTONE';
  /** Destinataire unique, ou fan-out vers les abonnés d'une chaîne. */
  userId?: string;
  fanoutChannelId?: string;
  actorChannelId?: string;
  videoId?: string;
  commentId?: string;
  title: string;
  body?: string;
  imageUrl?: string;
  link: string;
}

export interface EmailJob {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export type AnalyticsJob =
  | { type: 'flush-views' }
  | { type: 'rollup-daily'; date?: string }
  | { type: 'recompute-hot-scores' }
  | { type: 'refresh-trending-tags' }
  | { type: 'publish-scheduled' };

export async function closeQueues() {
  await Promise.allSettled([
    transcodeQueue.close(),
    thumbnailQueue.close(),
    searchQueue.close(),
    notificationQueue.close(),
    analyticsQueue.close(),
    emailQueue.close(),
  ]);
}
