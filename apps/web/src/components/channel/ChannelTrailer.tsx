'use client';

import Link from 'next/link';
import { Play } from 'lucide-react';
import {
  formatRelativeTime,
  formatViews,
  type VideoCardDTO,
} from '@kelvyntube/shared';
import { PATHS } from '@/lib/nav';
import { useTrailerDetail } from './queries';

export interface ChannelTrailerProps {
  video: VideoCardDTO;
}

/**
 * Bande-annonce de la chaîne, affichée aux visiteurs non abonnés.
 *
 * Volontairement autonome : un simple `<video controls>` sur le MP4 de repli
 * (le lecteur HLS complet appartient au module de visionnage). Si le MP4 n'est
 * pas disponible, on retombe sur une grande miniature cliquable vers `/watch`.
 */
export function ChannelTrailer({ video }: ChannelTrailerProps) {
  const { data: detail } = useTrailerDetail(video.id);
  const watchHref = PATHS.watch(video.id);
  const mp4 = detail?.mp4FallbackUrl ?? null;

  return (
    <section className="flex flex-col gap-4 feed-3:flex-row feed-3:items-start feed-3:gap-6">
      <div className="w-full overflow-hidden rounded-kt bg-bg-elevated feed-3:w-[560px] feed-3:shrink-0">
        {mp4 ? (
          <video
            src={mp4}
            poster={video.thumbnailUrl ?? undefined}
            controls
            preload="metadata"
            playsInline
            className="aspect-video w-full bg-black"
          >
            <track kind="captions" />
          </video>
        ) : (
          <Link
            href={watchHref}
            aria-label={`Regarder la bande-annonce : ${video.title}`}
            className="group relative block aspect-video w-full kt-focus-ring"
          >
            {video.thumbnailUrl ? (
              <img
                src={video.thumbnailUrl}
                alt=""
                className="size-full object-cover"
                decoding="async"
              />
            ) : null}
            <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/40">
              <span className="flex size-14 items-center justify-center rounded-full bg-black/70 text-white">
                <Play size={26} aria-hidden="true" />
              </span>
            </span>
          </Link>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-kt-sm font-medium uppercase tracking-wide text-fg-subtle">
          Bande-annonce de la chaîne
        </p>
        <h2 className="text-kt-md font-medium text-fg">
          <Link href={watchHref} className="rounded kt-focus-ring hover:text-fg-muted">
            {video.title}
          </Link>
        </h2>
        <p className="flex flex-wrap items-center gap-x-2 text-kt-sm text-fg-muted">
          <span>{formatViews(video.viewCount)}</span>
          {video.publishedAt ? (
            <>
              <span aria-hidden="true">•</span>
              <span>{formatRelativeTime(video.publishedAt)}</span>
            </>
          ) : null}
        </p>
        {detail?.description ? (
          <p className="kt-clamp-3 max-w-prose text-kt-base text-fg-muted">
            {detail.description}
          </p>
        ) : null}
      </div>
    </section>
  );
}
