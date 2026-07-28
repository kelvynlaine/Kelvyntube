'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { VideoCardDTO } from '@kelvyntube/shared';
import { IconButton, VideoCard } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';

export interface ChannelVideoRowProps {
  title: string;
  videos: VideoCardDTO[];
  /** Lien « Tout afficher » optionnel affiché à droite du titre. */
  moreHref?: string;
}

/**
 * Rangée horizontale défilante de `VideoCard`.
 * Le défilement clavier reste natif (la piste est focalisable et scrollable) ;
 * les flèches ne sont qu'un raccourci pointeur.
 */
export function ChannelVideoRow({ title, videos, moreHref }: ChannelVideoRowProps) {
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const syncArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    syncArrows();
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(syncArrows);
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncArrows, videos.length]);

  const scrollBy = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.9), behavior: 'smooth' });
  };

  if (videos.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-kt-md font-medium text-fg">{title}</h2>
        <div className="flex items-center gap-1">
          {moreHref ? (
            <Link
              href={moreHref}
              className="rounded-pill px-3 py-1 text-kt-sm font-medium text-fg-muted transition-colors hover:text-fg kt-focus-ring"
            >
              Tout afficher
            </Link>
          ) : null}
          <div className="hidden items-center gap-1 feed-3:flex">
            <IconButton
              aria-label="Faire défiler vers la gauche"
              size="sm"
              variant="solid"
              disabled={!canScrollLeft}
              onClick={() => scrollBy(-1)}
            >
              <ChevronLeft size={18} />
            </IconButton>
            <IconButton
              aria-label="Faire défiler vers la droite"
              size="sm"
              variant="solid"
              disabled={!canScrollRight}
              onClick={() => scrollBy(1)}
            >
              <ChevronRight size={18} />
            </IconButton>
          </div>
        </div>
      </div>

      <ul
        ref={trackRef}
        onScroll={syncArrows}
        className="kt-no-scrollbar -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-1"
      >
        {videos.map((video) => (
          <li
            key={video.id}
            className="w-[220px] shrink-0 snap-start feed-3:w-[260px]"
          >
            <VideoCard
              video={video}
              layout="grid"
              showChannel={false}
              linkComponent={Link}
              href={PATHS.watch(video.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
