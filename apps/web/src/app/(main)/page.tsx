'use client';

import { Suspense, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ROUTES,
  type FeedChipDTO,
  type HomeFeedDTO,
  type VideoCardDTO,
} from '@kelvyntube/shared';
import { EmptyState, VideoCardSkeleton } from '@kelvyntube/ui';
import { Clapperboard } from 'lucide-react';
import {
  ALL_CATEGORY_SLUG,
  DEFAULT_SKELETON_COUNT,
  FeedChips,
  FeedErrorState,
  InfiniteFeed,
  ShortsRow,
  VideoGrid,
  useImpressionTracker,
} from '@/components/feed';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';

/** Nombre de vidéos par page du feed d'accueil. */
const PAGE_SIZE = 24;

export default function HomePage() {
  // `useSearchParams` impose une frontière Suspense côté App Router.
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeFeed />
    </Suspense>
  );
}

/** Squelette affiché pendant la résolution des paramètres d'URL. */
function HomeFallback() {
  return (
    <div className="flex flex-col">
      <FeedChips chips={[]} activeSlug={ALL_CATEGORY_SLUG} onSelect={() => undefined} loading />
      <div className="kt-video-grid pt-2">
        {Array.from({ length: DEFAULT_SKELETON_COUNT }).map((_, index) => (
          <VideoCardSkeleton key={index} layout="grid" />
        ))}
      </div>
    </div>
  );
}

function HomeFeed() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get('category') ?? ALL_CATEGORY_SLUG;

  const { trackImpression, trackClick, flush } = useImpressionTracker({ source: 'HOME' });

  const query = useInfiniteQuery({
    queryKey: ['feed', 'home', category],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<HomeFeedDTO>(ROUTES.feed.home, {
        query: { category, cursor: pageParam ?? undefined, limit: PAGE_SIZE },
        allowAnonymous: true,
      }),
    getNextPageParam: (lastPage) => lastPage.videos.nextCursor,
  });

  const firstPage = query.data?.pages[0];

  const videos = useMemo(
    () => query.data?.pages.flatMap((page) => page.videos.items) ?? [],
    [query.data],
  );

  // Les chips sont mémorisées d'un feed à l'autre : changer de catégorie ne
  // doit pas faire clignoter la rangée de filtres.
  const lastChipsRef = useRef<FeedChipDTO[]>([]);
  if (firstPage?.chips.length) lastChipsRef.current = firstPage.chips;
  const chips = firstPage?.chips ?? lastChipsRef.current;

  const shortsRow = firstPage?.shortsRow ?? [];

  /** Change de catégorie sans rechargement complet (l'URL reste partageable). */
  const selectCategory = useCallback(
    (slug: string) => {
      if (slug === category) return;
      flush(); // les impressions déjà mesurées partent avant le changement de feed
      router.replace(slug === ALL_CATEGORY_SLUG ? PATHS.home : PATHS.category(slug), {
        scroll: false,
      });
    },
    [category, flush, router],
  );

  const onVideoClick = useCallback(
    (video: VideoCardDTO) => trackClick(video.id),
    [trackClick],
  );

  const showError = query.isError && videos.length === 0;

  return (
    <div className="flex flex-col">
      <FeedChips
        chips={chips}
        activeSlug={category}
        onSelect={selectCategory}
        loading={query.isLoading && chips.length === 0}
      />

      {showError ? (
        <FeedErrorState
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          className="mt-4"
        />
      ) : (
        <VideoGrid
          className="pt-2"
          videos={videos}
          loading={query.isLoading}
          onImpression={trackImpression}
          onVideoClick={onVideoClick}
          shelf={
            shortsRow.length > 0 ? (
              <ShortsRow
                videos={shortsRow}
                onImpression={trackImpression}
                onVideoClick={onVideoClick}
              />
            ) : undefined
          }
          emptyState={
            <EmptyState
              icon={<Clapperboard size={26} />}
              title="Aucune vidéo à afficher"
              description="Essayez une autre catégorie ou revenez un peu plus tard."
            />
          }
        />
      )}

      {videos.length > 0 ? (
        <InfiniteFeed
          hasNextPage={query.hasNextPage}
          isFetchingNextPage={query.isFetchingNextPage}
          hasError={query.isError}
          onLoadMore={() => void query.fetchNextPage()}
          endMessage="Vous avez tout vu pour le moment."
        />
      ) : null}
    </div>
  );
}
