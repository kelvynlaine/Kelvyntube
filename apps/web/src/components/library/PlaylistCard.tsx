'use client';

import Link from 'next/link';
import { ListVideo } from 'lucide-react';
import {
  formatRelativeTime,
  type PlaylistSummaryDTO,
} from '@kelvyntube/shared';
import { cn } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';
import { formatItemCount, playlistIcon, VISIBILITY_LABELS } from './playlist-utils';

/**
 * Carte de playlist : miniature + surimpression « N vidéos », titre,
 * visibilité et date de mise à jour.
 */
export function PlaylistCard({
  playlist,
  href,
  className,
}: {
  playlist: PlaylistSummaryDTO;
  /** Surcharge de la destination (playlists système -> pages dédiées). */
  href?: string;
  className?: string;
}) {
  const target = href ?? PATHS.playlist(playlist.id);

  return (
    <Link
      href={target}
      className={cn(
        'group/playlist flex flex-col gap-2 rounded-kt kt-focus-ring',
        className,
      )}
    >
      <span className="relative block aspect-video overflow-hidden rounded-kt bg-bg-elevated">
        {playlist.thumbnailUrl ? (
          <img
            src={playlist.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-200 group-hover/playlist:scale-105"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-fg-subtle">
            <ListVideo size={32} aria-hidden="true" />
          </span>
        )}

        {/* Bandeau « N vidéos » façon YouTube */}
        <span className="absolute inset-y-0 right-0 flex w-[44%] flex-col items-center justify-center gap-1 bg-black/70 text-kt-sm font-medium text-white">
          <span aria-hidden="true">{playlistIcon(playlist.kind, 18)}</span>
          {formatItemCount(playlist.itemCount)}
        </span>
      </span>

      <span className="kt-clamp-2 text-kt-md font-medium text-fg">
        {playlist.title}
      </span>

      <span className="flex flex-wrap items-center gap-x-1 text-kt-sm text-fg-muted">
        <span>{VISIBILITY_LABELS[playlist.visibility]}</span>
        <span aria-hidden="true">•</span>
        <span>Mise à jour {formatRelativeTime(playlist.updatedAt)}</span>
      </span>
    </Link>
  );
}
