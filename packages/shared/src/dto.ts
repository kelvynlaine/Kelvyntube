/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CONTRAT D'API — formes de réponse (DTO)
 *  Ces types sont la source de vérité partagée entre `apps/api` et `apps/web`.
 *  L'API DOIT retourner exactement ces formes ; le web PEUT s'y fier.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Enveloppes génériques ──────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
    /** Détails de validation champ par champ. */
    details?: Record<string, string[]>;
  };
}

/** Pagination par curseur (feeds, commentaires, listes infinies). */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Pagination par offset (tableaux du Studio). */
export interface OffsetPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Enums (miroirs des enums Prisma, en union de littéraux) ────────────────

export type VideoStatus = 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
export type VideoVisibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE' | 'SCHEDULED';
export type VideoKind = 'LONG' | 'SHORT';
export type NotificationLevel = 'ALL' | 'PERSONALIZED' | 'NONE';
export type TrafficSource =
  | 'HOME' | 'SEARCH' | 'SUGGESTED' | 'CHANNEL' | 'EXTERNAL'
  | 'PLAYLIST' | 'SHORTS' | 'NOTIFICATION' | 'DIRECT';
export type DeviceType = 'DESKTOP' | 'MOBILE' | 'TABLET' | 'TV' | 'UNKNOWN';
export type PlaylistKind = 'USER' | 'WATCH_LATER' | 'LIKED' | 'HISTORY_MIX';
export type NotificationType =
  | 'NEW_SUBSCRIBER' | 'NEW_VIDEO' | 'NEW_COMMENT' | 'COMMENT_REPLY'
  | 'COMMENT_MENTION' | 'COMMENT_HEARTED' | 'VIDEO_PROCESSED'
  | 'VIDEO_FAILED' | 'MILESTONE';
export type CommentSort = 'top' | 'newest';
export type LikeState = 'LIKE' | 'DISLIKE' | 'NONE';

// ── Auth & utilisateur ─────────────────────────────────────────────────────

export interface AuthUserDTO {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  interests: string[];
  onboarded: boolean;
  theme: string;
  autoplay: boolean;
  locale: string;
  /** Chaînes possédées par l'utilisateur (multi-chaînes). */
  channels: ChannelSummaryDTO[];
  activeChannelId: string | null;
  createdAt: string;
}

export interface AuthTokensDTO {
  accessToken: string;
  /** Le refresh token est posé en cookie httpOnly ; renvoyé ici seulement pour les clients non-navigateur. */
  refreshToken?: string;
  expiresIn: number;
}

export interface AuthResponseDTO {
  user: AuthUserDTO;
  tokens: AuthTokensDTO;
}

// ── Chaîne ─────────────────────────────────────────────────────────────────

export interface ChannelSummaryDTO {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  subscriberCount: number;
}

export interface ChannelLinkDTO {
  title: string;
  url: string;
}

export interface ChannelDTO extends ChannelSummaryDTO {
  description: string | null;
  bannerUrl: string | null;
  location: string | null;
  links: ChannelLinkDTO[];
  videoCount: number;
  totalViews: number;
  createdAt: string;
  trailerVideoId: string | null;
  /** Relation de l'utilisateur courant à cette chaîne. */
  viewer: {
    isOwner: boolean;
    isSubscribed: boolean;
    notificationLevel: NotificationLevel | null;
  };
}

// ── Vidéo ──────────────────────────────────────────────────────────────────

export interface CategoryDTO {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}

export interface TagDTO {
  id: string;
  name: string;
  usageCount: number;
  trending: boolean;
}

export interface VideoVariantDTO {
  label: string;
  width: number;
  height: number;
  bitrateKbps: number;
  playlistUrl: string;
}

export interface ChapterDTO {
  startSec: number;
  title: string;
}

export interface CaptionDTO {
  language: string;
  label: string;
  url: string;
  auto: boolean;
}

/** Forme compacte utilisée par toutes les grilles / sidebars (VideoCard). */
export interface VideoCardDTO {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  previewClipUrl: string | null;
  durationSec: number;
  viewCount: number;
  publishedAt: string | null;
  kind: VideoKind;
  channel: ChannelSummaryDTO;
  /** Vrai si l'utilisateur est abonné et n'a pas encore vu la vidéo (badge "Nouveau"). */
  isNew?: boolean;
  /** Progression de visionnage 0-100 pour la barre rouge sous la miniature. */
  watchedPct?: number;
}

/** Forme complète de la page de visionnage. */
export interface VideoDetailDTO {
  id: string;
  title: string;
  description: string | null;
  status: VideoStatus;
  visibility: VideoVisibility;
  kind: VideoKind;
  durationSec: number;
  width: number | null;
  height: number | null;
  thumbnailUrl: string | null;
  hlsMasterUrl: string | null;
  mp4FallbackUrl: string | null;
  previewSpriteUrl: string | null;
  viewCount: number;
  likeCount: number;
  /** Non-null uniquement pour le propriétaire de la chaîne. */
  dislikeCount: number | null;
  commentCount: number;
  commentsEnabled: boolean;
  publishedAt: string | null;
  createdAt: string;
  category: CategoryDTO | null;
  tags: TagDTO[];
  variants: VideoVariantDTO[];
  chapters: ChapterDTO[];
  captions: CaptionDTO[];
  channel: ChannelDTO;
  viewer: {
    like: LikeState;
    isSubscribed: boolean;
    notificationLevel: NotificationLevel | null;
    watchedSec: number;
    inWatchLater: boolean;
  };
}

/** Ligne du tableau de gestion des vidéos (Studio). */
export interface StudioVideoRowDTO {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  status: VideoStatus;
  visibility: VideoVisibility;
  processingProgress: number;
  processingError: string | null;
  durationSec: number;
  publishedAt: string | null;
  publishAt: string | null;
  createdAt: string;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  ctr: number;
  avgWatchPct: number;
}

// ── Upload ─────────────────────────────────────────────────────────────────

export interface UploadInitDTO {
  uploadId: string;
  videoId: string;
  chunkSizeBytes: number;
  totalChunks: number;
  /** Index des chunks déjà reçus (reprise après coupure réseau). */
  receivedChunks: number[];
}

export interface UploadStatusDTO {
  uploadId: string;
  videoId: string;
  receivedChunks: number[];
  totalChunks: number;
  completed: boolean;
  status: VideoStatus;
  processingProgress: number;
}

// ── Commentaires ───────────────────────────────────────────────────────────

export interface CommentAuthorDTO {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  handle: string | null;
  isCreator: boolean;
}

export interface CommentDTO {
  id: string;
  text: string;
  author: CommentAuthorDTO;
  parentId: string | null;
  likeCount: number;
  replyCount: number;
  pinned: boolean;
  heartedByCreator: boolean;
  edited: boolean;
  createdAt: string;
  reactions: { emoji: string; count: number; reacted: boolean }[];
  viewer: {
    like: LikeState;
    canDelete: boolean;
    canModerate: boolean;
  };
  /** Premières réponses préchargées (les autres via /replies). */
  replies?: CommentDTO[];
}

// ── Abonnements & notifications ────────────────────────────────────────────

export interface SubscriptionDTO {
  channel: ChannelSummaryDTO;
  level: NotificationLevel;
  createdAt: string;
  /** Nombre de vidéos non vues depuis le dernier passage. */
  unseenCount: number;
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  imageUrl: string | null;
  link: string;
  read: boolean;
  createdAt: string;
  actorChannel: ChannelSummaryDTO | null;
}

// ── Playlists ──────────────────────────────────────────────────────────────

export interface PlaylistSummaryDTO {
  id: string;
  title: string;
  description: string | null;
  visibility: VideoVisibility;
  kind: PlaylistKind;
  thumbnailUrl: string | null;
  itemCount: number;
  updatedAt: string;
  owner: ChannelSummaryDTO | null;
}

export interface PlaylistDetailDTO extends PlaylistSummaryDTO {
  items: (VideoCardDTO & { position: number; addedAt: string })[];
}

// ── Recherche ──────────────────────────────────────────────────────────────

export interface SearchResultsDTO {
  videos: CursorPage<VideoCardDTO>;
  channels: ChannelSummaryDTO[];
  playlists: PlaylistSummaryDTO[];
  /** Termes corrigés / suggérés. */
  suggestion: string | null;
}

export interface SearchSuggestionDTO {
  text: string;
  type: 'query' | 'channel' | 'tag';
  /** Présent pour type = channel. */
  channel?: ChannelSummaryDTO;
}

// ── Analytics (Kelvyn Studio) ──────────────────────────────────────────────

export interface TimeSeriesPointDTO {
  date: string; // ISO date (YYYY-MM-DD) ou datetime pour le temps réel
  value: number;
}

export interface StudioOverviewDTO {
  range: { from: string; to: string };
  totals: {
    views: number;
    watchTimeHours: number;
    subscribers: number;
    subscribersDelta: number;
    estimatedRevenue: number;
    impressions: number;
    ctr: number;
    avgViewDurationSec: number;
  };
  series: {
    views: TimeSeriesPointDTO[];
    watchTime: TimeSeriesPointDTO[];
    subscribers: TimeSeriesPointDTO[];
    revenue: TimeSeriesPointDTO[];
  };
  topVideos: (VideoCardDTO & { views: number; watchTimeHours: number })[];
  /** Vues des 60 dernières minutes (pic d'audience temps réel). */
  realtime: {
    last48hViews: number;
    liveViewers: number;
    perHour: TimeSeriesPointDTO[];
  };
}

export interface VideoAnalyticsDTO {
  videoId: string;
  range: { from: string; to: string };
  totals: {
    views: number;
    watchTimeHours: number;
    avgViewDurationSec: number;
    avgViewPct: number;
    impressions: number;
    ctr: number;
    likes: number;
    dislikes: number;
    comments: number;
    subsGained: number;
    subsLost: number;
  };
  viewsOverTime: TimeSeriesPointDTO[];
  /** Courbe de rétention : 100 points (0-99 % de la vidéo). */
  retention: { bucket: number; pct: number }[];
  trafficSources: { source: TrafficSource; views: number; pct: number }[];
  devices: { device: DeviceType; views: number; pct: number }[];
  countries: { country: string; views: number; pct: number }[];
  ageGroups: { bucket: string; pct: number }[];
  realtime: { liveViewers: number; perHour: TimeSeriesPointDTO[] };
}

// ── Feed ───────────────────────────────────────────────────────────────────

export interface FeedChipDTO {
  slug: string;
  label: string;
}

export interface HomeFeedDTO {
  chips: FeedChipDTO[];
  videos: CursorPage<VideoCardDTO>;
  /** Rangée de Shorts insérée dans la grille. */
  shortsRow: VideoCardDTO[];
}
