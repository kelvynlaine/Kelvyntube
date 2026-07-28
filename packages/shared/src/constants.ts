/**
 * Constantes partagées entre l'API et le web.
 */

export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

/** Résolutions de transcodage (du plus petit au plus grand). */
export const RENDITIONS = [
  { label: '240p', width: 426, height: 240, bitrateKbps: 400, audioKbps: 64 },
  { label: '360p', width: 640, height: 360, bitrateKbps: 800, audioKbps: 96 },
  { label: '480p', width: 854, height: 480, bitrateKbps: 1400, audioKbps: 128 },
  { label: '720p', width: 1280, height: 720, bitrateKbps: 2800, audioKbps: 128 },
  { label: '1080p', width: 1920, height: 1080, bitrateKbps: 5000, audioKbps: 192 },
  { label: '1440p', width: 2560, height: 1440, bitrateKbps: 9000, audioKbps: 192 },
  { label: '2160p', width: 3840, height: 2160, bitrateKbps: 18000, audioKbps: 192 },
] as const;

export type RenditionLabel = (typeof RENDITIONS)[number]['label'];

/** Taille d'un chunk d'upload resumable (8 Mo — minimum S3 multipart = 5 Mo). */
export const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;

/** Durée maximale d'un Short (secondes). */
export const SHORT_MAX_DURATION = 60;

/** Ratio de bannière de chaîne. */
export const BANNER_ASPECT_RATIO = 16 / 9;

/** Catégories par défaut (seed). */
export const DEFAULT_CATEGORIES = [
  { slug: 'musique', name: 'Musique', icon: 'music', order: 1 },
  { slug: 'gaming', name: 'Gaming', icon: 'gamepad-2', order: 2 },
  { slug: 'tech', name: 'Tech', icon: 'cpu', order: 3 },
  { slug: 'sport', name: 'Sport', icon: 'dumbbell', order: 4 },
  { slug: 'vlog', name: 'Vlog', icon: 'video', order: 5 },
  { slug: 'education', name: 'Éducation', icon: 'graduation-cap', order: 6 },
  { slug: 'actualites', name: 'Actualités', icon: 'newspaper', order: 7 },
  { slug: 'cuisine', name: 'Cuisine', icon: 'chef-hat', order: 8 },
  { slug: 'humour', name: 'Humour', icon: 'laugh', order: 9 },
  { slug: 'voyage', name: 'Voyage', icon: 'plane', order: 10 },
  { slug: 'cinema', name: 'Cinéma', icon: 'clapperboard', order: 11 },
  { slug: 'auto', name: 'Auto & Moto', icon: 'car', order: 12 },
] as const;

/** Clés Redis — namespace unique pour éviter les collisions entre modules. */
export const REDIS_KEYS = {
  /** Compteur de vues tamponné : HASH videoId -> delta */
  viewBuffer: 'kt:views:buffer',
  /** Set de déduplication : SETEX kt:views:dedupe:<videoId>:<sessionId> */
  viewDedupe: (videoId: string, sessionId: string) =>
    `kt:views:dedupe:${videoId}:${sessionId}`,
  /** Watch-time tamponné : HASH videoId -> secondes */
  watchTimeBuffer: 'kt:watchtime:buffer',
  /** Impressions de miniatures : HASH videoId -> delta */
  impressionBuffer: 'kt:impressions:buffer',
  /** Clics sur miniatures : HASH videoId -> delta */
  clickBuffer: 'kt:clicks:buffer',
  /** Rétention tamponnée : HASH `<videoId>:<bucket>` -> delta */
  retentionBuffer: 'kt:retention:buffer',
  /** Spectateurs en direct : SETEX kt:live:<videoId>:<sessionId> */
  liveViewer: (videoId: string, sessionId: string) =>
    `kt:live:${videoId}:${sessionId}`,
  /** Cache du feed d'accueil par utilisateur */
  homeFeed: (userId: string, categorySlug: string) =>
    `kt:feed:home:${userId}:${categorySlug}`,
  /** Cache des vidéos tendances globales */
  trending: (categorySlug: string) => `kt:feed:trending:${categorySlug}`,
  /** Canal Pub/Sub des notifications temps réel */
  notificationChannel: 'kt:notifications',
  /** Canal Pub/Sub de la progression de traitement vidéo */
  processingChannel: 'kt:processing',
  /** Rate limiting : kt:rl:<scope>:<identifier> */
  rateLimit: (scope: string, identifier: string) => `kt:rl:${scope}:${identifier}`,
} as const;

/** Noms des files BullMQ. */
export const QUEUES = {
  transcode: 'kt-transcode',
  thumbnails: 'kt-thumbnails',
  search: 'kt-search-index',
  notifications: 'kt-notifications',
  analytics: 'kt-analytics',
  email: 'kt-email',
} as const;

/** Événements WebSocket (serveur -> client). */
export const WS_EVENTS = {
  notification: 'notification',
  processingProgress: 'processing:progress',
  viewCount: 'video:viewcount',
  liveViewers: 'video:liveviewers',
  commentCreated: 'comment:created',
  subscriberCount: 'channel:subscribers',
} as const;

/** Pagination par défaut. */
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 50;
