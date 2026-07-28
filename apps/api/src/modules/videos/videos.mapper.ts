import { Prisma } from '@kelvyntube/db';
import type {
  CaptionDTO,
  ChapterDTO,
  LikeState,
  NotificationLevel,
  VideoDetailDTO,
  VideoVariantDTO,
} from '@kelvyntube/shared';
import { toCategoryDTO, toChannelDTO, toNumber, toTagDTO } from '../../lib/serializers.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MAPPER VIDÉO — Prisma → VideoDetailDTO
 *  Toute la page de visionnage passe par ici : c'est le seul endroit qui
 *  connaît la forme exacte attendue par le front.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Include Prisma partagé par toutes les lectures « détail vidéo ». */
export const videoDetailInclude = {
  channel: true,
  category: true,
  variants: { where: { ready: true }, orderBy: { height: 'asc' } },
  chapters: { orderBy: { startSec: 'asc' } },
  captions: { orderBy: { language: 'asc' } },
  tags: { include: { tag: true }, orderBy: { position: 'asc' } },
} satisfies Prisma.VideoInclude;

export type VideoWithRelations = Prisma.VideoGetPayload<{ include: typeof videoDetailInclude }>;

/** Contexte « spectateur » calculé par le service avant l'appel au mapper. */
export interface VideoViewerContext {
  userId: string | null;
  /** L'utilisateur possède la chaîne : seul cas où `dislikeCount` est exposé. */
  isOwner: boolean;
  like: LikeState;
  isSubscribed: boolean;
  notificationLevel: NotificationLevel | null;
  /** Reprise de lecture (WatchHistory.positionSec). */
  watchedSec: number;
  inWatchLater: boolean;
}

// ── Chapitres dérivés de la description ───────────────────────────────────

/**
 * Nombre minimum d'entrées pour qu'une liste de timestamps soit considérée
 * comme un vrai sommaire. (YouTube exige officiellement 3 chapitres ; on est
 * volontairement un peu plus permissif pour les vidéos courtes.)
 */
const MIN_DERIVED_CHAPTERS = 2;

/** `0:00`, `1:23`, `01:02:03` en début de ligne, suivi du titre. */
const CHAPTER_LINE = /^\s*(?:\(|\[)?((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\)|\])?\s*[-–—:.)|]?\s*(.+?)\s*$/;

function timestampToSeconds(raw: string): number | null {
  const parts = raw.split(':').map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/**
 * Dérive les chapitres depuis la description quand aucun `VideoChapter` n'est
 * enregistré en base (comportement YouTube).
 *
 * Règles appliquées :
 *  1. une ligne = un timestamp en tête + un titre non vide ;
 *  2. le PREMIER chapitre doit démarrer à 0:00, sinon la liste est ignorée ;
 *  3. les timestamps doivent être strictement croissants ;
 *  4. un timestamp au-delà de la durée de la vidéo invalide l'entrée ;
 *  5. au moins {@link MIN_DERIVED_CHAPTERS} entrées valides.
 */
export function parseChaptersFromDescription(
  description: string | null | undefined,
  durationSec = 0,
): ChapterDTO[] {
  if (!description) return [];

  const found: ChapterDTO[] = [];
  for (const line of description.split(/\r?\n/)) {
    const m = CHAPTER_LINE.exec(line);
    if (!m) continue;
    const startSec = timestampToSeconds(m[1]);
    const title = m[2]?.trim();
    if (startSec === null || !title) continue;
    // Le titre ne doit pas être qu'un second timestamp (ex : "0:00 - 1:00")
    if (/^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(title)) continue;
    if (durationSec > 0 && startSec > durationSec) continue;
    found.push({ startSec, title: title.slice(0, 100) });
  }

  if (found.length < MIN_DERIVED_CHAPTERS) return [];

  // Croissance stricte : on abandonne dès qu'un timestamp recule.
  const ordered: ChapterDTO[] = [];
  for (const c of found) {
    if (ordered.length && c.startSec <= ordered[ordered.length - 1].startSec) continue;
    ordered.push(c);
  }

  // Règle YouTube : sans chapitre à 0:00 la liste entière est invalide.
  if (ordered.length < MIN_DERIVED_CHAPTERS || ordered[0].startSec !== 0) return [];
  return ordered;
}

// ── Mappers ───────────────────────────────────────────────────────────────

function toVariantDTO(v: VideoWithRelations['variants'][number]): VideoVariantDTO {
  return {
    label: v.label,
    width: v.width,
    height: v.height,
    bitrateKbps: v.bitrateKbps,
    playlistUrl: v.playlistUrl,
  };
}

function toCaptionDTO(c: VideoWithRelations['captions'][number]): CaptionDTO {
  return { language: c.language, label: c.label, url: c.url, auto: c.auto };
}

export function toVideoDetailDTO(
  video: VideoWithRelations,
  viewer: VideoViewerContext,
): VideoDetailDTO {
  const chapters: ChapterDTO[] = video.chapters.length
    ? video.chapters.map((c) => ({ startSec: c.startSec, title: c.title }))
    : parseChaptersFromDescription(video.description, video.durationSec);

  return {
    id: video.id,
    title: video.title,
    description: video.description,
    status: video.status,
    visibility: video.visibility,
    kind: video.kind,
    durationSec: video.durationSec,
    width: video.width,
    height: video.height,
    thumbnailUrl: video.thumbnailUrl,
    thumbnailCandidates: video.thumbnailCandidates,
    hlsMasterUrl: video.hlsMasterUrl,
    mp4FallbackUrl: video.mp4FallbackUrl,
    previewSpriteUrl: video.previewSpriteUrl,
    viewCount: toNumber(video.viewCount),
    likeCount: video.likeCount,
    // Les dislikes ne sont JAMAIS publics (comportement YouTube depuis 2021).
    dislikeCount: viewer.isOwner ? video.dislikeCount : null,
    commentCount: video.commentCount,
    commentsEnabled: video.commentsEnabled,
    publishedAt: video.publishedAt ? video.publishedAt.toISOString() : null,
    createdAt: video.createdAt.toISOString(),
    category: video.category ? toCategoryDTO(video.category) : null,
    tags: video.tags.map((vt) => toTagDTO(vt.tag)),
    variants: video.variants.map(toVariantDTO),
    chapters,
    captions: video.captions.map(toCaptionDTO),
    channel: toChannelDTO(video.channel, {
      userId: viewer.userId,
      isSubscribed: viewer.isSubscribed,
      level: viewer.notificationLevel,
    }),
    viewer: {
      like: viewer.like,
      isSubscribed: viewer.isSubscribed,
      notificationLevel: viewer.notificationLevel,
      watchedSec: viewer.watchedSec,
      inWatchLater: viewer.inWatchLater,
    },
  };
}
