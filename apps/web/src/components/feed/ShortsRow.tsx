'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { formatViews, type VideoCardDTO } from '@kelvyntube/shared';
import { cn, useImpression } from '@kelvyntube/ui';
import { ChevronRight, Film } from 'lucide-react';
import { PATHS } from '@/lib/nav';
import { ShortsIcon } from './ShortsIcon';

export interface ShortsRowProps {
  videos: VideoCardDTO[];
  /** Impression d'une miniature de Short (CTR). */
  onImpression?: (videoId: string) => void;
  /** Clic sur un Short (CTR). */
  onVideoClick?: (video: VideoCardDTO) => void;
  title?: string;
  className?: string;
}

/**
 * Bandeau de Shorts inséré dans la grille d'accueil : titre, lien
 * « Tout afficher » et défilement horizontal de cartes verticales 9:16.
 */
export function ShortsRow({
  videos,
  onImpression,
  onVideoClick,
  title = 'Shorts',
  className,
}: ShortsRowProps) {
  if (videos.length === 0) return null;

  return (
    <section
      aria-label={title}
      className={cn(
        'flex flex-col gap-3 border-y border-border py-6',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-kt-lg font-medium text-fg">
          <ShortsIcon size={22} className="text-brand" />
          {title}
        </h2>
        <Link
          href={PATHS.shorts}
          className="flex shrink-0 items-center gap-1 rounded-pill px-2 py-1 text-kt-base font-medium text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg kt-focus-ring"
        >
          Tout afficher
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </header>

      {/*
        Sur mobile la rangée défile d'un bord à l'autre de l'écran : les marges
        négatives annulent la gouttière d'`AppShell`, si bien que la dernière
        carte visible est coupée par le bord (indice de défilement) plutôt que
        par un blanc de 16 px qui laissait croire à la fin de la liste.
      */}
      <ul className="kt-no-scrollbar -mx-4 flex snap-x snap-proximity gap-3 overflow-x-auto scroll-smooth px-4 pb-1 feed-3:-mx-1 feed-3:px-1">
        {videos.map((video) => (
          <ShortsRowCard
            key={video.id}
            video={video}
            onImpression={onImpression}
            onVideoClick={onVideoClick}
          />
        ))}
      </ul>
    </section>
  );
}

interface ShortsRowCardProps {
  video: VideoCardDTO;
  onImpression?: (videoId: string) => void;
  onVideoClick?: (video: VideoCardDTO) => void;
}

/** Carte verticale 9:16 d'un Short. */
function ShortsRowCard({ video, onImpression, onVideoClick }: ShortsRowCardProps) {
  const ref = useRef<HTMLLIElement | null>(null);

  useImpression(ref, onImpression ? () => onImpression(video.id) : undefined, {
    threshold: 0.5,
  });

  return (
    <li ref={ref} className="w-[150px] shrink-0 snap-start xs:w-[168px]">
      <Link
        href={PATHS.short(video.id)}
        onClick={() => onVideoClick?.(video)}
        className="flex flex-col gap-2 rounded-kt kt-focus-ring"
      >
        <span className="relative block aspect-[9/16] overflow-hidden rounded-kt bg-bg-elevated">
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-fg-subtle">
              <Film size={24} aria-hidden="true" />
            </span>
          )}
          <span className="absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-kt-xs font-medium text-white bg-black/70">
            {formatViews(video.viewCount)}
          </span>
        </span>

        <span className="kt-clamp-2 text-kt-base font-medium text-fg">
          {video.title}
        </span>
      </Link>
    </li>
  );
}
