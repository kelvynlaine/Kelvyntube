import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CONTRAT D'API — validation des requêtes (Zod)
 *  L'API valide avec ces schémas ; le web les réutilise pour ses formulaires.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Primitives ─────────────────────────────────────────────────────────────

export const cuidSchema = z.string().min(1);

export const handleSchema = z
  .string()
  .min(3, 'Au moins 3 caractères')
  .max(30, 'Au plus 30 caractères')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Lettres, chiffres, point, tiret et underscore uniquement');

export const passwordSchema = z
  .string()
  .min(8, 'Au moins 8 caractères')
  .max(128)
  .regex(/[a-z]/, 'Au moins une minuscule')
  .regex(/[A-Z]/, 'Au moins une majuscule')
  .regex(/[0-9]/, 'Au moins un chiffre');

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

export const offsetPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const visibilitySchema = z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE', 'SCHEDULED']);
export const notificationLevelSchema = z.enum(['ALL', 'PERSONALIZED', 'NONE']);
export const trafficSourceSchema = z.enum([
  'HOME', 'SEARCH', 'SUGGESTED', 'CHANNEL', 'EXTERNAL',
  'PLAYLIST', 'SHORTS', 'NOTIFICATION', 'DIRECT',
]);

// ── Auth ───────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  password: passwordSchema,
  displayName: z.string().min(2).max(50),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const verifyEmailSchema = z.object({ token: z.string().min(10) });

export const requestPasswordResetSchema = z.object({ email: z.string().email() });

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const onboardingSchema = z.object({
  handle: handleSchema,
  displayName: z.string().min(2).max(50),
  interests: z.array(z.string()).min(1, 'Choisis au moins un centre d\'intérêt').max(12),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
  autoplay: z.boolean().optional(),
  interests: z.array(z.string()).max(12).optional(),
  locale: z.string().min(2).max(5).optional(),
});

// ── Chaîne ─────────────────────────────────────────────────────────────────

export const createChannelSchema = z.object({
  handle: handleSchema,
  name: z.string().min(2).max(60),
  description: z.string().max(5000).optional(),
});

export const updateChannelSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  handle: handleSchema.optional(),
  description: z.string().max(5000).nullable().optional(),
  location: z.string().max(80).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  links: z
    .array(z.object({ title: z.string().min(1).max(40), url: z.string().url() }))
    .max(10)
    .optional(),
  trailerVideoId: z.string().nullable().optional(),
  blockedWords: z.array(z.string().min(1).max(40)).max(200).optional(),
});

// ── Upload & vidéos ────────────────────────────────────────────────────────

export const uploadInitSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSizeBytes: z.number().int().positive().max(50 * 1024 * 1024 * 1024), // 50 Go
  mimeType: z.string().regex(/^video\//, 'Fichier vidéo requis'),
  /** Le client peut proposer une taille de chunk ; l'API renvoie celle retenue. */
  chunkSizeBytes: z.number().int().min(5 * 1024 * 1024).optional(),
});

export const uploadCompleteSchema = z.object({
  uploadId: z.string().min(1),
});

export const updateVideoSchema = z.object({
  title: z.string().min(1, 'Titre requis').max(120).optional(),
  description: z.string().max(10000).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  visibility: visibilitySchema.optional(),
  publishAt: z.string().datetime().nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  commentsEnabled: z.boolean().optional(),
  madeForKids: z.boolean().optional(),
  ageRestricted: z.boolean().optional(),
  language: z.string().min(2).max(5).optional(),
  chapters: z
    .array(z.object({ startSec: z.number().int().min(0), title: z.string().min(1).max(100) }))
    .max(100)
    .optional(),
}).refine(
  (v) => v.visibility !== 'SCHEDULED' || !!v.publishAt,
  { message: 'Une date de publication est requise pour une vidéo programmée', path: ['publishAt'] },
);

export const bulkUpdateVideosSchema = z.object({
  videoIds: z.array(z.string()).min(1).max(200),
  visibility: visibilitySchema.optional(),
  categoryId: z.string().nullable().optional(),
  commentsEnabled: z.boolean().optional(),
  addTags: z.array(z.string()).max(20).optional(),
});

// ── Lecture & vues ─────────────────────────────────────────────────────────

/** Ping envoyé par le lecteur toutes les ~10 s. */
export const watchHeartbeatSchema = z.object({
  videoId: z.string(),
  sessionId: z.string().min(8).max(64),
  /** Temps total visionné depuis le début de la session (secondes). */
  watchedSec: z.number().int().min(0),
  /** Position courante dans la vidéo (secondes). */
  positionSec: z.number().int().min(0),
  source: trafficSourceSchema.default('DIRECT'),
});

/** Impressions de miniatures : envoyé en batch par le feed. */
export const impressionBatchSchema = z.object({
  videoIds: z.array(z.string()).min(1).max(100),
  source: trafficSourceSchema.default('HOME'),
});

export const clickSchema = z.object({
  videoId: z.string(),
  source: trafficSourceSchema.default('HOME'),
});

// ── Interactions ───────────────────────────────────────────────────────────

export const likeSchema = z.object({
  /** 1 = like, -1 = dislike, 0 = retirer */
  value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});

export const createCommentSchema = z.object({
  text: z.string().min(1, 'Commentaire vide').max(10000),
  parentId: z.string().nullable().optional(),
});

export const updateCommentSchema = z.object({
  text: z.string().min(1).max(10000),
});

export const commentReactionSchema = z.object({
  emoji: z.string().min(1).max(8),
});

export const listCommentsSchema = cursorPaginationSchema.extend({
  sort: z.enum(['top', 'newest']).default('top'),
});

export const subscribeSchema = z.object({
  level: notificationLevelSchema.default('PERSONALIZED'),
});

// ── Playlists ──────────────────────────────────────────────────────────────

export const createPlaylistSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  visibility: visibilitySchema.default('PUBLIC'),
  videoId: z.string().optional(), // ajout immédiat
});

export const updatePlaylistSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  visibility: visibilitySchema.optional(),
});

export const playlistItemSchema = z.object({ videoId: z.string() });

export const reorderPlaylistSchema = z.object({
  videoId: z.string(),
  position: z.number().int().min(0),
});

// ── Feed & recherche ───────────────────────────────────────────────────────

export const homeFeedSchema = cursorPaginationSchema.extend({
  /** slug de catégorie ou "all" */
  category: z.string().default('all'),
});

export const shortsFeedSchema = cursorPaginationSchema.extend({
  seedVideoId: z.string().optional(),
});

export const relatedVideosSchema = cursorPaginationSchema.extend({
  videoId: z.string(),
});

export const searchSchema = cursorPaginationSchema.extend({
  q: z.string().min(1).max(200),
  /** Filtres façon YouTube */
  duration: z.enum(['any', 'short', 'medium', 'long']).default('any'),
  uploadDate: z.enum(['any', 'hour', 'today', 'week', 'month', 'year']).default('any'),
  type: z.enum(['all', 'video', 'channel', 'playlist', 'short']).default('all'),
  sort: z.enum(['relevance', 'date', 'views', 'rating']).default('relevance'),
});

export const suggestSchema = z.object({
  q: z.string().min(1).max(100),
});

/**
 * Suggestions de hashtags du formulaire de publication.
 * `q` est OPTIONNEL : sans terme de recherche, l'API renvoie l'ensemble des
 * hashtags existants (les plus utilisés d'abord), ce qui alimente le panel
 * « tous les hashtags » du Studio.
 */
export const tagSuggestSchema = z.object({
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

// ── Booster d'engagement (Studio) ──────────────────────────────────────────

/** Plafonds volontairement explicites — ils bornent aussi l'UI. */
export const BOOST_LIMITS = {
  views: 7_000_000_000,
  likes: 500_000_000,
  dislikes: 50_000_000,
  /** Les commentaires créent de vraies lignes : plafond bien plus bas. */
  comments: 2_000,
  subscribers: 500_000_000,
} as const;

export const boostSchema = z
  .object({
    /** Cible : une vidéo précise, ou toute la chaîne si omis. */
    videoId: z.string().optional(),
    views: z.number().int().min(0).max(BOOST_LIMITS.views).default(0),
    likes: z.number().int().min(0).max(BOOST_LIMITS.likes).default(0),
    dislikes: z.number().int().min(0).max(BOOST_LIMITS.dislikes).default(0),
    comments: z.number().int().min(0).max(BOOST_LIMITS.comments).default(0),
    subscribers: z.number().int().min(0).max(BOOST_LIMITS.subscribers).default(0),
    /** Étale les statistiques sur N jours passés pour des courbes crédibles. */
    spreadDays: z.number().int().min(1).max(365).default(30),
  })
  .refine(
    (v) => v.views + v.likes + v.dislikes + v.comments + v.subscribers > 0,
    { message: 'Choisis au moins une métrique à simuler', path: ['views'] },
  )
  .refine((v) => Boolean(v.videoId) || v.comments === 0, {
    message: 'Les commentaires nécessitent de cibler une vidéo précise',
    path: ['comments'],
  });

// ── Analytics ──────────────────────────────────────────────────────────────

export const analyticsRangeSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  /** Raccourci : 7d, 28d, 90d, 365d, lifetime */
  preset: z.enum(['7d', '28d', '90d', '365d', 'lifetime']).default('28d'),
});

// ── Types inférés ──────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type UploadInitInput = z.infer<typeof uploadInitSchema>;
export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;
export type WatchHeartbeatInput = z.infer<typeof watchHeartbeatSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export type HomeFeedInput = z.infer<typeof homeFeedSchema>;
export type AnalyticsRangeInput = z.infer<typeof analyticsRangeSchema>;
export type BoostInput = z.infer<typeof boostSchema>;
export type TagSuggestInput = z.infer<typeof tagSuggestSchema>;
