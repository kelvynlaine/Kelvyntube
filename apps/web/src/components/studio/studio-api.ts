/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KELVYN STUDIO — contrat de données côté client
 *
 *  Types complémentaires (formes renvoyées par l'API mais absentes de
 *  `packages/shared/dto.ts`) et clés de cache React Query.
 *  Aucun `fetch` brut ici : tout passe par le client `api`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type {
  CommentDTO,
  TimeSeriesPointDTO,
  VideoCardDTO,
  VideoDetailDTO,
  VideoStatus,
  VideoVisibility,
} from '@kelvyntube/shared';

// ── Périodes d'analyse ─────────────────────────────────────────────────────

/** Miroir de `analyticsRangeSchema.preset`. */
export type AnalyticsPreset = '7d' | '28d' | '90d' | '365d' | 'lifetime';

export const ANALYTICS_PRESETS: { value: AnalyticsPreset; label: string; days: number | null }[] = [
  { value: '7d', label: '7 derniers jours', days: 7 },
  { value: '28d', label: '28 derniers jours', days: 28 },
  { value: '90d', label: '90 derniers jours', days: 90 },
  { value: '365d', label: '365 derniers jours', days: 365 },
  { value: 'lifetime', label: 'Depuis toujours', days: null },
];

const PRESET_VALUES = new Set<string>(ANALYTICS_PRESETS.map((p) => p.value));

/** Normalise un `?preset=` d'URL (28 jours par défaut, comme l'API). */
export function parsePreset(raw: string | null | undefined): AnalyticsPreset {
  return raw && PRESET_VALUES.has(raw) ? (raw as AnalyticsPreset) : '28d';
}

export function presetLabel(preset: AnalyticsPreset): string {
  return ANALYTICS_PRESETS.find((p) => p.value === preset)?.label ?? preset;
}

/** Libellé de comparaison affiché sous les deltas des `StatCard`. */
export function presetComparisonLabel(preset: AnalyticsPreset): string {
  const days = ANALYTICS_PRESETS.find((p) => p.value === preset)?.days;
  return days ? `vs ${days} jours précédents` : 'sur toute la période';
}

// ── DTO du Studio non exposés par @kelvyntube/shared ───────────────────────

/** `GET ROUTES.studio.realtime` — bloc « en temps réel ». */
export interface StudioRealtimeDTO {
  liveViewers: number;
  last48hViews: number;
  perHour: TimeSeriesPointDTO[];
  topVideosNow: { video: VideoCardDTO; viewers: number }[];
}

/** `GET ROUTES.studio.subscribers` — analytics d'abonnés. */
export interface StudioSubscribersDTO {
  total: number;
  gained: number;
  lost: number;
  /** Solde net par jour (gagnés − perdus). */
  series: TimeSeriesPointDTO[];
  byVideo: { video: VideoCardDTO; gained: number; lost: number }[];
}

/** `GET ROUTES.comments.moderation` — commentaire enrichi de sa vidéo. */
export type StudioCommentDTO = CommentDTO & {
  video: { id: string; title: string; thumbnailUrl: string | null };
};

export type StudioCommentFilter = 'all' | 'unanswered' | 'held';

/**
 * Réglages d'édition acceptés par `updateVideoSchema` et renvoyés par l'API,
 * mais absents de `VideoDetailDTO` (qui décrit la page de visionnage publique).
 * Tous optionnels : le formulaire retombe sur des valeurs neutres.
 */
export interface VideoSettingsExtraDTO {
  publishAt?: string | null;
  madeForKids?: boolean;
  ageRestricted?: boolean;
  language?: string | null;
}

export type StudioVideoDetailDTO = VideoDetailDTO & VideoSettingsExtraDTO;

/** Ligne du tableau de contenu — la description n'est pas garantie par l'API. */
export interface StudioVideoRowExtraDTO {
  description?: string | null;
}

/** Réponse de `GET ROUTES.channels.checkHandle`. */
export interface HandleAvailabilityDTO {
  available: boolean;
  suggestions: string[];
}

/** Réponse de `POST ROUTES.videos.bulkUpdate`. */
export interface BulkUpdateResultDTO {
  updated: number;
  videoIds: string[];
}

/** Réponse de `PUT ROUTES.videos.thumbnail`. */
export interface ThumbnailUploadResultDTO {
  thumbnailUrl: string;
}

/** Réponse de `POST ROUTES.channels.uploadAsset`. */
export interface ChannelAssetResultDTO {
  url: string;
}

// ── Événement temps réel de transcodage ────────────────────────────────────

/** Charge utile de `WS_EVENTS.processingProgress` (cf. transcode.worker). */
export interface ProcessingProgressEvent {
  videoId: string;
  progress: number;
  status: VideoStatus;
  error?: string;
}

/** Garde de type : les messages WS arrivent en `unknown`. */
export function isProcessingProgressEvent(data: unknown): data is ProcessingProgressEvent {
  if (typeof data !== 'object' || data === null) return false;
  const event = data as Partial<ProcessingProgressEvent>;
  return typeof event.videoId === 'string' && typeof event.progress === 'number';
}

// ── Clés de cache React Query ──────────────────────────────────────────────

export const studioKeys = {
  all: ['studio'] as const,
  overview: (channelId: string, preset: AnalyticsPreset) =>
    ['studio', 'overview', channelId, preset] as const,
  realtime: (channelId: string) => ['studio', 'realtime', channelId] as const,
  videos: (channelId: string, filters: Record<string, string | number | undefined>) =>
    ['studio', 'videos', channelId, filters] as const,
  videoAnalytics: (channelId: string, videoId: string, preset: AnalyticsPreset) =>
    ['studio', 'video-analytics', channelId, videoId, preset] as const,
  subscribers: (channelId: string, preset: AnalyticsPreset) =>
    ['studio', 'subscribers', channelId, preset] as const,
  comments: (channelId: string, filters: Record<string, string | number | undefined>) =>
    ['studio', 'comments', channelId, filters] as const,
  video: (videoId: string) => ['studio', 'video', videoId] as const,
  channel: (channelId: string) => ['studio', 'channel', channelId] as const,
  categories: ['studio', 'categories'] as const,
  tagSuggestions: (q: string) => ['studio', 'tag-suggestions', q] as const,
  handleCheck: (handle: string) => ['studio', 'handle-check', handle] as const,
};

// ── Libellés métier ────────────────────────────────────────────────────────

export const VISIBILITY_LABELS: Record<VideoVisibility, string> = {
  PUBLIC: 'Publique',
  UNLISTED: 'Non répertoriée',
  PRIVATE: 'Privée',
  SCHEDULED: 'Programmée',
};

export const STATUS_LABELS: Record<VideoStatus, string> = {
  UPLOADING: 'Envoi en cours',
  UPLOADED: 'En file d\'attente',
  PROCESSING: 'Traitement',
  READY: 'Prête',
  FAILED: 'Échec',
};

/** Un statut encore en mouvement : la ligne doit écouter le temps réel. */
export function isInFlight(status: VideoStatus): boolean {
  return status === 'UPLOADING' || status === 'UPLOADED' || status === 'PROCESSING';
}
