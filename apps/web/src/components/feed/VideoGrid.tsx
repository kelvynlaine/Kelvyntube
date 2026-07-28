'use client';

import { Fragment, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import type { VideoCardDTO } from '@kelvyntube/shared';
import { VideoCard, VideoCardSkeleton, cn } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';
import { useGridColumns } from './useGridColumns';

/** Nombre de squelettes affichés au premier chargement. */
export const DEFAULT_SKELETON_COUNT = 12;

export interface VideoGridProps {
  videos: VideoCardDTO[];
  /** Premier chargement : affiche des squelettes à la place de la grille. */
  loading?: boolean;
  skeletonCount?: number;
  /** Impression d'une miniature (CTR). */
  onImpression?: (videoId: string) => void;
  /** Clic sur une miniature ou un titre (CTR). */
  onVideoClick?: (video: VideoCardDTO) => void;
  /**
   * Bandeau pleine largeur inséré juste après la première ligne de la grille
   * (rangée de Shorts). Le nombre de colonnes est mesuré, donc l'insertion
   * reste correcte de 1 à 6 colonnes.
   */
  shelf?: ReactNode;
  /** Rendu quand la liste est vide et le chargement terminé. */
  emptyState?: ReactNode;
  className?: string;
}

/** Grille responsive de `VideoCard` (1 → 6 colonnes selon `feed-*`). */
export function VideoGrid({
  videos,
  loading = false,
  skeletonCount = DEFAULT_SKELETON_COUNT,
  onImpression,
  onVideoClick,
  shelf,
  emptyState,
  className,
}: VideoGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const columns = useGridColumns(gridRef);

  // Sur une seule colonne, insérer après la 1re carte serait trop tôt :
  // on garde au minimum deux vidéos avant la rangée de Shorts.
  const shelfPosition = shelf ? Math.max(columns, 2) : -1;
  const shelfAtEnd = shelf !== undefined && videos.length > 0 && videos.length < shelfPosition;

  if (!loading && videos.length === 0) {
    return <>{emptyState ?? null}</>;
  }

  return (
    <div ref={gridRef} className={cn('kt-video-grid', className)}>
      {loading
        ? Array.from({ length: skeletonCount }).map((_, index) => (
            <VideoCardSkeleton key={index} layout="grid" />
          ))
        : videos.map((video, index) => (
            <Fragment key={video.id}>
              <VideoCard
                video={video}
                layout="grid"
                linkComponent={Link}
                href={PATHS.watch(video.id)}
                channelHref={PATHS.channel(video.channel.handle)}
                onImpression={onImpression}
                onClick={onVideoClick}
              />
              {index + 1 === shelfPosition ? (
                <div className="col-span-full">{shelf}</div>
              ) : null}
            </Fragment>
          ))}

      {/* Moins de vidéos que de colonnes : la rangée passe simplement en dessous */}
      {!loading && shelfAtEnd ? <div className="col-span-full">{shelf}</div> : null}
    </div>
  );
}
