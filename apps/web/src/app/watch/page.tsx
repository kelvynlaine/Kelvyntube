import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ROUTES, parseTimestamp, type VideoDetailDTO } from '@kelvyntube/shared';
import { ApiClientError, api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { WatchLayout } from '@/components/watch';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /watch?v=<videoId>&t=<secondes>&list=<playlistId>
 *  La vidéo est récupérée côté serveur : elle alimente `generateMetadata`
 *  (Open Graph / Twitter Card) et le premier rendu de la page.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type SearchParams = Record<string, string | string[] | undefined>;

interface WatchPageProps {
  searchParams: Promise<SearchParams>;
}

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Kelvyn Tube';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Première valeur d'un paramètre de recherche potentiellement répété. */
function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** `?t=` : « 90 », « 90s », « 1m30s », « 1h2m3s » ou « 1:30 ». */
function parseStartTime(raw: string | string[] | undefined): number | null {
  const value = first(raw)?.trim();
  if (!value) return null;

  if (/^\d+$/.test(value)) return Number(value);

  const clock = parseTimestamp(value);
  if (clock !== null) return clock;

  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match || !match[0]) return null;
  const [, h, m, s] = match;
  const seconds = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  return seconds > 0 ? seconds : null;
}

interface LoadResult {
  video: VideoDetailDTO | null;
  /** Vidéo inexistante, supprimée ou privée pour ce visiteur. */
  missing: boolean;
}

/** Récupération serveur mémoïsée (partagée entre metadata et page). */
const loadVideo = cache(async (videoId: string): Promise<LoadResult> => {
  try {
    const video = await api.get<VideoDetailDTO>(ROUTES.videos.byId(videoId), {
      allowAnonymous: true,
      cache: 'no-store',
    });
    return { video, missing: false };
  } catch (error) {
    const missing =
      error instanceof ApiClientError &&
      (error.status === 404 || error.status === 403 || error.status === 410);
    return { video: null, missing };
  }
});

export async function generateMetadata({
  searchParams,
}: WatchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const videoId = first(params.v);
  if (!videoId) return { title: 'Vidéo introuvable' };

  const { video } = await loadVideo(videoId);
  if (!video) return { title: 'Vidéo introuvable' };

  const description =
    video.description?.replace(/\s+/g, ' ').trim().slice(0, 200) ||
    `${video.channel.name} sur ${SITE_NAME}`;
  const images = video.thumbnailUrl ? [{ url: video.thumbnailUrl }] : undefined;
  const canonical = PATHS.watch(video.id);

  return {
    metadataBase: new URL(SITE_URL),
    title: video.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'video.other',
      siteName: SITE_NAME,
      title: video.title,
      description,
      url: canonical,
      images,
      videos: video.mp4FallbackUrl
        ? [
            {
              url: video.mp4FallbackUrl,
              width: video.width ?? undefined,
              height: video.height ?? undefined,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: video.title,
      description,
      images: video.thumbnailUrl ? [video.thumbnailUrl] : undefined,
    },
  };
}

export default async function WatchPage({ searchParams }: WatchPageProps) {
  const params = await searchParams;
  const videoId = first(params.v);
  if (!videoId) notFound();

  const { video, missing } = await loadVideo(videoId);
  if (missing) notFound();

  return (
    <WatchLayout
      videoId={videoId}
      initialVideo={video}
      startAtParam={parseStartTime(params.t)}
      playlistId={first(params.list)}
    />
  );
}
