'use client';

import Link from 'next/link';
import { Play } from 'lucide-react';
import { formatViews, type VideoCardDTO } from '@kelvyntube/shared';
import { Skeleton } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';

/** Carte verticale 9:16 de l'onglet Shorts. */
export function ShortCard({ video }: { video: VideoCardDTO }) {
  return (
    <article className="flex flex-col gap-2">
      <Link
        href={PATHS.short(video.id)}
        className="group relative block aspect-[9/16] overflow-hidden rounded-kt bg-bg-elevated kt-focus-ring"
      >
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-fg-subtle">
            <Play size={28} aria-hidden="true" />
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8">
          <span className="kt-clamp-2 text-kt-sm font-medium text-white">
            {video.title}
          </span>
        </span>
      </Link>
      <p className="text-kt-sm text-fg-muted">{formatViews(video.viewCount)}</p>
    </article>
  );
}

/** Squelette aligné sur `ShortCard`. */
export function ShortCardSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="aspect-[9/16] w-full rounded-kt" />
      <Skeleton variant="text" className="h-3 w-1/2" />
    </div>
  );
}

/** Classes de la grille de Shorts (partagées entre contenu et squelette). */
export const SHORTS_GRID_CLASS =
  'grid grid-cols-2 gap-x-4 gap-y-6 xs:grid-cols-3 feed-3:grid-cols-4 feed-4:grid-cols-5 feed-5:grid-cols-6';
