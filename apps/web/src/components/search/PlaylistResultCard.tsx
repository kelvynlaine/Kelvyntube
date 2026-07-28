'use client';

import { formatCompactNumber, type PlaylistSummaryDTO } from '@kelvyntube/shared';
import { VerifiedBadge, cn } from '@kelvyntube/ui';
import { ListVideo } from 'lucide-react';
import Link from 'next/link';
import { PATHS } from '@/lib/nav';

/**
 * Carte « playlist » des résultats de recherche.
 * La miniature est empilée (deux plans décalés derrière l'image principale)
 * pour signaler visuellement qu'il s'agit d'une collection.
 */
export interface PlaylistResultCardProps {
  playlist: PlaylistSummaryDTO;
  className?: string;
}

export function PlaylistResultCard({ playlist, className }: PlaylistResultCardProps) {
  const href = PATHS.playlist(playlist.id);
  const owner = playlist.owner;

  return (
    <article className={cn('flex w-full gap-4', className)}>
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="relative block w-40 shrink-0 pt-2 xs:w-60 feed-3:w-[360px]"
      >
        {/* Plans empilés en arrière-plan */}
        <span
          aria-hidden="true"
          className="absolute inset-x-3 top-0 block h-2 rounded-t-kt bg-bg-elevated opacity-40"
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-1.5 top-1 block h-2 rounded-t-kt bg-bg-elevated opacity-70"
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

          {/* Bandeau « N vidéos » façon YouTube */}
          <span className="absolute inset-y-0 right-0 flex w-1/3 flex-col items-center justify-center gap-1 bg-black/70 text-white">
            <ListVideo size={18} aria-hidden="true" />
            <span className="text-kt-sm font-medium tabular-nums">{playlist.itemCount}</span>
          </span>
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={href}
          title={playlist.title}
          className="kt-clamp-2 rounded text-kt-lg font-medium leading-7 text-fg kt-focus-ring"
        >
          {playlist.title}
        </Link>

        <p className="text-kt-sm text-fg-muted">
          Playlist • {playlist.itemCount} vidéo{playlist.itemCount > 1 ? 's' : ''}
        </p>

        {owner ? (
          <Link
            href={PATHS.channel(owner.handle)}
            className="mt-2 flex min-w-0 items-center gap-1 rounded text-kt-sm text-fg-muted transition-colors hover:text-fg kt-focus-ring"
          >
            <span className="truncate">{owner.name}</span>
            {owner.verified ? <VerifiedBadge size={12} /> : null}
            <span aria-hidden="true">•</span>
            <span className="shrink-0">
              {formatCompactNumber(owner.subscriberCount)} abonnés
            </span>
          </Link>
        ) : null}

        {playlist.description ? (
          <p className="kt-clamp-2 mt-1 text-kt-sm text-fg-muted">{playlist.description}</p>
        ) : null}

        <Link
          href={href}
          className="mt-2 w-fit rounded text-kt-sm font-medium text-fg-muted transition-colors hover:text-fg kt-focus-ring"
        >
          Voir la playlist complète
        </Link>
      </div>
    </article>
  );
}
