'use client';

import Link from 'next/link';
import { ListVideo } from 'lucide-react';
import { formatCompactNumber, type PlaylistSummaryDTO } from '@kelvyntube/shared';
import { Skeleton } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';

/** Carte de playlist : miniature « empilée », titre et nombre de vidéos. */
export function PlaylistCard({ playlist }: { playlist: PlaylistSummaryDTO }) {
  const count = playlist.itemCount;

  return (
    <article className="flex flex-col gap-2">
      <Link
        href={PATHS.playlist(playlist.id)}
        className="group relative block kt-focus-ring"
        aria-label={`${playlist.title} — ${count} vidéos`}
      >
        {/* Effet de pile : deux bandeaux décalés derrière la miniature */}
        <span
          aria-hidden="true"
          className="absolute inset-x-3 -top-2 block h-2 rounded-t-kt bg-bg-active"
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-1.5 -top-1 block h-2 rounded-t-kt bg-bg-hover"
        />
        <span className="relative block aspect-video overflow-hidden rounded-kt bg-bg-elevated">
          {playlist.thumbnailUrl ? (
            <img
              src={playlist.thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-fg-subtle">
              <ListVideo size={28} aria-hidden="true" />
            </span>
          )}
          <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-kt-xs font-medium text-white">
            <ListVideo size={12} aria-hidden="true" />
            {formatCompactNumber(count)}
          </span>
        </span>
      </Link>

      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={PATHS.playlist(playlist.id)}
          className="kt-clamp-2 rounded text-kt-md font-medium text-fg kt-focus-ring"
        >
          {playlist.title}
        </Link>
        <p className="text-kt-sm text-fg-muted">
          {count} {count > 1 ? 'vidéos' : 'vidéo'}
        </p>
      </div>
    </article>
  );
}

export function PlaylistCardSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="aspect-video w-full rounded-kt" />
      <Skeleton variant="text" className="h-4 w-3/4" />
      <Skeleton variant="text" className="h-3 w-1/3" />
    </div>
  );
}
