'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ROUTES,
  type CategoryDTO,
  type CursorPage,
  type VideoCardDTO,
} from '@kelvyntube/shared';
import {
  EmptyState,
  VideoCard,
  VideoCardSkeleton,
  type FilterChip,
} from '@kelvyntube/ui';
import { Flame } from 'lucide-react';
import {
  ALL_CATEGORY_SLUG,
  FeedChips,
  FeedErrorState,
  InfiniteFeed,
  useImpressionTracker,
} from '@/components/feed';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';

const PAGE_SIZE = 24;
const SKELETON_COUNT = 8;

/** Tendances : classement vertical numéroté, filtrable par catégorie. */
export default function TrendingPage() {
  const [category, setCategory] = useState<string>(ALL_CATEGORY_SLUG);
  const { trackImpression, trackClick, flush } = useImpressionTracker({ source: 'HOME' });

  const categoriesQuery = useQuery({
    queryKey: ['feed', 'categories'],
    queryFn: () => api.get<CategoryDTO[]>(ROUTES.feed.categories),
    staleTime: 10 * 60_000,
  });

  const query = useInfiniteQuery({
    queryKey: ['feed', 'trending', category],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<VideoCardDTO>>(ROUTES.feed.trending, {
        query: { category, cursor: pageParam ?? undefined, limit: PAGE_SIZE },
        allowAnonymous: true,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const videos = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  const chips: FilterChip[] = useMemo(
    () =>
      (categoriesQuery.data ?? []).map((item) => ({
        slug: item.slug,
        label: item.name,
      })),
    [categoriesQuery.data],
  );

  const selectCategory = useCallback(
    (slug: string) => {
      if (slug === category) return;
      flush();
      setCategory(slug);
    },
    [category, flush],
  );

  const showError = query.isError && videos.length === 0;

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-full bg-bg-elevated text-brand"
        >
          <Flame size={22} />
        </span>
        <h1 className="text-kt-xl font-medium text-fg">Tendances</h1>
      </header>

      <FeedChips
        chips={chips}
        activeSlug={category}
        onSelect={selectCategory}
        loading={categoriesQuery.isLoading}
        label="Filtrer les tendances par catégorie"
      />

      {showError ? (
        <FeedErrorState
          title="Impossible de charger les tendances"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          className="mt-4"
        />
      ) : query.isLoading ? (
        <div className="flex flex-col gap-6 pt-2">
          {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <VideoCardSkeleton key={index} layout="list" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <EmptyState
          icon={<Flame size={26} />}
          title="Aucune tendance dans cette catégorie"
          description="Essayez une autre catégorie pour découvrir les vidéos du moment."
        />
      ) : (
        <ol className="flex flex-col gap-6 pt-2">
          {videos.map((video, position) => (
            <li key={video.id} className="flex items-start gap-3 feed-2:gap-6">
              {/* La position est déjà restituée par la sémantique de <ol> */}
              <span
                aria-hidden="true"
                className="w-6 shrink-0 pt-1 text-center text-kt-lg font-medium tabular-nums text-fg-subtle feed-2:w-12 feed-2:text-kt-xl"
              >
                {position + 1}
              </span>
              <VideoCard
                video={video}
                layout="list"
                linkComponent={Link}
                href={PATHS.watch(video.id)}
                channelHref={PATHS.channel(video.channel.handle)}
                onImpression={trackImpression}
                onClick={(clicked) => trackClick(clicked.id)}
                className="min-w-0 flex-1"
              />
            </li>
          ))}
        </ol>
      )}

      {videos.length > 0 ? (
        <InfiniteFeed
          hasNextPage={query.hasNextPage}
          isFetchingNextPage={query.isFetchingNextPage}
          hasError={query.isError}
          onLoadMore={() => void query.fetchNextPage()}
          endMessage="Fin du classement."
        />
      ) : null}
    </div>
  );
}
