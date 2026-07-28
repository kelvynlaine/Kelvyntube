'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { Film } from 'lucide-react';
import {
  Button,
  EmptyState,
  FilterChips,
  VideoCard,
  VideoCardSkeleton,
  type FilterChip,
} from '@kelvyntube/ui';
import {
  ROUTES,
  type CursorPage,
  type VideoCardDTO,
} from '@kelvyntube/shared';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';

const PAGE_SIZE = 12;

type RelatedFilter = 'all' | 'channel' | 'recent';

const FILTERS: FilterChip[] = [
  { slug: 'all', label: 'Tout' },
  { slug: 'channel', label: 'De cette chaîne' },
  { slug: 'recent', label: 'Récentes' },
];

/**
 * Vidéos suggérées, paginées par curseur.
 * Le même `queryKey` est partagé avec la page (lecture automatique).
 */
export function useRelatedVideos(videoId: string) {
  return useInfiniteQuery<
    CursorPage<VideoCardDTO>,
    Error,
    InfiniteData<CursorPage<VideoCardDTO>, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: ['related', videoId],
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<VideoCardDTO>>(ROUTES.videos.related(videoId), {
        query: { cursor: pageParam ?? undefined, limit: PAGE_SIZE },
        allowAnonymous: true,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export interface RelatedVideosProps {
  videoId: string;
  /** Chaîne de la vidéo courante (filtre « De cette chaîne »). */
  channelId: string;
  playlistId?: string | null;
  className?: string;
}

/** Colonne de suggestions : chips de filtre + liste compacte infinie. */
export function RelatedVideos({
  videoId,
  channelId,
  playlistId,
  className,
}: RelatedVideosProps) {
  const [filter, setFilter] = useState<RelatedFilter>('all');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const query = useRelatedVideos(videoId);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  // Filtrage / tri côté client sur le jeu déjà chargé.
  const visible = useMemo(() => {
    if (filter === 'channel') {
      return items.filter((item) => item.channel.id === channelId);
    }
    if (filter === 'recent') {
      return [...items].sort((a, b) => {
        const left = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const right = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        return right - left;
      });
    }
    return items;
  }, [channelId, filter, items]);

  // Défilement infini.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <section aria-labelledby="titre-suggestions" className={className}>
      <h2 id="titre-suggestions" className="sr-only">
        Vidéos suggérées
      </h2>

      <FilterChips
        chips={FILTERS}
        activeSlug={filter}
        label="Filtrer les suggestions"
        onSelect={(slug) => setFilter(slug as RelatedFilter)}
        className="mb-3"
      />

      {query.isPending ? (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <li key={index}>
              <VideoCardSkeleton layout="compact" />
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<Film size={22} />}
          title="Aucune suggestion"
          description={
            filter === 'all'
              ? 'Revenez plus tard pour de nouvelles recommandations.'
              : 'Essayez un autre filtre.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => (
            <li key={item.id}>
              <VideoCard
                video={item}
                layout="compact"
                linkComponent={Link}
                href={PATHS.watch(item.id, { list: playlistId ?? undefined })}
                channelHref={PATHS.channel(item.channel.handle)}
              />
            </li>
          ))}
        </ul>
      )}

      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      {hasNextPage ? (
        <Button
          variant="ghost"
          className="mt-3 self-center"
          fullWidth
          loading={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          Afficher plus de suggestions
        </Button>
      ) : null}
    </section>
  );
}
